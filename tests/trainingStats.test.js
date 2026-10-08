import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
	calculateQuizStats,
	calculateQuizStatsWithPool,
	deduplicateProgressRecords,
	normalizeProgressForQuizStats
} from '../src/lib/server/training/training-utils.js';

function makeDueDate() {
  return new Date(2026, 1, 3, 4, 0, 0).toISOString();
}

it('keeps paused and outside-quiz songs resumable in the display while excluding them from stats', () => {
  const active = { song_ann_id: 1 };
  const paused = { song_ann_id: 2, suspended_at: '2026-09-06T00:00:00Z' };
  const outside = { song_ann_id: 3, is_active: false };
  const missing = { id: 'missing', song_ann_id: null };
  const records = [active, paused, outside, missing];
  expect(deduplicateProgressRecords(records)).toEqual(records);
  expect(normalizeProgressForQuizStats(records)).toEqual([active]);
});

it('displays the latest legacy duplicate without changing its suspension or history', () => {
  const old = { song_ann_id: 2, last_attempt_at: '2026-09-05T00:00:00Z' };
  const latest = { song_ann_id: 2, last_attempt_at: '2026-09-06T00:00:00Z', suspended_at: '2026-09-06T01:00:00Z', history: [{ rating: 2 }] };
  expect(deduplicateProgressRecords([old, latest])).toEqual([latest]);
});

describe('Training stats - dueToday filtering', () => {
  beforeAll(() => {
    // Feb 3, 2026 at noon local time
    const fixedNow = new Date(2026, 1, 3, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts due songs for active playable records', () => {
    const records = [
      {
        song_ann_id: 123,
        is_active: true,
        attempt_count: 2,
        success_count: 2,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 5 }
      }
    ];

    const stats = calculateQuizStats(records);
    expect(stats.totalSongs).toBe(1);
    expect(stats.dueToday).toBe(1);
  });

  it('ignores inactive or missing-id records in due counts', () => {
    const records = [
      {
        song_ann_id: 123,
        is_active: true,
        attempt_count: 1,
        success_count: 1,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 4 }
      },
      {
        song_ann_id: 456,
        is_active: false,
        attempt_count: 3,
        success_count: 2,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 6 }
      },
      {
        song_ann_id: null,
        is_active: true,
        attempt_count: 4,
        success_count: 4,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 3 }
      }
    ];

    const stats = calculateQuizStats(records);
    expect(stats.totalSongs).toBe(1);
    expect(stats.dueToday).toBe(1);
  });

  it('returns zero due when only inactive or unplayable records exist', () => {
    const records = [
      {
        song_ann_id: 111,
        is_active: false,
        attempt_count: 1,
        success_count: 0,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 6 }
      },
      {
        song_ann_id: null,
        is_active: true,
        attempt_count: 2,
        success_count: 1,
        history: [],
        fsrs_state: { due: makeDueDate(), state: 2, difficulty: 4 }
      }
    ];

    const stats = calculateQuizStats(records);
    expect(stats.totalSongs).toBe(0);
    expect(stats.dueToday).toBe(0);
  });

	it('does not count paused songs as playable totals', () => {
		const records = [
			{
				song_ann_id: 123,
				is_active: true,
				suspended_at: null,
				attempt_count: 2,
				success_count: 2,
				history: [],
				fsrs_state: { due: makeDueDate(), state: 2, difficulty: 5 }
			},
			{
				song_ann_id: 456,
				is_active: true,
				suspended_at: '2026-02-01T00:00:00.000Z',
				attempt_count: 4,
				success_count: 4,
				history: [],
				fsrs_state: { due: makeDueDate(), state: 2, difficulty: 3 }
			}
		];

		const stats = calculateQuizStatsWithPool(records, 20);
		expect(stats.totalSongs).toBe(1);
		expect(stats.dueToday).toBe(1);
	});
});
