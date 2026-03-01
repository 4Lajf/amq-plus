import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reconstructSongsFromLocalStorage, importFromLocalStorage } from '../src/lib/server/training/training-utils.js';

describe('Training import utilities', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reconstructs songs with partial-match fallback', async () => {
    const localStorageData = {
      'Artist_Title': {
        efactor: 2.5,
        successCount: 1,
        failureCount: 0,
        date: Date.now()
      }
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            annSongId: 123,
            animeENName: 'Some Anime',
            songName: 'Title',
            songArtist: 'Artist'
          }
        ]
      });

    globalThis.fetch = fetchMock;

    const result = await reconstructSongsFromLocalStorage(localStorageData);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(firstCallBody.song_name_search_filter.partial_match).toBe(false);
    expect(firstCallBody.artist_search_filter.partial_match).toBe(false);
    expect(secondCallBody.song_name_search_filter.partial_match).toBe(true);
    expect(secondCallBody.artist_search_filter.partial_match).toBe(true);

    expect(Object.keys(result.songMap)).toHaveLength(1);
    expect(result.songMap['Artist_Title'].annSongId).toBe(123);
    expect(result.failedSongs).toHaveLength(0);
  });

  it('imports training progress with song_key and song_ann_id', async () => {
    const localStorageData = {
      'Artist_Title': {
        efactor: 2.2,
        successCount: 2,
        failureCount: 1,
        successStreak: 1,
        failureStreak: 0,
        date: Date.now(),
        lastReviewDate: Date.now(),
        lastFiveTries: [true, false, true],
        interval: 3
      }
    };

    const songMap = {
      'Artist_Title': { annSongId: 456 }
    };

    let captured = null;
    const supabase = {
      from: (table) => ({
        insert: async (payload) => {
          captured = { table, payload };
          return { error: null };
        }
      })
    };

    const result = await importFromLocalStorage(supabase, localStorageData, 'user-1', 'quiz-1', songMap);

    expect(result.imported).toBe(1);
    expect(captured.table).toBe('training_progress');
    expect(captured.payload).toHaveLength(1);
    expect(captured.payload[0].song_key).toBe('Artist_Title');
    expect(captured.payload[0].song_ann_id).toBe(456);
  });
});
