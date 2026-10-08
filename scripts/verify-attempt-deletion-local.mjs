import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { Client } = createRequire(join(process.env.AMQ_PG_RUNTIME, 'package.json'))('pg');
const connection = { host: '127.0.0.1', port: 55439, user: 'postgres' };
const database = `amq_delete_verify_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ ...connection, database: 'postgres' });
await admin.connect();
let db;
try {
  await admin.query(`CREATE DATABASE ${database}`);
  db = new Client({ ...connection, database });
  await db.connect();
  await db.query(`CREATE TABLE training_sessions(id uuid primary key,user_id uuid,correct_songs int,incorrect_songs int,total_songs int,ended_at timestamptz);
    CREATE TABLE training_session_plays(id uuid primary key,session_id uuid,user_id uuid,quiz_id uuid,song_ann_id int,success boolean);`);
  await db.query(readFileSync(new URL('../supabase/migrations/20260909000000_delete_training_attempt_counters.sql', import.meta.url), 'utf8'));
  await db.query(readFileSync(new URL('../supabase/migrations/20260924155601_guard_active_training_deletion.sql', import.meta.url), 'utf8'));
  const user = randomUUID(), session = randomUUID(), quiz = randomUUID(), good = randomUUID(), bad = randomUUID();
  await db.query('INSERT INTO training_sessions VALUES($1,$2,1,1,2,now())', [session,user]);
  await db.query('INSERT INTO training_session_plays VALUES($1,$3,$4,$5,101,true),($2,$3,$4,$5,102,false)',[good,bad,session,user,quiz]);
  const remove = async (owner,id) => (await db.query('SELECT delete_training_attempt($1,$2,$3) AS result',[owner,session,id])).rows[0].result;
  const counts = async () => (await db.query('SELECT correct_songs,incorrect_songs,total_songs FROM training_sessions')).rows[0];
  for (const role of ['anon', 'authenticated']) {
    await db.query(`SET ROLE ${role}`);
    await assert.rejects(remove(user,bad), /permission denied/);
    await db.query('RESET ROLE');
  }
  assert.equal((await remove(randomUUID(),bad)).status,'not_found');
  assert.deepEqual(await counts(),{correct_songs:1,incorrect_songs:1,total_songs:2});
  await db.query('BEGIN');
  assert.equal((await remove(user,bad)).status,'deleted');
  assert.deepEqual(await counts(),{correct_songs:1,incorrect_songs:0,total_songs:1});
  await db.query('ROLLBACK');
  assert.deepEqual(await counts(),{correct_songs:1,incorrect_songs:1,total_songs:2});
  assert.equal((await remove(user,bad)).status,'deleted');
  assert.equal((await remove(user,bad)).status,'not_found');
  assert.deepEqual(await counts(),{correct_songs:1,incorrect_songs:0,total_songs:1});
  assert.equal((await remove(user,good)).status,'deleted');
  assert.deepEqual(await counts(),{correct_songs:0,incorrect_songs:0,total_songs:0});
  await db.query('UPDATE training_sessions SET ended_at=null,total_songs=5,incorrect_songs=1');
  await db.query('INSERT INTO training_session_plays VALUES($1,$2,$3,$4,102,false)',[bad,session,user,quiz]);
  await assert.rejects(remove(user,bad), error => error.code === 'PT409');
  await assert.rejects(db.query('DELETE FROM training_sessions WHERE id=$1',[session]), error => error.code === 'PT409');
  await assert.rejects(db.query('DELETE FROM training_session_plays WHERE id=$1',[bad]), error => error.code === 'PT409');
  assert.deepEqual(await counts(),{correct_songs:0,incorrect_songs:1,total_songs:5});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM training_session_plays')).rows[0].n,1);
  await db.query('UPDATE training_sessions SET ended_at=now()');
  assert.equal((await remove(user,bad)).status,'deleted');
  console.log('PASS: role permissions, ownership, deletion counters, retry, transaction rollback, last-play totals and active-session deletion guards with unchanged history/counters');
} finally {
  await db?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
}
