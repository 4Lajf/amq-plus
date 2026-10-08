/**
 * Song list load API endpoint.
 * Fetches a specific song list's songs from Pixeldrain storage.
 *
 * @module songListLoadAPI
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { loadSavedSongList } from '$lib/server/song-list-loader.js';
import { isAdmin } from '$lib/server/auth-utils.js';

/**
 * Load response structure.
 * @typedef {Object} LoadResponse
 * @property {boolean} success - Whether the load was successful
 * @property {Object[]} songs - Array of song objects
 * @property {string} [error] - Error message if load failed
 */

/**
 * GET /api/song-lists/[id]/load
 * Fetches a specific song list's songs from Pixeldrain
 * Requires authentication - only the owner can load their private lists
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Song list ID
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} Load response
 */
export async function GET({ params, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to load your lists' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();
		const userIsAdmin = isAdmin(user);

		let query = supabaseAdmin
			.from('song_lists')
			.select('id, user_id, name')
			.eq('id', params.id);

		if (!userIsAdmin) {
			query = query.eq('user_id', user.id);
		}

		const { data: listData, error: dbError } = await query.single();

		if (dbError || !listData) {
			console.error('Database error:', dbError);
			return error(404, { message: 'List not found' });
		}

		const { songs, name, source } = await loadSavedSongList(params.id, supabaseAdmin);
		return json({ songs, name, source });
	} catch (err) {
		console.error('Error loading song list:', err);
		return error(500, { message: err.message || 'Failed to load song list' });
	}
}
