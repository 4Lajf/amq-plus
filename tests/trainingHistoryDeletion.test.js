import { beforeEach, expect, it, vi } from 'vitest';
import { deleteTrainingHistory } from '../src/lib/server/training/delete-history.js';

const plan = { quizId: 'quiz', revision: '7', playIds: ['play'], requestIds: ['request'] };
const snapshot = { fsrs_state: { state: 0, due: '2026-01-01T00:00:00Z' }, attempt_count: 4,
  success_count: 3, failure_count: 1, success_streak: 0, failure_streak: 1, history: [{ imported: true }], last_attempt_at: null };
const journal = [ { id: 1, song_ann_id: 1, kind: 'checkpoint', snapshot },
  { id: 2, song_ann_id: 1, kind: 'rating', request_id: 'request', payload: { sourceSong: 1, rating: 2, success: true, playedAt: '2026-01-02T00:00:00Z' } } ];
let db, pageResult;
beforeEach(() => {
  pageResult = { data: journal };
  db = { rpc: vi.fn(async name => ({ data: name === 'prepare_training_history_deletion' ? plan : { status: 'deleted', success: true, progressUpdated: true } })),
    from: () => { const query = { select: () => query, eq: () => query, order: () => query, range: async () => pageResult }; return query; } };
});
it('sends the baseline restoration and expected version to a single commit', async () => {
  expect(await deleteTrainingHistory(db, 'owner', 'session', 'play')).toMatchObject({ success: true });
  expect(db.rpc).toHaveBeenLastCalledWith('commit_training_history_deletion', {
    p_user_id: 'owner', p_session_id: 'session', p_play_id: 'play', p_expected_revision: '7',
    p_expected_play_ids: ['play'], p_changes: [{ song_ann_id: 1, ...snapshot }]
  });
});
it('fails closed when the migration is absent', async () => {
  db.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
  await expect(deleteTrainingHistory(db, 'owner', 'session')).rejects.toMatchObject({ status: 503 });
  expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('does not commit after history reading fails', async () => {
  pageResult = { data: null, error: { code: '57014' } };
  await expect(deleteTrainingHistory(db, 'owner', 'session')).rejects.toMatchObject({ status: 500 });
  expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('reports missing checkpoints as a conflict before any destructive operation', async () => {
  pageResult = { data: [journal[1]] };
  await expect(deleteTrainingHistory(db, 'owner', 'session')).rejects.toMatchObject({ status: 409 });
  expect(db.rpc.mock.calls.every(([name]) => name === 'prepare_training_history_deletion')).toBe(true);
});
it('re-reads after a stale commit and eventually commits the fresh plan', async () => {
  let commits = 0;
  db.rpc.mockImplementation(async name => ({ data: name === 'prepare_training_history_deletion' ? { ...plan, revision: commits ? '8' : '7' }
    : { status: ++commits === 1 ? 'stale' : 'deleted', success: true } }));
  expect(await deleteTrainingHistory(db, 'owner', 'session')).toMatchObject({ success: true });
  expect(commits).toBe(2);
  expect(db.rpc.mock.calls.at(-1)[1].p_expected_revision).toBe('8');
});
it('stops after three stale commits without claiming success', async () => {
  db.rpc.mockImplementation(async name => ({ data: name === 'prepare_training_history_deletion' ? plan : { status: 'stale' } }));
  await expect(deleteTrainingHistory(db, 'owner', 'session')).rejects.toMatchObject({ status: 409 });
  expect(db.rpc.mock.calls.filter(([name]) => name === 'commit_training_history_deletion')).toHaveLength(3);
});
