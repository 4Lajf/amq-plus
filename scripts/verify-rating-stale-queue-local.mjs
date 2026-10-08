import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import * as ratingValidation from '../src/lib/server/training/rating-request.js';

// Called inside the disposable PostgreSQL verifier. Only transport, identity and
// scheduling are adapters; the route retry loop, connector queue and SQL commit
// function are the actual application code. No hosted database is accessed.
export async function verifyStaleQueue({ db, writer, seed, commit }) {
	const fixture = await seed();
	const original = fixture.bodies[0];
	const progressState = async () => (await db.query('SELECT song_ann_id, fsrs_state, history, attempt_count, last_attempt_at FROM training_progress WHERE quiz_id=$1 ORDER BY song_ann_id', [fixture.quiz])).rows;
	const initialProgress = await progressState();
	let contention = true;
	const statuses = [];
	const adapter = {
		from(table) {
			assert.ok(['training_sessions', 'training_progress', 'training_rating_commits'].includes(table));
			const filters = [];
			let singular = false;
			const query = {
				select() { return query; },
				eq(key, value) { assert.match(key, /^[a-z_]+$/); filters.push([key, value]); return query; },
				limit() { return query; },
				single() { singular = true; return query; },
				maybeSingle() { singular = true; return query; },
				async then(resolve, reject) {
					try {
						const projection = table === 'training_progress' ? '*, updated_at::text AS updated_at' : '*';
						const rows = (await db.query(`SELECT ${projection} FROM ${table} WHERE ${filters.map(([key], i) => `${key}=$${i + 1}`).join(' AND ')}`, filters.map(([, value]) => value))).rows;
						return resolve({ data: singular ? rows[0] : rows });
					} catch (error) { return reject(error); }
				}
			};
			return query;
		},
		async rpc(name, body) {
			assert.equal(name, 'commit_training_rating');
			if (contention) {
				// A separate committed write invalidates the version the route just
				// read. PostgreSQL itself returns stale; no result is fabricated.
				await writer.query('UPDATE training_progress SET is_active=is_active WHERE id=$1', [body.p_expected_progress_id]);
			}
			const result = await commit(db, body);
			statuses.push(result.status);
			return { data: result };
		}
	};
	const routeSource = readFileSync(new URL('../src/routes/api/training/session/[sessionId]/progress/+server.js', import.meta.url), 'utf8');
	const routeContext = {
		...ratingValidation, console,
		json: (body, init) => Response.json(body, init),
		createSupabaseAdmin: () => adapter,
		lookupToken: async () => ({ user_id: original.p_user_id }),
		INVALID_TOKEN_MESSAGE: 'Invalid token',
		getUserTrainingPreferences: async () => ({ allow_same_day_reviews: true }),
		findDuplicateSiblings: async () => original.p_duplicate_song_ids,
		trainingScheduler: { updateCardState: () => original.p_fsrs_after }
	};
	vm.runInNewContext(routeSource.replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace('export async function POST', 'async function POST'), routeContext);
	const connector = readFileSync(new URL('../amqPlusConnector.user.js', import.meta.url), 'utf8');
	const requests = [], timers = [];
	const answer = { sessionId: fixture.sessions[0], requestId: randomUUID(), playedAt: new Date().toISOString(), annSongId: 101, rating: 3, success: true };
	const state = { authToken: 'local-only', pendingSync: [answer], syncInProgress: false };
	const display = { fadeIn: () => display, delay: () => display, fadeOut: () => display };
	const queueContext = {
		trainingState: state, trainingCompletionRequested: false,
		API_BASE_URL: 'http://127.0.0.1', console,
		GM_xmlhttpRequest: request => requests.push(request),
		setTimeout: (callback, delay) => timers.push({ callback, delay }),
		saveTrainingSettings() {}, sendSystemMessage() {}, $: () => display
	};
	vm.runInNewContext(connector.slice(connector.indexOf('function processTrainingSyncQueue('), connector.indexOf('function updateTrainingAccuracy(')), queueContext);
	const deliver = async (request) => {
		const response = await routeContext.POST({ params: { sessionId: fixture.sessions[0] }, request: new Request('http://127.0.0.1/progress', { method: 'POST', body: request.data }) });
		const text = await response.text();
		request.onload({ status: response.status, responseText: text });
		return { status: response.status, body: JSON.parse(text) };
	};
	queueContext.processTrainingSyncQueue();
	assert.equal((await deliver(requests[0])).status, 503);
	assert.deepEqual(statuses, ['stale', 'stale', 'stale']);
	assert.equal(state.pendingSync.length, 1);
	assert.equal(state.syncInProgress, false);
	assert.equal(timers[0].delay, 5000);
	assert.deepEqual(await progressState(), initialProgress);
	assert.equal((await db.query('SELECT sum(correct_songs + incorrect_songs)::int AS n FROM training_sessions WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 0);
	assert.equal((await db.query('SELECT count(*)::int AS n FROM training_session_plays WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 0);
	assert.equal((await db.query('SELECT count(*)::int AS n FROM training_rating_commits WHERE request_id=$1', [answer.requestId])).rows[0].n, 0);
	contention = false;
	timers[0].callback();
	assert.equal(requests[1].data, requests[0].data);
	assert.equal((await deliver(requests[1])).status, 200);
	assert.equal(state.pendingSync.length, 0);
	// Replay the same HTTP body after success as if its acknowledgement was lost.
	const replay = await deliver({ ...requests[1], onload() {} });
	assert.equal(replay.status, 200);
	assert.equal(replay.body.idempotentReplay, true);
	assert.deepEqual(statuses, ['stale', 'stale', 'stale', 'committed', 'duplicate']);
	assert.equal((await db.query('SELECT count(*)::int AS n FROM training_session_plays WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 1);
	assert.equal((await db.query('SELECT count(*)::int AS n FROM training_rating_commits WHERE request_id=$1', [answer.requestId])).rows[0].n, 1);
	assert.equal((await db.query('SELECT sum(attempt_count)::int AS n FROM training_progress WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 1);
	assert.equal((await db.query('SELECT sum(correct_songs)::int AS n FROM training_sessions WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 1);
	const savedProgress = await progressState();
	assert.equal(savedProgress.reduce((n, row) => n + row.history.length, 0), 1);
	assert.ok(savedProgress.every(row => row.fsrs_state.reps === original.p_fsrs_after.reps));
	await db.query('DELETE FROM quiz_configurations WHERE id=$1', [fixture.quiz]);
	return { staleAttempts: 3, queuedAfter503: true, retryBodyUnchanged: true, committedExactlyOnce: true, replayIdempotent: true };
}
