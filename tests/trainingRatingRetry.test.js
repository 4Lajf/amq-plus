import fs from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db;
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => db }));
vi.mock('$lib/server/training/training-utils.js', () => ({
	lookupToken: async () => ({ user_id: 'learner' }),
	INVALID_TOKEN_MESSAGE: 'Invalid token'
}));
vi.mock('$lib/server/training/user-preferences.js', () => ({
	getUserTrainingPreferences: async () => ({ allow_same_day_reviews: true })
}));
vi.mock('$lib/server/training/duplicate-groups.js', () => ({
	findDuplicateSiblings: async () => []
}));
vi.mock('$lib/server/training/fsrs-service.js', () => ({
	trainingScheduler: {
		createNewCard: () => ({ state: 0 }),
		updateCardState: () => ({ state: 1, due: '2026-09-06T00:00:00Z' })
	}
}));

const { POST } = await import('../src/routes/api/training/session/[sessionId]/progress/+server.js');
const connector = fs.readFileSync('amqPlusConnector.user.js', 'utf8');
const queueCode = connector.slice(
	connector.indexOf('function processTrainingSyncQueue('),
	connector.indexOf('function updateTrainingAccuracy(')
);

function queuedConnector(annSongId = 42) {
	const requests = [],
		timers = [];
	const state = {
		authToken: 'token',
		syncInProgress: false,
		pendingSync: [
			{
				sessionId: 'session',
				requestId: 'c4c8f2dc-0137-4a66-81aa-5bf8497201d7',
				playedAt: new Date().toISOString(),
				annSongId,
				rating: 3,
				success: true
			}
		]
	};
	const display = { fadeIn: () => display, delay: () => display, fadeOut: () => display };
	const context = {
		trainingState: state,
		trainingCompletionRequested: false,
		API_BASE_URL: 'https://example.test',
		console: { log() {}, warn() {}, error() {} },
		GM_xmlhttpRequest: (req) => requests.push(req),
		setTimeout: (callback, delay) => timers.push({ callback, delay }),
		saveTrainingSettings: vi.fn(),
		sendSystemMessage: vi.fn(),
		$: () => display
	};
	vm.runInNewContext(queueCode, context);
	context.processTrainingSyncQueue();
	return { requests, timers, state };
}

async function deliver(request) {
	const response = await POST({
		params: { sessionId: 'session' },
		request: new Request('https://example.test/progress', {
			method: 'POST',
			body: request.data
		})
	});
	request.onload({ status: response.status, responseText: await response.text() });
	return response.status;
}

beforeEach(() => {
	db = {
		rpc: vi.fn(),
		from(table) {
			const result =
				table === 'training_sessions'
					? {
							data: {
								id: 'session',
								quiz_id: 'quiz',
								started_at: new Date(Date.now() - 60000).toISOString(),
								session_data: { playlistAnnSongIds: [42] }
							}
						}
					: { data: [] };
			const query = {
				select: () => query,
				eq: () => query,
				limit: () => query,
				single: async () => result,
				then: (resolve) => resolve(result)
			};
			return query;
		}
	};
});

describe('rating endpoint to connector retry contract', () => {
	it('resumes restored answers during startup without opening Training', () => {
		const requests = [];
		const display = { fadeIn: () => display, delay: () => display, fadeOut: () => display };
		const context = {
			trainingState: { pendingSync: [], syncInProgress: false },
			trainingCompletionRequested: false,
			amqPlusEnabled: false,
			API_BASE_URL: 'https://example.test',
			console: { log() {}, warn() {}, error() {} },
			loadSettings() {
				context.trainingState.authToken = 'saved-token';
				context.trainingState.pendingSync = [42, 43].map(annSongId => ({ sessionId: 'saved-session', requestId: `saved-${annSongId}`, annSongId, rating: 1 }));
			},
			GM_xmlhttpRequest: request => requests.push(request),
			saveTrainingSettings: vi.fn(),
			$: () => display,
			Listener: function () { this.bindListener = () => {}; }
		};
		for (const name of ['createUI', 'setupListeners', 'hijackStartButton', 'setupQuizSavedModalObserver', 'setupQuizCreatorExportButton', 'setupSocketCommandInterceptor', 'setupRoomSettingsHijackOnLobbyEnter', 'setupBasicModeUIObserver', 'restoreDifficultSongSuggestions']) context[name] = vi.fn();
		const setupCode = connector.slice(connector.indexOf('function setup() {'), connector.indexOf('function setupRoomSettingsHijackOnLobbyEnter('));
		vm.runInNewContext(queueCode + '\n' + setupCode, context);
		context.setup();
		expect(requests).toHaveLength(1);
		expect(JSON.parse(requests[0].data).annSongId).toBe(42);
		requests[0].onload({ status: 200 });
		expect(requests).toHaveLength(2);
		expect(JSON.parse(requests[1].data).annSongId).toBe(43);
		requests[1].onload({ status: 200 });
		expect(context.trainingState.pendingSync).toEqual([]);
	});
	it('saves a revealed song ID pinned as a string by the live connector', async () => {
		db.rpc.mockResolvedValue({ data: { success: true, nextReview: '2026-09-06', currentStreak: 1 } });
		const client = queuedConnector('42');
		expect(await deliver(client.requests[0])).toBe(200);
		expect(client.state.pendingSync).toHaveLength(0);
	});
	it('retains the answer after three stale results and saves it on the next delivery', async () => {
		db.rpc.mockResolvedValue({ data: { status: 'stale' } });
		const client = queuedConnector();
		expect(await deliver(client.requests[0])).toBe(503);
		expect(db.rpc).toHaveBeenCalledTimes(3);
		expect(client.state.pendingSync).toHaveLength(1);
		expect(client.state.syncInProgress).toBe(false);
		expect(client.timers[0].delay).toBe(5000);
		db.rpc.mockResolvedValue({
			data: { success: true, nextReview: '2026-09-06', currentStreak: 1 }
		});
		client.timers[0].callback();
		expect(client.requests[1].data).toBe(client.requests[0].data);
		expect(await deliver(client.requests[1])).toBe(200);
		expect(client.state.pendingSync).toHaveLength(0);
	});
	it('keeps database failures retryable too', async () => {
		db.rpc.mockResolvedValue({ error: { message: 'database unavailable' } });
		const client = queuedConnector();
		expect(await deliver(client.requests[0])).toBe(500);
		expect(client.state.pendingSync).toHaveLength(1);
		expect(client.timers).toHaveLength(1);
	});
	it('keeps a changed-payload idempotency conflict permanent', async () => {
		db.rpc.mockResolvedValue({ data: { status: 'idempotency_conflict' } });
		const client = queuedConnector();
		expect(await deliver(client.requests[0])).toBe(409);
		expect(client.state.pendingSync).toHaveLength(0);
		expect(client.timers).toHaveLength(0);
	});
});
