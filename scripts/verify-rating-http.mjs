// Disposable identity/quiz: exercises the running local API without replacing a user's token.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

if (!process.argv.includes('--run')) throw new Error('Pass --run to create and clean up disposable fixtures.');
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ data, error }) => { if (error) throw error; return data; };
const quizId = randomUUID(), sessionId = randomUUID();
let userId;
let signedInClient;
try {
  const email = `amq-http-${randomUUID()}@example.test`, password = randomBytes(32).toString('hex');
  const created = check(await db.auth.admin.createUser({ email, password, email_confirm: true }));
  userId = created.user.id;
  const token = randomBytes(32).toString('hex');
  check(await db.from('training_tokens').insert({ user_id: userId, token_hash: await bcrypt.hash(token, 10), token_sha256: createHash('sha256').update(token).digest('hex') }));
  check(await db.from('quiz_configurations').insert({ id: quizId, user_id: userId, creator_username: '[TEST]', name: '[TEST] Temporary HTTP replay', configuration_data: { version: '2.0', routes: [] }, is_public: false, allow_remixing: false, play_token: randomBytes(16).toString('base64url'), share_token: randomBytes(16).toString('base64url') }));
  if (process.argv.includes('--ownership')) {
    const jar = new Map();
    signedInClient = createServerClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: entries => entries.forEach(({ name, value }) => jar.set(name, value)) } });
    const login = check(await signedInClient.auth.signInWithPassword({ email, password }));
    assert.equal(login.user.id, userId);
    const foreign = '1be009a8-d209-4016-a855-d5180807e1eb';
    const before = check(await db.from('training_progress').select('*').eq('quiz_id', foreign).order('id'));
    const statuses = [];
    for (const [target, action, body] of [[foreign, 'refresh-pool', {}], [foreign, 'merge', { sourceQuizId: quizId }], [quizId, 'merge', { sourceQuizId: foreign }]]) {
      const response = await fetch(`http://localhost:5173/api/training/${target}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }, body: JSON.stringify(body) });
      const result = await response.json();
      assert.equal(response.status, 403, JSON.stringify(result));
      assert.match(result.message || result.error, /permission/);
      statuses.push({ action, targetOwned: target === quizId, status: response.status });
    }
    const after = check(await db.from('training_progress').select('*').eq('quiz_id', foreign).order('id'));
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ authenticatedOwnership: statuses, foreignProgressUnchanged: true }));
  }
  check(await db.from('training_sessions').insert({ id: sessionId, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [29028], playlistReasons: ['new'] } }));
  const payload = { token, requestId: randomUUID(), playedAt: new Date().toISOString(), annSongId: 29028, rating: 3, success: true, userAnswer: 'test', correctAnswer: 'test', shelved: true, isShelved: true };
  const send = async (body, targetSession = sessionId) => { const r = await fetch(`http://localhost:5173/api/training/session/${targetSession}/progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const first = await send(payload);
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal(first.body.idempotentReplay, false);
  for (let i = 0; i < 3; i++) {
    const replay = await send(payload);
    assert.equal(replay.status, 200, JSON.stringify(replay));
    assert.equal(replay.body.idempotentReplay, true);
    assert.equal(replay.body.nextReview, first.body.nextReview);
  }
  const conflict = await send({ ...payload, rating: 1 });
  assert.equal(conflict.status, 409, JSON.stringify(conflict));
  const songConflict = await send({ ...payload, annSongId: 14877 });
  assert.equal(songConflict.status, 409, JSON.stringify(songConflict));
  const progress = check(await db.from('training_progress').select('*').eq('user_id', userId).eq('quiz_id', quizId));
  const plays = check(await db.from('training_session_plays').select('*').eq('session_id', sessionId));
  const session = check(await db.from('training_sessions').select('correct_songs,incorrect_songs').eq('id', sessionId).single());
  assert.equal(progress.length, 1); assert.equal(progress[0].attempt_count, 1); assert.equal(plays.length, 1);
  assert.equal(session.correct_songs, 1); assert.equal(session.incorrect_songs, 0);
  assert.ok(new Date(progress[0].fsrs_state.due).getUTCFullYear() < 2090);
  assert.equal(progress[0].fsrs_state.shelved, undefined);
  console.log(JSON.stringify({ replayRequests: 3, conflictStatus: conflict.status, attempts: 1, plays: 1, correct: 1, nextReview: first.body.nextReview }));
  const laterSessionId = randomUUID();
  check(await db.from('training_sessions').insert({ id: laterSessionId, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [29028], playlistReasons: ['revision'] } }));
  const later = await send({ ...payload, requestId: randomUUID(), playedAt: new Date().toISOString(), rating: 4 }, laterSessionId);
  assert.equal(later.status, 200, JSON.stringify(later));
  const beforeStale = check(await db.from('training_progress').select('*').eq('user_id', userId).eq('quiz_id', quizId).single());
  const stale = await send({ ...payload, requestId: randomUUID() });
  assert.equal(stale.status, 409, JSON.stringify(stale));
  const oldReplay = await send(payload);
  assert.equal(oldReplay.status, 200, JSON.stringify(oldReplay));
  assert.equal(oldReplay.body.idempotentReplay, true);
  assert.equal(oldReplay.body.nextReview, first.body.nextReview);
  const afterStale = check(await db.from('training_progress').select('*').eq('user_id', userId).eq('quiz_id', quizId).single());
  assert.deepEqual(afterStale, beforeStale);
  assert.equal(afterStale.attempt_count, 2);
  const allPlays = check(await db.from('training_session_plays').select('id').eq('quiz_id', quizId));
  assert.equal(allPlays.length, 2);
  console.log(JSON.stringify({ changedSongStatus: songConflict.status, staleStatus: stale.status, oldReplayStatus: oldReplay.status, attemptsAfterLaterSession: 2, playsAfterLaterSession: 2, latestProgressUnchanged: true }));
  if (process.argv.includes('--same-day-scheduling')) {
    const results = [];
    for (const [enabled, songId] of [[true, 14877], [false, 23963], [true, 7616]]) {
      check(await db.from('user_quiz_training_preferences').upsert({ user_id: userId, quiz_id: quizId, allow_same_day_reviews: enabled }, { onConflict: 'user_id,quiz_id' }));
      const target = randomUUID();
      check(await db.from('training_sessions').insert({ id: target, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [songId], playlistReasons: ['new'] } }));
      const playedAt = new Date().toISOString();
      const response = await send({ ...payload, annSongId: songId, requestId: randomUUID(), playedAt, rating: 1, success: false }, target);
      assert.equal(response.status, 200, JSON.stringify(response));
      const saved = check(await db.from('training_progress').select('fsrs_state').eq('user_id', userId).eq('quiz_id', quizId).eq('song_ann_id', songId).single());
      assert.equal(saved.fsrs_state.due, response.body.nextReview);
      const tomorrow = new Date(playedAt); tomorrow.setUTCHours(24, 0, 0, 0);
      const due = Date.parse(saved.fsrs_state.due);
      if (enabled) {
        assert.ok(due > Date.parse(playedAt));
        assert.ok(due - Date.parse(playedAt) <= 10 * 60000);
      } else {
        assert.equal(due, tomorrow.getTime());
      }
      results.push({ sameDayEnabled: enabled, minutesUntilDue: (due - Date.parse(playedAt)) / 60000, due: saved.fsrs_state.due });
    }
    console.log(JSON.stringify({ sameDayScheduling: results }));
  }
  if (process.argv.includes('--mature')) {
    const at = new Date();
    const mature = { ...afterStale.fsrs_state, state: 2, stability: 46, difficulty: 5, reps: 8, lapses: 0, scheduled_days: 46, elapsed_days: 46, last_review: new Date(at.getTime() - 46 * 86400000).toISOString(), due: at.toISOString() };
    check(await db.from('training_progress').update({ fsrs_state: mature }).eq('id', afterStale.id).eq('user_id', userId));
    const matureSession = randomUUID();
    check(await db.from('training_sessions').insert({ id: matureSession, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [29028], playlistReasons: ['due'] } }));
    const playedAt = new Date().toISOString();
    const hard = await send({ ...payload, requestId: randomUUID(), playedAt, rating: 2, success: false }, matureSession);
    assert.equal(hard.status, 200, JSON.stringify(hard));
    const saved = check(await db.from('training_progress').select('fsrs_state').eq('id', afterStale.id).single());
    const days = (Date.parse(saved.fsrs_state.due) - Date.parse(playedAt)) / 86400000;
    assert.ok(days >= 18 && days <= 26, `Unexpected mature Lucky guess interval: ${days}`);
    assert.equal(saved.fsrs_state.due, hard.body.nextReview);
    assert.ok(saved.fsrs_state.stability < 46);
    console.log(JSON.stringify({ matureLuckyGuessDays: days, stabilityBefore: 46, stabilityAfter: saved.fsrs_state.stability, due: saved.fsrs_state.due }));
  }
  if (process.argv.includes('--difficult-exclusions')) {
    for (const scenario of [
      { name: 'review lapse control', state: 2, lapses: 7, rating: 1, expected: true },
      { name: 'learning repeat', state: 1, lapses: 8, rating: 1 },
      { name: 'relearning repeat', state: 3, lapses: 8, rating: 1 },
      { name: 'fewer than eight lapses', state: 2, lapses: 6, rating: 1 },
      { name: 'inactive after rating', state: 2, lapses: 7, rating: 1, inactive: true },
      { name: 'paused after rating', state: 2, lapses: 7, rating: 1, paused: true },
      { name: 'old lifetime lapses without current failure', state: 2, lapses: 8, rating: 3 },
      { name: 'new session: one day and four additional lapses', state: 2, lapses: 11, rating: 1, markerDays: 1 },
      { name: 'new session: thirty-one days and three additional lapses', state: 2, lapses: 10, rating: 1, markerDays: 31 },
      { name: 'new session: thirty-one days and four additional lapses', state: 2, lapses: 11, rating: 1, markerDays: 31, expected: true },
      { name: 'new session: both thresholds but no current failure', state: 2, lapses: 12, rating: 3, markerDays: 31 }
    ]) {
      const target = randomUUID();
      check(await db.from('training_progress').update({
        is_active: true, inactivated_at: null, suspended_at: null,
        difficult_song_suggestion: scenario.markerDays ? { choice: 'keep', lapses: 8, decidedAt: new Date(Date.now() - scenario.markerDays * 86400000).toISOString(), sessionId } : null,
        fsrs_state: { ...afterStale.fsrs_state, state: scenario.state, lapses: scenario.lapses }
      }).eq('id', afterStale.id));
      check(await db.from('training_sessions').insert({ id: target, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [29028], playlistReasons: ['due'] } }));
      const rated = await send({ ...payload, requestId: randomUUID(), playedAt: new Date().toISOString(), rating: scenario.rating, success: scenario.rating !== 1 }, target);
      assert.equal(rated.status, 200, JSON.stringify(rated));
      if (scenario.markerDays) {
        const saved = check(await db.from('training_progress').select('fsrs_state').eq('id', afterStale.id).single());
        assert.equal(saved.fsrs_state.lapses, scenario.lapses + (scenario.rating === 1 ? 1 : 0));
      }
      if (scenario.inactive) check(await db.from('training_progress').update({ is_active: false, inactivated_at: new Date().toISOString() }).eq('id', afterStale.id));
      if (scenario.paused) check(await db.from('training_progress').update({ suspended_at: new Date().toISOString() }).eq('id', afterStale.id));
      const response = await fetch(`http://localhost:5173/api/training/session/${target}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.difficultSongs.some(song => song.annSongId === 29028), Boolean(scenario.expected), scenario.name);
      console.log(JSON.stringify({ difficultEligibility: scenario.name, offered: Boolean(scenario.expected) }));
    }
  }
  if (process.argv.includes('--difficult-decisions')) {
    const readProgress = async () => check(await db.from('training_progress').select('*').eq('id', afterStale.id).single());
    for (const choice of ['keep', 'pause']) {
      const prior = await readProgress();
      check(await db.from('training_progress').update({ suspended_at: null, difficult_song_suggestion: null, fsrs_state: { ...prior.fsrs_state, state: 2, lapses: 7 } }).eq('id', prior.id));
      const target = randomUUID();
      check(await db.from('training_sessions').insert({ id: target, user_id: userId, quiz_id: quizId, total_songs: 1, session_data: { playlistAnnSongIds: [29028], playlistReasons: ['due'] } }));
      const rated = await send({ ...payload, requestId: randomUUID(), playedAt: new Date().toISOString(), rating: 1, success: false }, target);
      assert.equal(rated.status, 200);
      const completed = await fetch(`http://localhost:5173/api/training/session/${target}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const summary = await completed.json();
      assert.equal(completed.status, 200);
      assert.ok(summary.difficultSongs.some(song => song.annSongId === 29028));
      const before = await readProgress();
      const decide = async requestedChoice => {
        const r = await fetch(`http://localhost:5173/api/training/session/${target}/difficult-songs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, annSongId: 29028, choice: requestedChoice }) });
        return { status: r.status, body: await r.json() };
      };
      assert.equal((await decide(choice)).status, 200);
      const after = await readProgress();
      const unchanged = row => { const { updated_at, difficult_song_suggestion, suspended_at, ...rest } = row; return rest; };
      assert.deepEqual(unchanged(after), unchanged(before));
      assert.equal(after.difficult_song_suggestion.choice, choice);
      assert.equal(after.difficult_song_suggestion.lapses, 8);
      assert.equal(Boolean(after.suspended_at), choice === 'pause');
      const replay = await decide(choice === 'pause' ? 'keep' : 'pause');
      assert.equal(replay.status, 200);
      assert.equal(replay.body.choice, choice);
      assert.deepEqual(await readProgress(), after);
      console.log(JSON.stringify({ difficultDecision: choice, fullLearningHistoryUnchanged: true, firstDecisionWinsReplay: true }));
      if (choice === 'keep') {
        for (const [days, lapses, eligible] of [[1, 12, false], [31, 11, false], [31, 12, true]]) {
          check(await db.from('training_progress').update({
            fsrs_state: { ...after.fsrs_state, lapses },
            difficult_song_suggestion: { ...after.difficult_song_suggestion, decidedAt: new Date(Date.now() - days * 86400000).toISOString() }
          }).eq('id', after.id));
          const r = await fetch(`http://localhost:5173/api/training/session/${target}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
          const body = await r.json();
          assert.equal(r.status, 200);
          assert.equal(body.difficultSongs.some(song => song.annSongId === 29028), eligible);
          console.log(JSON.stringify({ seededSuppressionBoundary: { days, lapses, eligible } }));
        }
      }
    }
  }
  if (process.argv.includes('--session-fields') || process.argv.includes('--same-day-return') || process.argv.includes('--same-day-off-session') || process.argv.includes('--new-trivial-session')) {
    const source = check(await db.from('quiz_configurations').select('configuration_data').eq('id', '1be009a8-d209-4016-a855-d5180807e1eb').single());
    check(await db.from('quiz_configurations').update({ configuration_data: source.configuration_data }).eq('id', quizId));
    const ownQuiz = check(await db.from('quiz_configurations').select('play_token').eq('id', quizId).single());
    const start = await fetch('http://localhost:5173/api/training/session/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, quizId: ownQuiz.play_token, connectorVersion: '1.4.5', sessionLength: 5, mode: 'manual', dueCount: 0, newCount: 5, revisionCount: 0, shelvedCount: 100, shelvedSongPercentage: 100 }) });
    const job = await start.json();
    assert.equal(start.status, 202, JSON.stringify(job));
    let result;
    for (let i = 0; i < 120; i++) {
      const response = await fetch(`http://localhost:5173/api/training/session/job/${job.jobId}`, { headers: { 'x-training-token': token } });
      result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      if (result.status !== 'pending') break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(result.status, 'ready', JSON.stringify(result));
    const generated = check(await db.from('training_sessions').select('session_data,total_songs').eq('id', result.sessionId).single());
    assert.equal(generated.total_songs, 5);
    assert.ok(!JSON.stringify(generated.session_data).toLowerCase().includes('shelv'));
    assert.equal(generated.session_data.composition.new, 5);
    console.log(JSON.stringify({ legacySessionFieldsIgnored: true, totalSongs: generated.total_songs, composition: generated.session_data.composition }));
    if (process.argv.includes('--same-day-return') || process.argv.includes('--same-day-off-session') || process.argv.includes('--new-trivial-session')) {
      const sameDayOff = process.argv.includes('--same-day-off-session');
      const newTrivial = process.argv.includes('--new-trivial-session');
      if (sameDayOff) check(await db.from('user_quiz_training_preferences').upsert({ user_id: userId, quiz_id: quizId, allow_same_day_reviews: false }, { onConflict: 'user_id,quiz_id' }));
      const songId = Number(result.playlist[0].annSongId);
      const playedAt = new Date().toISOString();
      const missed = await send({ ...payload, requestId: randomUUID(), playedAt, annSongId: songId, rating: newTrivial ? 4 : 1, success: newTrivial }, result.sessionId);
      assert.equal(missed.status, 200, JSON.stringify(missed));
      const dueTime = Date.parse(missed.body.nextReview);
      if (sameDayOff) {
        const tomorrow = new Date(playedAt); tomorrow.setUTCHours(24, 0, 0, 0);
        assert.equal(dueTime, tomorrow.getTime());
      } else if (newTrivial) {
        assert.ok(dueTime - Date.parse(playedAt) >= 86400000);
        const saved = check(await db.from('training_progress').select('fsrs_state').eq('user_id', userId).eq('quiz_id', quizId).eq('song_ann_id', songId).single());
        assert.equal(saved.fsrs_state.state, 2);
        assert.equal(saved.fsrs_state.due, missed.body.nextReview);
      } else assert.ok(dueTime > Date.now() && dueTime - Date.now() < 120000);
      const generateDue = async () => {
        const response = await fetch('http://localhost:5173/api/training/session/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, quizId: ownQuiz.play_token, connectorVersion: '1.4.5', sessionLength: 5, mode: 'manual', dueCount: 5, newCount: 0, revisionCount: 0 }) });
        const accepted = await response.json();
        assert.equal(response.status, 202, JSON.stringify(accepted));
        for (let i = 0; i < 120; i++) {
          const poll = await fetch(`http://localhost:5173/api/training/session/job/${accepted.jobId}`, { headers: { 'x-training-token': token } });
          const body = await poll.json();
          if (body.status !== 'pending') return { status: poll.status, body };
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error('Due session did not finish');
      };
      const early = await generateDue();
      assert.ok(Date.now() < dueTime, 'Early observation missed the boundary');
      if (early.body.status === 'ready') assert.ok(!early.body.playlist.some(s => Number(s.annSongId) === songId));
      else assert.match(early.body.error, /No songs|No eligible/i);
      console.log(JSON.stringify({ beforeDueExcluded: true, sameDayOff, newTrivial, due: missed.body.nextReview, waitingForRealClock: !sameDayOff && !newTrivial }));
      if (!sameDayOff && !newTrivial) {
        while (Date.now() <= dueTime) await new Promise(resolve => setTimeout(resolve, Math.min(30000, dueTime - Date.now() + 100)));
        const after = await generateDue();
        assert.equal(after.status, 200, JSON.stringify(after));
        assert.equal(after.body.status, 'ready');
        assert.ok(after.body.playlist.some(s => Number(s.annSongId) === songId));
        console.log(JSON.stringify({ afterDueIncluded: true, songId, due: missed.body.nextReview, observedAt: new Date().toISOString() }));
      }
    }
  }
} finally {
  if (signedInClient) check(await signedInClient.auth.signOut());
  check(await db.from('quiz_configurations').delete().eq('id', quizId));
  if (userId) check(await db.auth.admin.deleteUser(userId));
  const remaining = check(await db.from('quiz_configurations').select('id').eq('id', quizId));
  assert.equal(remaining.length, 0);
  console.log('Disposable fixture cleanup complete.');
}
