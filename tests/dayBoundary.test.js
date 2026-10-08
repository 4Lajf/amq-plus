import { describe, it, expect } from 'vitest';
import {
	utcStartOfDay,
	utcStartOfNextDay,
	utcEndOfDay,
	utcAddDays,
	utcDaysBetween,
	isSameUtcDay,
	dayBoundaryNote,
	localDayRolloverLabel
} from '../src/lib/utils/day-boundary.js';
import { trainingScheduler, State } from '../src/lib/server/training/fsrs-service.js';

describe('utc day boundary', () => {
	it('anchors the day at 00:00 UTC regardless of the host timezone', () => {
		// 23:30 UTC is already "tomorrow" in Berlin and still "today" in New York.
		// All three must agree on the UTC day.
		expect(utcStartOfDay('2026-08-06T23:30:00Z').toISOString()).toBe('2026-08-06T00:00:00.000Z');
		expect(utcStartOfDay('2026-08-06T00:00:00Z').toISOString()).toBe('2026-08-06T00:00:00.000Z');
		expect(utcStartOfDay('2026-08-06T12:00:00Z').toISOString()).toBe('2026-08-06T00:00:00.000Z');
	});

	it('rolls to the next boundary at midnight', () => {
		expect(utcStartOfNextDay('2026-08-06T23:59:59Z').toISOString()).toBe(
			'2026-08-07T00:00:00.000Z'
		);
		expect(utcEndOfDay('2026-08-06T00:00:00Z').toISOString()).toBe('2026-08-06T23:59:59.999Z');
	});

	it('adds and diffs whole days', () => {
		expect(utcAddDays('2026-08-06T18:00:00Z', 3).toISOString()).toBe('2026-08-09T00:00:00.000Z');
		expect(utcAddDays('2026-08-06T18:00:00Z', -1).toISOString()).toBe('2026-08-05T00:00:00.000Z');
		expect(utcDaysBetween('2026-08-06T23:00:00Z', '2026-08-07T01:00:00Z')).toBe(1);
		expect(utcDaysBetween('2026-08-07T01:00:00Z', '2026-08-06T23:00:00Z')).toBe(-1);
	});

	it('crosses month and year boundaries', () => {
		expect(utcStartOfNextDay('2026-12-31T12:00:00Z').toISOString()).toBe(
			'2027-01-01T00:00:00.000Z'
		);
		expect(utcAddDays('2026-02-28T00:00:00Z', 1).toISOString()).toBe('2026-03-01T00:00:00.000Z');
	});

	it('compares days, not instants', () => {
		expect(isSameUtcDay('2026-08-06T00:00:01Z', '2026-08-06T23:59:59Z')).toBe(true);
		expect(isSameUtcDay('2026-08-06T23:59:59Z', '2026-08-07T00:00:00Z')).toBe(false);
	});
});

describe('scheduleNext day rollover', () => {
	const card = {
		songKey: 'x',
		due: '2026-08-06T00:00:00Z',
		stability: 3,
		difficulty: 5,
		elapsed_days: 1,
		scheduled_days: 1,
		reps: 3,
		lapses: 0,
		state: State.Review,
		last_review: '2026-08-05T00:00:00Z'
	};

	// These three used to pin "no same-day reviews" - every sub-day due snapped to
	// the next UTC midnight. That rule is gone: FSRS's short-term steps are
	// honoured, and getDueSongs gates on the due timestamp. See
	// docs/SPEC-same-day-reviews.md.

	it('schedules a lapse the same UTC day, not tomorrow', () => {
		const now = new Date('2026-08-06T10:00:00Z');
		const next = trainingScheduler.scheduleNext(card, 1, now);
		expect(isSameUtcDay(next.due, now)).toBe(true);
		expect(new Date(next.due).getTime()).toBeGreaterThan(now.getTime());
	});

	it('uses the FSRS relearning step rather than a fixed app floor', () => {
		// Review + Again → stock relearning_steps ["10m"]. Fuzz is on by default
		// so allow a narrow band around ten minutes rather than an exact stamp.
		const now = new Date('2026-08-06T10:00:00Z');
		const next = trainingScheduler.scheduleNext(card, 1, now);
		const gapMs = new Date(next.due).getTime() - now.getTime();
		expect(gapMs).toBeGreaterThanOrEqual(5 * 60_000);
		expect(gapMs).toBeLessThanOrEqual(20 * 60_000);
	});

	it('crosses midnight by the clock when the FSRS step spans it', () => {
		const now = new Date('2026-08-06T23:55:00Z');
		const next = trainingScheduler.scheduleNext(card, 1, now);
		const gapMs = new Date(next.due).getTime() - now.getTime();
		expect(gapMs).toBeGreaterThan(0);
		expect(isSameUtcDay(next.due, now)).toBe(false);
	});

	it('leaves a genuinely future due date alone', () => {
		const now = new Date('2026-08-06T10:00:00Z');
		const next = trainingScheduler.scheduleNext(card, 4, now);
		// "Easy" on a review card schedules well beyond tomorrow; the rollover guard
		// must not drag it back to the boundary.
		expect(new Date(next.due).getTime()).toBeGreaterThan(
			new Date('2026-08-07T00:00:00Z').getTime()
		);
	});
});

describe('W8 day-boundary copy', () => {
	it('states the rule and the viewer local equivalent', () => {
		const note = dayBoundaryNote(new Date('2026-08-11T15:00:00Z'));
		expect(note).toContain('00:00 UTC');
		expect(note).toMatch(/\d{2}:\d{2}/);
	});

	it('derives the local label from the next boundary, not a hardcoded string', () => {
		const now = new Date('2026-08-11T15:00:00Z');
		expect(dayBoundaryNote(now)).toContain(localDayRolloverLabel(now));
	});
});
