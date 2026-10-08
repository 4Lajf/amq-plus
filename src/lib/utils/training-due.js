import { utcStartOfDay } from './day-boundary.js';

/**
 * Due eligibility shared by progress filters and the scheduler.
 *
 * Day-scale reviews are due for their whole UTC day: ts-fsrs keeps the hour of
 * the last rating (rated 18:00 + 4d = due 18:00), which left Due Today counting
 * songs a session would not play until that hour. A due date on a later day
 * than the last review is a day-scale interval, so it opens at midnight.
 *
 * Same-day learning steps (1m / 10m, Lucky guess) keep their exact timestamp -
 * that check is what stops a song you just rated from coming straight back.
 * Records without last_review also stay exact.
 */
export function isTrainingDue(record, now = new Date()) {
	if (record.is_active === false || record.song_ann_id == null || record.suspended_at != null)
		return false;
	const due = record.fsrs_state?.due;
	if (due == null || due === '') return false;
	const dueAt = new Date(due);
	if (Number.isNaN(dueAt.getTime())) return false;
	if (dueAt.getTime() <= now.getTime()) return true;

	const lastReview = record.fsrs_state?.last_review;
	if (!lastReview) return false;
	const lastReviewAt = new Date(lastReview);
	if (Number.isNaN(lastReviewAt.getTime())) return false;

	const dueDay = utcStartOfDay(dueAt).getTime();
	return dueDay > utcStartOfDay(lastReviewAt).getTime() && dueDay <= utcStartOfDay(now).getTime();
}
