import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), admin: {} }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => mocks.admin }));
vi.mock('$lib/server/training/delete-history.js', () => ({ deleteTrainingHistory: mocks.remove }));
import { DELETE } from '../src/routes/api/training/session/[sessionId]/plays/[playId]/+server.js';
const request = { params: { sessionId: 'session', playId: 'play' }, locals: { safeGetSession: async () => ({ session: { user: { id: 'owner' } } }) } };
beforeEach(() => { vi.resetAllMocks(); mocks.remove.mockResolvedValue({ success: true, progressUpdated: true }); });
it('delegates the owned attempt to atomic replay', async () => {
  expect(await (await DELETE(request)).json()).toMatchObject({ success: true, progressUpdated: true });
  expect(mocks.remove).toHaveBeenCalledWith(mocks.admin,'owner','session','play');
});
it('propagates a refused rebuild without claiming deletion', async () => {
  mocks.remove.mockRejectedValue({ status: 409 });
  await expect(DELETE(request)).rejects.toMatchObject({ status: 409 });
});
it('requires sign-in before attempting a deletion', async () => {
  await expect(DELETE({ ...request, locals: { safeGetSession: async () => ({ session: null }) } })).rejects.toMatchObject({ status: 401 });
  expect(mocks.remove).not.toHaveBeenCalled();
});
