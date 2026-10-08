// Requires a disposable PostgreSQL server on 127.0.0.1:55439 and pg in
// AMQ_PG_RUNTIME (a separate temporary package directory). No .env is loaded.
// Runs actual migration SQL with local-only fault injection, then drops the DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { verifyStaleQueue } from './verify-rating-stale-queue-local.mjs';

const { Client } = createRequire(join(process.env.AMQ_PG_RUNTIME, 'package.json'))('pg');
const connection = { host: '127.0.0.1', port: 55439, user: 'postgres' };
const database = `amq_rating_verify_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ ...connection, database: 'postgres' });
await admin.connect();
const clients = [];
let created = false;
const sql = (name) =>
	readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
try {
	await admin.query(`CREATE DATABASE ${database}`);
	created = true;
	for (let i = 0; i < 3; i++) {
		const client = new Client({ ...connection, database });
		await client.connect();
		await client.query("SET statement_timeout = '15s'");
		clients.push(client);
	}
	const [db, racer1, racer2] = clients;
	await db.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
		CREATE TABLE public.quiz_configurations(id uuid PRIMARY KEY);
		DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
		IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
		IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;`);
	const training = sql('20251108000000_training_system.sql');
	await db.query(training.slice(0, training.indexOf('-- Function to extract due timestamp')));
	await db.query(
		training.slice(
			training.indexOf('-- Function to update updated_at'),
			training.indexOf('-- Function to update updated_at') +
				training
					.slice(training.indexOf('-- Function to update updated_at'))
					.indexOf('EXECUTE FUNCTION public.update_training_progress_updated_at();') +
				'EXECUTE FUNCTION public.update_training_progress_updated_at();'.length
		)
	);
	const plays = sql('20251124000000_add_training_session_plays.sql');
	await db.query(plays.slice(0, plays.indexOf('-- Enable RLS')));
	await db.query(`ALTER TABLE training_progress DROP COLUMN song_key CASCADE;
		ALTER TABLE training_progress ADD COLUMN song_ann_id integer;
		ALTER TABLE training_progress ADD COLUMN is_active boolean DEFAULT true;
		ALTER TABLE training_progress ADD COLUMN inactivated_at timestamptz;
		ALTER TABLE training_progress ADD COLUMN suspended_at timestamptz;
		CREATE UNIQUE INDEX progress_identity ON training_progress(user_id,quiz_id,song_ann_id);
		ALTER TABLE training_session_plays DROP COLUMN song_key;
	`);
	await db.query(sql('20260905000000_atomic_training_rating_commits.sql'));
	const user = randomUUID();
	await db.query('INSERT INTO auth.users VALUES ($1)', [user]);
	const getProgress = async (quiz) =>
		(
			await db.query(
				'SELECT *, updated_at::text AS updated_at FROM training_progress WHERE quiz_id=$1 ORDER BY song_ann_id',
				[quiz]
			)
		).rows;
	const seed = async () => {
		const quiz = randomUUID();
		const sessions = [randomUUID(), randomUUID()];
		await db.query('INSERT INTO quiz_configurations VALUES ($1)', [quiz]);
		for (const id of sessions)
			await db.query(
				`INSERT INTO training_sessions(id,user_id,quiz_id,total_songs,session_data)
			VALUES($1,$2,$3,1,'{"playlistAnnSongIds":[101,102],"combineDuplicates":true}')`,
				[id, user, quiz]
			);
		for (const id of [101, 102])
			await db.query(
				`INSERT INTO training_progress(user_id,quiz_id,song_ann_id,fsrs_state)
			VALUES($1,$2,$3,$4)`,
				[
					user,
					quiz,
					id,
					{
						state: 2,
						reps: 4,
						due: new Date().toISOString(),
						stability: 4,
						difficulty: 5,
						songKey: String(id)
					}
				]
			);
		const rows = await getProgress(quiz);
		const bodies = rows.map((row, index) => ({
			p_user_id: user,
			p_session_id: sessions[index],
			p_request_id: randomUUID(),
			p_ann_song_id: row.song_ann_id,
			p_rating: 3,
			p_success: true,
			p_played_at: new Date().toISOString(),
			p_expected_progress_id: row.id,
			p_expected_updated_at: row.updated_at,
			p_fsrs_before: row.fsrs_state,
			p_fsrs_after: {
				...row.fsrs_state,
				reps: 5,
				due: new Date(Date.now() + 600_000).toISOString()
			},
			p_user_answer: 'local test',
			p_correct_answer: 'local test',
			p_duplicate_song_ids: [row.song_ann_id === 101 ? 102 : 101]
		}));
		return { quiz, sessions, bodies };
	};
	const commit = async (client, body) =>
		(
			await client.query(
				`SELECT commit_training_rating(${Object.keys(body)
					.map((name, i) => `${name} => $${i + 1}`)
					.join(',')}) AS result`,
				Object.values(body)
			)
		).rows[0].result;
	// Sleep is local-only and makes opposite row locks overlap reproducibly.
	await db.query(`CREATE FUNCTION slow_rating_update() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$;
		CREATE TRIGGER slow_rating_update BEFORE UPDATE ON training_progress FOR EACH ROW EXECUTE FUNCTION slow_rating_update();`);
	const old = await seed();
	const originalRace = await Promise.allSettled([
		commit(racer1, old.bodies[0]),
		commit(racer2, old.bodies[1])
	]);
	assert.ok(
		originalRace.some((x) => x.status === 'rejected' && x.reason.code === '40P01'),
		'original migration reproduces deadlock'
	);
	await db.query('DELETE FROM quiz_configurations WHERE id=$1', [old.quiz]);
	await db.query(sql('20260906000000_lock_rating_duplicate_groups.sql'));
	for (let round = 0; round < 10; round++) {
		const fixture = await seed();
		const race = await Promise.all([
			commit(racer1, fixture.bodies[0]),
			commit(racer2, fixture.bodies[1])
		]);
		assert.equal(race.filter((x) => x.status === 'committed').length, 1);
		assert.equal(race.filter((x) => x.status === 'stale').length, 1);
		const stale = race.findIndex((x) => x.status === 'stale');
		const fresh = (await getProgress(fixture.quiz))[stale];
		const retry = {
			...fixture.bodies[stale],
			p_expected_updated_at: fresh.updated_at,
			p_fsrs_before: fresh.fsrs_state,
			p_fsrs_after: {
				...fresh.fsrs_state,
				reps: 6,
				due: new Date(Date.now() + 1_200_000).toISOString()
			}
		};
		assert.equal((await commit(racer1, retry)).status, 'committed');
		assert.equal((await commit(racer1, retry)).status, 'duplicate');
		for (const row of await getProgress(fixture.quiz)) {
			assert.equal(row.attempt_count, 1);
			assert.equal(row.history.length, 1);
			assert.deepEqual(row.fsrs_state, { ...retry.p_fsrs_after, songKey: String(row.song_ann_id) });
		}
		const counts = (
			await db.query(
				'SELECT correct_songs,incorrect_songs FROM training_sessions WHERE quiz_id=$1',
				[fixture.quiz]
			)
		).rows;
		assert.ok(counts.every((x) => x.correct_songs === 1 && x.incorrect_songs === 0));
		assert.equal(
			(
				await db.query('SELECT count(*)::int n FROM training_session_plays WHERE quiz_id=$1', [
					fixture.quiz
				])
			).rows[0].n,
			2
		);
		await db.query('DELETE FROM quiz_configurations WHERE id=$1', [fixture.quiz]);
	}
	await db.query('DROP TRIGGER slow_rating_update ON training_progress');
	const staleQueue = await verifyStaleQueue({ db, writer: racer2, seed, commit });
	const rollback = await seed();
	const snapshot = async () => {
		const result = {};
		for (const table of [
			'training_progress',
			'training_sessions',
			'training_session_plays',
			'training_rating_commits'
		]) {
			const key = table === 'training_rating_commits' ? 'request_id' : 'id';
			result[table] = (
				await db.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY ${key}`)
			).rows.map((x) => x.row);
		}
		return result;
	};
	const before = await snapshot();
	// Ledger response is the final write: progress, play, sibling and counters
	// have already changed inside the transaction when this local trigger fails.
	await db.query(`CREATE FUNCTION force_late_rating_failure() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'local rollback verification'; END $$;
		CREATE TRIGGER force_late_rating_failure BEFORE UPDATE ON training_rating_commits
		FOR EACH ROW EXECUTE FUNCTION force_late_rating_failure();`);
	await assert.rejects(commit(racer1, rollback.bodies[0]), /local rollback verification/);
	assert.deepEqual(await snapshot(), before);
	await db.query('DROP TRIGGER force_late_rating_failure ON training_rating_commits');
	assert.equal((await commit(racer1, rollback.bodies[0])).status, 'committed');
	assert.equal((await commit(racer1, rollback.bodies[0])).status, 'duplicate');
	const after = await snapshot();
	assert.equal(after.training_session_plays.length, 1);
	assert.equal(after.training_rating_commits.length, 1);
	assert.equal(
		after.training_progress.reduce((n, x) => n + x.attempt_count, 0),
		1
	);
	assert.equal(
		after.training_sessions.reduce((n, x) => n + x.correct_songs, 0),
		1
	);
	await db.query(sql('20260909000000_delete_training_attempt_counters.sql'));
	for (let round = 0; round < 10; round++) {
		const fixture = await seed();
		assert.equal((await commit(racer1, fixture.bodies[0])).status, 'committed');
		const sessionId = fixture.bodies[0].p_session_id;
		const play = (await db.query('SELECT id FROM training_session_plays WHERE session_id=$1', [sessionId])).rows[0];
		const fresh = (await getProgress(fixture.quiz))[1];
		const next = { ...fixture.bodies[1], p_session_id: sessionId,
			p_expected_updated_at: fresh.updated_at, p_fsrs_before: fresh.fsrs_state };
		const [deleted, rated] = await Promise.all([
			racer1.query('SELECT delete_training_attempt($1,$2,$3) result', [user, sessionId, play.id]),
			commit(racer2, next)
		]);
		assert.equal(deleted.rows[0].result.status, 'deleted');
		assert.equal(rated.status, 'committed');
		const counters = (await db.query('SELECT correct_songs,incorrect_songs FROM training_sessions WHERE id=$1',[sessionId])).rows[0];
		assert.deepEqual(counters, { correct_songs: 1, incorrect_songs: 0 });
		assert.equal((await db.query('SELECT count(*)::int n FROM training_session_plays WHERE session_id=$1',[sessionId])).rows[0].n, 1);
		await db.query('DELETE FROM quiz_configurations WHERE id=$1',[fixture.quiz]);
	}
	// A late parent-delete failure must roll back cascaded plays and ledger rows.
	const sessionCascade = await seed();
	assert.equal((await commit(racer1, sessionCascade.bodies[0])).status, 'committed');
	const cascadeSessionId = sessionCascade.bodies[0].p_session_id;
	const cascadeBefore = await snapshot();
	await db.query(`CREATE FUNCTION fail_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'local session cascade rollback'; END $$;
		CREATE TRIGGER fail_session_delete AFTER DELETE ON training_sessions
		FOR EACH ROW EXECUTE FUNCTION fail_session_delete();`);
	await assert.rejects(db.query('DELETE FROM training_sessions WHERE id=$1 AND user_id=$2',
		[cascadeSessionId, user]), /local session cascade rollback/);
	assert.deepEqual(await snapshot(), cascadeBefore);
	await db.query('DROP TRIGGER fail_session_delete ON training_sessions');
	assert.equal((await db.query('DELETE FROM training_sessions WHERE id=$1 AND user_id=$2 RETURNING id',
		[cascadeSessionId, user])).rowCount, 1);
	for (const table of ['training_session_plays', 'training_rating_commits']) {
		assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE session_id=$1`,
			[cascadeSessionId])).rows[0].n, 0);
	}
	assert.deepEqual((await snapshot()).training_progress, cascadeBefore.training_progress);
	await db.query('DELETE FROM quiz_configurations WHERE id=$1', [sessionCascade.quiz]);
	// Model the recalculation's PostgREST conditional write while a real rating
	// transaction owns the row lock. Both stale UPDATE and DELETE must do nothing.
	for (const operation of ['update', 'delete']) {
		for (let round = 0; round < 5; round++) {
			const fixture = await seed();
			const original = (await getProgress(fixture.quiz))[0];
			await racer1.query('BEGIN');
			assert.equal((await commit(racer1, fixture.bodies[0])).status, 'committed');
			const statement = operation === 'update'
				? 'UPDATE training_progress SET attempt_count=999 WHERE user_id=$1 AND quiz_id=$2 AND song_ann_id=$3 AND id=$4 AND updated_at=$5 RETURNING id'
				: 'DELETE FROM training_progress WHERE user_id=$1 AND quiz_id=$2 AND song_ann_id=$3 AND id=$4 AND updated_at=$5 RETURNING id';
			const staleWrite = racer2.query(statement,
				[user, fixture.quiz, original.song_ann_id, original.id, original.updated_at]);
			await racer1.query('COMMIT');
			assert.equal((await staleWrite).rowCount, 0);
			const preserved = (await getProgress(fixture.quiz))[0];
			assert.equal(preserved.id, original.id);
			assert.equal(preserved.attempt_count, original.attempt_count + 1);
			assert.deepEqual(preserved.fsrs_state, fixture.bodies[0].p_fsrs_after);
			assert.equal((await db.query('SELECT count(*)::int n FROM training_session_plays WHERE quiz_id=$1', [fixture.quiz])).rows[0].n, 1);
			await db.query('DELETE FROM quiz_configurations WHERE id=$1', [fixture.quiz]);
		}
	}
	console.log(
		JSON.stringify(
			{
				postgres: (await db.query('SELECT version()')).rows[0].version,
				originalDeadlockReproduced: true,
				fixedConcurrentRounds: 10,
				concurrentDeleteAndRatingRounds: 10,
				sessionCascadeRollbackAndSuccess: true,
				staleRecalculationUpdateAndDeleteRounds: 10,
				staleQueue,
				lateFailureRolledBackAllTables: true,
				retryCommittedOnce: true
			},
			null,
			2
		)
	);
} finally {
	await Promise.all(clients.map((client) => client.end()));
	if (created) await admin.query(`DROP DATABASE ${database}`);
	await admin.end();
	console.log('Disposable local database removed.');
}
