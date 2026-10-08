import { beforeEach, expect, it, vi } from 'vitest';
import { QuizSourceError, QuizSourceLoadError } from '../src/lib/server/quiz-source-error.js';

const mock = vi.hoisted(() => ({ generate: vi.fn(), cache: vi.fn(), sync: vi.fn(), from: vi.fn() }));
vi.mock('$lib/server/songFiltering.js', () => ({ generateQuizSongs: mock.generate }));
vi.mock('$lib/utils/simulation.js', () => ({ simulateQuizFromRoutes: () => ({}) }));
vi.mock('$lib/server/song-list-utils.js', () => ({ extractSongListIds: () => [] }));
vi.mock('$lib/server/training/song-pool-cache.js', () => ({
  buildResolvedConfigStamp: () => '', buildSongPoolCacheKey: () => 'key',
  getCachedSongPool: () => null, setCachedSongPool: mock.cache
}));
vi.mock('$lib/server/training/pool-sync.js', () => ({ planPoolSync: mock.sync, applyPoolSync: mock.sync }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => ({ from: mock.from }) }));

const { buildTrainingSession } = await import('../src/lib/server/training/sessionStartService.js');
const { POST: refresh } = await import('../src/routes/api/training/[quizId]/refresh-pool/+server.js');
const quiz = { id: 'quiz', user_id: 'owner', play_token: 'token', configuration_data: { routes: [] } };
beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockImplementation(table => {
    if (table !== 'quiz_configurations') throw new Error(`Unexpected state access: ${table}`);
    return { select: () => ({ eq: () => ({ single: async () => ({ data: quiz }) }) }) };
  });
});

it.each([
  [new QuizSourceLoadError('AniList unavailable', 502), 502],
  [new QuizSourceLoadError('Invalid nested scope', 422), 422],
  [new QuizSourceError('Source quiz was removed'), 422]
])('preserves actionable nested-source errors without modifying progress', async (failure, status) => {
  mock.generate.mockRejectedValue(failure);
  const start = await buildTrainingSession({ supabaseAdmin: { from: mock.from }, userId: 'owner', quiz, params: {}, serverFetch: fetch });
  expect(start).toMatchObject({ ok: false, status, body: { error: expect.stringContaining(failure.message) } });
  expect(mock.from).not.toHaveBeenCalled();
  const response = await refresh({ params: { quizId: 'quiz' }, fetch, locals: { safeGetSession: async () => ({ session: { user: { id: 'owner' } } }) } });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, message: `Nothing was changed. ${failure.message}` });
  expect(mock.cache).not.toHaveBeenCalled();
  expect(mock.sync).not.toHaveBeenCalled();
});

it.each([
  [0, 'loadingErrors', 502], [2, 'loadingErrors', 502], [2, 'scopingErrors', 422],
  [2, 'loadingErrors', 422, 'filter-source-scope']
])('stops training start and refresh before caching or reconciliation: %s songs, %s', async (count, field, status, mode) => {
  mock.generate.mockResolvedValue({ songs: Array.from({ length: count }, (_, annSongId) => ({ annSongId })),
    metadata: { [field]: [{ message: 'Source unavailable', mode }] } });
  const start = await buildTrainingSession({ supabaseAdmin: { from: mock.from }, userId: 'owner', quiz, params: {}, serverFetch: fetch });
  expect(start).toMatchObject({ ok: false, status, body: { error: expect.stringContaining('Source unavailable') } });
  expect(mock.from).not.toHaveBeenCalled();
  const response = await refresh({ params: { quizId: 'quiz' }, fetch,
    locals: { safeGetSession: async () => ({ session: { user: { id: 'owner' } } }) } });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, message: expect.stringContaining('Nothing was changed') });
  expect(mock.from).toHaveBeenCalledTimes(1);
  expect(mock.cache).not.toHaveBeenCalled();
  expect(mock.sync).not.toHaveBeenCalled();
});
