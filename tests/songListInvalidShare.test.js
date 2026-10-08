import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ single: vi.fn(), loadSongs: vi.fn() }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => {
  const query = { select: () => query, eq: () => query, single: mocks.single };
  return { from: () => query };
} }));
vi.mock('$lib/server/song-list-loader.js', () => ({ loadSavedSongList: mocks.loadSongs }));
import { load } from '../src/routes/songlist/create/+page.server.js';
const request = (kind) => ({ url: new URL(`http://localhost/songlist/create?${kind}=test-token`), locals: { safeGetSession: async () => ({session:null,user:null}) } });
beforeEach(() => { vi.resetAllMocks(); });
it.each(['view','edit'])('invalid %s link gives actionable 404 instead of an empty builder', async kind => {
  mocks.single.mockResolvedValue({error:{code:'PGRST116'}});
  await expect(load(request(kind))).rejects.toMatchObject({status:404,body:{message:expect.stringContaining('Ask the list owner')}});
  expect(mocks.loadSongs).not.toHaveBeenCalled();
});
it('valid view link retains song content and view-only mode', async () => {
  mocks.single.mockResolvedValue({data:{id:'list',name:'Fixture',user_id:'owner'}});
  mocks.loadSongs.mockResolvedValue({songs:[{annSongId:42}]});
  expect(await load(request('view'))).toMatchObject({isViewOnly:true,editToken:null,publicList:{id:'list',songs:[{annSongId:42}],is_owned_by_current_user:false}});
});
it('database failures remain server errors, not invalid-link results', async () => {
  mocks.single.mockResolvedValue({error:{code:'XX000',message:'unavailable'}});
  await expect(load(request('view'))).rejects.toMatchObject({status:500});
});
