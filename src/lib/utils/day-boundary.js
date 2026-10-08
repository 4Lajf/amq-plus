/**
 * The training day boundary.
 *
 * Every "is this due today", "schedule it for tomorrow" and forecast bucket in
 * training runs off one rule: **the day rolls over at 00:00 UTC.**
 *
 * This used to be implicit and wrong. The scheduler built "tomorrow 04:00" with
 * setHours() and the due comparisons normalized with getFullYear()/getMonth()/
 * getDate(), all of which resolve in whatever timezone the *server process*
 * happens to run in — while the browser rendered the same timestamps in the
 * viewer's timezone. Users far from the server offset saw "due tomorrow" songs
 * play today and a due count that never matched what they were given
 * (Ikunobu, 2026-08-06: "the server might just be thinking it's tomorrow", and
 * "website shows we are on Aug 6th but playing songs for Aug 7th"). 3shine, near
 * the server offset, saw nothing wrong the same day.
 *
 * UTC is the fix because it is the one clock both sides already agree on. It
 * also removes a silent dependency on host configuration: the same deployment
 * moved between regions used to shift everybody's review schedule.
 *
 * These helpers are pure and take an explicit `now` so tests can pin it.
 *
 * @module lib/utils/day-boundary
 */

const MS_PER_DAY = 86_400_000;

/**
 * Midnight UTC at the start of the day containing `date`.
 *
 * @param {Date|string|number} date
 * @returns {Date}
 */
export function utcStartOfDay(date) {
	const d = date instanceof Date ? date : new Date(date);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Midnight UTC at the end of the day containing `date` (i.e. the next boundary).
 *
 * @param {Date|string|number} date
 * @returns {Date}
 */
export function utcStartOfNextDay(date) {
	return new Date(utcStartOfDay(date).getTime() + MS_PER_DAY);
}

/**
 * Last representable instant of the UTC day containing `date`.
 * For inclusive range ends where a half-open interval is awkward.
 *
 * @param {Date|string|number} date
 * @returns {Date}
 */
export function utcEndOfDay(date) {
	return new Date(utcStartOfNextDay(date).getTime() - 1);
}

/**
 * `n` UTC days after the day containing `date`, at midnight UTC.
 *
 * @param {Date|string|number} date
 * @param {number} n may be negative
 * @returns {Date}
 */
export function utcAddDays(date, n) {
	return new Date(utcStartOfDay(date).getTime() + n * MS_PER_DAY);
}

/**
 * Whole UTC days from `a`'s day to `b`'s day. Positive when `b` is later.
 *
 * @param {Date|string|number} a
 * @param {Date|string|number} b
 * @returns {number}
 */
export function utcDaysBetween(a, b) {
	return Math.round((utcStartOfDay(b).getTime() - utcStartOfDay(a).getTime()) / MS_PER_DAY);
}

/**
 * Do these two instants fall on the same UTC day?
 *
 * @param {Date|string|number} a
 * @param {Date|string|number} b
 * @returns {boolean}
 */
export function isSameUtcDay(a, b) {
	return utcStartOfDay(a).getTime() === utcStartOfDay(b).getTime();
}

/**
 * When the training day rolls over, in the viewer's own clock.
 *
 * W8 / decision C1: the boundary stays at 00:00 UTC, and the UI says so. A user
 * in UTC-5 watches "due today" reset at 19:00 with no explanation, which is its
 * own confusion generator - it is what Ikunobu spent two days chasing. Reading
 * it from here rather than hardcoding "00:00 UTC" in each component keeps the
 * copy honest if the rule ever moves.
 *
 * @param {Date} [now] - Instant to resolve the local equivalent against
 * @returns {string} e.g. "19:00" for a viewer at UTC-5
 */
export function localDayRolloverLabel(now = new Date()) {
	const rollover = utcStartOfNextDay(now);
	return rollover.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
}

/**
 * One sentence explaining the boundary, ready to drop next to any day-scoped
 * number ("due today", the review forecast, the daily review limit).
 *
 * @param {Date} [now] - Instant to resolve the local equivalent against
 * @returns {string}
 */
export function dayBoundaryNote(now = new Date()) {
	return `The training day rolls over at 00:00 UTC — ${localDayRolloverLabel(now)} your time.`;
}
