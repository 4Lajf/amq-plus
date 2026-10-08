// Disposable quiz with owner and trainee progress on the same song for live Chrome requests.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ data, error }) => { if (error) throw error; return data; };
const path = join(tmpdir(), 'amq-shared-progress-fixture.json');
const trainee = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const mode = process.argv[2];
if (mode === 'prepare') {
  try { await readFile(path); throw new Error('Clean up existing fixture first'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const state = { quizId: randomUUID(), owner: null, before: null };
  await writeFile(path, JSON.stringify(state), { flag: 'wx' });
  const user = check(await db.auth.admin.createUser({ email: `amq-owner-${randomUUID()}@example.test`, password: randomBytes(32).toString('hex'), email_confirm: true }));
  state.owner = user.user.id; await writeFile(path, JSON.stringify(state));
  check(await db.from('quiz_configurations').insert({ id: state.quizId, user_id: state.owner, name: '[TEST] disposable shared progress', creator_username: '[TEST]', configuration_data: { version: '2.0', routes: [] }, is_public: false, play_token: randomBytes(16).toString('base64url'), share_token: randomBytes(16).toString('base64url') }));
  const template = check(await db.from('training_progress').select('*').eq('user_id', trainee).eq('quiz_id', '1be009a8-d209-4016-a855-d5180807e1eb').eq('song_ann_id', 18174).single());
  check(await db.from('training_progress').insert([state.owner, trainee].map(user_id => ({ ...template, id: randomUUID(), user_id, quiz_id: state.quizId }))));
  state.before = check(await db.from('training_progress').select('*').eq('quiz_id', state.quizId).order('id'));
  await writeFile(path, JSON.stringify(state));
  console.log(JSON.stringify({ quizId: state.quizId, songId: 18174, untrackedSongId: 29028 }));
} else {
  const state = JSON.parse(await readFile(path, 'utf8'));
  if (mode === 'cleanup') {
    check(await db.from('quiz_configurations').delete().eq('id', state.quizId));
    if (state.owner) check(await db.auth.admin.deleteUser(state.owner));
    assert.equal(check(await db.from('training_progress').select('id').eq('quiz_id', state.quizId)).length, 0);
    assert.equal(check(await db.from('quiz_configurations').select('id').eq('id', state.quizId)).length, 0);
    await unlink(path); console.log('Disposable shared quiz, identity, and progress removed.');
  } else {
    const rows = check(await db.from('training_progress').select('*').eq('quiz_id', state.quizId).order('id'));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.find(r => r.user_id === state.owner), state.before.find(r => r.user_id === state.owner));
    const before = state.before.find(r => r.user_id === trainee), after = rows.find(r => r.user_id === trainee);
    const stable = r => { const { updated_at, suspended_at, is_active, inactivated_at, ...rest } = structuredClone(r); delete rest.fsrs_state.due; return rest; };
    assert.deepEqual(stable(after), stable(before));
    if (mode === 'paused') assert.ok(after.suspended_at); else assert.equal(after.suspended_at, null);
    if (mode !== 'untracked') { const day = new Date(); day.setUTCHours(0,0,0,0); assert.equal(after.fsrs_state.due, day.toISOString()); }
    else assert.deepEqual(after, before);
    console.log(JSON.stringify({ mode, ownerUnchanged: true, learningAndHistoryUnchanged: true, progressRows: rows.length, traineePaused: Boolean(after.suspended_at) }));
  }
}
