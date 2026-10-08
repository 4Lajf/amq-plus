/**
 * POST /api/training/[quizId]/reset-due
 * Spread backlog: redistribute due/overdue songs across a chosen horizon.
 *
 * Body (optional):
 *   { days: 7 | 14 | 30 } — explicit horizon
 *   If omitted, adaptive spread (min 7 days, ~30 songs/day) — legacy behaviour.
 *
 * Songs ordered by overdue factor (elapsed/stability) descending so the most
 * at-risk cards return sooner within the window. Only `fsrs_state.due` changes.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { bulkSetDueDates } from '$lib/server/training/bulk-reschedule.js';
import { isPlayableProgressRecord } from '$lib/server/training/progress-filters.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';
import { mayModifyOwnTrainingFor } from '$lib/server/training/training-utils.js';
import { utcStartOfDay, utcAddDays } from '$lib/utils/day-boundary.js';

const MIN_SPREAD_DAYS = 7;
const MAX_SONGS_PER_DAY = 30;
const ALLOWED_HORIZONS = new Set([7, 14, 30]);

/**
 * @param {number} songCount
 * @returns {{ days: number, songsPerDay: number }}
 */
function computeAdaptiveSpread(songCount) {
	const days = Math.max(MIN_SPREAD_DAYS, Math.ceil(songCount / MAX_SONGS_PER_DAY));
	const songsPerDay = Math.ceil(songCount / days);
	return { days, songsPerDay };
}

// @ts-ignore
export async function POST({ params, request, locals: { safeGetSession } }) {
	const { session } = await safeGetSession();

	if (!session) {
		throw error(401, { message: 'Unauthorized' });
	}

	const userId = session.user.id;
	const quizId = params.quizId;

	const supabaseAdmin = createSupabaseAdmin();

	if (!(await mayModifyOwnTrainingFor(supabaseAdmin, userId, quizId))) {
		throw error(403, { message: "You do not have permission to modify this quiz's training." });
	}

	/** @type {number|null} */
	let requestedDays = null;
	try {
		const body = await request.json();
		if (body && body.days != null) {
			const parsed = Number(body.days);
			if (!ALLOWED_HORIZONS.has(parsed)) {
				throw error(400, { message: 'days must be 7, 14, or 30.' });
			}
			requestedDays = parsed;
		}
	} catch (err) {
		if (err?.status) throw err;
		// Empty body is fine — adaptive mode.
	}

	try {
		const { data: progressRecords, error: fetchError } = await fetchAllPages(() =>
			supabaseAdmin
				.from('training_progress')
				.select('*')
				.eq('user_id', userId)
				.eq('quiz_id', quizId)
				.order('id', { ascending: true })
		);

		if (fetchError) {
			console.error('[Spread Backlog] Error fetching progress:', fetchError);
			throw error(500, { message: 'Failed to fetch training progress' });
		}

		if (!progressRecords || progressRecords.length === 0) {
			return json({ success: true, message: 'No training progress found', resetCount: 0 });
		}

		const now = new Date();
		const today = utcStartOfDay(now);

		const dueSongs = progressRecords.filter((record) => {
			if (!isPlayableProgressRecord(record)) return false;
			if (!record.fsrs_state?.due) return false;
			const dueDate = utcStartOfDay(new Date(record.fsrs_state.due));
			return dueDate <= today;
		});

		if (dueSongs.length === 0) {
			return json({ success: true, message: 'No due songs to reschedule', resetCount: 0 });
		}

		dueSongs.sort((a, b) => {
			const factorA = trainingScheduler.overdueFactor(a.fsrs_state, now);
			const factorB = trainingScheduler.overdueFactor(b.fsrs_state, now);
			if (factorA !== factorB) return factorB - factorA;
			const stabA = a.fsrs_state?.stability ?? 0;
			const stabB = b.fsrs_state?.stability ?? 0;
			return stabA - stabB;
		});

		const { days: spreadDays, songsPerDay } = requestedDays
			? { days: requestedDays, songsPerDay: Math.ceil(dueSongs.length / requestedDays) }
			: computeAdaptiveSpread(dueSongs.length);

		console.log(
			`[Spread Backlog] ${dueSongs.length} songs → ${spreadDays} days (~${songsPerDay}/day)`
		);

		const updates = dueSongs.map((record, index) => {
			const dayOffset = Math.min(spreadDays, Math.floor(index / songsPerDay) + 1);
			const newDueDate = utcStartOfDay(utcAddDays(now, dayOffset));
			return { id: record.id, due: newDueDate.toISOString() };
		});

		const { updated, failed } = await bulkSetDueDates(supabaseAdmin, userId, quizId, updates);

		if (failed > 0) {
			console.warn(
				`[Spread Backlog] ${failed} of ${updates.length} songs could not be rescheduled`
			);
		}

		console.log(`[Spread Backlog] Done: ${updated} songs over ${spreadDays} days`);

		return json({
			success: true,
			message: `Spread ${updated} songs over ${spreadDays} days (~${songsPerDay} per day, most at-risk first). Progress kept.`,
			resetCount: updated,
			failedCount: failed,
			spreadDays,
			songsPerDay
		});
	} catch (err) {
		console.error('[Spread Backlog] Error:', err);
		if (err.status) throw err;
		throw error(500, { message: 'Failed to spread backlog' });
	}
}
