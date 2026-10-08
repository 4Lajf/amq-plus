/**
 * Tests for countDailyBudgetSpend - the daily due/new budgets.
 *
 * These pin the "abandoned session eats the day" bug: the budgets used to sum
 * what each session *planned* to show, so opening a session and backing out
 * spent the whole allowance. Measured over 30 days, 9.1% of sessions never play
 * a single song and only 82.3% of planned songs are ever played.
 */

import { describe, it, expect } from 'vitest';
import { countDailyBudgetSpend } from '../src/lib/server/training/sessionStartService.js';

function session(id, reasons, annIds = null, composition = null) {
  const ids = annIds ?? reasons.map((_, i) => 100 + i);
  return {
    id,
    session_data: {
      playlistAnnSongIds: ids,
      playlistReasons: reasons,
      ...(composition ? { composition } : {})
    }
  };
}

function play(sessionId, annSongId) {
  return { session_id: sessionId, song_ann_id: annSongId };
}

describe('countDailyBudgetSpend', () => {
  it('charges for songs played, not songs planned', () => {
    // Planned 2 due + 2 new; the player answered one of each and quit.
    const sessions = [session('s1', ['due', 'due', 'new', 'new'])];
    const plays = [play('s1', 100), play('s1', 102)];

    expect(countDailyBudgetSpend(sessions, plays)).toEqual({
      due: 1,
      new: 1,
      legacyDue: 0,
      legacyNew: 0
    });
  });

  it('costs nothing when a session is started and abandoned', () => {
    const sessions = [session('s1', ['due', 'new', 'new'])];

    expect(countDailyBudgetSpend(sessions, [])).toEqual({
      due: 0,
      new: 0,
      legacyDue: 0,
      legacyNew: 0
    });
  });

  it('keeps ignoring extra-practice and legacy shelved reasons', () => {
    const sessions = [session('s1', ['due', 'revision', 'shelved', 'new'])];
    const plays = [play('s1', 100), play('s1', 101), play('s1', 102), play('s1', 103)];

    const spent = countDailyBudgetSpend(sessions, plays);
    expect(spent.due).toBe(1);
    expect(spent.new).toBe(1);
  });

  it('accumulates across several sessions in the same day', () => {
    const sessions = [
      session('s1', ['due', 'new'], [100, 101]),
      session('s2', ['new', 'new'], [200, 201])
    ];
    const plays = [play('s1', 100), play('s1', 101), play('s2', 200), play('s2', 201)];

    const spent = countDailyBudgetSpend(sessions, plays);
    expect(spent.due).toBe(1);
    expect(spent.new).toBe(3);
  });

  it('does not let one session claim another session plays', () => {
    // Same annSongId in both playlists, but only played under s2.
    const sessions = [
      session('s1', ['new'], [100]),
      session('s2', ['due'], [100])
    ];
    const plays = [play('s2', 100)];

    const spent = countDailyBudgetSpend(sessions, plays);
    expect(spent.new).toBe(0);
    expect(spent.due).toBe(1);
  });

  it('falls back to planned composition for sessions written before playlistReasons', () => {
    const legacy = {
      id: 's-old',
      session_data: {
        playlistAnnSongIds: [100, 101, 102],
        composition: { due: 2, new: 1 }
      }
    };

    expect(countDailyBudgetSpend([legacy], [play('s-old', 100)])).toEqual({
      due: 2,
      new: 1,
      legacyDue: 2,
      legacyNew: 1
    });
  });

  it('falls back when the reasons array is out of step with the id list', () => {
    const skewed = {
      id: 's-skew',
      session_data: {
        playlistAnnSongIds: [100, 101, 102],
        playlistReasons: ['due', 'new'],
        composition: { due: 3, new: 0 }
      }
    };

    const spent = countDailyBudgetSpend([skewed], [play('s-skew', 100)]);
    expect(spent.due).toBe(3);
    expect(spent.legacyDue).toBe(3);
  });

  it('mixes attributed and legacy sessions without double counting', () => {
    const sessions = [
      session('s1', ['due', 'new'], [100, 101]),
      {
        id: 's-old',
        session_data: {
          playlistAnnSongIds: [200],
          composition: { due: 5, new: 5 }
        }
      }
    ];
    const plays = [play('s1', 100), play('s-old', 200)];

    expect(countDailyBudgetSpend(sessions, plays)).toEqual({
      due: 6,
      new: 5,
      legacyDue: 5,
      legacyNew: 5
    });
  });

  it('counts a song once even if it somehow recorded two plays', () => {
    const sessions = [session('s1', ['new'], [100])];
    const plays = [play('s1', 100), play('s1', 100)];

    expect(countDailyBudgetSpend(sessions, plays).new).toBe(1);
  });

  it('survives empty, null and malformed input', () => {
    expect(countDailyBudgetSpend([], [])).toEqual({
      due: 0, new: 0, legacyDue: 0, legacyNew: 0
    });
    expect(countDailyBudgetSpend(null, null)).toEqual({
      due: 0, new: 0, legacyDue: 0, legacyNew: 0
    });
    expect(countDailyBudgetSpend([{ id: 'x' }], [{ session_id: null }])).toEqual({
      due: 0, new: 0, legacyDue: 0, legacyNew: 0
    });
  });

  it('tolerates string annSongIds from jsonb round-tripping', () => {
    const sessions = [session('s1', ['due', 'new'], ['100', '101'])];
    const plays = [play('s1', 100), play('s1', 101)];

    const spent = countDailyBudgetSpend(sessions, plays);
    expect(spent.due).toBe(1);
    expect(spent.new).toBe(1);
  });
});
