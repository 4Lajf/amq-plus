/**
 * Tests for computeSessionPlaylist composition rules.
 *
 * These pin the three scheduler bugs from the Discord backlog:
 *  - due songs padded out by not-yet-due "revision" filler
 *  - legacy far-future dates treated as a hidden fourth category
 *  - songs played earlier today handed straight back as filler
 */

import { describe, it, expect } from 'vitest';
import { TrainingScheduler } from '../src/lib/server/training/fsrs-service.js';

const DAY = 24 * 60 * 60 * 1000;

function song(annSongId) {
  return {
    annSongId,
    songArtist: `Artist${annSongId}`,
    songName: `Song${annSongId}`
  };
}

function progress(annSongId, dueOffsetDays, extra = {}) {
  return {
    id: `row-${annSongId}`,
    song_ann_id: annSongId,
    is_active: true,
    fsrs_state: {
      due: new Date(Date.now() + dueOffsetDays * DAY).toISOString(),
      stability: 5,
      difficulty: 5,
      state: 2,
      reps: 3
    },
    ...extra
  };
}

/** Legacy rows used 2099 as a sentinel; they are now ordinary upcoming cards. */
function legacyFarFuture(annSongId) {
  return {
    id: `row-${annSongId}`,
    song_ann_id: annSongId,
    is_active: true,
    fsrs_state: {
      due: new Date(2099, 0, 1).toISOString(),
      stability: 5,
      difficulty: 5,
      state: 2,
      reps: 3
    }
  };
}

function reasons(playlist) {
  return playlist.reduce((acc, item) => {
    acc[item.selection_reason] = (acc[item.selection_reason] || 0) + 1;
    return acc;
  }, {});
}

describe('manual due-only sessions', () => {
  it.each([0, 2])('keeps %i due songs without filling with future reviews', (dueCount) => {
    const scheduler = new TrainingScheduler();
    const due = Array.from({ length: dueCount }, (_, i) => progress(1000 + i, -1));
    const future = Array.from({ length: 20 }, (_, i) => progress(2000 + i, 10));
    const records = [...due, ...future];
    const { playlist } = scheduler.computeSessionPlaylist(
      records,
      [...records.map(r => song(r.song_ann_id)), song(5000)],
      20,
      { mode: 'manual', dueSongPercentage: 100, newSongPercentage: 0, revisionSongPercentage: 0 }
    );
    expect(playlist).toHaveLength(dueCount);
    expect(playlist.every(item => item.selection_reason === 'due')).toBe(true);
  });

  it('still fills with extra practice when the manual mix requests it', () => {
    const scheduler = new TrainingScheduler();
    const records = Array.from({ length: 20 }, (_, i) => progress(2000 + i, 10));
    const { playlist } = scheduler.computeSessionPlaylist(
      records, records.map(r => song(r.song_ann_id)), 20,
      { mode: 'manual', dueSongPercentage: 50, newSongPercentage: 0, revisionSongPercentage: 50 }
    );
    expect(playlist).toHaveLength(20);
    expect(playlist.every(item => item.selection_reason === 'revision')).toBe(true);
  });
});

describe('computeSessionPlaylist - auto mode', () => {
  it('does not pad with revision songs while due songs are still waiting', () => {
    const scheduler = new TrainingScheduler();

    // 30 overdue, 30 due in the future, no new songs available.
    const due = Array.from({ length: 30 }, (_, i) => progress(1000 + i, -2));
    const future = Array.from({ length: 30 }, (_, i) => progress(2000 + i, +5));
    const allSongs = [...due, ...future].map(r => song(r.song_ann_id));

    const { playlist } = scheduler.computeSessionPlaylist(
      [...due, ...future],
      allSongs,
      10,
      { mode: 'auto', maxNewPercentage: 30 }
    );

    const counts = reasons(playlist);
    expect(counts.due).toBe(10);
    expect(counts.revision).toBeUndefined();
  });

  it('tapers new songs with backlog pressure instead of stopping them', () => {
    const scheduler = new TrainingScheduler();

    // 40 due against a 20-song session = 2x pressure, halfway up the ramp
    // between the full 30% share (6) and the floor (1).
    const due = Array.from({ length: 40 }, (_, i) => progress(1000 + i, -1));
    const neverPracticed = Array.from({ length: 40 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...neverPracticed];

    const { playlist, metadata } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      maxNewPercentage: 30
    });

    const counts = reasons(playlist);
    expect(counts.new).toBeGreaterThan(0);
    expect(counts.new).toBeLessThan(6);
    expect(counts.due).toBe(20 - counts.new);
    expect(metadata.backlogThrottle).toMatchObject({ fullShare: 6, allowed: counts.new });
  });

  it('never taper introductions to zero, however deep the backlog', () => {
    const scheduler = new TrainingScheduler();

    // 400 due against a 20-song session = 20x pressure, far past the ceiling.
    const due = Array.from({ length: 400 }, (_, i) => progress(1000 + i, -5));
    const neverPracticed = Array.from({ length: 40 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...neverPracticed];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      maxNewPercentage: 30
    });

    const counts = reasons(playlist);
    expect(counts.new).toBe(1);
    expect(counts.due).toBe(19);
  });

  it('fills a session with new songs once the small due pool is exhausted', () => {
    const scheduler = new TrainingScheduler();

    const due = Array.from({ length: 10 }, (_, i) => progress(1000 + i, -1));
    const neverPracticed = Array.from({ length: 40 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...neverPracticed];

    const { playlist, metadata } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      maxNewPercentage: 30
    });

    const counts = reasons(playlist);
    expect(counts.due).toBe(10);
    expect(counts.new).toBe(10);
    expect(metadata.backlogThrottle).toBeNull();
  });

  it('does not let leftover slots undo the taper', () => {
    const scheduler = new TrainingScheduler();

    // Deep backlog (taper to 1) but only 4 due songs actually resolvable, so
    // slots are left over. Those must not be refilled with new songs.
    const due = Array.from({ length: 400 }, (_, i) => progress(1000 + i, -5));
    const neverPracticed = Array.from({ length: 40 }, (_, i) => song(5000 + i));
    const allSongs = [...due.slice(0, 4).map((r) => song(r.song_ann_id)), ...neverPracticed];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      maxNewPercentage: 30
    });

    const counts = reasons(playlist);
    expect(counts.new).toBe(1);
  });

  it('respects remainingNewCapacity in auto mode when due cannot fill', () => {
    const scheduler = new TrainingScheduler();

    const due = [progress(1001, -1), progress(1002, -1)];
    const neverPracticed = Array.from({ length: 30 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...neverPracticed];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      maxNewPercentage: 50,
      remainingNewCapacity: 3
    });

    const counts = reasons(playlist);
    expect(counts.due).toBe(2);
    expect(counts.new).toBe(3);
  });

  it('falls through to revision once the due backlog is exhausted', () => {
    const scheduler = new TrainingScheduler();

    const due = [progress(1001, -1), progress(1002, -1)];
    const future = Array.from({ length: 20 }, (_, i) => progress(2000 + i, +5));
    const allSongs = [...due, ...future].map(r => song(r.song_ann_id));

    const { playlist } = scheduler.computeSessionPlaylist(
      [...due, ...future],
      allSongs,
      10,
      { mode: 'auto', maxNewPercentage: 0 }
    );

    const counts = reasons(playlist);
    expect(counts.due).toBe(2);
    expect(counts.revision).toBe(8);
  });

  it('cuts the new share to the floor under a large due backlog', () => {
    // Previously reserved a flat ~30% new even with 50 overdue waiting, which
    // grew backlogs. 50 due against a 10-song session is 5x pressure - past the
    // ceiling - so introductions sit at the floor rather than at three.
    const scheduler = new TrainingScheduler();

    const due = Array.from({ length: 50 }, (_, i) => progress(1000 + i, -3));
    const unseen = Array.from({ length: 10 }, (_, i) => song(3000 + i));
    const allSongs = [...due.map(r => song(r.song_ann_id)), ...unseen];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 10, {
      mode: 'auto',
      maxNewPercentage: 30
    });

    const counts = reasons(playlist);
    expect(counts.new).toBe(1);
    expect(counts.due).toBe(9);
  });

  it('treats legacy far-future cards as extra practice, never as a hidden category', () => {
    const scheduler = new TrainingScheduler();

    const parked = Array.from({ length: 20 }, (_, i) => legacyFarFuture(4000 + i));
    const allSongs = parked.map(r => song(r.song_ann_id));

    const { playlist } = scheduler.computeSessionPlaylist(
      parked,
      allSongs,
      10,
      { mode: 'auto', maxNewPercentage: 0 }
    );

    const counts = reasons(playlist);
    expect(counts.revision).toBe(10);
    expect(counts.shelved).toBeUndefined();
  });

  it('excludes songs already played today from revision filler', () => {
    const scheduler = new TrainingScheduler();

    const future = Array.from({ length: 10 }, (_, i) => progress(2000 + i, +5));
    const allSongs = future.map(r => song(r.song_ann_id));

    const { playlist } = scheduler.computeSessionPlaylist(future, allSongs, 10, {
      mode: 'auto',
      maxNewPercentage: 0,
      excludePlayedSongAnnIds: [2000, 2001, 2002]
    });

    const ids = playlist.map(item => item.annSongId);
    expect(ids).not.toContain(2000);
    expect(ids).not.toContain(2001);
    expect(ids).not.toContain(2002);
    expect(playlist.length).toBe(7);
  });
});

describe('computeSessionPlaylist - manual mode', () => {
  it('ignores a legacy shelf target and emits only current categories', () => {
    const scheduler = new TrainingScheduler();

    const due = Array.from({ length: 6 }, (_, i) => progress(1000 + i, -3));
    const parked = Array.from({ length: 20 }, (_, i) => legacyFarFuture(4000 + i));
    const allSongs = [...due, ...parked].map(r => song(r.song_ann_id));

    const { playlist } = scheduler.computeSessionPlaylist(
      [...due, ...parked],
      allSongs,
      10,
      { mode: 'manual', dueCount: 6, newCount: 0, revisionCount: 0, shelvedCount: 4 }
    );

    const counts = reasons(playlist);
    expect(counts.due).toBe(6);
    expect(counts.revision).toBeUndefined();
    expect(playlist).toHaveLength(6);
    expect(counts.shelved).toBeUndefined();
  });

  it('respects remainingNewCapacity in manual mode too, including the leftover fill', () => {
    // The manual branch clamped its target to the budget and then let the
    // leftover-fill step top the session up with new songs regardless: 4 due in
    // a 20-song session with 2 of budget left selected 16 new. Auto had always
    // treated the budget as a ceiling for the whole session; manual treated it
    // as a gate on the first pass only. Manual is the mode most sessions run in
    // (841 vs 197 over 7 days), so the daily new-song limit was not applying to
    // roughly 80% of sessions.
    const scheduler = new TrainingScheduler();

    const due = Array.from({ length: 4 }, (_, i) => progress(1000 + i, -3));
    const unseen = Array.from({ length: 30 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...unseen];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      dueSongPercentage: 20,
      newSongPercentage: 50,
      revisionSongPercentage: 0,
      remainingNewCapacity: 2
    });

    const counts = reasons(playlist);
    expect(counts.due).toBe(4);
    expect(counts.new, 'leftover fill must not spend past the daily budget').toBe(2);
  });

  it('still fills the session with new songs when the budget is unset', () => {
    // The clamp must not turn into a cap on ordinary manual sessions - with no
    // daily limit configured the leftover fill should still top the session up.
    const scheduler = new TrainingScheduler();

    const due = Array.from({ length: 4 }, (_, i) => progress(1000 + i, -3));
    const unseen = Array.from({ length: 30 }, (_, i) => song(5000 + i));
    const allSongs = [...due.map((r) => song(r.song_ann_id)), ...unseen];

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      dueSongPercentage: 20,
      newSongPercentage: 50,
      revisionSongPercentage: 0
    });

    const counts = reasons(playlist);
    expect(counts.due).toBe(4);
    expect(counts.new).toBe(16);
  });
});

describe('computeSessionPlaylist - daily review limit', () => {
  const scheduler = new TrainingScheduler();

  function bigBacklog() {
    const due = Array.from({ length: 60 }, (_, i) => progress(1000 + i, -3));
    return { due, allSongs: due.map(r => song(r.song_ann_id)) };
  }

  it('caps due songs in manual percentage mode', () => {
    const { due, allSongs } = bigBacklog();

    // The setting used to be read only in auto mode, so opening Advanced
    // Settings silently bypassed the cap the UI had just promised.
    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      remainingDueCapacity: 5,
      dueSongPercentage: 100,
      newSongPercentage: 0,
      revisionSongPercentage: 0
    });

    expect(reasons(playlist).due ?? 0).toBe(5);
  });

  it('caps due songs in manual absolute-count mode', () => {
    const { due, allSongs } = bigBacklog();

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      remainingDueCapacity: 3,
      dueCount: 20,
      newCount: 0,
      revisionCount: 0
    });

    expect(reasons(playlist).due ?? 0).toBe(3);
  });

  it('does not let the fill step exceed the cap either', () => {
    const { due, allSongs } = bigBacklog();

    // dueCount is under the cap, but the fill chain used to top up from the
    // full available pool and blow straight past it.
    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      remainingDueCapacity: 4,
      dueCount: 2,
      newCount: 0,
      revisionCount: 0
    });

    expect(reasons(playlist).due ?? 0).toBe(4);
  });

  it('is unlimited by default so no existing user is capped', () => {
    const { due, allSongs } = bigBacklog();

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'manual',
      dueCount: 20,
      newCount: 0,
      revisionCount: 0
    });

    expect(reasons(playlist).due).toBe(20);
  });

  it('still caps due songs in auto mode', () => {
    const { due, allSongs } = bigBacklog();

    const { playlist } = scheduler.computeSessionPlaylist(due, allSongs, 20, {
      mode: 'auto',
      remainingDueCapacity: 7,
      maxNewPercentage: 0
    });

    expect(reasons(playlist).due ?? 0).toBe(7);
  });
});
