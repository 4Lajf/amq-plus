// Run with: node --env-file=.env scripts/verify-rating-concurrency.mjs --run
// Creates and removes one private fixture; never changes existing learning data.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (!process.argv.includes('--run'))
	throw new Error('Pass --run to create a temporary database fixture.');
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
	auth: { persistSession: false }
});
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const sourceId = '58ea2809-dbcd-4724-aea5-a31d96463330';
const quizId = randomUUID();
const sessionId = randomUUID();
const extraSessionIds = [randomUUID(), randomUUID()];
const duplicateSessionIds = [randomUUID(), randomUUID()];
const songIds = [29028, 14877, 23963];
const check = ({ data, error }) => {
	if (error) throw new Error(JSON.stringify(error));
	return data;
};
const results = [];
let created = false;
try {
	const source = check(
		await db
			.from('quiz_configurations')
			.select('configuration_data,creator_username')
			.eq('id', sourceId)
			.eq('user_id', owner)
			.single()
	);
	check(
		await db.from('quiz_configurations').insert({
			id: quizId,
			user_id: owner,
			name: '[TEST] Temporary rating concurrency',
			is_public: false,
			allow_remixing: false,
			play_token: randomBytes(16).toString('base64url'),
			share_token: randomBytes(16).toString('base64url'),
			...source
		})
	);
	created = true;
	check(
		await db.from('training_sessions').insert({
			id: sessionId,
			user_id: owner,
			quiz_id: quizId,
			total_songs: 3,
			correct_songs: 0,
			incorrect_songs: 0,
			session_data: { playlistAnnSongIds: songIds }
		})
	);
	const playedAt = new Date().toISOString();
	const due = new Date(Date.now() + 600_000).toISOString();
	const payload = (songId, success) => ({
		p_user_id: owner,
		p_session_id: sessionId,
		p_request_id: randomUUID(),
		p_ann_song_id: songId,
		p_rating: success ? 3 : 1,
		p_success: success,
		p_played_at: playedAt,
		p_expected_progress_id: null,
		p_expected_updated_at: null,
		p_fsrs_before: { state: 0, reps: 0 },
		p_fsrs_after: { state: 1, reps: 1, due, stability: 1, difficulty: 5, songKey: String(songId) },
		p_user_answer: success ? 'test answer' : '',
		p_correct_answer: 'test answer',
		p_duplicate_song_ids: []
	});
	const commit = async (body) => check(await db.rpc('commit_training_rating', body));
	const first = payload(songIds[0], false);
	const duplicates = await Promise.all(Array.from({ length: 5 }, () => commit(first)));
	assert.equal(duplicates.filter((x) => x.status === 'committed').length, 1);
	assert.equal(duplicates.filter((x) => x.status === 'duplicate').length, 4);
	for (const result of duplicates) {
		assert.equal(result.nextReview, due);
		assert.equal(result.currentStreak, 0);
		assert.equal(result.success, true);
	}
	let progress = check(await db.from('training_progress').select('*').eq('quiz_id', quizId));
	let plays = check(
		await db.from('training_session_plays').select('id').eq('session_id', sessionId)
	);
	let session = check(
		await db
			.from('training_sessions')
			.select('correct_songs,incorrect_songs')
			.eq('id', sessionId)
			.single()
	);
	let ledger = check(
		await db.from('training_rating_commits').select('request_id').eq('session_id', sessionId)
	);
	assert.equal(progress.length, 1);
	assert.equal(progress[0].attempt_count, 1);
	assert.equal(progress[0].history.length, 1);
	assert.equal(plays.length, 1);
	assert.equal(ledger.length, 1);
	assert.deepEqual(session, { correct_songs: 0, incorrect_songs: 1 });
	results.push({
		scenario: 'five simultaneous first submissions',
		commits: 1,
		replays: 4,
		plays: 1,
		attempts: 1,
		history: 1
	});
	const distinct = await Promise.all([
		commit(payload(songIds[1], true)),
		commit(payload(songIds[2], false))
	]);
	assert.ok(distinct.every((x) => x.status === 'committed'));
	progress = check(
		await db.from('training_progress').select('attempt_count,history').eq('quiz_id', quizId)
	);
	plays = check(await db.from('training_session_plays').select('id').eq('session_id', sessionId));
	session = check(
		await db
			.from('training_sessions')
			.select('correct_songs,incorrect_songs')
			.eq('id', sessionId)
			.single()
	);
	ledger = check(
		await db.from('training_rating_commits').select('request_id').eq('session_id', sessionId)
	);
	assert.equal(progress.length, 3);
	assert.ok(progress.every((x) => x.attempt_count === 1 && x.history.length === 1));
	assert.equal(plays.length, 3);
	assert.equal(ledger.length, 3);
	assert.deepEqual(session, { correct_songs: 1, incorrect_songs: 2 });
	results.push({
		scenario: 'two distinct concurrent answers in one session',
		addedPlays: 2,
		correct: 1,
		incorrect: 2,
		totalLedger: 3
	});
	check(
		await db.from('training_sessions').insert(
			extraSessionIds.map((id) => ({
				id,
				user_id: owner,
				quiz_id: quizId,
				total_songs: 1,
				correct_songs: 0,
				incorrect_songs: 0,
				session_data: { playlistAnnSongIds: [songIds[0]] }
			}))
		)
	);
	const before = check(
		await db
			.from('training_progress')
			.select('*')
			.eq('quiz_id', quizId)
			.eq('song_ann_id', songIds[0])
			.single()
	);
	const competing = extraSessionIds.map((id) => ({
		...payload(songIds[0], true),
		p_session_id: id,
		p_expected_progress_id: before.id,
		p_expected_updated_at: before.updated_at,
		p_fsrs_before: before.fsrs_state,
		p_fsrs_after: {
			...before.fsrs_state,
			reps: 2,
			due: new Date(Date.now() + 1_200_000).toISOString()
		}
	}));
	const raced = await Promise.all(competing.map(commit));
	assert.equal(raced.filter((x) => x.status === 'committed').length, 1);
	assert.equal(raced.filter((x) => x.status === 'stale').length, 1);
	const staleIndex = raced.findIndex((x) => x.status === 'stale');
	const fresh = check(await db.from('training_progress').select('*').eq('id', before.id).single());
	assert.equal(fresh.attempt_count, 2);
	const pendingId = competing[staleIndex].p_request_id;
	const pendingLedger = check(
		await db.from('training_rating_commits').select('request_id').eq('request_id', pendingId)
	);
	assert.equal(pendingLedger.length, 0);
	const retried = {
		...competing[staleIndex],
		p_expected_updated_at: fresh.updated_at,
		p_fsrs_before: fresh.fsrs_state,
		p_fsrs_after: {
			...fresh.fsrs_state,
			reps: 3,
			due: new Date(Date.now() + 1_800_000).toISOString()
		}
	};
	assert.equal((await commit(retried)).status, 'committed');
	assert.equal((await commit(retried)).status, 'duplicate');
	const final = check(await db.from('training_progress').select('*').eq('id', before.id).single());
	assert.equal(final.attempt_count, 3);
	assert.equal(final.history.length, 3);
	assert.equal(final.history.filter((x) => x.requestId === pendingId).length, 1);
	assert.deepEqual(final.fsrs_state, retried.p_fsrs_after);
	const competingSessions = check(
		await db
			.from('training_sessions')
			.select('correct_songs,incorrect_songs')
			.in('id', extraSessionIds)
	);
	assert.ok(competingSessions.every((x) => x.correct_songs === 1 && x.incorrect_songs === 0));
	results.push({
		scenario: 'same card in separate sessions',
		firstCommit: 1,
		stale: 1,
		retryPreservedRequestId: true,
		finalAttempts: 3,
		replayAddedNothing: true
	});
	check(
		await db.from('training_sessions').insert(
			duplicateSessionIds.map((id) => ({
				id,
				user_id: owner,
				quiz_id: quizId,
				total_songs: 1,
				correct_songs: 0,
				incorrect_songs: 0,
				session_data: { playlistAnnSongIds: songIds.slice(1), combineDuplicates: true }
			}))
		)
	);
	const siblings = check(
		await db
			.from('training_progress')
			.select('*')
			.eq('quiz_id', quizId)
			.in('song_ann_id', songIds.slice(1))
	);
	const linked = siblings.map((row, index) => ({
		...payload(row.song_ann_id, true),
		p_session_id: duplicateSessionIds[index],
		p_expected_progress_id: row.id,
		p_expected_updated_at: row.updated_at,
		p_fsrs_before: row.fsrs_state,
		p_fsrs_after: {
			...row.fsrs_state,
			reps: 2,
			due: new Date(Date.now() + 2_400_000).toISOString()
		},
		p_duplicate_song_ids: siblings
			.filter((other) => other.id !== row.id)
			.map((other) => other.song_ann_id)
	}));
	const linkedResults = await Promise.all(linked.map(commit));
	assert.equal(linkedResults.filter((x) => x.status === 'committed').length, 1);
	assert.equal(linkedResults.filter((x) => x.status === 'stale').length, 1);
	const linkedStale = linkedResults.findIndex((x) => x.status === 'stale');
	const linkedFresh = check(
		await db.from('training_progress').select('*').eq('id', siblings[linkedStale].id).single()
	);
	const linkedRetry = {
		...linked[linkedStale],
		p_expected_updated_at: linkedFresh.updated_at,
		p_fsrs_before: linkedFresh.fsrs_state,
		p_fsrs_after: {
			...linkedFresh.fsrs_state,
			reps: 3,
			due: new Date(Date.now() + 3_000_000).toISOString()
		}
	};
	assert.equal((await commit(linkedRetry)).status, 'committed');
	assert.equal((await commit(linkedRetry)).status, 'duplicate');
	const linkedFinal = check(
		await db
			.from('training_progress')
			.select('*')
			.eq('quiz_id', quizId)
			.in('song_ann_id', songIds.slice(1))
	);
	for (const row of linkedFinal) {
		assert.equal(row.attempt_count, 2);
		assert.equal(row.history.length, 2);
		assert.deepEqual(row.fsrs_state, {
			...linkedRetry.p_fsrs_after,
			songKey: String(row.song_ann_id)
		});
	}
	const linkedSessions = check(
		await db
			.from('training_sessions')
			.select('correct_songs,incorrect_songs')
			.in('id', duplicateSessionIds)
	);
	assert.ok(linkedSessions.every((x) => x.correct_songs === 1 && x.incorrect_songs === 0));
	results.push({
		scenario: 'duplicate-linked cards in separate sessions',
		firstCommit: 1,
		stale: 1,
		retryPreservedRequestId: true,
		siblingSchedulesMatch: true,
		attemptsEach: 2
	});
	console.log(JSON.stringify({ results }, null, 2));
} finally {
	if (created) {
		// Delete only this run's generated ID, also checking ownership and fixture name.
		const deleted = check(
			await db
				.from('quiz_configurations')
				.delete()
				.eq('id', quizId)
				.eq('user_id', owner)
				.eq('name', '[TEST] Temporary rating concurrency')
				.select('id')
		);
		assert.equal(deleted.length, 1);
		for (const table of ['training_progress', 'training_sessions', 'training_session_plays']) {
			const rows = check(await db.from(table).select('id').eq('quiz_id', quizId));
			assert.equal(rows.length, 0, `${table} cleanup`);
		}
		const ledger = check(
			await db
				.from('training_rating_commits')
				.select('request_id')
				.in('session_id', [sessionId, ...extraSessionIds, ...duplicateSessionIds])
		);
		assert.equal(ledger.length, 0, 'ledger cleanup');
		console.log('Temporary quiz, progress, sessions, plays, and ledger verified removed.');
	}
}
