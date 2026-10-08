import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrainingDue } from '../src/lib/utils/training-due.js';
import { TrainingScheduler } from '../src/lib/server/training/fsrs-service.js';
import { utcStartOfDay } from '../src/lib/utils/day-boundary.js';

afterEach(() => vi.useRealTimers());

describe('progress and scheduler share due eligibility', () => {
	it.each([
		['2026-09-04T23:59:59Z', true],
		['2026-09-05T09:59:59Z', true],
		['2026-09-05T10:00:00Z', true],
		['2026-09-05T10:00:00.001Z', false],
		['2026-09-05T20:00:00Z', false],
		['2026-09-06T00:00:00Z', false],
		['2026-09-05T12:00:00+02:00', true],
		[null, false],
		['', false],
		['invalid', false]
	])('due %s is eligible: %s', (due, expected) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
		const record = { song_ann_id: 1, is_active: true, fsrs_state: { due, state: 2 } };
		expect(isTrainingDue(record)).toBe(expected);
		expect(new TrainingScheduler().getDueSongs([record])).toEqual(expected ? [record] : []);
	});

	it.each([{ is_active: false }, { suspended_at: '2026-09-04T00:00:00Z' }, { song_ann_id: null }])(
		'excludes unavailable songs: %j',
		(overrides) => {
			const record = { song_ann_id: 1, fsrs_state: { due: '2026-09-04T00:00:00Z' }, ...overrides };
			expect(isTrainingDue(record, new Date('2026-09-05T00:00:00Z'))).toBe(false);
			expect(new TrainingScheduler().getDueSongs([record])).toEqual([]);
		}
	);

	it.each([
		// Day-scale review rated on an earlier day: due for its whole UTC day.
		['2026-09-05T20:00:00Z', '2026-09-01T20:00:00Z', true],
		['2026-09-05T23:59:59Z', '2026-09-04T23:00:00Z', true],
		// Not yet its day.
		['2026-09-06T00:30:00Z', '2026-09-02T00:30:00Z', false],
		// Same-day learning step keeps its exact time.
		['2026-09-05T10:10:00Z', '2026-09-05T10:00:00Z', false],
		['2026-09-05T20:00:00Z', '2026-09-05T09:00:00Z', false],
		// No or bad last_review falls back to the exact time.
		['2026-09-05T20:00:00Z', null, false],
		['2026-09-05T20:00:00Z', 'invalid', false]
	])('due %s after last review %s is eligible: %s', (due, last_review, expected) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
		const record = { song_ann_id: 1, is_active: true, fsrs_state: { due, last_review, state: 2 } };
		expect(isTrainingDue(record)).toBe(expected);
		expect(new TrainingScheduler().getDueSongs([record])).toEqual(expected ? [record] : []);
	});

	it('a song rated now is not due again until its next day', () => {
		const scheduler = new TrainingScheduler();
		const now = new Date('2026-09-05T10:00:00Z');
		const card = scheduler.scheduleNext(
			{ due: '2026-09-05T00:00:00Z', stability: 10, difficulty: 5, state: 2, reps: 5, last_review: '2026-08-26T10:00:00Z' },
			3,
			now
		);
		const record = { song_ann_id: 1, fsrs_state: card };
		expect(isTrainingDue(record, new Date('2026-09-05T23:59:59Z'))).toBe(false);
		expect(new Date(card.due).getUTCHours()).toBe(10);
		expect(isTrainingDue(record, utcStartOfDay(new Date(card.due)))).toBe(true);
	});

	it('crosses UTC midnight at the exact due instant', () => {
		const record = { song_ann_id: 1, fsrs_state: { due: '2026-09-06T00:00:00Z' } };
		expect(isTrainingDue(record, new Date('2026-09-05T23:59:59.999Z'))).toBe(false);
		expect(isTrainingDue(record, new Date('2026-09-06T00:00:00Z'))).toBe(true);
	});
});
