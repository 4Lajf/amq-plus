// Two real session starts, isolated from the user's progress and connector token.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const checked = ({ data, error }) => { if (error) throw error; return data; };
if (process.argv.includes('--amq') && !process.stdin.isTTY) {
  throw new Error('--amq requires an interactive terminal (tty: true) to keep the fixture alive and guarantee cleanup.');
}
const quizId = randomUUID();
const playToken = randomBytes(16).toString('base64url');
const token = randomBytes(32).toString('hex');
let userId;
try {
  const source = checked(await db.from('quiz_configurations').select('configuration_data').eq('id', 'eb90a823-11a7-4c58-8b50-c62f5438a914').single());
  if (process.argv.includes('--masterlist')) {
    source.configuration_data.routes[0].sources = [{ id: 'cache-masterlist', mode: 'masterlist', sourceType: 'song-list', useEntirePool: true }];
  }
  if (process.argv.includes('--fixed-sample')) {
    source.configuration_data.routes[0].basicSettings.samplePoint.value = { useRange: false, staticValue: 35, start: 35, end: 35 };
  }
  if (process.argv.includes('--invalid-quiz')) {
    source.configuration_data.routes[0].basicSettings.guessTime.value = { useRange: false, staticValue: -1, min: -1, max: -1 };
  }
  if (process.argv.includes('--range-sample')) {
    source.configuration_data.routes[0].basicSettings.samplePoint.value = { useRange: true, staticValue: 35, start: 60, end: 65 };
  }
  userId = checked(await db.auth.admin.createUser({ email: `amq-cache-${randomUUID()}@example.test`, password: randomBytes(32).toString('hex'), email_confirm: true })).user.id;
  checked(await db.from('training_tokens').insert({ user_id: userId, token_hash: await bcrypt.hash(token, 10), token_sha256: createHash('sha256').update(token).digest('hex') }));
  checked(await db.from('quiz_configurations').insert({ id: quizId, user_id: userId, name: '[TEST] disposable pool cache', creator_username: '[TEST]', configuration_data: source.configuration_data, is_public: false, play_token: playToken, share_token: randomBytes(16).toString('base64url') }));
  if (process.argv.includes('--difficult')) {
    source.configuration_data.routes[0].basicSettings.guessTime.value = { useRange: false, staticValue: 5, min: 5, max: 5 };
    checked(await db.from('quiz_configurations').update({ configuration_data: source.configuration_data }).eq('id', quizId));
    const learner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
    const template = checked(await db.from('training_progress').select('*').eq('user_id', learner).eq('quiz_id', '1be009a8-d209-4016-a855-d5180807e1eb').eq('song_ann_id', 18174).single());
    checked(await db.from('training_progress').insert([21983, 29028].map(song_ann_id => ({ ...template, id: randomUUID(), quiz_id: quizId, user_id: learner, song_ann_id, fsrs_state: { ...template.fsrs_state, state: 2, lapses: 7, stability: 46, reps: 20, due: '2026-09-01T00:00:00Z' }, is_active: true, inactivated_at: null }))));
  }
  if (process.argv.includes('--amq')) {
    console.log(JSON.stringify({ quizId, playUrl: `http://localhost:5173/play/${playToken}` }));
    const input = createInterface({ input: process.stdin, output: process.stdout });
    await input.question('Fixture ready for AMQ. Press Enter after leaving the test quizzes to clean up.\n');
    input.close();
  } else {
  for (let run = 1; run <= 2; run++) {
    const started = performance.now();
    const response = await fetch('http://localhost:5173/api/training/session/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, quizId: playToken, connectorVersion: '1.4.5', sessionLength: 5, mode: 'auto' }) });
    const accepted = await response.json();
    assert.equal(response.status, 202);
    const messages = new Set();
    let result;
    do {
      const poll = await fetch(`http://localhost:5173/api/training/session/job/${accepted.jobId}`, { headers: { 'x-training-token': token } });
      result = await poll.json();
      if (result.message) messages.add(result.message);
      if (result.status !== 'pending') break;
      assert.ok(performance.now() - started < 120000, 'Session job exceeded two minutes');
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (true);
    assert.equal(result.status, 'ready', result.error);
    console.log(JSON.stringify({ quizId, run, elapsedMs: Math.round(performance.now() - started), messages: [...messages] }));
  }
  assert.equal(checked(await db.from('training_sessions').select('id').eq('quiz_id', quizId)).length, 2);
  assert.equal(checked(await db.from('training_progress').select('id').eq('quiz_id', quizId)).length, 0);
  }
} finally {
  if (userId) {
    checked(await db.from('quiz_configurations').delete().eq('id', quizId).eq('user_id', userId));
    checked(await db.auth.admin.deleteUser(userId));
    for (const [table, field] of [['quiz_configurations', 'id'], ['training_sessions', 'quiz_id'], ['training_progress', 'quiz_id']]) {
      assert.equal(checked(await db.from(table).select(field).eq(field, quizId)).length, 0);
    }
    assert.equal(checked(await db.from('training_tokens').select('id').eq('user_id', userId)).length, 0);
    console.log('Verified cleanup: quiz, sessions, progress, identity, token.');
  }
}
