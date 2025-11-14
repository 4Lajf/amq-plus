/**
 * Quiz Configuration Favorites API endpoint.
 * Handles user favorite quiz configurations.
 *
 * @module api/quiz-configurations/favorites
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/quiz-configurations/favorites
 * Fetches all favorite quiz configurations for the authenticated user
 * Requires authentication
 */
// @ts-ignore
export async function GET({ locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to view favorites' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch user's favorite quiz configurations
		const { data, error: dbError } = await supabaseAdmin
			.from('user_favorite_quizzes')
			.select(
				`
				quiz_id,
				created_at,
				public_quiz_configurations (*)
			`
			)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		// Extract the public_quiz_configurations data
		const favorites = (data || [])
			.map((fav) => ({
				...fav.public_quiz_configurations,
				favorited_at: fav.created_at
			}))
			.filter(Boolean);

		return json({ data: favorites });
	} catch (err) {
		console.error('Error fetching favorites:', err);
		return error(500, { message: 'Failed to fetch favorites' });
	}
}

/**
 * POST /api/quiz-configurations/favorites
 * Adds a quiz configuration to favorites
 *
 * Request body:
 * {
 *   quiz_id: string
 * }
 */
// @ts-ignore
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	try {
		const body = await request.json();
		const { quiz_id } = body;

		if (!quiz_id) {
			return error(400, { message: 'Missing quiz_id' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Check if already favorited
		const { data: existing } = await supabaseAdmin
			.from('user_favorite_quizzes')
			.select('*')
			.eq('user_id', user.id)
			.eq('quiz_id', quiz_id)
			.single();

		if (existing) {
			return error(400, { message: 'Quiz already in favorites' });
		}

		// Add to favorites
		const { data, error: dbError } = await supabaseAdmin
			.from('user_favorite_quizzes')
			.insert({
				user_id: user.id,
				quiz_id,
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ data, success: true });
	} catch (err) {
		console.error('Error adding to favorites:', err);
		return error(500, { message: 'Failed to add to favorites' });
	}
}

/**
 * DELETE /api/quiz-configurations/favorites
 * Removes a quiz configuration from favorites
 *
 * Request body:
 * {
 *   quiz_id: string
 * }
 */
// @ts-ignore
export async function DELETE({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	try {
		const body = await request.json();
		const { quiz_id } = body;

		if (!quiz_id) {
			return error(400, { message: 'Missing quiz_id' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		const { error: dbError } = await supabaseAdmin
			.from('user_favorite_quizzes')
			.delete()
			.eq('user_id', user.id)
			.eq('quiz_id', quiz_id);

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error removing from favorites:', err);
		return error(500, { message: 'Failed to remove from favorites' });
	}
}
