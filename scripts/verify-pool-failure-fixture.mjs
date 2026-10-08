// Live source-failure fixtures for the running server and signed-in Chrome.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ data, error }) => { if (error) throw error; return data; };
const path = join(tmpdir(), 'amq-pool-failure-fixture.json');
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const mode = process.argv[2];
if (mode === 'prepare') {
  try { await readFile(path); throw new Error('Clean up existing fixture first'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const state = { ids: [randomUUID(), randomUUID()], playTokens: [randomBytes(16).toString('base64url'), randomBytes(16).toString('base64url')], starter: null, token: randomBytes(32).toString('hex'), before: null };
  await writeFile(path, JSON.stringify(state), { flag: 'wx' });
  state.starter = check(await db.auth.admin.createUser({ email: `amq-pool-${randomUUID()}@example.test`, password: randomBytes(32).toString('hex'), email_confirm: true })).user.id;
  await writeFile(path, JSON.stringify(state));
  check(await db.from('training_tokens').insert({ user_id: state.starter, token_hash: await bcrypt.hash(state.token, 10), token_sha256: createHash('sha256').update(state.token).digest('hex') }));
  const source = check(await db.from('quiz_configurations').select('configuration_data').eq('id', '0981688d-7f57-4e36-a27b-1fd849e63149').single()).configuration_data;
  const consumer = check(await db.from('quiz_configurations').select('configuration_data').eq('id', '99d1b672-b6da-40cb-9fff-95886408d2d7').single()).configuration_data;
  state.goodSource = structuredClone(source);
  const badSource = { ...structuredClone(source.routes[0].sources[0]), id: 'upstream-anilist', mode: 'user-lists', userListImport: { platform: 'anilist', username: '4Lajf', selectedLists: { completed: true, watching: true, planning: true, on_hold: true, dropped: true } } };
  source.routes[0].sources.push(badSource);
  Object.assign(consumer.routes[0].sources[0], { selectedQuizId: state.ids[0], selectedQuizName: '[TEST] failing source', selectedListName: '[TEST] failing source' });
  const template = check(await db.from('training_progress').select('*').eq('user_id', owner).eq('quiz_id', '1be009a8-d209-4016-a855-d5180807e1eb').eq('song_ann_id', 18174).single());
  for (const [i, configuration_data] of [source, consumer].entries()) {
    check(await db.from('quiz_configurations').insert({ id: state.ids[i], user_id: owner, name: `[TEST] pool failure ${i}`, creator_username: '[TEST]', configuration_data, is_public: false, play_token: state.playTokens[i], share_token: randomBytes(16).toString('base64url') }));
    check(await db.from('training_progress').insert([owner, state.starter].map(user_id => ({ ...template, id: randomUUID(), user_id, quiz_id: state.ids[i], is_active: true, inactivated_at: null }))));
  }
  state.before = check(await db.from('training_progress').select('*').in('quiz_id', state.ids).order('id'));
  await writeFile(path, JSON.stringify(state));
  console.log(JSON.stringify({ directQuiz: state.ids[0], nestedQuiz: state.ids[1], progressRows: state.before.length }));
} else {
  const state = JSON.parse(await readFile(path, 'utf8'));
  if (mode === 'start') {
    for (let i = 0; i < state.ids.length; i++) {
      const r = await fetch('http://localhost:5173/api/training/session/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: state.token, quizId: state.playTokens[i], connectorVersion: '1.4.5', sessionLength: 5, mode: 'auto' }) });
      const accepted = await r.json(); assert.equal(r.status, 202, JSON.stringify(accepted));
      let result;
      for (let attempt = 0; attempt < 120; attempt++) {
        const poll = await fetch(`http://localhost:5173/api/training/session/job/${accepted.jobId}`, { headers: { 'x-training-token': state.token } });
        result = await poll.json();
        if (result.status !== 'pending') break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      assert.equal(result.status, 'error', JSON.stringify(result));
      assert.match(result.error, /AniList|source|403/i);
      console.log(JSON.stringify({ nested: Boolean(i), result }));
    }
  } else if (mode === 'verify') {
    assert.deepEqual(check(await db.from('training_progress').select('*').in('quiz_id', state.ids).order('id')), state.before);
    assert.equal(check(await db.from('training_sessions').select('id').in('quiz_id', state.ids)).length, 0);
    console.log('All four progress rows unchanged; no sessions created.');
  } else if (mode === 'repair') {
    check(await db.from('quiz_configurations').update({ configuration_data: state.goodSource }).eq('id', state.ids[0]));
    console.log('Removed the unavailable AniList source from the disposable configuration.');
  } else if (mode === 'cleanup') {
    check(await db.from('quiz_configurations').delete().in('id', state.ids).eq('user_id', owner));
    if (state.starter) check(await db.auth.admin.deleteUser(state.starter));
    for (const [table, field] of [['quiz_configurations', 'id'], ['training_progress', 'quiz_id'], ['training_sessions', 'quiz_id']]) assert.equal(check(await db.from(table).select(field).in(field, state.ids)).length, 0);
    await unlink(path); console.log('Pool-failure quizzes, identity, and progress removed.');
  } else throw new Error('Use prepare, start, verify, repair, or cleanup');
}
