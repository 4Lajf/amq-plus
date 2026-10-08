import { beforeEach, describe, expect, it, vi } from 'vitest';

let db;
const lookup = vi.fn(),
	candidates = vi.fn();
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => db }));
vi.mock('$lib/server/training/training-utils.js', () => ({
	lookupToken: (...args) => lookup(...args),
	INVALID_TOKEN_MESSAGE: 'Invalid token'
}));
vi.mock('$lib/server/training/difficult-songs.js', () => ({
	getDifficultSongs: (...args) => candidates(...args)
}));
const { POST } = await import(
	'../src/routes/api/training/session/[sessionId]/difficult-songs/+server.js'
);

function database({
	prior = null,
	session = { quiz_id: 'quiz', ended_at: '2026-09-05' },
	fail = false
} = {}) {
	const writes = [],
		filters = [];
	return {
		writes,
		filters,
		from(table) {
			let updating = false;
			const q = {
				select() {
					return updating
						? Promise.resolve({
								data: [{ song_ann_id: 42 }],
								error: fail ? new Error('write failed') : null
							})
						: q;
				},
				eq(key, value) {
					filters.push([table, key, value]);
					return q;
				},
				is() {
					return q;
				},
				update(value) {
					updating = true;
					writes.push(value);
					return q;
				},
				single() {
					return Promise.resolve({
						data: table === 'training_sessions' ? session : { difficult_song_suggestion: prior }
					});
				}
			};
			return q;
		}
	};
}

function decide(choice = 'keep') {
	return POST({
		params: { sessionId: 'session' },
		request: new Request('https://example.test', {
			method: 'POST',
			body: JSON.stringify({ token: 'token', annSongId: 42, choice })
		})
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	lookup.mockResolvedValue({ user_id: 'learner' });
	candidates.mockResolvedValue([{ annSongId: 42, lapses: 8 }]);
	db = database();
});

describe('difficult-song explicit decisions', () => {
	it('Keep practicing saves suppression without changing suspension or FSRS', async () => {
		expect((await decide()).status).toBe(200);
		expect(Object.keys(db.writes[0])).toEqual(['difficult_song_suggestion']);
		expect(db.writes[0].difficult_song_suggestion).toMatchObject({
			sessionId: 'session',
			lapses: 8,
			choice: 'keep'
		});
		expect(db.filters).toContainEqual(['training_progress', 'user_id', 'learner']);
		expect(db.filters).toContainEqual(['training_sessions', 'user_id', 'learner']);
	});
	it('Pause explicitly saves suspension alongside the decision', async () => {
		expect((await decide('pause')).status).toBe(200);
		expect(db.writes[0].suspended_at).toBe(db.writes[0].difficult_song_suggestion.decidedAt);
		expect(db.writes[0].fsrs_state).toBeUndefined();
	});
	it('replays an already saved decision without a second write', async () => {
		db = database({ prior: { sessionId: 'session', choice: 'keep' } });
		expect(await (await decide('pause')).json()).toEqual({ success: true, choice: 'keep' });
		expect(db.writes).toHaveLength(0);
	});
	it('rejects invalid authentication and unfinished sessions', async () => {
		lookup.mockResolvedValueOnce(null);
		expect((await decide()).status).toBe(401);
		db = database({ session: { quiz_id: 'quiz', ended_at: null } });
		expect((await decide()).status).toBe(404);
		expect(db.writes).toHaveLength(0);
	});
	it('does not pause a card that no longer qualifies', async () => {
		candidates.mockResolvedValue([]);
		expect(await (await decide('pause')).json()).toEqual({ success: true, noLongerEligible: true });
		expect(db.writes).toHaveLength(0);
	});
	it('reports a failed save so the connector keeps the suggestion', async () => {
		db = database({ fail: true });
		expect((await decide()).status).toBe(500);
	});
});
