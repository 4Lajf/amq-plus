/**
 * R13. The rating buttons show these numbers, so a preview that disagrees with
 * what the button actually schedules is worse than no preview at all — that was
 * the original complaint, four people inferring FSRS from screenshots.
 */

import { describe, it, expect } from 'vitest';
import { TrainingScheduler } from '../src/lib/server/training/fsrs-service.js';

const NOW = new Date('2026-08-10T09:00:00.000Z');
const RATINGS = [1, 2, 3, 4];

describe('TrainingScheduler.projectRatings', () => {
	it('offers all four ratings for a brand new song', () => {
		const scheduler = new TrainingScheduler();

		const preview = scheduler.projectRatings(null, NOW);

		expect(Object.keys(preview.intervals).map(Number).sort()).toEqual(RATINGS);
		expect(preview.state).toBe('New');
		// A new card has no history to report yet.
		expect(preview.difficulty).toBeNull();
		expect(preview.stability).toBeNull();
	});

	it('allows same-day returns for short learning steps', () => {
		const scheduler = new TrainingScheduler();

		// Late in the UTC day: Again / Hard on a New card can still land today.
		const lateInDay = new Date('2026-08-10T23:50:00.000Z');
		const preview = scheduler.projectRatings(null, lateInDay);

		for (const rating of RATINGS) {
			const due = new Date(preview.intervals[rating].due);
			expect(due.getTime()).toBeGreaterThan(lateInDay.getTime());
			expect(preview.intervals[rating].days).toBeGreaterThanOrEqual(1);
		}

		// Again on a brand-new card is a short step — same calendar day is OK.
		expect(new Date(preview.intervals[1].due).toISOString().slice(0, 10)).toBe('2026-08-10');
	});

	it('matches what scheduleNext actually writes, for every rating', () => {
		const scheduler = new TrainingScheduler();
		const card = {
			due: '2026-08-10T00:00:00.000Z',
			stability: 12.5,
			difficulty: 5.2,
			elapsed_days: 6,
			scheduled_days: 6,
			reps: 4,
			lapses: 1,
			state: 2,
			last_review: '2026-08-04T09:00:00.000Z'
		};

		const preview = scheduler.projectRatings(card, NOW);

		for (const rating of RATINGS) {
			const applied = scheduler.scheduleNext(card, rating, NOW);
			expect(preview.intervals[rating].due).toBe(applied.due);
		}
	});

	it('orders the intervals Again <= Hard <= Good <= Easy', () => {
		const scheduler = new TrainingScheduler();
		const card = {
			due: '2026-08-10T00:00:00.000Z',
			stability: 30,
			difficulty: 4,
			elapsed_days: 30,
			scheduled_days: 30,
			reps: 8,
			lapses: 0,
			state: 2,
			last_review: '2026-07-11T09:00:00.000Z'
		};

		const preview = scheduler.projectRatings(card, NOW);
		const days = RATINGS.map((r) => preview.intervals[r].days);

		expect(days[0]).toBeLessThanOrEqual(days[1]);
		expect(days[1]).toBeLessThanOrEqual(days[2]);
		expect(days[2]).toBeLessThanOrEqual(days[3]);
		// A well-known card should actually spread, not collapse to four 1s.
		expect(days[3]).toBeGreaterThan(days[0]);
	});

	it('reports the card difficulty and stability it was given', () => {
		const scheduler = new TrainingScheduler();
		const card = {
			due: '2026-08-10T00:00:00.000Z',
			stability: 7.25,
			difficulty: 6.5,
			state: 2,
			reps: 3,
			lapses: 0,
			last_review: '2026-08-03T09:00:00.000Z'
		};

		const preview = scheduler.projectRatings(card, NOW);

		expect(preview.difficulty).toBeCloseTo(6.5);
		expect(preview.stability).toBeCloseTo(7.25);
		expect(preview.state).toBe('Review');
	});

	it('does not mutate the card it was asked to project', () => {
		const scheduler = new TrainingScheduler();
		const card = {
			due: '2026-08-10T00:00:00.000Z',
			stability: 9,
			difficulty: 5,
			state: 2,
			reps: 2,
			lapses: 0
		};
		const before = JSON.stringify(card);

		scheduler.projectRatings(card, NOW);

		expect(JSON.stringify(card)).toBe(before);
	});
});
