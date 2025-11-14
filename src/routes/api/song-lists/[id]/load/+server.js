/**
 * Song list load API endpoint.
 * Fetches a specific song list's songs from Pixeldrain storage.
 *
 * @module songListLoadAPI
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchFromPixeldrain } from '$lib/server/pixeldrain.js';
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

		// Fetch the list metadata to get the songs_list_link
		// Admin users can load any list, regular users only their own
		let query = supabaseAdmin
			.from('song_lists')
			.select('id, user_id, name, songs_list_link')
			.eq('id', params.id);
		
		// If not admin, restrict to user's own lists
		if (!userIsAdmin) {
			query = query.eq('user_id', user.id);
		}
		
		const { data: listData, error: dbError } = await query.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return error(404, { message: 'List not found' });
		}

		// Fetch songs from Pixeldrain
		let songs = [];
		if (listData.songs_list_link) {
			try {
				songs = await fetchFromPixeldrain(listData.songs_list_link);
			} catch (err) {
				console.error('Failed to fetch songs from Pixeldrain:', err);
				return error(500, { message: 'Failed to load songs from storage' });
			}
		}

		return json({ songs, name: listData.name });
	} catch (err) {
		console.error('Error loading song list:', err);
		return error(500, { message: 'Failed to load song list' });
	}
}
