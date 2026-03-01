// @ts-nocheck
import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * Load function for song list page
 * Loads public song lists with optional filtering and pagination
 * No authentication required, but favorites are only available for authenticated users
 *
 * @param {Object} params - Load parameters
 * @param {URL} params.url - Request URL object
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Object>} Loaded data
 */
export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();

	// Parse query parameters
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 12; // Fixed at 12 per page
	const search = url.searchParams.get('search') || '';
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';
	const creator = url.searchParams.get('creator') || '';
	const dateFrom = url.searchParams.get('dateFrom') || '';
	const dateTo = url.searchParams.get('dateTo') || '';
	const myLists = url.searchParams.get('myLists') === 'true';

	const offset = (page - 1) * limit;

	// Get current user if authenticated
	let currentUserId = null;
	if (myLists) {
		try {
			const { session, user } = await locals.safeGetSession();
			if (session && user) {
				currentUserId = user.id;
			}
		} catch (err) {
			console.error('Error getting user session:', err);
		}
	}

	// Build query - use song_lists table directly if filtering by user, otherwise use public_song_lists view
	let query;
	if (myLists && currentUserId) {
		query = supabaseAdmin
			.from('song_lists')
			.select(
				'id, name, description, created_at, user_id, creator_username, song_count, is_public',
				{
					count: 'exact'
				}
			)
			.eq('user_id', currentUserId);
	} else {
		query = supabaseAdmin
			.from('public_song_lists')
			.select('id, name, description, created_at, creator_id, creator_username, song_count', {
				count: 'exact'
			});
	}

	// Apply filters
	if (search) {
		query = query.or(
			`name.ilike.%${search}%,description.ilike.%${search}%,creator_username.ilike.%${search}%`
		);
	}

	if (name) {
		query = query.ilike('name', `%${name}%`);
	}

	if (description) {
		query = query.ilike('description', `%${description}%`);
	}

	if (creator) {
		query = query.ilike('creator_username', `%${creator}%`);
	}

	if (dateFrom) {
		query = query.gte('created_at', dateFrom);
	}

	if (dateTo) {
		const dateToEnd = new Date(dateTo);
		dateToEnd.setDate(dateToEnd.getDate() + 1);
		query = query.lt('created_at', dateToEnd.toISOString());
	}

	// Apply sorting and pagination
	query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

	const { data, error: supabaseError, count } = await query;

	if (supabaseError) {
		throw error(500, {
			message: supabaseError.message,
			devHelper: '/songlist server load'
		});
	}

	// Fetch user's favorites if authenticated
	let favoriteIds = [];
	try {
		const { session, user } = await locals.safeGetSession();
		if (session && user) {
			const { data: favorites } = await supabaseAdmin
				.from('user_favorite_lists')
				.select('list_id')
				.eq('user_id', user.id);

			favoriteIds = (favorites || []).map((f) => f.list_id);
		}
	} catch (err) {
		console.error('Error fetching favorites:', err);
		// Continue without favorites if there's an error
	}

	return {
		publicLists: data || [],
		pagination: {
			page,
			limit,
			total: count || 0,
			totalPages: Math.ceil((count || 0) / limit)
		},
		filters: {
			search,
			name,
			description,
			creator,
			dateFrom,
			dateTo,
			myLists
		},
		favoriteIds
	};
};
