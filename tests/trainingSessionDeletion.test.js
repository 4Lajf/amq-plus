import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: null, recalculate: vi.fn() }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => mocks.admin }));
vi.mock('$lib/server/training/delete-history.js', () => ({ deleteTrainingHistory: mocks.recalculate }));
import { DELETE, GET } from '../src/routes/api/training/session/[sessionId]/+server.js';

const request = { params: { sessionId: 'session' }, locals: {
  safeGetSession: async () => ({ session: { user: { id: 'owner' } } })
} };

function fixture(count, { failSessionDelete = false, failPage = -1, owner = 'owner', endedAt = '2026-01-02T00:00:00Z' } = {}) {
  let session = { id: 'session', user_id: owner, quiz_id: 'quiz', ended_at: endedAt };
  let plays = Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(6, '0'), session_id: 'session', user_id: owner,
    quiz_id: 'quiz', song_ann_id: index + 1, played_at: '2026-01-01T00:00:00Z'
  }));
  const deletes = [];
  return {
    deletes,
    get plays() { return plays; },
    get session() { return session; },
    from(table) {
      let deleting = false;
      const filters = {};
      const result = (from = 0, to = 999) => {
        const matches = row => row && Object.entries(filters).every(([key, value]) => row[key] === value);
        if (deleting) {
          deletes.push({ table, filters: { ...filters } });
          if (table === 'training_sessions') {
            if (failSessionDelete) return { error: { message: 'delete failed' } };
            if (!matches(session)) return { data: [], error: null };
            session = null;
            plays = []; // Existing ON DELETE CASCADE constraint.
          } else {
            plays = plays.filter(row => !matches(row));
          }
          return { data: [{ id: 'session' }], error: null };
        }
        if (table === 'training_sessions') return { data: matches(session) ? session : null, error: null };
        if (from === failPage) return { data: null, error: { message: 'page failed' } };
        return { data: plays.filter(matches).slice(from, to + 1), error: null };
      };
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        order() { return query; },
        single() { return Promise.resolve(result()); },
        range(from, to) { return Promise.resolve(result(from, to)); },
        delete() { deleting = true; return query; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
      return query;
    }
  };
}

beforeEach(() => { vi.resetAllMocks(); });

it('retains paginated session details', async () => {
  mocks.admin = fixture(1001);
  expect((await (await GET(request)).json()).plays).toHaveLength(1001);
});
it('delegates the complete session to one atomic replay operation', async () => {
  mocks.admin = fixture(2);
  mocks.recalculate.mockResolvedValue({ success: true, deletedPlays: 2, progressUpdated: true });
  expect(await (await DELETE(request)).json()).toMatchObject({ success: true, deletedPlays: 2 });
  expect(mocks.recalculate).toHaveBeenCalledWith(mocks.admin,'owner','session');
  expect(mocks.admin.deletes).toEqual([]);
});
it('never follows a failed atomic operation with separate deletion', async () => {
  mocks.admin = fixture(2); mocks.recalculate.mockRejectedValue({ status: 409 });
  await expect(DELETE(request)).rejects.toMatchObject({ status: 409 });
  expect(mocks.admin.plays).toHaveLength(2);
  expect(mocks.admin.deletes).toEqual([]);
});
