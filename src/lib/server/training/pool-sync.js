/**
 * Reconciling `training_progress.is_active` against the quiz's current song pool.
 *
 * A training row is "active" when the song it tracks is still produced by the
 * quiz's filters. Edit the quiz — or edit a song list it draws from — and that
 * answer changes, but nothing recomputes it until the next session start. The
 * community workaround was to open the editor, make a meaningless change, save,
 * and hope; Nirom did exactly that and could not tell whether it had worked.
 *
 * This module is that reconciliation, lifted out of `sessionStartService` so the
 * explicit "Refresh song pool" action and the automatic sync are the same code
 * rather than two implementations that drift.
 *
 * @module lib/server/training/pool-sync
 */

import { shiftDueDate } from '$lib/server/training/training-utils.js';

/**
 * @param {any} annSongId
 * @returns {number|null}
 */
function normalizeAnnSongId(annSongId) {
	if (annSongId === null || annSongId === undefined || annSongId === '') return null;
	const numericId = Number(annSongId);
	return Number.isFinite(numericId) ? numericId : null;
}

/**
 * Legacy identity for rows written before `song_ann_id` existed.
 * @param {any} song
 * @returns {string|null}
 */
function makeSongKey(song) {
	if (!song) return null;
	const artist = song.songArtist || song.artist || '';
	const title = song.songName || song.title || '';
	if (!artist || !title) return null;
	return `${artist}_${title}`;
}

/**
 * @typedef {Object} PoolSyncPlan
 * @property {{ id: string, is_active: true, inactivated_at: null, fsrs_state: any }[]} reactivateUpdates
 * @property {string[]} deactivateIds
 */

/**
 * Work out which rows change, and apply the change to the in-memory records so
 * the caller's scheduler sees the post-sync state without a re-read.
 *
 * @param {any[]} progressRecords mutated in place
 * @param {any[]} poolSongs
 * @param {Date} now
 * @returns {PoolSyncPlan}
 */
export function planPoolSync(progressRecords, poolSongs, now) {
	const poolSongAnnIds = new Set(
		(poolSongs || []).map((s) => normalizeAnnSongId(s?.annSongId)).filter((id) => id !== null)
	);
	const poolSongKeys = new Set(
		(poolSongs || []).map((song) => makeSongKey(song)).filter((key) => key)
	);

	/** @type {PoolSyncPlan['reactivateUpdates']} */
	const reactivateUpdates = [];
	/** @type {string[]} */
	const deactivateIds = [];

	for (const record of progressRecords || []) {
		// A suspended song is the user's decision, and is_active is this loop's
		// decision. Reactivating a suspended row because it is still in the pool
		// would silently undo the suspension on the next session start.
		if (record.suspended_at != null) continue;

		const recordAnnId = normalizeAnnSongId(record.song_ann_id);
		const recordSongKey = record.song_key || record.annSongId || null;
		const isInPool =
			(recordAnnId !== null && poolSongAnnIds.has(recordAnnId)) ||
			(recordSongKey && poolSongKeys.has(recordSongKey));

		if (isInPool && record.is_active === false) {
			// Becoming active - shift due date so a song parked for a month does
			// not come back already a month overdue.
			const updatedFsrsState = shiftDueDate(record.fsrs_state, record.inactivated_at, now);
			reactivateUpdates.push({
				id: record.id,
				is_active: true,
				inactivated_at: null,
				fsrs_state: updatedFsrsState
			});

			record.is_active = true;
			record.inactivated_at = null;
			record.fsrs_state = updatedFsrsState;
		} else if (!isInPool && record.is_active !== false) {
			deactivateIds.push(record.id);

			record.is_active = false;
			record.inactivated_at = now.toISOString();
		}
	}

	return { reactivateUpdates, deactivateIds };
}

/**
 * Write a plan out. Failures are logged and swallowed: a session that could not
 * update `is_active` is still a usable session, and the next start retries.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {PoolSyncPlan} plan
 * @param {Date} now
 * @param {string} [tag] log prefix
 * @returns {Promise<{ activated: number, deactivated: number }>}
 */
export async function applyPoolSync(supabaseAdmin, plan, now, tag = '[POOL SYNC]') {
	const { reactivateUpdates, deactivateIds } = plan;
	if (reactivateUpdates.length === 0 && deactivateIds.length === 0) {
		return { activated: 0, deactivated: 0 };
	}

	let activated = 0;
	let deactivated = 0;

	try {
		if (reactivateUpdates.length > 0) {
			console.log(`${tag} Reactivating ${reactivateUpdates.length} songs with shifted due dates...`);
			// Each row gets its own fsrs_state, so these cannot be one upsert.
			await Promise.all(
				reactivateUpdates.map((update) =>
					supabaseAdmin
						.from('training_progress')
						.update({
							is_active: true,
							inactivated_at: null,
							fsrs_state: update.fsrs_state
						})
						.eq('id', update.id)
				)
			);
			activated = reactivateUpdates.length;
		}

		if (deactivateIds.length > 0) {
			console.log(`${tag} Deactivating ${deactivateIds.length} songs...`);
			const { error: deactivateError } = await supabaseAdmin
				.from('training_progress')
				.update({ is_active: false, inactivated_at: now.toISOString() })
				.in('id', deactivateIds);

			if (deactivateError) {
				console.warn(`${tag} ⚠ Error deactivating songs:`, deactivateError.message);
			} else {
				deactivated = deactivateIds.length;
			}
		}

		console.log(`${tag} ✓ is_active status synced`);
	} catch (syncErr) {
		console.warn(`${tag} ⚠ Unexpected error syncing is_active status:`, syncErr);
	}

	return { activated, deactivated };
}
