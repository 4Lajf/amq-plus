/**
 * Song Lists API endpoint for managing user song lists.
 * Handles CRUD operations for song lists with authentication and authorization.
 * See docs/API_ENDPOINTS.md for detailed API documentation.
 *
 * @module api/song-lists
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * @typedef {Object} SongListEntry
 * @property {string} id - Song list ID
 * @property {string} user_id - User ID
 * @property {string} name - List name
 * @property {string|null} description - Optional description
 * @property {boolean} is_public - Whether list is public
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Update timestamp
 * @property {string} creator_username - Creator username
 * @property {number} song_count - Number of songs in list
 */

/**
 * GET /api/song-lists
 * Fetches all song lists for the authenticated user (private lists).
 *
 * @param {Object} params - SvelteKit request parameters
 * @param {Object} params.locals - Request locals containing session
 * @returns {Promise<Response>} JSON response with {data: SongListEntry[]}
 * @throws {401} If user is not authenticated
 * @throws {500} If database operation fails
 */
export async function GET({ locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to view your private lists' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch user's private song lists (excluding songs_list_link for security)
		const { data, error: dbError } = await supabaseAdmin
			.from('song_lists')
			.select(
				'id, user_id, name, description, is_public, created_at, updated_at, creator_username, song_count'
			)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ data });
	} catch (err) {
		console.error('Error fetching song lists:', err);
		return error(500, { message: 'Failed to fetch song lists' });
	}
}

/**
 * POST /api/song-lists
 * Creates a new song list or updates an existing one.
 *
 * @param {Object} params - SvelteKit request parameters
 * @param {Request} params.request - Incoming request with JSON body
 * @param {Object} params.locals - Request locals containing session
 * @returns {Promise<Response>} JSON response with created/updated song list data
 * @throws {400} If required fields are missing
 * @throws {401} If user is not authenticated
 * @throws {500} If database operation fails
 *
 * Request body:
 * @typedef {Object} CreateSongListRequest
 * @property {string} name - List name
 * @property {string} [description] - Optional description
 * @property {string} songs_list_link - Pixeldrain URL to JSON file
 * @property {string} creator_username - Username of creator
 * @property {number} song_count - Number of songs in list
 * @property {string} [existingListId] - Optional ID for updating existing list
 */
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	try {
		const body = await request.json();
		const {
			name,
			description,
			songs_list_link,
			creator_username,
			song_count,
			existingListId,
			edit_token
		} = body;

		// Validate required fields
		if (!name || !songs_list_link || !creator_username || song_count === undefined) {
			return error(400, { message: 'Missing required fields' });
		}

		// Validate name length (max 64 characters)
		if (name.trim().length > 64) {
			return error(400, { message: 'List name must be 64 characters or less' });
		}

		// Validate description length (max 512 characters)
		if (description && description.length > 512) {
			return error(400, { message: 'List description must be 512 characters or less' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		if (existingListId) {
			// Update existing list
			let updateQuery = supabaseAdmin
				.from('song_lists')
				.update({
					songs_list_link,
					description: description || null,
					updated_at: new Date().toISOString(),
					// Only update creator_username if user is logged in (owner update)
					// If updating via token, preserve original creator_username
					...(user ? { creator_username } : {}),
					song_count
				})
				.eq('id', existingListId);

			// Authorization: Owner (session) OR Edit Token
			if (session && user) {
				// If logged in, check ownership
				// We first try to update assuming ownership
				// Ideally we should check ownership first or assume RLS/filter handles it
				// But here we are using admin client, so we MUST filter by user_id
				updateQuery = updateQuery.eq('user_id', user.id);
			} else if (edit_token) {
				// If not logged in but has token, check edit_token
				updateQuery = updateQuery.eq('edit_token', edit_token);
			} else {
				return error(401, { message: 'Unauthorized' });
			}

			const { data, error: dbError } = await updateQuery.select().single();

			// If no data returned, it means either list doesn't exist OR auth failed
			if (dbError || !data) {
				// Check if list exists to give better error message
				const { data: exists } = await supabaseAdmin
					.from('song_lists')
					.select('id')
					.eq('id', existingListId)
					.single();

				if (!exists) {
					return error(404, { message: 'List not found' });
				}
				return error(403, { message: 'Unauthorized to edit this list' });
			}

			return json({ data, updated: true });
		} else {
			// Create new list - Require Authentication
			if (!session || !user) {
				return error(401, { message: 'Unauthorized' });
			}

			// Create new list (no UUID in name - use ID for uniqueness)
			const { data, error: dbError } = await supabaseAdmin
				.from('song_lists')
				.insert({
					user_id: user.id,
					name: name.trim(),
					description: description || null,
					songs_list_link,
					creator_username,
					song_count,
					created_at: new Date().toISOString()
				})
				.select()
				.single();

			if (dbError) {
				console.error('Database error:', dbError);
				return error(500, { message: dbError.message });
			}

			return json({ data, created: true });
		}
	} catch (err) {
		console.error('Error saving song list:', err);
		return error(500, { message: 'Failed to save song list' });
	}
}
