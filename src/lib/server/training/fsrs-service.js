/**
 * FSRS Service - Manages spaced repetition scheduling using ts-fsrs
 *
 * FSRS (Free Spaced Repetition Scheduler) is a modern algorithm that optimizes
 * review intervals based on memory retention patterns.
 */

import { fsrs, generatorParameters, Rating, State, createEmptyCard, S_MIN } from 'ts-fsrs';
import {
	utcStartOfDay,
	utcStartOfNextDay,
	utcEndOfDay,
	utcAddDays,
	utcDaysBetween
} from '$lib/utils/day-boundary.js';
import { isTrainingDue } from '$lib/utils/training-due.js';
import { dedupeByGroup } from './duplicate-groups.js';

/**
 * FSRS Rating scale:
 * 1 - Again: Complete failure, reset the card
 * 2 - Hard: Difficult to recall, shorter interval
 * 3 - Good: Recalled with effort, standard interval
 * 4 - Easy: Recalled easily, longer interval
 */
export { Rating };

/**
 * FSRS Card states:
 * 0 - New: Never studied
 * 1 - Learning: Currently being learned
 * 2 - Review: In review phase
 * 3 - Relearning: Failed and being relearned
 */
export { State };

/**
 * How far out a card may ever be scheduled, in days.
 *
 * W18. ts-fsrs's stock `maximum_interval` is 36500 days - a hundred years, i.e.
 * effectively uncapped. That is the whole of TriusHalf's "rescheduled to
 * mid-September" and 3shine's "then I just won't see that song for a year".
 * Production had 12,369 active cards (8.8%) scheduled beyond six months, 2,912
 * beyond a year, and the furthest sat at 2029-06-30.
 *
 * Six months is legible, meaningful without being disruptive, and reversible:
 * a cap moves `due` only and never touches stability or difficulty, so raising
 * it later restores the old schedule shape.
 */
export const MAX_INTERVAL_DAYS = 180;

/**
 * Lucky guess (Hard): same-day band for early states only.
 *
 * Hard means "I got it, but I was shaky" — not a full lapse (Again) and not a
 * solid recall (Good). For New / Learning / Relearning we keep FSRS's
 * card-specific due but clamp it into a same-day band:
 *
 *   earliest  HARD_MIN_INTERVAL_MINUTES (10)  — never an instant re-drill
 *   latest    HARD_MAX_INTERVAL_DAYS (1)      — back by tomorrow at the latest
 *
 * Review-state Hard uses raw FSRS (plus the global 180d ceiling). A uniform
 * 1-day ceiling on mature Hard collapsed multi-week intervals onto tomorrow
 * (~44–50% of Hard presses) and inflated near-term due volume; Approach 1
 * keeps the short band where shaky early cards need it and leaves spaced
 * Review Hard alone.
 *
 * Stability is still halved when Hard would grow it (HARD_STABILITY_RETENTION)
 * so a Review Hard chain cannot load a spring into the next Okay, and the due
 * date is derived from that halved stability rather than the raw FSRS one.
 */
export const HARD_MIN_INTERVAL_MINUTES = 10;
export const HARD_MAX_INTERVAL_DAYS = 1;

/**
 * Card states that get the Hard 10m–1d due band. Review is intentionally
 * excluded — mature Hard follows raw FSRS.
 */
export function hardDueBandApplies(state) {
	return state === State.New || state === State.Learning || state === State.Relearning;
}

/**
 * What fraction of stability a Hard may leave behind, when it would otherwise
 * grow it.
 *
 * Capping `due` alone is cosmetic. In FSRS only Again lowers stability; Hard
 * raises it, and reviewing early (retrievability ~1 at the capped date) still
 * nets a positive gain. So a card pinned at three days keeps compounding
 * underneath, and the first non-Hard rating releases it straight to the
 * six-month ceiling: the cap buys three days and leaves a loaded spring.
 *
 * Measured over 90 days on Review-state cards, Hard grew stability on 96.0% of
 * 32,351 presses and roughly doubled the mean (10.9 -> 21.2 days), with a p90
 * gain of +27 days. Simulated on a mature card, ten consecutive Hard presses
 * took stability 198 -> 432 while every due date stayed at three days.
 *
 * Halving instead of merely freezing gives a recovery ramp rather than a cliff:
 * Hard lands short, then Okay -> intermediate, then the normal ladder. Freezing
 * alone would still send the next Okay straight to 180.
 *
 * The due date is derived from this adjusted stability, not from the raw FSRS
 * one - see dueForAdjustedStability. That pairing was missed when Approach 1
 * stopped capping Review Hard at a day: the card was scheduled off the
 * un-halved number and stored the halved one, so a mature Lucky guess landed
 * ~3.8x further out than the stability it saved could support. If you change
 * one of the two, change the other.
 *
 * Only applied where stability would otherwise grow, which confines it to
 * Review-state cards. On Learning and Relearning, Hard already shrinks
 * stability (measured: 0% of 30,982 presses grew it) and needs no help.
 */
export const HARD_STABILITY_RETENTION = 0.5;

/**
 * Target probability of recall at the moment a card comes due.
 *
 * Stated rather than inherited: it is the twin lever to the weights and the
 * first thing per-quiz tuning would reach for, so it belongs next to the other
 * knobs. Raised from the ts-fsrs stock 0.9 because production is measurably
 * undershooting it.
 *
 * Observed retention on Review-state cards over 60 days, by scheduled interval:
 *
 *   band    reviews   by rating   by answer
 *   1 day    33,581      85.3%       78.7%
 *   2-3      32,861      84.2%       76.6%
 *   4-7      25,469      88.5%       79.7%
 *   8-14     20,410      88.1%       79.5%
 *   15-30    15,138      84.4%       74.9%
 *   31+      15,124      85.0%       79.0%
 *
 * Both curves are flat, which is the signature of a level offset rather than a
 * shape problem: weights that genuinely misfit this population would slope with
 * interval, because the error would compound the further out the card is
 * scheduled. Flat-but-low means the stock weights describe these learners
 * correctly and the target is simply set too loose - intervals run slightly
 * long. Rated retention sits ~4.5 points under the 0.9 target.
 *
 * This is the cheap version of what a global weight re-fit would buy, and it is
 * worth doing first precisely because per-user optimization is blocked on corpus
 * quality - 32% of measurable users effectively never press Forgot, so an
 * optimizer would learn "this user never forgets" and push them further out.
 *
 * Cost is NOT negligible, and it is what decided the value. Modelled over all
 * 107,108 active Review-state cards as the change in steady-state load (sum of
 * 1/interval, intervals from the FSRS-6 closed form clamped to
 * [1, MAX_INTERVAL_DAYS]):
 *
 *   target   overall load   median user   worst user (>=200 cards)
 *   0.905        +2.4%          +0.4%           +6.9%
 *   0.91         +8.0%          +6.8%          +14.4%
 *   0.915       +10.8%          +8.2%          +22.4%
 *   0.92        +17.6%         +14.5%          +31.3%
 *   0.93        +35.7%         +36.3%          +70.7%
 *
 * The curve is steep because ts-fsrs 6's decay (w20 = 0.1542) makes intervals
 * quite sensitive near 0.9: at equal stability, 0.92 shortens a 30-day interval
 * to 22 and a 120-day one to 88. Only the 16.1% of cards already sitting at the
 * 180-day cap are insulated.
 *
 * 0.92 would close the measured gap outright, but +17.6% is a lot to add to a
 * population already carrying a 44.2% due-or-overdue backlog - for comparison,
 * the Hard cap that motivated all of this cost +2.2%. 0.91 takes roughly half
 * the calibration gain for well under half the load, and it is one number to
 * move again once the backlog is under control. Deliberately the conservative
 * end, because the two problems are not symmetric: a slightly loose target
 * costs some forgotten songs, while an unpayable backlog is what makes people
 * stop training altogether.
 */
export const REQUEST_RETENTION = 0.91;

/**
 * Optional floor, in minutes, applied on top of a ts-fsrs due date.
 *
 * Default **0**: honour the algorithm. Learning/relearning steps are already
 * card-dependent (stock `["1m","10m"]` / `["10m"]`), and getDueSongs compares
 * timestamps for cards due today, so a fixed ten-minute floor was overriding
 * the short steps without buying safety the selection path did not already
 * have.
 *
 * Set to a large number (e.g. 1440) only as an emergency revert toward
 * "nothing comes back the same day." The real old bump snapped to next UTC
 * midnight; this is an approximation, not a bit-for-bit restore.
 */
export const MIN_REVIEW_GAP_MINUTES = 0;

/**
 * Backlog pressure = due songs waiting / session length. Auto mode tapers new
 * introductions linearly between these two points.
 *
 * Below the floor the backlog fits in a single session and there is nothing to
 * protect against, so the configured new share applies untouched. At and above
 * the ceiling - four sessions' worth of due songs - introductions sit at
 * MIN_NEW_SLOTS_UNDER_BACKLOG.
 */
export const BACKLOG_PRESSURE_FLOOR = 1;
export const BACKLOG_PRESSURE_CEILING = 4;

/**
 * Introductions never reach zero from backlog pressure alone.
 *
 * Stopping them entirely is what an unbounded backlog would otherwise do, and a
 * quiz that silently never shows you a new song again reads as broken rather
 * than as protective. Setting the new share to 0%, or a daily_new_limit, is
 * still an explicit way to stop them.
 */
export const MIN_NEW_SLOTS_UNDER_BACKLOG = 1;

/**
 * NOTE on rating and correctness.
 *
 * The server always schedules the rating the player submitted. On a miss the
 * connector auto-selects Again, and Hard/Good/Easy require a confirm popup
 * ("only if you knew the song but mistyped / were too slow"). That default
 * fixes the common Hard-on-wrong path (≈37% of misses, mean due ~10d) without
 * a server-side force that would remove deliberate overrides.
 */

/**
 * NOTE on `enable_short_term`, which is left at its default of true.
 *
 * The case against it is often stated as "we persist scheduled_days = 0 on a
 * third of reviews while the real gap is a day, so FSRS gets fed the wrong
 * elapsed-vs-scheduled numbers." That is not what happens. ts-fsrs never reads
 * `scheduled_days` back: `AbstractScheduler.init()` derives elapsed time from
 * `last_review` against the review timestamp, and `scheduled_days` is only ever
 * written. Persisting the clamped value (see scheduleNext) is worth doing
 * because every stat we compute about our own scheduling reads that field - but
 * it is analytics hygiene, not an algorithm fix, and it should not be ranked as
 * one.
 *
 * The real mechanism is elsewhere and is narrower. While a card sits in
 * Learning or Relearning, ts-fsrs updates stability through
 * `next_short_term_stability(s, g)`, which takes no time argument at all - it
 * assumes the same-session re-drill that short-term steps are designed for.
 *
 * Exposure, measured over 90 days and 386,346 rated plays: 18.8% of reviews
 * start in Learning (p50 gap 0.93d, p90 5.08d) and 11.2% in Relearning (p50
 * 0.87d, p90 2.08d) - 30.0% together. The remaining 70% are New (no elapsed
 * time to get wrong) or Review, which uses the time-aware formula and is fine.
 *
 * That used to be a real argument for turning the flag off, because we bumped
 * every sub-day due to the next UTC day: the model assumed minutes and got days.
 * MIN_REVIEW_GAP_MINUTES (default 0) removed the bump, so short-term steps now
 * land where ts-fsrs assumes they will - the median gap between consecutive
 * same-quiz sessions is 15.2 minutes against steps of 1m/10m.
 *
 * So the flag stays on, and now for a positive reason rather than inertia. The
 * question to re-ask is no longer "should we disable short-term steps" but
 * "having honoured them, did rated-vs-answered retention on Learning-state cards
 * actually improve" - measurable, and the thing to check before touching this
 * again.
 */

export class TrainingScheduler {
	constructor(params = {}) {
		// Initialize FSRS with custom parameters
		// enable_fuzz adds randomness to intervals to avoid review clustering
		const fsrsParams = generatorParameters({
			enable_fuzz: true,
			maximum_interval: MAX_INTERVAL_DAYS,
			request_retention: REQUEST_RETENTION,
			...params
		});

		this.scheduler = fsrs(fsrsParams);
		this.maxIntervalDays = fsrsParams.maximum_interval;
	}

	/**
	 * The latest a review may be scheduled from `now`.
	 *
	 * `maximum_interval` alone is not a guarantee: enable_fuzz is applied on top
	 * and can push a capped interval a couple of days past it. The cap is meant
	 * to be something we can state plainly to users ("nothing goes further out
	 * than six months"), so clamp the result rather than trusting the parameter.
	 *
	 * @param {Date} now
	 * @returns {Date}
	 */
	maxDueDate(now) {
		return utcStartOfDay(new Date(now.getTime() + this.maxIntervalDays * 86_400_000));
	}

	/**
	 * Apply app due-date policy on top of a raw ts-fsrs due.
	 * Shared by scheduleNext and projectRatings so previews cannot lie.
	 *
	 * @param {Date} due
	 * @param {number} rating
	 * @param {Date} now
	 * @param {number} [cardState] - pre-rating FSRS state (needed for Hard band)
	 * @param {{ allowSameDayReviews?: boolean }} [options]
	 * @returns {Date}
	 */
	applyDuePolicy(due, rating, now, cardState = State.New, options = {}) {
		const allowSameDayReviews = options.allowSameDayReviews !== false;
		let nextDueDate = new Date(due);

		// Honour ts-fsrs's card-specific interval (1m / 10m learning steps, days for
		// mature Good, etc.). Same-day returns used to be banned by snapping every
		// sub-day due to tomorrow; the protection against looping is now
		// getDueSongs's timestamp compare, not a one-size floor that wiped the
		// short steps. An optional MIN_REVIEW_GAP_MINUTES still exists as a revert
		// lever; at 0 we only refuse to schedule in the past.
		// Per-quiz allow_same_day_reviews=false restores the old tomorrow bump.
		if (MIN_REVIEW_GAP_MINUTES > 0) {
			const earliest = new Date(now.getTime() + MIN_REVIEW_GAP_MINUTES * 60_000);
			if (nextDueDate < earliest) {
				nextDueDate = earliest;
			}
		} else if (nextDueDate < now) {
			nextDueDate = new Date(now);
		}

		// Lucky guess (Hard): early states only — clamp into [10m, 1d]. Review Hard
		// keeps raw FSRS (global 180d ceiling still applies below).
		if (rating === Rating.Hard && hardDueBandApplies(cardState)) {
			const hardEarliest = new Date(now.getTime() + HARD_MIN_INTERVAL_MINUTES * 60_000);
			const hardLatest = new Date(now.getTime() + HARD_MAX_INTERVAL_DAYS * 86_400_000);
			if (nextDueDate < hardEarliest) {
				nextDueDate = hardEarliest;
			}
			if (nextDueDate > hardLatest) {
				nextDueDate = hardLatest;
			}
		}

		if (!allowSameDayReviews) {
			// Old bump: nothing returns later today — snap same-calendar-day dues
			// (and anything still "today" after clamps) to the next UTC day.
			if (utcStartOfDay(nextDueDate).getTime() <= utcStartOfDay(now).getTime()) {
				nextDueDate = utcStartOfNextDay(now);
			}
		}

		// Global six-month ceiling (fuzz can otherwise leak past maximum_interval).
		const latest = this.maxDueDate(now);
		if (nextDueDate > latest) {
			nextDueDate = latest;
		}

		return nextDueDate;
	}

	/**
	 * Stability a Hard rating is allowed to leave behind.
	 *
	 * The other half of the Hard cap - see HARD_STABILITY_RETENTION for why a due
	 * date alone does nothing. Returns the FSRS value untouched for every other
	 * rating, and whenever Hard already lowered stability on its own.
	 *
	 * @param {number} rating
	 * @param {number|null|undefined} before - stability before the review
	 * @param {number} after - stability ts-fsrs produced
	 * @returns {number}
	 */
	applyStabilityPolicy(rating, before, after) {
		if (rating !== Rating.Hard) return after;
		if (!Number.isFinite(before) || !Number.isFinite(after)) return after;

		// A New card has stability 0 - there is no prior memory to retain a
		// fraction of, and init_stability is the first real estimate rather than
		// growth. Halving it would floor every first-play Hard at S_MIN.
		if (before <= 0) return after;

		// Learning and Relearning already shrink stability on Hard; leave them be.
		if (after <= before) return after;

		return Math.max(S_MIN, before * HARD_STABILITY_RETENTION);
	}

	/**
	 * The due date implied by the stability we are actually going to store.
	 *
	 * ts-fsrs schedules from the stability it produced, but applyStabilityPolicy
	 * then halves that on a Review-state Hard - so the card was being scheduled
	 * off a number we immediately threw away. Measured on this tree: stability 30
	 * scheduled Lucky guess 54 days out while storing stability 15, whose own
	 * interval is 26 days. Roughly 3.8x further than the stored memory supports,
	 * on a system whose request_retention was just tuned to 0.91 at a measured
	 * +8% review load - and getDueSongs orders by elapsed/stability, so the
	 * halved cards then sort ahead of everything else for months.
	 *
	 * Re-deriving keeps what the halving is for (a Hard chain cannot load a
	 * spring into the next Okay) without letting the due date contradict it.
	 * Every other rating is untouched: applyStabilityPolicy returns FSRS's own
	 * value there, so this returns FSRS's own due.
	 *
	 * Shared by scheduleNext and projectRatings, for the same reason
	 * applyDuePolicy is - a preview that disagreed with the scheduler would be
	 * the bug this is fixing, one layer up.
	 *
	 * @param {Object} branchCard - the card ts-fsrs produced for this rating
	 * @param {number} adjustedStability - what applyStabilityPolicy will store
	 * @param {Object} fsrsCard - the card as it stood before the review
	 * @param {Date} now
	 * @returns {Date}
	 */
	dueForAdjustedStability(branchCard, adjustedStability, fsrsCard, now) {
		if (!Number.isFinite(adjustedStability) || adjustedStability === branchCard.stability) {
			return new Date(branchCard.due);
		}

		// next_interval is the inverse of the retrievability curve: the gap after
		// which this stability decays to request_retention. It already honours
		// maximum_interval, and it is deterministic for a given stability.
		const days = this.scheduler.next_interval(adjustedStability, fsrsCard.elapsed_days ?? 0);
		return new Date(now.getTime() + Math.max(0, days) * 86_400_000);
	}

	/**
	 * Days from today (UTC) to a due date — what we persist as scheduled_days after
	 * policy clamps, so elapsed-vs-scheduled stays honest.
	 *
	 * Floors at 0, not 1. A same-day return really is zero scheduled days, and
	 * that is exactly what ts-fsrs itself records for a sub-day step; reporting 1
	 * would overstate every short-term review in our own logs. ts-fsrs never reads
	 * this field back (elapsed time comes from last_review), so it is analytics
	 * only — which is the whole reason it has to be accurate.
	 *
	 * @param {Date} now
	 * @param {Date} due
	 * @returns {number}
	 */
	scheduledDaysForDue(now, due) {
		return Math.max(0, utcDaysBetween(utcStartOfDay(now), utcStartOfDay(due)));
	}

	/**
	 * Normalize annSongId to a numeric ID for comparisons.
	 * @param {number|string|null|undefined} annSongId
	 * @returns {number|null}
	 */
	normalizeAnnSongId(annSongId) {
		if (annSongId === null || annSongId === undefined || annSongId === '') return null;
		const numericId = Number(annSongId);
		return Number.isFinite(numericId) ? numericId : null;
	}

	/**
	 * Build a stable song key from song data.
	 * @param {Object} song
	 * @returns {string|null}
	 */
	makeSongKey(song) {
		if (!song) return null;
		const artist = song.songArtist || song.artist || '';
		const title = song.songName || song.title || '';
		if (!artist || !title) return null;
		return `${artist}_${title}`;
	}

	/**
	 * Extract a stored progress song key (legacy).
	 * @param {Object} record
	 * @returns {string|null}
	 */
	getProgressSongKey(record) {
		if (!record) return null;
		return record.song_key || record.annSongId || null;
	}

	/**
	 * Create a new FSRS card for a song
	 * @param {string} songKey - Unique song identifier
	 * @returns {Object} New FSRS card state
	 */
	createNewCard(songKey, now = new Date()) {
		const card = createEmptyCard();
		return {
			songKey,
			...card,
			due: new Date(now) // Due immediately for first review
		};
	}

	/**
	 * Schedule next review based on user's rating
	 * @param {Object} card - Current FSRS card state
	 * @param {number} rating - User rating (1-4)
	 * @param {Date} now - Current time (defaults to now)
	 * @param {{ allowSameDayReviews?: boolean }} [options]
	 * @returns {Object} Updated FSRS card state
	 */
	scheduleNext(card, rating, now = new Date(), options = {}) {
		// Convert our card format to ts-fsrs Card format
		// Use createEmptyCard as base to ensure all required properties are present
		const baseCard = createEmptyCard();
		const fsrsCard = {
			...baseCard,
			due: new Date(card.due),
			stability: card.stability ?? baseCard.stability,
			difficulty: card.difficulty ?? baseCard.difficulty,
			elapsed_days: card.elapsed_days ?? 0,
			scheduled_days: card.scheduled_days ?? 0,
			reps: card.reps ?? 0,
			lapses: card.lapses ?? 0,
			state: card.state ?? baseCard.state,
			last_review: card.last_review ? new Date(card.last_review) : undefined
		};

		// Get scheduling info for all possible ratings
		const schedulingInfo = this.scheduler.repeat(fsrsCard, now);

		// Get the card for the selected rating
		const selectedRating = schedulingInfo[rating];
		const adjustedStability = this.applyStabilityPolicy(
			rating,
			fsrsCard.stability,
			selectedRating.card.stability
		);
		const nextDueDate = this.applyDuePolicy(
			this.dueForAdjustedStability(selectedRating.card, adjustedStability, fsrsCard, now),
			rating,
			now,
			fsrsCard.state,
			options
		);

		return {
			...selectedRating.card,
			due: nextDueDate.toISOString(),
			stability: adjustedStability,
			// Persist the gap we actually scheduled rather than the one FSRS asked
			// for. ts-fsrs never reads scheduled_days back - elapsed time is derived
			// from last_review - so this is our own review log being honest, not an
			// input the algorithm was getting wrong.
			scheduled_days: this.scheduledDaysForDue(now, nextDueDate),
			last_review: now.toISOString()
		};
	}

	/**
	 * What each of the four ratings would do to this card, without applying any.
	 *
	 * R13. The whole Jul 2 thread is four people guessing at FSRS behaviour from
	 * screenshots, and TriusHalf deleted a quiz partly over it. The scheduler
	 * already computes all four branches on every review — `repeat()` returns the
	 * lot and `scheduleNext` throws three away — so showing them costs nothing.
	 *
	 * Same-day suppression is applied here too, otherwise the preview would
	 * promise "10 minutes" for a button that actually schedules tomorrow.
	 *
	 * @param {Object|null} card - Current FSRS card state, or null for a new song
	 * @param {Date} now
	 * @param {{ allowSameDayReviews?: boolean }} [options]
	 * @returns {{ difficulty: number|null, stability: number|null, state: string,
	 *             intervals: Record<number, { days: number, due: string }> }}
	 */
	projectRatings(card, now = new Date(), options = {}) {
		const baseCard = createEmptyCard();
		const fsrsCard = card
			? {
					...baseCard,
					due: new Date(card.due),
					stability: card.stability ?? baseCard.stability,
					difficulty: card.difficulty ?? baseCard.difficulty,
					elapsed_days: card.elapsed_days ?? 0,
					scheduled_days: card.scheduled_days ?? 0,
					reps: card.reps ?? 0,
					lapses: card.lapses ?? 0,
					state: card.state ?? baseCard.state,
					last_review: card.last_review ? new Date(card.last_review) : undefined
				}
			: baseCard;

		const schedulingInfo = this.scheduler.repeat(fsrsCard, now);

		/** @type {Record<number, { days: number, due: string }>} */
		const intervals = {};
		const dayStart = utcStartOfDay(now);

		for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
			const branch = schedulingInfo[rating];
			if (!branch) continue;

			const adjustedStability = this.applyStabilityPolicy(
				rating,
				fsrsCard.stability,
				branch.card.stability
			);
			const due = this.applyDuePolicy(
				this.dueForAdjustedStability(branch.card, adjustedStability, fsrsCard, now),
				rating,
				now,
				fsrsCard.state,
				options
			);

			intervals[rating] = {
				// Whole UTC days from today, which is the unit the due list is bucketed
				// in — "1" reads as tomorrow, not as "24 hours from this instant".
				// Same-day returns report as 1 for preview labels so the UI never
				// promises "0 days".
				days: Math.max(1, utcDaysBetween(dayStart, due)),
				due: due.toISOString()
			};
		}

		return {
			difficulty: card?.difficulty != null ? Number(card.difficulty) : null,
			stability: card?.stability != null ? Number(card.stability) : null,
			state: this.getStateName(fsrsCard.state),
			intervals
		};
	}

	/**
	 * Get songs that are due for review
	 * Uses calendar day comparison (normalized to midnight) for consistency with stats display
	 * @param {Array} progressRecords - Array of training_progress records
	 * @param {number} limit - Maximum number of songs to return
	 * @returns {Array} Songs due for review, sorted by urgency
	 */
	getDueSongs(progressRecords, limit = 20) {
		const now = new Date();

		console.log('[TRAINING SELECTION] Finding due songs...');
		console.log('[TRAINING SELECTION]   Total progress records:', progressRecords.length);

		// Filter songs that are due and sort by forget-risk (overdue factor).
		// overdueFactor = elapsed / stability — same order as lowest retrievability,
		// without needing the FSRS power curve.
		const dueSongs = progressRecords
			.filter((record) => isTrainingDue(record, now))
			.sort((a, b) => {
				const factorA = this.overdueFactor(a.fsrs_state, now);
				const factorB = this.overdueFactor(b.fsrs_state, now);
				if (factorA !== factorB) return factorB - factorA; // highest risk first

				const rawDateA = a.fsrs_state?.due ? new Date(a.fsrs_state.due) : null;
				const rawDateB = b.fsrs_state?.due ? new Date(b.fsrs_state.due) : null;

				const dayA = rawDateA ? utcStartOfDay(rawDateA).getTime() : Number.POSITIVE_INFINITY;
				const dayB = rawDateB ? utcStartOfDay(rawDateB).getTime() : Number.POSITIVE_INFINITY;

				if (dayA !== dayB) return dayA - dayB;

				const tsA = rawDateA ? rawDateA.getTime() : Number.POSITIVE_INFINITY;
				const tsB = rawDateB ? rawDateB.getTime() : Number.POSITIVE_INFINITY;
				if (tsA !== tsB) return tsA - tsB;

				const stabilityA = a.fsrs_state?.stability ?? Number.POSITIVE_INFINITY;
				const stabilityB = b.fsrs_state?.stability ?? Number.POSITIVE_INFINITY;
				return stabilityA - stabilityB;
			});

		console.log('[TRAINING SELECTION]   Found due songs:', dueSongs.length);
		console.log('[TRAINING SELECTION]   Returning:', Math.min(dueSongs.length, limit), 'songs');

		return dueSongs.slice(0, limit);
	}

	/**
	 * Forget-risk proxy: elapsed time since last review divided by stability.
	 * Higher = more overextended. Missing last_review or non-positive stability
	 * sorts to the front of the queue.
	 *
	 * @param {Object|null|undefined} fsrsState
	 * @param {Date} now
	 * @returns {number}
	 */
	overdueFactor(fsrsState, now = new Date()) {
		const stability = Number(fsrsState?.stability);
		if (!Number.isFinite(stability) || stability <= 0) {
			return Number.POSITIVE_INFINITY;
		}
		const lastReview = fsrsState?.last_review ? new Date(fsrsState.last_review) : null;
		if (!lastReview || Number.isNaN(lastReview.getTime())) {
			return Number.POSITIVE_INFINITY;
		}
		const elapsedDays = Math.max(0, (now.getTime() - lastReview.getTime()) / 86_400_000);
		return elapsedDays / stability;
	}

	/**
	 * Get songs that haven't been practiced yet
	 * @param {Array} progressRecords - Array of training_progress records
	 * @param {Array} allQuizSongs - All songs in the quiz
	 * @param {number} limit - Maximum number of new songs
	 * @returns {Array} New songs to introduce
	 */
	getNewSongs(progressRecords, allQuizSongs, limit = 10) {
		console.log('[TRAINING SELECTION] Finding new songs...');
		console.log('[TRAINING SELECTION]   Total quiz songs:', allQuizSongs.length);
		console.log('[TRAINING SELECTION]   Practiced songs:', progressRecords.length);

		// Create set of practiced song_ann_ids for fast lookup (normalized)
		const practicedIds = new Set(
			progressRecords.map((r) => this.normalizeAnnSongId(r.song_ann_id)).filter((id) => id !== null)
		);
		const practicedKeys = new Set(
			progressRecords.map((r) => this.getProgressSongKey(r)).filter((key) => key)
		);

		// Find songs not yet practiced (using numeric annSongId from quiz songs)
		const unpracticedSongs = allQuizSongs.filter((song) => {
			const songAnnId = this.normalizeAnnSongId(song.annSongId);
			const songKey = this.makeSongKey(song);
			if (songAnnId !== null && practicedIds.has(songAnnId)) return false;
			if (songKey && practicedKeys.has(songKey)) return false;
			return true;
		});

		// Uniform shuffle — the old `.sort(() => Math.random() - 0.5)` is biased
		// toward the front of the pool (front ~1.5×, back ~0.6×), so large quizzes
		// systematically under-introduce songs near the end of the generated list.
		const shuffled = this.shuffleArray(unpracticedSongs);

		// Take the requested number of songs
		const newSongs = shuffled.slice(0, limit);

		console.log('[TRAINING SELECTION]   Found new songs:', unpracticedSongs.length);
		console.log('[TRAINING SELECTION]   Returning:', newSongs.length, 'songs');

		return newSongs;
	}

	/**
	 * Get songs that need extra practice (not currently due, but eligible for review).
	 * Sorted by due date: closest to due first.
	 * @param {Array} progressRecords
	 * @param {number} limit
	 * @returns {Array}
	 */
	getSongsNeedingRevision(progressRecords, limit = 20) {
		const now = new Date();
		const today = utcStartOfDay(now);

		console.log('[TRAINING SELECTION] Finding songs needing revision...');

		const revisionSongs = progressRecords
			.filter((record) => {
				if (record.is_active === false) return false;
				if (record.song_ann_id == null) return false;
				if (record.suspended_at != null) return false;

				const dueDateTime = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				if (!dueDateTime) return false;

				const dueDate = utcStartOfDay(dueDateTime);

				return dueDate > today;
			})
			.sort((a, b) => {
				const dueDateA = a.fsrs_state?.due ? new Date(a.fsrs_state.due) : new Date(9999, 11, 31);
				const dueDateB = b.fsrs_state?.due ? new Date(b.fsrs_state.due) : new Date(9999, 11, 31);

				const timeDiff = dueDateA.getTime() - dueDateB.getTime();
				if (Math.abs(timeDiff) > 1000 * 60 * 60) {
					return timeDiff;
				}

				const stabilityA = a.fsrs_state?.stability ?? 999;
				const stabilityB = b.fsrs_state?.stability ?? 999;
				return stabilityA - stabilityB;
			});

		console.log('[TRAINING SELECTION]   Found revision candidates:', revisionSongs.length);
		console.log(
			'[TRAINING SELECTION]   Returning:',
			Math.min(revisionSongs.length, limit),
			'songs'
		);

		return revisionSongs.slice(0, limit);
	}

	/**
	 * Compute optimized training session playlist
	 * Uses configurable split between due and new songs with smart fallback logic
	 *
	 * @typedef {Object} PlaylistOptions
	 * @property {'auto'|'manual'} [mode='auto'] - Selection mode: 'auto' uses FSRS with daily caps, 'manual' uses percentage-based distribution
	 * @property {number} [dueSongPercentage=70] - Percentage of due songs (used in manual mode)
	 * @property {number} [newSongPercentage=30] - Percentage of new songs (used in manual mode)
	 * @property {number} [revisionSongPercentage=0] - Percentage of revision songs (used in manual mode)
	 * @property {number} [maxNewPercentage=30] - Maximum percentage of new songs (used in auto mode)
	 * @property {number} [dueCount=null] - Absolute count of due songs (used in manual mode, overrides percentage)
	 * @property {number} [newCount=null] - Absolute count of new songs (used in manual mode, overrides percentage)
	 * @property {number} [revisionCount=null] - Absolute count of revision songs (used in manual mode, overrides percentage)
	 * @property {number} [remainingDueCapacity=9999] - Remaining daily capacity for due songs (used in auto mode)
	 * @property {number} [remainingNewCapacity=9999] - Remaining daily capacity for new songs (auto mode)
	 * @property {Array<number|string>} [excludePlayedSongAnnIds=[]] - annSongIds already played today, kept out of the playlist
	 * @property {Map<number, string>|null} [duplicateGroups=null] - N8: annSongId -> duplicate-recording group id. When present, at most one card per group is scheduled. Null disables the behaviour entirely.
	 *
	 * @param {Array} progressRecords - Array of training_progress records
	 * @param {Array} allQuizSongs - All songs in the quiz
	 * @param {number} maxSessionLength - Maximum number of songs in session
	 * @param {PlaylistOptions} [options] - Configuration object with mode and parameters
	 * @returns {Object} Result with playlist and metadata
	 */
	computeSessionPlaylist(progressRecords, allQuizSongs, maxSessionLength = 20, options = {}) {
		const config = {
			mode: 'auto',
			dueSongPercentage: 70,
			newSongPercentage: 30,
			revisionSongPercentage: 0,
			maxNewPercentage: 30,
			dueCount: null,
			newCount: null,
			revisionCount: null,
			remainingDueCapacity: 9999,
			remainingNewCapacity: 9999,
			excludePlayedSongAnnIds: [],
			duplicateGroups: null,
			...options
		};

		console.log('[TRAINING SELECTION] ========================================');
		console.log('[TRAINING SELECTION] Computing playlist for session');
		console.log('[TRAINING SELECTION] Configuration:');
		console.log('[TRAINING SELECTION]   Max session length:', maxSessionLength);
		console.log('[TRAINING SELECTION]   Mode:', config.mode);

		if (config.mode === 'auto') {
			console.log('[TRAINING SELECTION]   Due capacity:', config.remainingDueCapacity);
			console.log('[TRAINING SELECTION]   Max new percentage:', config.maxNewPercentage + '%');
		} else {
			if (config.newCount !== null || config.dueCount !== null || config.revisionCount !== null) {
				console.log(
					'[TRAINING SELECTION]   Manual counts: due=' +
						config.dueCount +
						', new=' +
						config.newCount +
						', revision=' +
						config.revisionCount
				);
			} else {
				console.log(
					'[TRAINING SELECTION]   Manual targets: due=' +
						config.dueSongPercentage +
						'%, new=' +
						config.newSongPercentage +
						'%, revision=' +
						config.revisionSongPercentage +
						'%'
				);
			}
		}

		// Songs already played today must not come back as filler. Without this the
		// revision refill hands people the same songs they played an hour
		// ago, which is what "it just plays songs I already got today" describes.
		const recentlyPlayed = new Set(
			(config.excludePlayedSongAnnIds || [])
				.map((id) => this.normalizeAnnSongId(id))
				.filter((id) => id !== null)
		);
		const notRecentlyPlayed = (record) =>
			!recentlyPlayed.has(this.normalizeAnnSongId(record.song_ann_id));

		// Step 1: Get available songs in each category
		//
		// Due songs are deliberately exempt from the played-today filter, and that
		// exemption is now load-bearing rather than incidental: returning a card you
		// just lapsed on, later the same day, is the entire point of the short-term
		// steps (see MIN_REVIEW_GAP_MINUTES). Its own due time is what gates it.
		// Extra-practice filler stays filtered - handing those songs back the same
		// day is padding, not scheduling.
		console.log('[TRAINING SELECTION] Available pool:');
		let availableDueSongs = this.getDueSongs(progressRecords, 9999);
		let availableNewSongs = this.getNewSongs(progressRecords, allQuizSongs, 9999);
		// Explicit manual extra practice may repeat today's songs; automatic filler
		// still excludes them. Count mode takes precedence over percentages.
		const usesManualCounts =
			config.newCount !== null || config.dueCount !== null || config.revisionCount !== null;
		const explicitRevision = config.mode === 'manual' &&
			(usesManualCounts ? config.revisionCount > 0 : config.revisionSongPercentage > 0);
		let availableRevisionSongs = this.getSongsNeedingRevision(progressRecords, 9999).filter(
			(record) => explicitRevision || notRecentlyPlayed(record)
		);

		// N8: with combine_duplicates on, a recording that exists as several anime
		// entries contributes one card to the session instead of all of them.
		// Deduping the available pools rather than the final playlist means the
		// freed slots go to other songs instead of shrinking the session.
		//
		// Order is priority: a due copy beats a revision copy beats a new one, so a
		// song you already know is not re-introduced as "new" under another entry.
		if (config.duplicateGroups instanceof Map && config.duplicateGroups.size > 0) {
			const before =
				availableDueSongs.length + availableNewSongs.length + availableRevisionSongs.length;
			const seen = new Set();
			const progressId = (record) => this.normalizeAnnSongId(record.song_ann_id);
			const songId = (song) => this.normalizeAnnSongId(song.annSongId);

			availableDueSongs = dedupeByGroup(
				availableDueSongs,
				config.duplicateGroups,
				progressId,
				seen
			);
			availableRevisionSongs = dedupeByGroup(
				availableRevisionSongs,
				config.duplicateGroups,
				progressId,
				seen
			);
			availableNewSongs = dedupeByGroup(availableNewSongs, config.duplicateGroups, songId, seen);

			const after =
				availableDueSongs.length + availableNewSongs.length + availableRevisionSongs.length;
			console.log(
				'[TRAINING SELECTION]   Combine duplicates: dropped',
				before - after,
				'duplicate-recording candidate(s) from this session'
			);
		}

		if (recentlyPlayed.size > 0) {
			console.log(
				'[TRAINING SELECTION]   Played today:',
				recentlyPlayed.size,
				'| explicit extra-practice repeats:', explicitRevision
			);
		}

		console.log(
			'[TRAINING SELECTION]   Total available: due =',
			availableDueSongs.length,
			', new =',
			availableNewSongs.length,
			', revision =',
			availableRevisionSongs.length
		);
		console.log('[TRAINING SELECTION] ----------------------------------------');

		let selectedDue = [];
		let selectedNew = [];
		let selectedRevision = [];
		let warnings = [];

		let targetDueCount = 0;
		let targetNewCount = 0;
		let targetRevisionCount = 0;
		/** @type {{pressure: number, fullShare: number, allowed: number}|null} */
		let backlogThrottle = null;

		if (config.mode === 'auto') {
			// Due-first under load. Reserving a new-song share up front while hundreds
			// of due cards wait is what grows p90 backlogs — every mature SRS throttles
			// introductions when you are behind.
			//
			// A ramp, not a switch. The first version of this zeroed the reservation
			// the moment due could fill the session, which meant anyone with a
			// permanent backlog never saw a new song again and nothing said why.
			// Introductions now taper with backlog pressure and never stop entirely:
			// a quiz you are behind on still shows you something new, just slowly.
			const maxNewCount = Math.floor(maxSessionLength * (config.maxNewPercentage / 100));
			const dueFillable = Math.min(availableDueSongs.length, config.remainingDueCapacity);
			let reservedNewSlots = Math.min(maxNewCount, availableNewSongs.length);

			const pressure = maxSessionLength > 0 ? dueFillable / maxSessionLength : 0;
			if (maxNewCount > 0 && pressure > BACKLOG_PRESSURE_FLOOR) {
				const span = BACKLOG_PRESSURE_CEILING - BACKLOG_PRESSURE_FLOOR;
				const t = Math.min(1, (pressure - BACKLOG_PRESSURE_FLOOR) / span);
				const floor = Math.min(MIN_NEW_SLOTS_UNDER_BACKLOG, maxNewCount);
				const tapered = Math.round(maxNewCount - t * (maxNewCount - floor));
				reservedNewSlots = Math.min(reservedNewSlots, Math.max(floor, tapered));
				backlogThrottle = {
					pressure: Math.round(pressure * 10) / 10,
					fullShare: maxNewCount,
					allowed: reservedNewSlots
				};
				console.log(
					'[TRAINING SELECTION]   Backlog pressure',
					backlogThrottle.pressure + 'x session —',
					'tapering new songs',
					maxNewCount,
					'->',
					reservedNewSlots
				);
			}

			if (config.remainingNewCapacity != null) {
				reservedNewSlots = Math.min(reservedNewSlots, Math.max(0, config.remainingNewCapacity));
			}
			const dueLimit = Math.max(
				0,
				Math.min(config.remainingDueCapacity, maxSessionLength - reservedNewSlots)
			);
			targetDueCount = dueLimit;

			if (availableDueSongs.length >= dueLimit) {
				selectedDue = availableDueSongs.slice(0, dueLimit);
				console.log(
					'[TRAINING SELECTION] ✓ Got',
					selectedDue.length,
					'due songs (capped at',
					dueLimit + ')'
				);
			} else {
				selectedDue = availableDueSongs;
				console.log(
					'[TRAINING SELECTION] ⚠ Only',
					availableDueSongs.length,
					'due songs available (limit:',
					dueLimit + ')'
				);
			}

			let remainingSlots = maxSessionLength - selectedDue.length;

			// New songs: respect the reservation (0 when backlog fills the session)
			// and any daily new-card budget.
			const newBudget = config.remainingNewCapacity ?? 9999;
			const newLimit = Math.min(reservedNewSlots, remainingSlots, Math.max(0, newBudget));
			targetNewCount = reservedNewSlots;

			if (availableNewSongs.length >= newLimit) {
				selectedNew = availableNewSongs.slice(0, newLimit);
				console.log('[TRAINING SELECTION] ✓ Got', selectedNew.length, 'new songs');
			} else {
				selectedNew = availableNewSongs.slice(0, newLimit);
				console.log(
					'[TRAINING SELECTION] ⚠ Only',
					selectedNew.length,
					'new songs available (limit:',
					newLimit + ')'
				);
			}

			remainingSlots = maxSessionLength - selectedDue.length - selectedNew.length;

			// Padding with not-yet-due songs while due songs are still waiting is what
			// produced the "due count never moves, songs due tomorrow play today"
			// treadmill: the filler gets rated and rescheduled to tomorrow, so the
			// real backlog is never touched. Only fall through once due is exhausted.
			const dueExhausted = selectedDue.length >= availableDueSongs.length;

			if (remainingSlots > 0 && !dueExhausted) {
				console.log(
					'[TRAINING SELECTION] Skipping extra-practice filler -',
					availableDueSongs.length - selectedDue.length,
					'due songs still waiting'
				);
			}

			// Fill remaining slots with not-yet-due cards only after the due pool is
			// exhausted. These are surfaced to users as "extra practice".
			if (remainingSlots > 0 && dueExhausted) {
				selectedRevision = availableRevisionSongs.slice(0, remainingSlots);
				console.log('[TRAINING SELECTION] Added', selectedRevision.length, 'extra-practice songs');
				remainingSlots -= selectedRevision.length;
			}

			// Once every due and extra-practice card is exhausted, use unseen songs to
			// finish the session up to the daily new-song limit. The percentage is an
			// initial mix, not a reason for a first-time user with a 20-song limit to
			// receive an unexplained six-song session. Under backlog pressure we never
			// reach this branch, so the taper above still protects due work.
			const newRoom = Math.max(0, (config.remainingNewCapacity ?? 9999) - selectedNew.length);
			if (
				remainingSlots > 0 &&
				newRoom > 0 &&
				availableNewSongs.length > selectedNew.length &&
				config.maxNewPercentage > 0
			) {
				console.log(
					'[TRAINING SELECTION] Still',
					remainingSlots,
					'slots remaining. Filling with more new songs...'
				);
				const additionalNew = availableNewSongs.slice(
					selectedNew.length,
					selectedNew.length + Math.min(remainingSlots, newRoom)
				);
				selectedNew = [...selectedNew, ...additionalNew];
				console.log('[TRAINING SELECTION] Added', additionalNew.length, 'additional new songs');
				remainingSlots -= additionalNew.length;
			}

			if (remainingSlots > 0) {
				warnings.push(
					`Could only find ${selectedDue.length + selectedNew.length + selectedRevision.length} total songs (requested: ${maxSessionLength})`
				);
			}
		} else {
			// Manual/Advanced mode: Customizable percentage-based or absolute count distribution

			if (config.newCount !== null || config.dueCount !== null || config.revisionCount !== null) {
				// Use absolute counts if provided
				targetDueCount = config.dueCount !== null ? config.dueCount : 0;
				targetNewCount = config.newCount !== null ? config.newCount : 0;
				targetRevisionCount = config.revisionCount !== null ? config.revisionCount : 0;

				console.log(
					'[TRAINING SELECTION] Manual Absolute Targets: ',
					targetDueCount,
					'due,',
					targetNewCount,
					'new,',
					targetRevisionCount,
					'extra practice'
				);
			} else {
				// Use percentages
				targetDueCount = Math.floor(maxSessionLength * (config.dueSongPercentage / 100));
				targetNewCount = Math.floor(maxSessionLength * (config.newSongPercentage / 100));
				targetRevisionCount = Math.floor(maxSessionLength * (config.revisionSongPercentage / 100));

				console.log(
					'[TRAINING SELECTION] Manual Percentage Targets: ',
					targetDueCount,
					'due,',
					targetNewCount,
					'new,',
					targetRevisionCount,
					'extra practice'
				);
			}

			// The per-quiz daily review limit applies here too. Manual mode used to
			// skip it entirely, so the setting was a no-op the moment anyone opened
			// Advanced Settings. Default capacity is effectively unlimited.
			if (targetDueCount > config.remainingDueCapacity) {
				console.log(
					'[TRAINING SELECTION] Daily review limit caps due songs:',
					targetDueCount,
					'->',
					config.remainingDueCapacity
				);
				targetDueCount = config.remainingDueCapacity;
			}
			if (targetNewCount > (config.remainingNewCapacity ?? 9999)) {
				console.log(
					'[TRAINING SELECTION] Daily new limit caps new songs:',
					targetNewCount,
					'->',
					config.remainingNewCapacity
				);
				targetNewCount = Math.max(0, config.remainingNewCapacity ?? 0);
			}

			// 1. Get due songs
			selectedDue = availableDueSongs.slice(0, targetDueCount);
			console.log(
				'[TRAINING SELECTION] Selected',
				selectedDue.length,
				'due songs (target:',
				targetDueCount + ')'
			);
			if (selectedDue.length < targetDueCount) {
				warnings.push(`Only ${selectedDue.length} due songs available (target: ${targetDueCount})`);
			}

			// 2. Get new songs
			selectedNew = availableNewSongs.slice(0, targetNewCount);
			console.log(
				'[TRAINING SELECTION] Selected',
				selectedNew.length,
				'new songs (target:',
				targetNewCount + ')'
			);
			if (selectedNew.length < targetNewCount) {
				warnings.push(`Only ${selectedNew.length} new songs available (target: ${targetNewCount})`);
			}

			// 3. Get revision songs
			selectedRevision = availableRevisionSongs.slice(0, targetRevisionCount);
			console.log(
				'[TRAINING SELECTION] Selected',
				selectedRevision.length,
				'revision songs (target:',
				targetRevisionCount + ')'
			);
			if (selectedRevision.length < targetRevisionCount) {
				warnings.push(
					`Only ${selectedRevision.length} revision songs available (target: ${targetRevisionCount})`
				);
			}

			// 4. Fill remaining slots if any (respecting max session length)
			let remainingSlots =
				maxSessionLength - (selectedDue.length + selectedNew.length + selectedRevision.length);

			if (remainingSlots > 0) {
				console.log('[TRAINING SELECTION] Filling', remainingSlots, 'remaining slots...');

				// Strategy: First try to fill with due songs (if we haven't exhausted
				// them and the daily review limit still has room)
				const dueFillCeiling = Math.min(availableDueSongs.length, config.remainingDueCapacity);
				if (dueFillCeiling > selectedDue.length) {
					const extraDue = availableDueSongs.slice(
						selectedDue.length,
						Math.min(dueFillCeiling, selectedDue.length + remainingSlots)
					);
					selectedDue = [...selectedDue, ...extraDue];
					remainingSlots -= extraDue.length;
					console.log(
						'[TRAINING SELECTION]   Filled',
						extraDue.length,
						'slots with extra due songs'
					);
				}

				// A zero extra-practice target is an exclusion, including Catch Up's
				// due-only preset. Leave the session short when nothing due remains.
				const allowExtraRevision = config.revisionCount !== null
					? config.revisionCount > 0
					: config.revisionSongPercentage > 0;
				if (allowExtraRevision && remainingSlots > 0 && availableRevisionSongs.length > selectedRevision.length) {
					const extraRevision = availableRevisionSongs.slice(
						selectedRevision.length,
						selectedRevision.length + remainingSlots
					);
					selectedRevision = [...selectedRevision, ...extraRevision];
					remainingSlots -= extraRevision.length;
					console.log(
						'[TRAINING SELECTION]   Filled',
						extraRevision.length,
						'slots with extra revision songs'
					);
				}

				// ONLY if targetNewCount was NOT 0, try to fill remaining with new songs.
				//
				// The daily budget is a ceiling on introductions for the whole session,
				// exactly as in the auto branch above - not a gate on the first pass.
				// This used to check `remainingSlots` alone, so a session that had
				// already spent its budget kept introducing new songs to fill the
				// leftovers: 4 due in a 20-song session with 2 of budget left selected
				// 16 new. Manual is the mode most sessions run in, so the daily
				// new-song limit was effectively not applying to most of them.
				const allowExtraNew = config.newCount !== null ? config.newCount > 0 : targetNewCount > 0;
				const extraNewRoom = Math.max(
					0,
					Math.min(remainingSlots, (config.remainingNewCapacity ?? 9999) - selectedNew.length)
				);
				if (extraNewRoom > 0 && availableNewSongs.length > selectedNew.length && allowExtraNew) {
					const extraNew = availableNewSongs.slice(
						selectedNew.length,
						selectedNew.length + extraNewRoom
					);
					selectedNew = [...selectedNew, ...extraNew];
					remainingSlots -= extraNew.length;
					console.log(
						'[TRAINING SELECTION]   Filled',
						extraNew.length,
						'slots with extra new songs'
					);
				}
			}
		}

		// API validation prevents oversized manual targets, but keep the core
		// scheduler safe for internal callers and legacy jobs too. Due cards retain
		// priority, followed by new and then optional extra-practice cards.
		let safeRemainingSlots = Math.max(0, maxSessionLength);
		selectedDue = selectedDue.slice(0, safeRemainingSlots);
		safeRemainingSlots -= selectedDue.length;
		selectedNew = selectedNew.slice(0, safeRemainingSlots);
		safeRemainingSlots -= selectedNew.length;
		selectedRevision = selectedRevision.slice(0, safeRemainingSlots);

		console.log('[TRAINING SELECTION] ----------------------------------------');
		console.log('[TRAINING SELECTION] Selection summary:');
		console.log('[TRAINING SELECTION]   Due songs:', selectedDue.length);
		console.log('[TRAINING SELECTION]   New songs:', selectedNew.length);
		console.log('[TRAINING SELECTION]   Extra-practice songs:', selectedRevision.length);
		console.log(
			'[TRAINING SELECTION]   Total:',
			selectedDue.length + selectedNew.length + selectedRevision.length
		);

		// Step 3: Build playlist with detailed song information
		console.log('[TRAINING SELECTION] ----------------------------------------');
		if (selectedDue.length > 0) {
			console.log('[TRAINING SELECTION] Selected Due Songs (' + selectedDue.length + '):');
			selectedDue.forEach((record, idx) => {
				const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				const daysOverdue = dueDate
					? Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
					: 'unknown';
				const stability = record.fsrs_state?.stability?.toFixed(1) ?? 'N/A';
				const difficulty = record.fsrs_state?.difficulty?.toFixed(1) ?? 'N/A';
				const reps = record.fsrs_state?.reps ?? 0;
				const state = this.getStateName(record.fsrs_state?.state);

				console.log(
					`[TRAINING SELECTION]   ${idx + 1}. song_ann_id:${record.song_ann_id} | ` +
						`overdue: ${daysOverdue} days | stability: ${stability} | difficulty: ${difficulty} | ` +
						`reps: ${reps} | state: ${state}`
				);
			});
		}

		if (selectedNew.length > 0) {
			console.log('[TRAINING SELECTION] Selected New Songs (' + selectedNew.length + '):');
			selectedNew.forEach((song, idx) => {
				const songKey = `${song.songArtist}_${song.songName}`;
				const anime =
					song.animeENName || song.animeRomajiName || song.animeEnglishName || 'Unknown';
				const songType = song.songType || 'Unknown';
				console.log(
					`[TRAINING SELECTION]   ${idx + 1}. ${songKey} | never practiced | ` +
						`anime: ${anime} | type: ${songType}`
				);
			});
		}

		if (selectedRevision.length > 0) {
			console.log(
				'[TRAINING SELECTION] Selected Revision Songs (' + selectedRevision.length + '):'
			);
			selectedRevision.forEach((record, idx) => {
				const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				const daysUntilDue = dueDate
					? Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
					: 'unknown';
				const stability = record.fsrs_state?.stability?.toFixed(1) ?? 'N/A';
				const difficulty = record.fsrs_state?.difficulty?.toFixed(1) ?? 'N/A';
				const reps = record.fsrs_state?.reps ?? 0;

				console.log(
					`[TRAINING SELECTION]   ${idx + 1}. song_ann_id:${record.song_ann_id} | ` +
						`due in: ${daysUntilDue} days | stability: ${stability} | difficulty: ${difficulty} | ` +
						`reps: ${reps} | EARLY REVISION`
				);
			});
		}

		// Combine into playlist, filtering out songs not found in quiz
		let dueSongsWithData = selectedDue
			.map((record) => {
				const songData = this.findSongInQuiz(
					allQuizSongs,
					record.song_ann_id,
					this.getProgressSongKey(record)
				);
				if (!songData) {
					console.warn(
						`[TRAINING SELECTION] ⚠ Due song not found in quiz: song_ann_id=${record.song_ann_id}`
					);
					return null;
				}
				// songData already has the correct numeric annSongId from the quiz songs
				return {
					...songData,
					progress: record,
					is_new: false,
					selection_reason: 'due'
				};
			})
			.filter((item) => item !== null);

		let newSongsWithData = selectedNew.map((song) => {
			// song already has the correct numeric annSongId from the quiz songs
			return {
				...song,
				progress: null,
				is_new: true,
				selection_reason: 'new'
			};
		});

		let revisionSongsWithData = selectedRevision
			.map((record) => {
				const songData = this.findSongInQuiz(
					allQuizSongs,
					record.song_ann_id,
					this.getProgressSongKey(record)
				);
				if (!songData) {
					console.warn(
						`[TRAINING SELECTION] ⚠ Revision song not found in quiz: song_ann_id=${record.song_ann_id}`
					);
					return null;
				}
				return {
					...songData,
					progress: record,
					is_new: false,
					selection_reason: 'revision'
				};
			})
			.filter((item) => item !== null);

		// One card, one slot.
		//
		// A song can surface in more than one pool, and now that a card's due time
		// can fall inside the window a single long session covers, "it cannot happen
		// in practice" stopped being a safe assumption. Deduplicate in priority
		// order - due beats new beats extra practice - so a song keeps the
		// strongest reason that selected it, and the composition counts below stay
		// equal to what is actually in the playlist.
		const seenAnnIds = new Set();
		const keepFirstOccurrence = (items) =>
			items.filter((item) => {
				const annId = this.normalizeAnnSongId(item.annSongId);
				if (annId === null) return true;
				if (seenAnnIds.has(annId)) return false;
				seenAnnIds.add(annId);
				return true;
			});

		dueSongsWithData = keepFirstOccurrence(dueSongsWithData);
		newSongsWithData = keepFirstOccurrence(newSongsWithData);
		revisionSongsWithData = keepFirstOccurrence(revisionSongsWithData);

		// Warn if songs were skipped and log details
		const skippedDueSongs = selectedDue.filter((record) => {
			const found = this.findSongInQuiz(
				allQuizSongs,
				record.song_ann_id,
				this.getProgressSongKey(record)
			);
			return !found;
		});
		const skippedRevisionSongs = selectedRevision.filter((record) => {
			const found = this.findSongInQuiz(
				allQuizSongs,
				record.song_ann_id,
				this.getProgressSongKey(record)
			);
			return !found;
		});
		const skippedCount = skippedDueSongs.length + skippedRevisionSongs.length;

		if (skippedCount > 0) {
			console.warn(
				`[TRAINING SELECTION] ⚠ Skipped ${skippedCount} songs that were not found in quiz`
			);
			console.warn(`[TRAINING SELECTION] ⚠ Skipped Due Songs (${skippedDueSongs.length}):`);
			skippedDueSongs.forEach((record, idx) => {
				console.warn(`[TRAINING SELECTION]   ${idx + 1}. song_ann_id: ${record.song_ann_id}`);
				console.warn(`[TRAINING SELECTION]      quiz_id: ${record.quiz_id}`);
				console.warn(
					`[TRAINING SELECTION]      fsrs_state:`,
					JSON.stringify(record.fsrs_state, null, 2)
				);
				console.warn(`[TRAINING SELECTION]      full record:`, JSON.stringify(record, null, 2));
			});

			if (skippedRevisionSongs.length > 0) {
				console.warn(
					`[TRAINING SELECTION] ⚠ Skipped Revision Songs (${skippedRevisionSongs.length}):`
				);
				skippedRevisionSongs.forEach((record, idx) => {
					console.warn(`[TRAINING SELECTION]   ${idx + 1}. song_ann_id: ${record.song_ann_id}`);
					console.warn(`[TRAINING SELECTION]      quiz_id: ${record.quiz_id}`);
					console.warn(
						`[TRAINING SELECTION]      fsrs_state:`,
						JSON.stringify(record.fsrs_state, null, 2)
					);
					console.warn(`[TRAINING SELECTION]      full record:`, JSON.stringify(record, null, 2));
				});
			}

			console.warn(`[TRAINING SELECTION] ⚠ Total songs in quiz pool: ${allQuizSongs.length}`);
			console.warn(`[TRAINING SELECTION] ⚠ Sample quiz songs (first 5):`);
			allQuizSongs.slice(0, 5).forEach((song, idx) => {
				console.warn(
					`[TRAINING SELECTION]      ${idx + 1}. "${song.songArtist} - ${song.songName}" (annSongId: ${song.annSongId})`
				);
			});

			warnings.push(`${skippedCount} previously practiced songs are no longer in this quiz`);
		}

		// Final pass: keep selection logic, then shuffle the full picked playlist.
		const orderedPlaylist = this.shuffleArray([
			...dueSongsWithData,
			...newSongsWithData,
			...revisionSongsWithData
		]);

		// Calculate actual percentages using filtered counts
		const actualDuePercentage =
			orderedPlaylist.length > 0
				? Math.round((dueSongsWithData.length / orderedPlaylist.length) * 100)
				: 0;
		const actualNewPercentage =
			orderedPlaylist.length > 0
				? Math.round((newSongsWithData.length / orderedPlaylist.length) * 100)
				: 0;
		const actualRevisionPercentage =
			orderedPlaylist.length > 0
				? Math.round((revisionSongsWithData.length / orderedPlaylist.length) * 100)
				: 0;
		console.log('[TRAINING SELECTION] ----------------------------------------');
		console.log('[TRAINING SELECTION] Final composition:');
		console.log(
			'[TRAINING SELECTION]   ',
			dueSongsWithData.length,
			`due (${actualDuePercentage}%),`,
			newSongsWithData.length,
			`new (${actualNewPercentage}%),`,
			revisionSongsWithData.length,
			`extra practice (${actualRevisionPercentage}%)`
		);
		console.log('[TRAINING SELECTION] ========================================');

		return {
			playlist: orderedPlaylist,
			metadata: {
				requested: {
					total: maxSessionLength,
					dueCount: targetDueCount,
					newCount: targetNewCount,
					revisionCount: targetRevisionCount,
					duePercentage: config.mode === 'auto' ? 'auto' : config.dueSongPercentage,
					newPercentage:
						config.mode === 'auto' ? config.maxNewPercentage : 100 - config.dueSongPercentage
				},
				actual: {
					total: orderedPlaylist.length,
					dueCount: dueSongsWithData.length,
					newCount: newSongsWithData.length,
					revisionCount: revisionSongsWithData.length,
					duePercentage: actualDuePercentage,
					newPercentage: actualNewPercentage,
					revisionPercentage: actualRevisionPercentage
				},
				available: {
					dueCount: availableDueSongs.length,
					newCount: availableNewSongs.length,
					revisionCount: availableRevisionSongs.length,
					totalPoolSize: allQuizSongs.length
				},
				// Not a warning: nothing went wrong and the manual-mode warning list is
				// dropped for auto sessions anyway. This is the one thing about auto
				// mode a player cannot infer from the composition alone - "why did I
				// only get one new song" has an answer, and it should be visible.
				backlogThrottle,
				warnings: warnings
			}
		};
	}

	/**
	 * Get human-readable state name
	 * @param {number} state - FSRS state number
	 * @returns {string} State name
	 */
	getStateName(state) {
		switch (state) {
			case State.New:
				return 'New';
			case State.Learning:
				return 'Learning';
			case State.Review:
				return 'Review';
			case State.Relearning:
				return 'Relearning';
			default:
				return 'Unknown';
		}
	}

	/**
	 * Find a song in the quiz by song_ann_id
	 * @param {Array} allQuizSongs - All songs in quiz
	 * @param {number} songAnnId - AMQ song ID (numeric)
	 * @returns {Object|null} Song object or null
	 */
	findSongInQuiz(allQuizSongs, songAnnId, songKey = null) {
		const normalizedId = this.normalizeAnnSongId(songAnnId);
		if (normalizedId !== null) {
			const matchedById = allQuizSongs.find(
				(song) => this.normalizeAnnSongId(song.annSongId) === normalizedId
			);
			if (matchedById) return matchedById;
		}

		if (songKey) {
			return allQuizSongs.find((song) => this.makeSongKey(song) === songKey) || null;
		}

		return null;
	}

	/**
	 * Fisher-Yates shuffle algorithm
	 * @param {Array} array - Array to shuffle
	 * @returns {Array} Shuffled array
	 */
	shuffleArray(array) {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	/**
	 * Update card state after an attempt
	 * @param {Object} currentState - Current FSRS state
	 * @param {number} rating - User rating (1-4)
	 * @returns {Object} Updated FSRS state
	 */
	/**
	 * @param {Object|null} currentState
	 * @param {number} rating
	 * @param {{ allowSameDayReviews?: boolean, now?: Date|string }} [options]
	 */
	updateCardState(currentState, rating, options = {}) {
		const now = options.now ? new Date(options.now) : new Date();

		// If no current state, create new card
		if (!currentState || !currentState.due) {
			const newCard = this.createNewCard('', now);
			return this.scheduleNext(newCard, rating, now, options);
		}

		// Update existing card
		return this.scheduleNext(currentState, rating, now, options);
	}

	/**
	 * Get review forecast for upcoming days
	 * @param {Array} progressRecords - Array of training_progress records
	 * @param {number} days - Number of days to forecast (default 7)
	 * @returns {Array} Array of {date, count} for each day
	 */
	getForecast(progressRecords, days = 7) {
		const now = new Date();
		const forecast = [];

		for (let i = 0; i < days; i++) {
			// Buckets are whole UTC days, matching the boundary the scheduler uses.
			const startOfDay = utcAddDays(now, i);
			const targetDate = utcEndOfDay(startOfDay);

			const count = progressRecords.filter((record) => {
				// Only include playable songs in forecast
				if (record.is_active === false) return false;
				if (record.song_ann_id == null) return false;
				if (record.suspended_at != null) return false;

				const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				if (!dueDate) return false;

				// Day 0 includes overdue, matching dueToday and the quiz-page forecast.
				// Days 1..N are that calendar day only.
				if (i === 0) {
					return dueDate <= targetDate;
				}
				return dueDate >= startOfDay && dueDate <= targetDate;
			}).length;

			forecast.push({
				date: targetDate.toISOString().split('T')[0],
				count
			});
		}

		return forecast;
	}
}

/**
 * Singleton instance for easy access
 */
export const trainingScheduler = new TrainingScheduler();
