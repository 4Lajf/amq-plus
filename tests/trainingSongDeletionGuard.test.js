import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { DELETE } from '../src/routes/api/training/[quizId]/progress/song/+server.js';
const request = { params: { quizId: 'quiz' }, url: new URL('http://localhost/?songAnnId=42'),
  locals: { safeGetSession: async () => ({ session: { user: { id: 'owner' } } }) } };
beforeEach(() => { mocks.rpc.mockReset(); });
it('preserves the database active-session conflict', async () => {
  mocks.rpc.mockResolvedValue({ error: { code: 'PT409', message: 'Finish active sessions first' } });
  await expect(DELETE(request)).rejects.toMatchObject({ status: 409 });
});
it('fails closed if the atomic song deletion migration is unavailable', async () => {
  mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
  await expect(DELETE(request)).rejects.toMatchObject({ status: 503 });
});
it('passes ownership and song identity to the single transaction', async () => {
  mocks.rpc.mockResolvedValue({ data: { success: true } });
  expect(await (await DELETE(request)).json()).toEqual({ success: true });
  expect(mocks.rpc).toHaveBeenCalledWith('clear_training_song_history', { p_user_id: 'owner', p_quiz_id: 'quiz', p_song_ann_id: 42, p_record_id: null });
});
