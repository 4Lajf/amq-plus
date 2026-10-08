// Prepare a disposable quiz for authenticated Chrome HTTP checks; never reads browser credentials.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ data, error }) => { if (error) throw error; return data; };
const path = join(tmpdir(), 'amq-browser-http-fixture.json');
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const foreign = '1154c001-1dcd-4bf8-8fd2-240858727d47';
const mode = process.argv[2];
if (mode === 'prepare') {
  try { await readFile(path); throw new Error('Clean up the existing fixture first'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const id = randomUUID();
  const state = { id, owner, foreign,
    beforeForeign: check(await db.from('training_progress').select('*').eq('quiz_id', foreign).order('id')) };
  await writeFile(path, JSON.stringify(state), { flag: 'wx' });
  check(await db.from('quiz_configurations').insert({ id, user_id: owner, name: '[TEST] disposable browser HTTP', creator_username: '[TEST]', configuration_data: { version: '2.0', routes: [] }, is_public: false, play_token: randomBytes(16).toString('base64url'), share_token: randomBytes(16).toString('base64url') }));
  check(await db.from('quiz_stats').upsert({ quiz_id: id, legacy_likes: 7, likes: 7, plays: 11 }, { onConflict: 'quiz_id' }));
  console.log(JSON.stringify({ id, foreign }));
} else {
  const state = JSON.parse(await readFile(path, 'utf8'));
  if (mode === 'verify') {
    const expectedLikes = Number(process.argv[3]);
    assert.ok([7, 8].includes(expectedLikes));
    const stats = check(await db.from('quiz_stats').select('likes,legacy_likes,plays').eq('quiz_id', state.id).single());
    const likes = check(await db.from('quiz_likes').select('user_id').eq('quiz_id', state.id));
    assert.equal(stats.likes, expectedLikes); assert.equal(stats.legacy_likes, 7); assert.equal(stats.plays, 11);
    assert.equal(likes.length, expectedLikes - 7);
    if (likes.length) assert.equal(likes[0].user_id, owner);
    assert.deepEqual(check(await db.from('training_progress').select('*').eq('quiz_id', foreign).order('id')), state.beforeForeign);
    assert.equal(check(await db.from('training_progress').select('id').eq('quiz_id', state.id)).length, 0);
    console.log(JSON.stringify({ ...stats, voteRows: likes.length, foreignProgressUnchanged: true, ownedProgressEmpty: true }));
  } else if (mode === 'cleanup') {
    check(await db.from('quiz_configurations').delete().eq('id', state.id).eq('user_id', owner));
    for (const [table, field] of [['quiz_configurations', 'id'], ['quiz_stats', 'quiz_id'], ['quiz_likes', 'quiz_id'], ['training_progress', 'quiz_id']]) {
      assert.equal(check(await db.from(table).select(field).eq(field, state.id)).length, 0);
    }
    await unlink(path);
    console.log('Disposable browser HTTP fixture and related rows removed.');
  } else throw new Error('Use prepare, verify 7|8, or cleanup.');
}
