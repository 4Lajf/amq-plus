/**
 * POST /api/training/song-lists
 *
 * The connector's view of the user's own song lists: enough to populate an
 * "add to list" picker in-game, nothing more.
 *
 * Token-authenticated rather than session-authenticated because the connector
 * runs on animemusicquiz.com and has no cookie for this origin — same mechanism
 * as the rest of `/api/training`.
 *
 * Part of R14.
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';

// @ts-ignore
export async function POST({ request }) {
	const supabaseAdmin = createSupabaseAdmin();

	try {
		const { token } = await request.json();

		if (!token) {
			return json({ error: 'Token required' }, { status: 400 });
		}

		const validToken = await lookupToken(supabaseAdmin, token);
		if (!validToken) {
			return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		}

		const { data, error: dbError } = await supabaseAdmin
			.from('song_lists')
			.select('id, name, song_count, updated_at')
			.eq('user_id', validToken.user_id)
			.order('updated_at', { ascending: false });

		if (dbError) {
			console.error('[TRAINING SONG LISTS] Error fetching lists:', dbError);
			return json({ error: 'Failed to fetch song lists' }, { status: 500 });
		}

		return json({ lists: data || [] });
	} catch (err) {
		console.error('[TRAINING SONG LISTS] Error:', err);
		return json({ error: 'Failed to fetch song lists' }, { status: 500 });
	}
}
