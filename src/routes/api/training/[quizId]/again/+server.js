/**
 * POST /api/training/[quizId]/again
 *
 * W17 — doomchicken, Mar 5: "a way to add an 'again' to a song in a list for
 * when i miss it in ranked or tour."
 *
 * R14 built the capability (song-lists/append); the parked question was what it
 * MEANS to schedule a review for a song you missed outside training. Decided,
 * option (a): the song is made **due immediately**, and if it is not already in
 * the quiz's training pool it enters as new and plays soon.
 *
 * **No FSRS state is written.** Applying `Rating.Again` to an existing card was
 * explicitly rejected: that would let an out-of-band event mutate stability and
 * difficulty, which is precisely the coupling problem W18 exists to close. Do
 * not open a second write path into the scheduler while closing the first. This
 * moves `due` and nothing else — the same contract as bulk_set_training_due.
 *
 * Body: { token: string, annSongId: number }
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import {
	lookupToken,
	INVALID_TOKEN_MESSAGE,
	mayModifyOwnTrainingFor
} from '$lib/server/training/training-utils.js';
import { utcStartOfDay } from '$lib/utils/day-boundary.js';

// @ts-ignore
export async function POST({ params, request, locals: { safeGetSession } }) {
	const { quizId } = params;

	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const { token, annSongId } = body ?? {};

	const numericAnnSongId = Number(annSongId);
	if (!Number.isFinite(numericAnnSongId)) {
		throw error(400, { message: 'A numeric annSongId is required' });
	}

	const supabaseAdmin = createSupabaseAdmin();

	// Connector token in-game, cookie session on the website.
	let userId;
	if (token) {
		const validToken = await lookupToken(supabaseAdmin, token);
		if (!validToken) {
			return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		}
		userId = validToken.user_id;
	} else {
		const { session } = await safeGetSession();
		if (!session) throw error(401, { message: 'Unauthorized' });
		userId = session.user.id;
	}

	// Owner, or anyone with their own progress on this quiz. Marking due writes
	// one row scoped to this caller, so a shared-quiz trainee can do it for
	// themselves without touching the owner's schedule. See
	// mayModifyOwnTrainingFor.
	if (!(await mayModifyOwnTrainingFor(supabaseAdmin, userId, quizId))) {
		throw error(403, { message: "You do not have permission to modify this quiz's training." });
	}

	const { data: existing } = await supabaseAdmin
		.from('training_progress')
		.select('id, fsrs_state, suspended_at')
		.eq('user_id', userId)
		.eq('quiz_id', quizId)
		.eq('song_ann_id', numericAnnSongId)
		.order('attempt_count', { ascending: false })
		.limit(1);

	const record = existing?.[0] || null;

	// "Due immediately" means the start of the current training day, not a bare
	// timestamp — every other due date in the system is a UTC day boundary, and
	// a mid-day timestamp would sort oddly against them. See day-boundary.js.
	const dueNow = utcStartOfDay(new Date()).toISOString();

	if (!record) {
		// Not in the pool yet. Say so rather than inventing a card: the song enters
		// as new the next time the pool is synced, which is what "it enters as new
		// and plays soon" means.
		return json({
			success: true,
			alreadyTracked: false,
			message:
				'That song is not in this quiz yet. It will come up as a new song once the pool includes it.'
		});
	}

	const { error: updateError } = await supabaseAdmin
		.from('training_progress')
		.update({
			// Only `due` moves. Stability, difficulty, reps and lapses are the
			// scheduler's to own.
			fsrs_state: { ...(record.fsrs_state || {}), due: dueNow },
			is_active: true,
			inactivated_at: null,
			// Marking a song "again" is an explicit request to see it, so it also
			// lifts a suspension rather than silently doing nothing.
			suspended_at: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', record.id);

	if (updateError) {
		console.error('[TRAINING AGAIN] Update failed:', updateError);
		throw error(500, { message: 'Failed to make the song due' });
	}

	return json({
		success: true,
		alreadyTracked: true,
		due: dueNow,
		wasSuspended: record.suspended_at != null,
		message: 'Marked for review — it will come up in your next session.'
	});
}
