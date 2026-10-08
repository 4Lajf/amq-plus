import { describe, it, expect } from 'vitest';
import { resolveMissingSongMedia } from '../src/lib/server/song-media.js';

describe('saved song media recovery', () => {
  const index = new Map([
    ['18437', { HQ: '76cx84.webm', MQ: 'ng3jdz.webm', audio: '0dn9b5.mp3' }],
    ['48036', { HQ: '3qnvx2.webm', MQ: null, audio: 'yzw5lt.mp3' }],
    ['1', { HQ: null, MQ: null, audio: null }]
  ]);

  it('recovers Torikago and RENDEZVOUS by numeric or string ANN ID without mutating the list', () => {
    const songs = [18437, '48036'].map(annSongId =>
      Object.freeze({ annSongId, HQ: null, MQ: null, audio: null, songName: 'Saved title', _sourceId: 'list' })
    );
    const resolved = resolveMissingSongMedia(songs, index);
    expect(resolved.map(s => s.audio)).toEqual(['0dn9b5.mp3', 'yzw5lt.mp3']);
    expect(resolved[0]).toMatchObject({ songName: 'Saved title', _sourceId: 'list' });
    expect(songs.every(s => s.audio === null)).toBe(true);
  });

  it('preserves existing media, unknown IDs, and genuinely unuploaded songs', () => {
    const songs = [
      { annSongId: 18437, audio: 'custom.mp3' },
      { annSongId: 99999, HQ: null, MQ: null, audio: null },
      { annSongId: 1, HQ: null, MQ: null, audio: null },
      { songName: 'No identity' },
      { annSongId: 99998 }
    ];
    resolveMissingSongMedia(songs, index).forEach((song, i) => expect(song).toBe(songs[i]));
  });

  it('also resolves imports with omitted or empty media fields', () => {
    expect(resolveMissingSongMedia([{ annSongId: 18437 }, { annSongId: '48036', audio: '' }], index)
      .map(s => s.audio)).toEqual(['0dn9b5.mp3', 'yzw5lt.mp3']);
  });
});
