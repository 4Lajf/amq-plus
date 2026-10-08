import { expect, it, vi } from 'vitest';
import config from './testConfigs/17-user-list.json';

vi.mock('../src/lib/utils/anilist.js', () => ({
  fetchAniListData: vi.fn().mockRejectedValue(new Error('AniList API error: 403 Forbidden'))
}));

const { generateQuizSongs } = await import('../src/lib/server/songFiltering.js');

it('reports an uncached AniList failure instead of treating it as an empty list or caching it', async () => {
  const fetchCache = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    songsList: [], animeList: [], needsSongsFetch: true, uncachedStatuses: ['COMPLETED']
  }), { headers: { 'Content-Type': 'application/json' } }));
  const result = await generateQuizSongs(config, fetchCache);
  expect(result.songs).toEqual([]);
  expect(result.metadata.loadingErrors).toEqual([
    expect.objectContaining({ error: expect.stringContaining('AniList API error: 403 Forbidden') })
  ]);
  expect(result.metadata.loadingErrors[0].error).toContain('Please try again later');
  expect(fetchCache).toHaveBeenCalledTimes(1);
});
