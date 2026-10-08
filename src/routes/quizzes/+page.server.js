import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { generateQuizMetadata } from '$lib/utils/quizMetadata.js';

// @ts-ignore
export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const limit = 10;
	const search = url.searchParams.get('search') || '';
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';
	const creator = url.searchParams.get('creator') || '';
	const dateFrom = url.searchParams.get('dateFrom') || '';
	const dateTo = url.searchParams.get('dateTo') || '';
	const sortBy = url.searchParams.get('sortBy') || 'newest';

	let session = null;
	let user = null;
	try {
		({ session, user } = await locals.safeGetSession());
	} catch (sessionError) {
		console.error('Error getting user session:', sessionError);
	}

	const requestedFavorites = url.searchParams.get('favorite') === 'true';
	const requestedMine = url.searchParams.get('myQuizzes') === 'true';
	const favorite = Boolean(session && user && requestedFavorites);
	const myQuizzes = Boolean(session && user && requestedMine && !favorite);

	let favoriteIds = [];
	let likedQuizIds = [];
	if (user) {
		const [{ data: favorites }, { data: likes, error: likesError }] = await Promise.all([
			supabaseAdmin.from('user_favorite_quizzes').select('quiz_id').eq('user_id', user.id),
			supabaseAdmin.from('quiz_likes').select('quiz_id').eq('user_id', user.id)
		]);
		favoriteIds = (favorites || []).map((item) => item.quiz_id);
		// Keep browse usable during a rolling deploy before the additive migration lands.
		if (!likesError) likedQuizIds = (likes || []).map((item) => item.quiz_id);
	}

	const buildQuery = () => {
		let query = myQuizzes
			? supabaseAdmin
					.from('quiz_configurations')
					.select(
						'id, name, description, created_at, updated_at, user_id, creator_username, is_public, allow_remixing, play_token, quiz_metadata, configuration_data'
					)
					.eq('user_id', user.id)
			: supabaseAdmin
					.from('public_quiz_configurations')
					.select(
						'id, name, description, created_at, updated_at, creator_id, creator_username, allow_remixing, play_token, quiz_metadata'
					);

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

	const { data: allQuizzes, error: dbError } = await fetchAllPages(buildQuery);
	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, { message: 'Failed to load quiz configurations' });
	}

	let scopedQuizzes = allQuizzes || [];
	if (favorite) {
		const favoriteSet = new Set(favoriteIds);
		scopedQuizzes = scopedQuizzes.filter((quiz) => favoriteSet.has(quiz.id));
	}

	const quizIds = scopedQuizzes.map((quiz) => quiz.id);
	const statsMap = new Map();
	for (let index = 0; index < quizIds.length; index += 500) {
		const ids = quizIds.slice(index, index + 500);
		const { data: statsData, error: statsError } = await supabaseAdmin
			.from('quiz_stats')
			.select('quiz_id, likes, plays')
			.in('quiz_id', ids);
		if (statsError) {
			console.error('Error fetching quiz statistics:', statsError);
			continue;
		}
		for (const stat of statsData || []) statsMap.set(stat.quiz_id, stat);
	}

	scopedQuizzes = scopedQuizzes.map((quiz) => ({
		...quiz,
		likes: statsMap.get(quiz.id)?.likes || 0,
		plays: statsMap.get(quiz.id)?.plays || 0
	}));

	const newestFirst = (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
	if (sortBy === 'mostLiked') {
		scopedQuizzes.sort((a, b) => b.likes - a.likes || newestFirst(a, b));
	} else if (sortBy === 'mostPlayed') {
		scopedQuizzes.sort((a, b) => b.plays - a.plays || newestFirst(a, b));
	} else if (sortBy === 'trending') {
		scopedQuizzes.sort(
			(a, b) => b.plays * 0.3 + b.likes * 0.7 - (a.plays * 0.3 + a.likes * 0.7) || newestFirst(a, b)
		);
	} else {
		scopedQuizzes.sort(newestFirst);
	}

	const totalItems = scopedQuizzes.length;
	const offset = (page - 1) * limit;
	const quizzes = scopedQuizzes.slice(offset, offset + limit).map((quiz) => {
		if (!quiz.configuration_data || (quiz.quiz_metadata && quiz.quiz_metadata.sourceNodes))
			return quiz;
		try {
			return { ...quiz, quiz_metadata: generateQuizMetadata(quiz.configuration_data) };
		} catch (metadataError) {
			console.error(`Error regenerating metadata for quiz ${quiz.id}:`, metadataError);
			return quiz;
		}
	});

	return {
		quizzes,
		favoriteIds,
		likedQuizIds,
		pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
		filters: { search, name, description, creator, dateFrom, dateTo, myQuizzes, favorite, sortBy }
	};
};
