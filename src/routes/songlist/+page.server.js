// @ts-nocheck
import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';

export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const limit = 12;
	const search = url.searchParams.get('search') || '';
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';
	const creator = url.searchParams.get('creator') || '';
	const dateFrom = url.searchParams.get('dateFrom') || '';
	const dateTo = url.searchParams.get('dateTo') || '';

	let session = null;
	let user = null;
	try {
		({ session, user } = await locals.safeGetSession());
	} catch (sessionError) {
		console.error('Error getting user session:', sessionError);
	}

	const requestedFavorites = url.searchParams.get('favorite') === 'true';
	const requestedMine = url.searchParams.get('myLists') === 'true';
	const favorite = Boolean(session && user && requestedFavorites);
	const myLists = Boolean(session && user && requestedMine && !favorite);

	let favoriteIds = [];
	if (user) {
		const { data: favorites, error: favoritesError } = await supabaseAdmin
			.from('user_favorite_lists')
			.select('list_id')
			.eq('user_id', user.id);
		if (favoritesError) console.error('Error fetching favorites:', favoritesError);
		favoriteIds = (favorites || []).map((item) => item.list_id);
	}

	const buildQuery = () => {
		let query = myLists
			? supabaseAdmin
					.from('song_lists')
					.select(
						'id, name, description, created_at, user_id, creator_username, song_count, is_public'
					)
					.eq('user_id', user.id)
			: supabaseAdmin
					.from('public_song_lists')
					.select('id, name, description, created_at, creator_id, creator_username, song_count');

		if (search)
			query = query.or(
				`name.ilike.%${search}%,description.ilike.%${search}%,creator_username.ilike.%${search}%`
			);
		if (name) query = query.ilike('name', `%${name}%`);
		if (description) query = query.ilike('description', `%${description}%`);
		if (creator) query = query.ilike('creator_username', `%${creator}%`);
		if (dateFrom) query = query.gte('created_at', dateFrom);
		if (dateTo) {
			const endDate = new Date(dateTo);
			endDate.setUTCDate(endDate.getUTCDate() + 1);
			query = query.lt('created_at', endDate.toISOString());
		}
		return query.order('created_at', { ascending: false });
	};

	const { data: allLists, error: supabaseError } = await fetchAllPages(buildQuery);
	if (supabaseError) {
		throw error(500, { message: supabaseError.message, devHelper: '/songlist server load' });
	}

	const favoriteSet = new Set(favoriteIds);
	const scopedLists = favorite ? allLists.filter((list) => favoriteSet.has(list.id)) : allLists;
	const total = scopedLists.length;
	const offset = (page - 1) * limit;

	return {
		publicLists: scopedLists.slice(offset, offset + limit),
		pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
		filters: { search, name, description, creator, dateFrom, dateTo, myLists, favorite },
		favoriteIds
	};
};
