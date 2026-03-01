import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateQuizMetadata } from '$lib/utils/quizMetadata.js';

/**
 * Load public quiz configurations with optional filtering and pagination
 * No authentication required, but favorites are only available for authenticated users
 */
// @ts-ignore
export const load = async ({ url, locals }) => {
	const supabaseAdmin = createSupabaseAdmin();

	// Parse query parameters
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 10; // Fixed at 10 per page
	const search = url.searchParams.get('search') || '';
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';
	const creator = url.searchParams.get('creator') || '';
	const dateFrom = url.searchParams.get('dateFrom') || '';
	const dateTo = url.searchParams.get('dateTo') || '';
	const myQuizzes = url.searchParams.get('myQuizzes') === 'true';
	const sortBy = url.searchParams.get('sortBy') || 'newest'; // newest, trending, mostLiked, mostPlayed

	const offset = (page - 1) * limit;

	// Get current user if authenticated
	let currentUserId = null;
	if (myQuizzes) {
		try {
			const { session, user } = await locals.safeGetSession();
			if (session && user) {
				currentUserId = user.id;
			}
		} catch (err) {
			console.error('Error getting user session:', err);
		}
	}

	// Build query - use quiz_configurations table directly if filtering by user, otherwise use public_quiz_configurations view
	let query;
	if (myQuizzes && currentUserId) {
		query = supabaseAdmin
			.from('quiz_configurations')
			.select(
				'id, name, description, created_at, updated_at, user_id, creator_username, is_public, allow_remixing, play_token, quiz_metadata, configuration_data',
				{
					count: 'exact'
				}
			)
			.eq('user_id', currentUserId);
	} else {
		query = supabaseAdmin
			.from('public_quiz_configurations')
			.select('id, name, description, created_at, updated_at, creator_id, creator_username, allow_remixing, play_token, quiz_metadata', {
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
		// Add one day to include the entire end date
		const endDate = new Date(dateTo);
		endDate.setDate(endDate.getDate() + 1);
		query = query.lt('created_at', endDate.toISOString());
	}

	// Apply ordering based on sortBy parameter
	if (sortBy === 'newest') {
		query = query.order('created_at', { ascending: false });
	} else if (sortBy === 'trending') {
		query = query.order('created_at', { ascending: false });
	} else {
		query = query.order('created_at', { ascending: false });
	}

	// Apply pagination
	query = query.range(offset, offset + limit - 1);

	const { data: quizzes, error: dbError, count } = await query;

	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, { message: 'Failed to load quiz configurations' });
	}

	// Fetch stats for all quizzes
	let quizzesWithStats = quizzes || [];
	if (quizzesWithStats.length > 0) {
		const quizIds = quizzesWithStats.map(q => q.id);
		const { data: statsData } = await supabaseAdmin
			.from('quiz_stats')
			.select('quiz_id, likes, plays')
			.in('quiz_id', quizIds);

		// Create a map of quiz_id -> stats
		const statsMap = {};
		if (statsData) {
			statsData.forEach(stat => {
				statsMap[stat.quiz_id] = {
					likes: stat.likes || 0,
					plays: stat.plays || 0
				};
			});
		}

		quizzesWithStats = quizzesWithStats.map(quiz => {
			let updatedMetadata = quiz.quiz_metadata;
			if (quiz.configuration_data && (!updatedMetadata || !updatedMetadata.sourceNodes)) {
				try {
					updatedMetadata = generateQuizMetadata(quiz.configuration_data);
				} catch (err) {
					console.error(`Error regenerating metadata for quiz ${quiz.id}:`, err);
					// Keep existing metadata if regeneration fails
				}
			}

			return {
				...quiz,
				likes: statsMap[quiz.id]?.likes || 0,
				plays: statsMap[quiz.id]?.plays || 0,
				quiz_metadata: updatedMetadata
			};
		});

		// If sorting by likes or plays, sort the array
		if (sortBy === 'mostLiked') {
			quizzesWithStats.sort((a, b) => (b.likes || 0) - (a.likes || 0));
		} else if (sortBy === 'mostPlayed') {
			quizzesWithStats.sort((a, b) => (b.plays || 0) - (a.plays || 0));
		} else if (sortBy === 'trending') {
			quizzesWithStats.sort((a, b) => {
				const scoreA = (a.plays || 0) * 0.3 + (a.likes || 0) * 0.7;
				const scoreB = (b.plays || 0) * 0.3 + (b.likes || 0) * 0.7;
				return scoreB - scoreA;
			});
		}
	}

	// Fetch user's favorites if authenticated
	let favoriteIds = [];
	try {
		const { session, user } = await locals.safeGetSession();
		if (session && user) {
			const { data: favorites } = await supabaseAdmin
				.from('user_favorite_quizzes')
				.select('quiz_id')
				.eq('user_id', user.id);

			favoriteIds = (favorites || []).map((f) => f.quiz_id);
		}
	} catch (err) {
	}

	return {
		quizzes: quizzesWithStats,
		favoriteIds,
		pagination: {
			page,
			limit,
			totalItems: count || 0,
			totalPages: Math.ceil((count || 0) / limit)
		},
		filters: {
			search,
			name,
			description,
			creator,
			dateFrom,
			dateTo,
			myQuizzes,
			sortBy
		}
	};
};
