// @ts-nocheck
import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { loadSavedSongList } from '$lib/server/song-list-loader.js';

/**
 * Load function for song list creation page
 * Loads a specific song list if requested via `fromList` query parameter
 * Public lists can be viewed by anyone, private lists only by their owner
 *
 * @param {Object} params - Load parameters
 * @param {URL} params.url - Request URL object with optional `fromList` query parameter
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Object>} Loaded data
 */
export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();

	let currentUserId = null;
	try {
		const { session, user } = await locals.safeGetSession();
		if (session && user) {
			currentUserId = user.id;
		}
	} catch (err) {
		console.error('Error getting user session:', err);
	}

	const viewToken = url.searchParams.get('view');
	const editToken = url.searchParams.get('edit');

	if (viewToken || editToken) {
		let query = supabaseAdmin
			.from('song_lists')
			.select('id, name, description, created_at, creator_username, is_public, user_id');

		if (editToken) {
			query = query.eq('edit_token', editToken);
		} else {
			query = query.eq('view_token', viewToken);
		}

		const { data, error: supabaseError } = await query.single();

		if (supabaseError) {
			if (supabaseError.code === 'PGRST116') {
				throw error(404, { message: 'This share link is invalid or has been replaced. Ask the list owner for a new link.' });
			}
			throw error(500, {
				message: `Failed to load shared list: ${supabaseError.message}`
			});
		}

		let songs = [];
		try {
			const loaded = await loadSavedSongList(data.id, supabaseAdmin);
			songs = loaded.songs;
		} catch (err) {
			console.error('Failed to fetch songs for shared list:', err);
			throw error(500, {
				message: 'Failed to load song list from storage'
			});
		}

		return {
			publicList: {
				id: data.id,
				name: data.name,
				description: data.description,
				created_at: data.created_at,
				creator_username: data.creator_username,
				songs: songs,
				is_public: data.is_public,
				is_owned_by_current_user: data.user_id === currentUserId
			},
			editToken: editToken || null,
			isViewOnly: !!viewToken
		};
	}

	const fromList = url.searchParams.get('id') || url.searchParams.get('fromList');
	if (!fromList) {
		return { publicList: null };
	}

	let query = supabaseAdmin
		.from('song_lists')
		.select('id, name, description, created_at, creator_username, is_public, user_id')
		.eq('id', fromList);

	if (!currentUserId) {
		query = query.eq('is_public', true);
	}

	const { data, error: supabaseError } = await query.single();

	if (supabaseError) {
		if (supabaseError.code === 'PGRST116') {
			return { publicList: null };
		}
		throw error(500, {
			message: `Failed to load list: ${supabaseError.message}`
		});
	}

	if (!data.is_public && data.user_id !== currentUserId) {
		return { publicList: null };
	}

	let songs = [];
	try {
		const loaded = await loadSavedSongList(data.id, supabaseAdmin);
		songs = loaded.songs;
	} catch (err) {
		console.error('Failed to fetch songs from storage:', err);
		throw error(500, {
			message: 'Failed to load song list from storage'
		});
	}

	return {
		publicList: {
			id: data.id,
			name: data.name,
			description: data.description,
			created_at: data.created_at,
			creator_username: data.creator_username,
			songs: songs,
			is_public: data.is_public,
			is_owned_by_current_user: data.user_id === currentUserId
		}
	};
};
