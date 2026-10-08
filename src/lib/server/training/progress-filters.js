/**
 * Shared predicates for training_progress rows.
 *
 * These were copy-pasted into five endpoints, which is how `is_active` and
 * `song_ann_id` ended up being checked consistently but a third condition
 * (suspension) could not be added without finding all five. One definition now.
 *
 * @module lib/server/training/progress-filters
 */

/**
 * Has the user suspended this song?
 *
 * `suspended_at` is user-owned. `is_active` is derived from pool membership by
 * sessionStartService and is rewritten on every session start, so it cannot
 * carry user intent - see 20260810150000_training_progress_suspended.sql.
 *
 * @param {Object} record
 * @returns {boolean}
 */
export function isSuspendedProgressRecord(record) {
	return record?.suspended_at != null;
}

/**
 * Can this row be picked for a session?
 *
 * @param {Object} record
 * @returns {boolean}
 */
export function isPlayableProgressRecord(record) {
	return (
		record?.is_active !== false && record?.song_ann_id != null && !isSuspendedProgressRecord(record)
	);
}
