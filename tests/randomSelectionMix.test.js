import { describe, it, expect } from 'vitest';
import {
  __test_buildBaskets as buildBaskets,
  __test_distributeToBaskets as distributeToBaskets
} from '../src/lib/server/songFiltering.js';

function select(selection, watched, unwatched) {
  const total = selection.random + selection.watched + selection.unwatched;
  const config = {
    numberOfSongs: total,
    songLists: [{ mode: 'saved-lists' }],
    filters: [{
      definitionId: 'songs-and-types',
      settings: { mode: 'count', total, songSelection: selection }
    }]
  };
  const songs = [...Array(watched).fill('watched'), ...Array(unwatched).fill('unwatched')]
    .map((type, index) => ({
      annSongId: index + 1,
      animeENName: `Anime ${index + 1}`,
      songType: 'Opening 1',
      _sourceType: type
    }));
  const baskets = buildBaskets(config, () => 0.5);
  return distributeToBaskets(songs, baskets, total, () => 0.5, true, 0, 8, null);
}

describe('random songs can overlap watched and unwatched pools', () => {
  it('fills random slots from watched songs beyond the watched minimum', () => {
    expect(select({ random: 10, watched: 10, unwatched: 0 }, 20, 0)).toHaveLength(20);
  });

  it('fills random slots from unwatched songs beyond the unwatched minimum', () => {
    expect(select({ random: 10, watched: 0, unwatched: 10 }, 0, 20)).toHaveLength(20);
  });

  it('preserves both explicit minimums while filling the random remainder', () => {
    const songs = select({ random: 5, watched: 10, unwatched: 5 }, 15, 5);
    expect(songs).toHaveLength(20);
    expect(songs.filter(s => s._sourceType === 'watched')).toHaveLength(15);
    expect(songs.filter(s => s._sourceType === 'unwatched')).toHaveLength(5);
  });

  it('keeps exact watched/unwatched quotas when no random slots are requested', () => {
    const songs = select({ random: 0, watched: 10, unwatched: 10 }, 20, 20);
    expect(songs).toHaveLength(20);
    expect(songs.filter(s => s._sourceType === 'watched')).toHaveLength(10);
    expect(songs.filter(s => s._sourceType === 'unwatched')).toHaveLength(10);
  });
});
