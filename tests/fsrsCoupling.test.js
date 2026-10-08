/**
 * The six-month interval ceiling, and the rating contract.
 *
 * ts-fsrs's stock maximum_interval is 36500 days, so 8.8% of active cards were
 * scheduled beyond six months and the furthest sat at 2029. That cap stays.
 *
 * W18 also capped a wrong answer at Hard so Good and Easy could not extend an
 * interval after a miss. **That half was reverted on 4Lajf's call** - the player
 * keeps the choice - so the tests below pin the opposite property: whatever
 * button is pressed is what the scheduler acts on. The nudge lives in the
 * connector, which rings Again after a wrong answer without disabling anything.
 *
 * Run: npx vitest run tests/fsrsCoupling.test.js
 */
import { describe, it, expect } from 'vitest';
import {
	TrainingScheduler,
	trainingScheduler,
	MAX_INTERVAL_DAYS,
	HARD_MAX_INTERVAL_DAYS,
	HARD_MIN_INTERVAL_MINUTES,
	HARD_STABILITY_RETENTION,
	Rating
} from '../src/lib/server/training/fsrs-service.js';

const DAY_MS = 86_400_000;

describe('the submitted rating is the scheduled rating', () => {
	it('schedules a wrong answer on the button the player pressed', () => {
		// The property the revert exists to guarantee. Pressing Easy after a miss
		// must produce Easy's schedule, not Hard's - otherwise the buttons lie.
		//
		// Matured first, and reviewed AT its due date, because both matter.
		// On a card's FIRST reviews the learning steps are minutes, so Again /
		// Hard / Good can look alike by due date alone. Reviewing a mature card
		// early compresses intervals the same way. Reviewed when actually due,
		// the four separate cleanly - which is the case this test needs to pin.
		let card = trainingScheduler.createNewCard('song-1');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 3; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const due = (r) => new Date(trainingScheduler.scheduleNext(card, r, at).due).getTime();

		expect(due(Rating.Hard), 'Hard must not schedule before Again').toBeGreaterThanOrEqual(
			due(Rating.Again)
		);
		expect(due(Rating.Good), 'Good must schedule later than Hard').toBeGreaterThan(due(Rating.Hard));
		expect(due(Rating.Easy), 'Easy must schedule later than Good').toBeGreaterThan(due(Rating.Good));
	});

	it('does not consult correctness anywhere in scheduling', () => {
		// There is no success flag in this path any more. Same card, same rating,
		// same result, regardless of what happened in the lobby.
		const card = trainingScheduler.createNewCard('song-2');
		const at = new Date('2026-01-01T12:00:00Z');
		const a = trainingScheduler.scheduleNext(card, Rating.Good, at);
		const b = trainingScheduler.scheduleNext(card, Rating.Good, at);
		expect(a.due).toBe(b.due);
	});
});

describe('W18 maximum interval', () => {
	it('caps scheduling at six months', () => {
		expect(MAX_INTERVAL_DAYS).toBe(180);
	});

	it('clamps Hard into a same-day band only for early states (New/Learning/Relearning)', () => {
		expect(HARD_MIN_INTERVAL_MINUTES).toBe(10);
		expect(HARD_MAX_INTERVAL_DAYS).toBe(1);

		// Mature Review: stock FSRS Hard schedules weeks out — Approach 1 leaves it.
		let card = trainingScheduler.createNewCard('song-hard-cap');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);
		const hardMs = new Date(afterHard.due).getTime() - at.getTime();
		expect(hardMs).toBeGreaterThan(HARD_MAX_INTERVAL_DAYS * DAY_MS);

		const afterGood = trainingScheduler.scheduleNext(card, Rating.Good, at);
		expect(new Date(afterGood.due).getTime()).toBeGreaterThan(
			new Date(afterHard.due).getTime()
		);
	});

	it('still clamps New-card Hard into the 10m–1d band', () => {
		const card = trainingScheduler.createNewCard('song-hard-new-band');
		const at = new Date('2026-01-01T12:00:00Z');
		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);
		const hardMs = new Date(afterHard.due).getTime() - at.getTime();
		expect(hardMs).toBeGreaterThanOrEqual(HARD_MIN_INTERVAL_MINUTES * 60_000);
		expect(hardMs).toBeLessThanOrEqual(HARD_MAX_INTERVAL_DAYS * DAY_MS + 1000);
	});

	it('lets a short FSRS Hard stay near the short end of the band', () => {
		// First-play Hard is a learning step (often <10m). The band floors it at
		// HARD_MIN — it must not be stretched to a full day.
		const card = trainingScheduler.createNewCard('song-hard-short');
		const at = new Date('2026-01-01T12:00:00Z');
		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);
		const hardMs = new Date(afterHard.due).getTime() - at.getTime();

		expect(hardMs).toBe(HARD_MIN_INTERVAL_MINUTES * 60_000);
		expect(hardMs).toBeLessThan(HARD_MAX_INTERVAL_DAYS * DAY_MS / 2);
	});

	it('does not let Hard grow stability through the due cap', () => {
		expect(HARD_STABILITY_RETENTION).toBe(0.5);

		let card = trainingScheduler.createNewCard('song-hard-spring');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		// Stock FSRS Hard raises stability on a mature card - 96% of the time in
		// production, roughly doubling the mean. Capping `due` alone leaves that
		// growth in place, so the first non-Hard rating releases the card
		// straight to the six-month ceiling.
		const before = card.stability;
		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);

		expect(afterHard.stability).toBeLessThan(before);
		expect(afterHard.stability).toBeCloseTo(before * HARD_STABILITY_RETENTION, 6);
	});

	it('schedules a mature Hard from the stability it stores, not the one it discards', () => {
		// Approach 1 stopped capping Review Hard at a day, but applyStabilityPolicy
		// kept halving the stability - so the card was scheduled off the un-halved
		// number and saved with the halved one. Measured before the fix: stability
		// 30 sent Lucky guess 54 days out while storing 15, whose own interval is
		// 26 days, i.e. ~3.8x further than the saved memory supports.
		let card = trainingScheduler.createNewCard('song-hard-due-pairing');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);
		const scheduledDays = (new Date(afterHard.due).getTime() - at.getTime()) / DAY_MS;
		const impliedDays = trainingScheduler.scheduler.next_interval(afterHard.stability, 0);

		// Still a mature Hard - this is not a regression back to the 1-day cap.
		expect(scheduledDays).toBeGreaterThan(HARD_MAX_INTERVAL_DAYS);
		// The gap we scheduled is the gap the stored stability asks for.
		expect(
			Math.abs(scheduledDays - impliedDays),
			`scheduled ${scheduledDays.toFixed(1)}d but stored stability implies ${impliedDays}d`
		).toBeLessThanOrEqual(2);
	});

	it('previews the mature Hard date it will actually schedule', () => {
		// applyDuePolicy is shared between scheduleNext and projectRatings so a
		// preview cannot lie; the stability-derived due has to be shared for the
		// same reason, or the preview becomes this bug one layer up.
		let card = trainingScheduler.createNewCard('song-hard-preview-pairing');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const preview = trainingScheduler.projectRatings(card, at);
		const scheduled = trainingScheduler.scheduleNext(card, Rating.Hard, at);

		expect(preview.intervals[Rating.Hard].due).toBe(scheduled.due);
	});

	it('keeps pressing Hard from compounding stability', () => {
		let card = trainingScheduler.createNewCard('song-hard-repeat');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Good, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const mature = card.stability;
		for (let i = 0; i < 5; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Hard, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		// Without the clamp this walks upward (198 -> 432 in simulation) while
		// every due date stays pinned at three days.
		expect(card.stability).toBeLessThan(mature);
	});

	it('leaves a first-play Hard alone, since there is no prior stability', () => {
		// New cards carry stability 0. Halving that would floor every first Hard
		// at S_MIN - production has 9,361 of these in 90 days, all landing on the
		// init_stability estimate of ~1.3.
		const card = trainingScheduler.createNewCard('song-hard-new');
		const at = new Date('2026-01-01T12:00:00Z');

		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, at);

		expect(afterHard.stability).toBeGreaterThan(0.5);
	});

	it('leaves stability alone when Hard already lowered it', () => {
		// Learning and Relearning use next_short_term_stability, where Hard
		// shrinks stability on its own - 0% of 30,982 production presses grew it.
		// The clamp must not pile on there.
		let card = trainingScheduler.createNewCard('song-hard-learning');
		const at = new Date('2026-01-01T12:00:00Z');

		card = trainingScheduler.scheduleNext(card, Rating.Good, at);
		const before = card.stability;

		const next = new Date(new Date(card.due).getTime() + 1000);
		const afterHard = trainingScheduler.scheduleNext(card, Rating.Hard, next);

		expect(afterHard.stability).toBeLessThanOrEqual(before);
		expect(afterHard.stability).toBeGreaterThan(before * HARD_STABILITY_RETENTION);
	});

	it('never schedules a card past the cap, however well it is known', () => {
		let card = trainingScheduler.createNewCard('song-2');
		let at = new Date('2026-01-01T12:00:00Z');

		// Twenty consecutive Easy ratings would run to years under the stock
		// 36500-day maximum.
		for (let i = 0; i < 20; i++) {
			card = trainingScheduler.scheduleNext(card, Rating.Easy, at);
			const due = new Date(card.due);
			const intervalDays = (due.getTime() - at.getTime()) / DAY_MS;
			expect(
				intervalDays,
				`review ${i + 1} scheduled ${Math.round(intervalDays)} days out`
			).toBeLessThanOrEqual(MAX_INTERVAL_DAYS + 1);
			at = new Date(due.getTime() + 1000);
		}
	});

	it('is a construction parameter, so it can be raised back', () => {
		// A cap moves `due` only; stability and difficulty are untouched, which is
		// what makes the decision reversible.
		const loose = new TrainingScheduler({ maximum_interval: 36500 });
		let card = loose.createNewCard('song-3');
		let at = new Date('2026-01-01T12:00:00Z');
		for (let i = 0; i < 20; i++) {
			card = loose.scheduleNext(card, Rating.Easy, at);
			at = new Date(new Date(card.due).getTime() + 1000);
		}

		const intervalDays =
			(new Date(card.due).getTime() - new Date(card.last_review).getTime()) / DAY_MS;
		expect(intervalDays).toBeGreaterThan(MAX_INTERVAL_DAYS);
	});
});
