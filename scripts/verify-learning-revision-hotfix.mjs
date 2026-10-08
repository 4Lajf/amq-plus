// Run with production environment loaded. Creates private disposable fixtures for
// the specified owner, runs real session creation, and removes only those fixtures.
// node --env-file=../amq-plus-private/.env scripts/verify-learning-revision-hotfix.mjs USER_ID QUIZ_ID before|after
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [userId, sourceId, phase] = process.argv.slice(2);
assert(userId && sourceId && ['before', 'after'].includes(phase));
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = r => { if (r.error) throw new Error(JSON.stringify(r.error)); return r.data; };
const source = check(await db.from('quiz_configurations').select('*').eq('id', sourceId).eq('user_id', userId).single());
const original = check(await db.from('training_progress').select('*').eq('user_id', userId).eq('quiz_id', sourceId).order('id'));
assert.equal(original.filter(r => r.is_active !== false).length, 26);
const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true },
  resolve: { alias: { '$lib': path.resolve('src/lib') } },
  plugins: [{ name: 'private-env', resolveId(id) { if (id.startsWith('$env/static/')) return '\0' + id; },
    load(id) { if (id.startsWith('\0$env/static/')) return ['PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','PIXELDRAIN_API_KEY'].map(k => `export const ${k} = process.env.${k};`).join('\n'); },
    transform(code, id) {
      if (phase === 'before' && /\/training\/(fsrs-service|sessionStartService)\.js$/.test(id)) {
        return execFileSync('git', ['show', '015bb4c:' + path.relative(process.cwd(), id).replaceAll('\\', '/')], { encoding: 'utf8' });
      }
    } }]
});
const log = console.log;
console.log = () => {};
const fixtureIds = [];
let fixtureUserId = userId;
let temporaryUserId = null;
let token;
try {
  // Optional deployed-API verification uses a disposable identity so no existing
  // user's connector token is replaced or exposed.
  if (process.env.HOTFIX_API_URL) {
    const account = check(await db.auth.admin.createUser({ email: `hotfix-${randomUUID()}@example.invalid`, email_confirm: true }));
    temporaryUserId = account.user.id;
    fixtureUserId = temporaryUserId;
    token = randomBytes(32).toString('hex');
    check(await db.from('training_tokens').insert({ user_id: fixtureUserId, token_hash: await bcrypt.hash(token, 10), token_sha256: createHash('sha256').update(token).digest('hex') }));
  }
  const { buildTrainingSession } = await vite.ssrLoadModule('/src/lib/server/training/sessionStartService.js');
  for (const mode of ['auto', 'manual']) {
    const id = randomUUID();
    const quiz = check(await db.from('quiz_configurations').insert({
      user_id: fixtureUserId, id, creator_username: source.creator_username,
      name: '[TEST HOTFIX] learning revision ' + mode, is_public: false,
      configuration_data: source.configuration_data, combine_duplicates: source.combine_duplicates,
      play_token: randomBytes(24).toString('base64url'), share_token: randomBytes(24).toString('base64url')
    }).select('*').single());
    fixtureIds.push(id);
    check(await db.from('training_progress').insert(original.map(({ id: oldId, ...r }) => ({ ...r, id: randomUUID(), user_id: fixtureUserId, quiz_id: id }))));
    const sessionId = randomUUID();
    check(await db.from('training_sessions').insert({ id: sessionId, user_id: fixtureUserId, quiz_id: id, total_songs: 26 }));
    check(await db.from('training_session_plays').insert(original.map(r => ({ user_id: fixtureUserId, quiz_id: id, session_id: sessionId, song_ann_id: r.song_ann_id, rating: 3, success: true, played_at: new Date().toISOString() }))));
    const params = { mode, sessionLength: 26, dueSongPercentage: mode === 'auto' ? 100 : 0, newSongPercentage: 0, revisionSongPercentage: mode === 'auto' ? 0 : 100 };
    let result;
    if (process.env.HOTFIX_API_URL) {
      const start = await fetch(new URL('/api/training/session/start', process.env.HOTFIX_API_URL), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, token, quizId: quiz.play_token, connectorVersion: '1.4.2' })
      });
      const job = await start.json();
      assert.equal(start.status, 202, JSON.stringify(job));
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const poll = await fetch(new URL(`/api/training/session/job/${job.jobId}`, process.env.HOTFIX_API_URL), { headers: { 'X-Training-Token': token } });
        const body = await poll.json();
        if (body.status === 'pending') continue;
        result = { ok: body.status === 'ready', status: poll.status, body };
        break;
      }
      assert(result, 'Deployed API did not complete within 60 seconds');
    } else {
      result = await buildTrainingSession({ supabaseAdmin: db, userId: fixtureUserId, quiz, params, serverFetch: fetch });
    }
    log(JSON.stringify({ phase, mode, ok: result.ok, totalSongs: result.body.totalSongs, available: result.body.available, composition: result.body.composition, error: result.body.error }));
    if (phase === 'after' && mode === 'auto') {
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.match(result.body.error, /Revision Songs to 100%/);
      assert.equal(check(await db.from('training_sessions').select('id').eq('quiz_id', id)).length, 1);
      continue;
    }
    assert(result.ok, JSON.stringify(result.body));
    assert.equal(result.body.totalSongs, phase === 'before' ? 0 : 26);
    if (phase === 'after') {
      assert.equal(result.body.composition.revision, 26);
      assert.equal(new Set(result.body.playlist.map(s => s.annSongId)).size, 26);
      assert(result.body.command);
    }
  }
  const current = check(await db.from('training_progress').select('*').eq('user_id', userId).eq('quiz_id', sourceId).order('id'));
  assert.deepEqual(current, original, 'Original progress must remain unchanged');
  log('Original progress unchanged.');
} finally {
  console.log = log;
  for (const id of fixtureIds) {
    check(await db.from('quiz_configurations').delete().eq('id', id).eq('user_id', fixtureUserId));
    for (const table of ['training_progress', 'training_sessions', 'training_session_plays']) {
      assert.equal(check(await db.from(table).select('id').eq('quiz_id', id)).length, 0);
    }
  }
  if (temporaryUserId) check(await db.auth.admin.deleteUser(temporaryUserId));
  log('Disposable quizzes, progress, sessions, and plays cleaned up.');
  await vite.close();
}
