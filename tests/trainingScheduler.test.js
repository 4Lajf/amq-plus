/**
 * Tests for TrainingScheduler matching logic.
 */

import { describe, it, expect } from 'vitest';
import { TrainingScheduler } from '../src/lib/server/training/fsrs-service.js';

describe('TrainingScheduler - new song detection', () => {
  it('treats numeric progress IDs and string annSongId as same song', () => {
    const scheduler = new TrainingScheduler();
    const progressRecords = [{ song_ann_id: 123 }];
    const allQuizSongs = [
      { annSongId: '123', songArtist: 'Artist', songName: 'Title' }
    ];

    const newSongs = scheduler.getNewSongs(progressRecords, allQuizSongs, 10);
    expect(newSongs.length).toBe(0);
  });

  it('falls back to song key when numeric IDs are missing', () => {
    const scheduler = new TrainingScheduler();
    const progressRecords = [{ song_ann_id: null, annSongId: 'Artist_Title' }];
    const allQuizSongs = [
      { annSongId: 999, songArtist: 'Artist', songName: 'Title' }
    ];

    const newSongs = scheduler.getNewSongs(progressRecords, allQuizSongs, 10);
    expect(newSongs.length).toBe(0);
  });
});
