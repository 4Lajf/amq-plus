/**
 * POST /api/training/[quizId]/suspend
 *
 * Suspend or unsuspend songs in a quiz's training set. Bulk by design - the
 * request people actually made was "sort by difficulty and mass suspend the easy
 * ones" (Cherryish, 2026-03-05), so a single-song call is just a batch of one.
 *
 * Body: { songAnnIds: number[], suspended: boolean, token?: string }
 *
 * W10: `token` is the connector's way in. The ask was always to suspend *while
 * playing* - lng, Mar 5: "I'd rather get kitto seishun ga kikoeru 9 times and
 * mark it inactive as I go than have to manually add it to a list before I even
 * start playing." The moment you know a song is too easy is the moment it plays,
 * and R9 only shipped suspend on the website. The connector runs on
 * animemusicquiz.com and has no cookie for this origin, so it authenticates the
 * same way R14's song-lists/append does.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import {
	lookupToken,
	INVALID_TOKEN_MESSAGE,
	mayModifyOwnTrainingFor
} from '$lib/server/training/training-utils.js';

const MAX_BATCH = 5000;

// @ts-ignore
export async function POST({ params, request, locals: { safeGetSession } }) {
	const { quizId } = params;

	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const { songAnnIds, suspended, token } = body ?? {};

	// Cookie session for the website, connector token for in-game. Either
	// resolves to the user id that has to own the quiz below.
	let userId;
	if (token) {
		const supabaseForAuth = createSupabaseAdmin();
		const validToken = await lookupToken(supabaseForAuth, token);
		if (!validToken) {
			return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		}
		userId = validToken.user_id;
	} else {
		const { session } = await safeGetSession();
		if (!session) throw error(401, { message: 'Unauthorized' });
		userId = session.user.id;
	}

	if (typeof suspended !== 'boolean') {
		throw error(400, { message: '`suspended` must be a boolean' });
	}
	if (!Array.isArray(songAnnIds) || songAnnIds.length === 0) {
		throw error(400, { message: '`songAnnIds` must be a non-empty array' });
	}
	if (songAnnIds.length > MAX_BATCH) {
		throw error(400, { message: `Too many songs in one request (max ${MAX_BATCH})` });
	}

	const ids = [...new Set(songAnnIds.map(Number).filter((n) => Number.isFinite(n)))];
	if (ids.length === 0) {
		throw error(400, { message: '`songAnnIds` contained no valid numeric ids' });
	}

	const supabaseAdmin = createSupabaseAdmin();

	// Owner, or anyone with their own progress on this quiz — suspending writes
	// only to the caller's rows. See mayModifyOwnTrainingFor.
	if (!(await mayModifyOwnTrainingFor(supabaseAdmin, userId, quizId))) {
		throw error(403, { message: "You do not have permission to modify this quiz's training." });
	}

	const { data, error: updateError } = await supabaseAdmin
		.from('training_progress')
		.update({ suspended_at: suspended ? new Date().toISOString() : null })
		.eq('user_id', userId)
		.eq('quiz_id', quizId)
		.in('song_ann_id', ids)
		.select('song_ann_id');

	if (updateError) {
		console.error('[TRAINING SUSPEND] Update failed:', updateError);
		throw error(500, { message: 'Failed to update suspension state' });
	}

	const updated = data?.length ?? 0;
	console.log(
		`[TRAINING SUSPEND] ${suspended ? 'Suspended' : 'Unsuspended'} ${updated}/${ids.length} songs for quiz ${quizId}`
	);

	return json({
		success: true,
		suspended,
		updated,
		requested: ids.length,
		// Ids the user asked for that have no progress row in this quiz. Surfaced
		// rather than swallowed so a partial apply is visible.
		missing: ids.filter((id) => !(data ?? []).some((r) => r.song_ann_id === id))
	});
}
