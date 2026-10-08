// Disposable PostgreSQL only. No .env or hosted connection is used.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { rebuildHistory } from '../src/lib/server/training/history-replay.js';
const { Client } = createRequire(join(process.env.AMQ_PG_RUNTIME, 'package.json'))('pg');
const connection = { host: '127.0.0.1', port: 55439, user: 'postgres' };
const name = `amq_checkpoint_verify_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ ...connection, database: 'postgres' }); await admin.connect();
let db, racer;
const sql = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
try {
 await admin.query(`CREATE DATABASE ${name}`);
 db = new Client({ ...connection, database: name }); await db.connect();
 racer = new Client({ ...connection, database: name }); await racer.connect();
 await db.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE quiz_configurations(id uuid PRIMARY KEY,user_id uuid);
 DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;`);
 const training = sql('20251108000000_training_system.sql');
 await db.query(training.slice(0, training.indexOf('-- Function to extract due timestamp')));
 const plays = sql('20251124000000_add_training_session_plays.sql');
 await db.query(plays.slice(0, plays.indexOf('-- Enable RLS')));
 await db.query(`ALTER TABLE training_progress DROP COLUMN song_key CASCADE;
 ALTER TABLE training_progress ADD COLUMN song_ann_id integer;
 ALTER TABLE training_progress ADD COLUMN is_active boolean DEFAULT true;
 ALTER TABLE training_progress ADD COLUMN inactivated_at timestamptz;
 ALTER TABLE training_progress ADD COLUMN suspended_at timestamptz;
 CREATE UNIQUE INDEX progress_identity ON training_progress(user_id,quiz_id,song_ann_id);
 ALTER TABLE training_session_plays DROP COLUMN song_key;`);
 for (const migration of ['20260905000000_atomic_training_rating_commits.sql','20260906000000_lock_rating_duplicate_groups.sql',
 '20260909000000_delete_training_attempt_counters.sql','20260924155601_guard_active_training_deletion.sql','20260924160334_checkpointed_training_history.sql']) await db.query(sql(migration));
 const user=randomUUID(), quiz=randomUUID(), session=randomUUID();
 const settings={version:'amq-fsrs-20260924-v1',fingerprint:'local-test-engine',allowSameDayReviews:true};
 await db.query('INSERT INTO auth.users VALUES($1)',[user]);
 await db.query('INSERT INTO quiz_configurations VALUES($1,$2)',[quiz,user]);
 await db.query(`INSERT INTO training_sessions(id,user_id,quiz_id,session_data) VALUES($1,$2,$3,'{"playlistAnnSongIds":[101,102]}')`,[session,user,quiz]);
 const card={state:2,due:'2026-01-01T00:00:00Z',stability:10};
 await db.query(`INSERT INTO training_progress(user_id,quiz_id,song_ann_id,fsrs_state,attempt_count,success_count,failure_count,history)
 VALUES($1,$2,101,$3,5,4,1,'[{"imported":true}]'),($1,$2,102,$3,0,0,0,'[]')`,[user,quiz,card]);
 const progress=async()=> (await db.query('SELECT *,updated_at::text AS updated_at FROM training_progress WHERE song_ann_id=101')).rows[0];
 const requests=[];
 async function rate(rating,index,duplicates=[], client=db, requestId=randomUUID()) {
  const before=await progress();
  const after={...before.fsrs_state,stability:before.fsrs_state.stability+rating,last_review:`2026-01-0${index+2}T00:00:00.000Z`};
  const args=[user,session,requestId,101,rating,rating!==1,after.last_review,before.id,before.updated_at,before.fsrs_state,after,'','',duplicates,settings];
  const result=(await client.query('SELECT commit_training_rating_checkpointed($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) AS result',args)).rows[0].result;
  if(result.status==='committed') requests.push(requestId);
  return {result,args};
 }
 const a=await rate(3,0),b=await rate(1,1,[102]),c=await rate(4,2,[102]);
 assert.equal(c.result.status,'committed');
 const playId=(await db.query('SELECT play_id FROM training_rating_commits WHERE request_id=$1',[requests[1]])).rows[0].play_id;
 const prepare=async(id=playId)=> (await db.query('SELECT prepare_training_history_deletion($1,$2,$3) AS p',[user,session,id])).rows[0].p;
 await assert.rejects(prepare(),e=>e.code==='PT409');
 await db.query('UPDATE training_sessions SET ended_at=now() WHERE id=$1',[session]);
 for(const role of ['anon','authenticated']) {
  await db.query(`SET ROLE ${role}`); await assert.rejects(prepare(),/permission denied/); await db.query('RESET ROLE');
 }
 await assert.rejects(db.query('SELECT prepare_training_history_deletion($1,$2,$3)',[randomUUID(),session,playId]),e=>e.code==='PT404');
 const journal=async()=> (await db.query('SELECT * FROM training_history_journal ORDER BY id')).rows;
 const schedule=(state,rating,options)=>({...state,stability:state.stability+rating,last_review:options.now});
 let plan=await prepare();
 const changes=rebuildHistory(await journal(),plan.requestIds,schedule,settings);
 assert.equal(changes.find(x=>x.song_ann_id===101).attempt_count,7);
 assert.equal(changes.find(x=>x.song_ann_id===101).fsrs_state.stability,17);
 assert.equal(changes.find(x=>x.song_ann_id===102).fsrs_state.stability,17);
 const commit=async(p=plan,updates=changes,id=playId,client=db)=> (await client.query('SELECT commit_training_history_deletion($1,$2,$3,$4,$5,$6) AS result',[user,session,id,p.revision,JSON.stringify(p.playIds),JSON.stringify(updates)])).rows[0].result;
 // Match hosted service-role table privileges/BYPASSRLS, transactionally;
 // rollback also restores the disposable cluster role's original flags/grants.
 await db.query('BEGIN');
 await db.query('ALTER ROLE service_role BYPASSRLS');
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role');
 await db.query('SET LOCAL ROLE service_role');
 assert.equal((await commit()).status,'deleted');
 await db.query('ROLLBACK');
 assert.equal((await progress()).attempt_count,8);
 // A write between prepare and commit leaves the attempted deletion untouched.
 await db.query('UPDATE training_progress SET is_active=false WHERE song_ann_id=101');
 assert.equal((await commit()).status,'stale');
 assert.equal((await progress()).attempt_count,8);
 plan=await prepare();
 // Force failure after progress/journal mutations: PostgreSQL rolls all of it back.
 await db.query(`CREATE FUNCTION inject_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
 CREATE TRIGGER zz_fail_delete BEFORE DELETE ON training_session_plays FOR EACH ROW EXECUTE FUNCTION inject_delete_failure();`);
 await assert.rejects(commit(),/injected failure/);
 assert.equal((await progress()).attempt_count,8);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM training_session_plays')).rows[0].n,3);
 assert.equal((await journal()).some(e=>e.deleted),false);
 await db.query('DROP TRIGGER zz_fail_delete ON training_session_plays');
 plan=await prepare(); assert.equal((await commit()).status,'deleted');
 assert.equal((await progress()).attempt_count,7);
 assert.equal((await progress()).fsrs_state.stability,17);
 assert.equal((await progress()).is_active,false);
 assert.deepEqual((await db.query('SELECT correct_songs,incorrect_songs,total_songs FROM training_sessions')).rows[0],{correct_songs:2,incorrect_songs:0,total_songs:2});
 // Retry of the removed attempt must be idempotent and must not recreate a play.
 const retry=(await db.query('SELECT commit_training_rating_checkpointed($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) AS result',b.args)).rows[0].result;
 assert.equal(retry.status,'duplicate');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM training_session_plays')).rows[0].n,2);
 // Another deletion replays past the tombstone, restoring the import checkpoint.
 plan=await prepare(null);
 const allChanges=rebuildHistory(await journal(),plan.requestIds,schedule,settings);
 assert.equal((await commit(plan,allChanges,null)).status,'deleted');
 assert.equal((await progress()).attempt_count,5);
 assert.equal((await progress()).fsrs_state.stability,10);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM training_sessions')).rows[0].n,0);
 // A merge becomes a complete new baseline, including imported counters/history.
 await db.query(`INSERT INTO training_sessions(id,user_id,quiz_id,ended_at,session_data) VALUES($1,$2,$3,now(),'{"playlistAnnSongIds":[101,102]}')`,[session,user,quiz]);
 await db.query(`UPDATE training_progress SET fsrs_state=$1,attempt_count=20,success_count=18,failure_count=2,history='[{"merged":true}]' WHERE song_ann_id=101`,[{...card,stability:100}]);
 const mergedRating=await rate(3,0);
 const mergedPlay=(await db.query('SELECT play_id FROM training_rating_commits WHERE request_id=$1',[mergedRating.args[2]])).rows[0].play_id;
 plan=await prepare(mergedPlay);
 const mergedChanges=rebuildHistory(await journal(),plan.requestIds,schedule,settings);
 // The rating transaction holds the same quiz lock while deletion waits.
 await racer.query('BEGIN');
 await rate(4,1,[],racer);
 const waitingCommit=commit(plan,mergedChanges,mergedPlay);
 let observedWait=false;
 for(let i=0;i<50;i++) {
   const waiting=(await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[db.processID])).rows[0];
   if(waiting?.wait_event_type==='Lock') { observedWait=true; break; }
   await new Promise(resolve=>setTimeout(resolve,10));
 }
 await racer.query('COMMIT');
 assert.equal(observedWait,true);
 assert.equal((await waitingCommit).status,'stale');
 assert.equal((await progress()).attempt_count,22);
 plan=await prepare(mergedPlay);
 assert.equal((await commit(plan,rebuildHistory(await journal(),plan.requestIds,schedule,settings),mergedPlay)).status,'deleted');
 assert.equal((await progress()).attempt_count,21);
 assert.equal((await progress()).fsrs_state.stability,104);
 plan=await prepare(null);
 assert.equal((await commit(plan,rebuildHistory(await journal(),plan.requestIds,schedule,settings),null)).status,'deleted');
 assert.equal((await progress()).attempt_count,20);
 assert.deepEqual((await progress()).history,[{merged:true}]);
 await db.query('SELECT clear_training_song_history($1,$2,101,null)',[user,quiz]);
 assert.equal(await progress(),undefined);
 assert.equal((await journal()).at(-1).snapshot,null);
 // A completed quiz/account cleanup may cascade without leaving orphan journals.
 await db.query('DELETE FROM quiz_configurations WHERE id=$1',[quiz]);
 assert.equal((await journal()).length,0);
 console.log('PASS: checkpoint capture, duplicate propagation, merge baselines, active/ownership/role guards, concurrent rating serialization, rollback, counters, retry tombstones, atomic song clearing and full-session replay');
} finally { await racer?.end(); await db?.end(); await admin.query(`DROP DATABASE IF EXISTS ${name}`); await admin.end(); }
