// @ts-nocheck
import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchFromPixeldrain } from '$lib/server/pixeldrain.js';

/**
 * Load function for song list creation page
 * Loads a specific song list if requested via `fromList` query parameter
 * Public lists can be viewed by anyone, private lists only by their owner
 * Fetches the songs from Pixeldrain on the server and passes them to the client
 *
 * @param {Object} params - Load parameters
 * @param {URL} params.url - Request URL object with optional `fromList` query parameter
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Object>} Loaded data
 */
export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();

	// Check for view/edit tokens first
	const viewToken = url.searchParams.get('view');
	const editToken = url.searchParams.get('edit');

	if (viewToken || editToken) {
		let query = supabaseAdmin
			.from('song_lists')
			.select('id, name, description, created_at, creator_username, songs_list_link, is_public, user_id');

		if (editToken) {
			query = query.eq('edit_token', editToken);
		} else {
			query = query.eq('view_token', viewToken);
		}

		const { data, error: supabaseError } = await query.single();

		if (supabaseError) {
			if (supabaseError.code === 'PGRST116') {
				return { publicList: null };
			}
			throw error(500, {
				message: `Failed to load shared list: ${supabaseError.message}`
			});
		}

		// Fetch songs from Pixeldrain
		let songs = [];
		if (data.songs_list_link) {
			try {
				songs = await fetchFromPixeldrain(data.songs_list_link);
			} catch (err) {
				console.error('Failed to fetch songs from Pixeldrain:', err);
				throw error(500, {
					message: 'Failed to load song list from storage'
				});
			}
		}

		return {
			publicList: {
				id: data.id,
				name: data.name,
				description: data.description,
				created_at: data.created_at,
				creator_username: data.creator_username,
				songs: songs
			},
			editToken: editToken || null,
			isViewOnly: !!viewToken
		};
	}

	// Support both 'id' and 'fromList' parameters for backwards compatibility
	const fromList = url.searchParams.get('id') || url.searchParams.get('fromList');
	if (!fromList) {
		return { publicList: null };
	}

	// Get current user if authenticated
	let currentUserId = null;
	try {
		const { session, user } = await locals.safeGetSession();
		if (session && user) {
			currentUserId = user.id;
		}
	} catch (err) {
		console.error('Error getting user session:', err);
	}

	// Build query to fetch the list
	let query = supabaseAdmin
		.from('song_lists')
		.select('id, name, description, created_at, creator_username, songs_list_link, is_public, user_id')
		.eq('id', fromList);

	// If user is not authenticated, only allow public lists
	if (!currentUserId) {
		query = query.eq('is_public', true);
	}

	const { data, error: supabaseError } = await query.single();

	if (supabaseError) {
		// It's okay if not found, just return null and the page will load normally
		if (supabaseError.code === 'PGRST116') {
			return { publicList: null };
		}
		// For other errors, we should let the user know something went wrong
		throw error(500, {
			message: `Failed to load list: ${supabaseError.message}`
		});
	}

	// Check authorization: if list is private, only the owner can access it
	if (!data.is_public && data.user_id !== currentUserId) {
		// List is private and user is not the owner
		return { publicList: null };
	}

	// Fetch songs from Pixeldrain on the server
	let songs = [];
	if (data.songs_list_link) {
		try {
			songs = await fetchFromPixeldrain(data.songs_list_link);
		} catch (err) {
			console.error('Failed to fetch songs from Pixeldrain:', err);
			throw error(500, {
				message: 'Failed to load song list from storage'
			});
		}
	}

	// Return metadata and songs, but not the songs_list_link
	return {
		publicList: {
			id: data.id,
			name: data.name,
			description: data.description,
			created_at: data.created_at,
			creator_username: data.creator_username,
			songs: songs
		}
	};
};
