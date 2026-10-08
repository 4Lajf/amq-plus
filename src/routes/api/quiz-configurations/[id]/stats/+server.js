/**
 * Quiz Statistics API endpoint
 * Handles tracking plays and likes for quiz configurations
 * Can identify quizzes by ID or by name+description+creator
 *
 * @module api/quiz-configurations/[id]/stats
 */

import { json, error, isHttpError } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken } from '$lib/server/training/training-utils.js';

/**
 * Find quiz by name, description, and creator username
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {string} name - Quiz name (without "AMQ+ " prefix)
 * @param {string} description - Quiz description
 * @param {string} creatorUsername - Creator username
 * @returns {Promise<Object|null>} Quiz ID or null if not found
 */
async function findQuizByIdentifiers(supabaseAdmin, name, description, creatorUsername) {
	// Try exact match first
	let query = supabaseAdmin
		.from('quiz_configurations')
		.select('id')
		.eq('name', name)
		.eq('creator_username', creatorUsername);

	if (description) {
		query = query.eq('description', description);
	} else {
		query = query.is('description', null);
	}

	const { data, error: dbError } = await query.limit(1).maybeSingle();

	if (dbError) {
		console.error('Error finding quiz by identifiers:', dbError);
		return null;
	}

	return data?.id || null;
}

/**
 * POST /api/quiz-configurations/[id]/stats
 * Records play(s) for a quiz configuration
 * Can accept quiz ID in params or quiz identifiers in request body
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID (optional if body has identifiers)
 * @param {Request} params.request - Request with optional body containing name, description, creatorUsername, and optional playCount
 * @returns {Promise<Response>} Success response
 */
export async function POST({ params, request }) {
	try {
		const supabaseAdmin = createSupabaseAdmin();
		let quizId = params.id;
		let playCount = 1;

		// If no ID provided, try to find quiz by identifiers from request body
		if (!quizId) {
			try {
				const body = await request.json();
				const { name, description, creatorUsername, playCount: requestPlayCount } = body;

				if (!name || !creatorUsername) {
					return error(400, { message: 'Missing required fields: name and creatorUsername' });
				}

				playCount = requestPlayCount || 1;

				const cleanName = name.startsWith('AMQ+ ') ? name.substring(5) : name;
				console.log(
					`[DEBUG] [id]/stats POST: name="${name}", cleanName="${cleanName}", creator="${creatorUsername}", desc="${description}"`
				);

				quizId = await findQuizByIdentifiers(
					supabaseAdmin,
					cleanName,
					description || null,
					creatorUsername
				);
				console.log(`[DEBUG] First attempt (clean): quizId=${quizId}`);

				// If not found and name was cleaned, try with original name
				if (!quizId && cleanName !== name) {
					quizId = await findQuizByIdentifiers(
						supabaseAdmin,
						name,
						description || null,
						creatorUsername
					);
					console.log(`[DEBUG] Second attempt (original): quizId=${quizId}`);
				}

				if (!quizId) {
					return error(404, { message: 'Quiz not found with provided identifiers' });
				}
			} catch (e) {
				// If body parsing fails, try to use ID from params
				if (!quizId) {
					return error(400, { message: 'Invalid request body or missing quiz ID' });
				}
			}
		} else {
			// Try to get playCount from body if ID was provided in params
			try {
				const body = await request.json();
				playCount = body.playCount || 1;
			} catch (e) {
				// Body parsing failed, use default playCount of 1
			}
		}

		// Validate playCount
		const playsToAdd = Math.max(1, Math.min(parseInt(String(playCount)) || 1, 100)); // Cap at 100 to prevent abuse

		// Check if quiz exists
		const { data: quiz, error: fetchError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id')
			.eq('id', String(quizId))
			.single();

		if (fetchError || !quiz) {
			return error(404, { message: 'Quiz not found' });
		}

		// Increment play count by the specified amount (or create record if it doesn't exist)
		// First try to update existing record
		const { data: existingStats, error: checkError } = await supabaseAdmin
			.from('quiz_stats')
			.select('id, plays')
			.eq('quiz_id', quizId)
			.single();

		if (existingStats) {
			// Update existing record
			const { error: updateError } = await supabaseAdmin
				.from('quiz_stats')
				.update({
					plays: (existingStats.plays || 0) + playsToAdd,
					updated_at: new Date().toISOString()
				})
				.eq('id', existingStats.id);

			if (updateError) {
				console.error('Error updating quiz stats:', updateError);
				return error(500, { message: 'Failed to update quiz stats' });
			}
		} else {
			// Create new record
			const { error: insertError } = await supabaseAdmin.from('quiz_stats').insert({
				quiz_id: quizId,
				plays: playsToAdd,
				likes: 0
			});

			if (insertError) {
				console.error('Error creating quiz stats:', insertError);
				return error(500, { message: 'Failed to create quiz stats' });
			}
		}

		return json({ success: true, message: `${playsToAdd} play(s) recorded` });
	} catch (err) {
		console.error('Error recording play:', err);
		return error(500, { message: 'Failed to record play' });
	}
}

/**
 * PATCH /api/quiz-configurations/[id]/stats
 * Updates like/dislike state for a quiz configuration
 * Can accept quiz ID in params or quiz identifiers in request body
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID (optional if body has identifiers)
 * @param {Request} params.request - Request with JSON body containing likeState and optionally name, description, creatorUsername
 * @returns {Promise<Response>} Success response with updated stats
 */
// @ts-ignore - SvelteKit supplies locals on RequestEvent.
export async function PATCH({ params, request, locals }) {
	try {
		let body = {};
		try {
			body = await request.json();
		} catch {
			body = {};
		}
		const { likeState, name, description, creatorUsername, token } = body;

		// The website sends its cookie session. The connector runs on AMQ and has
		// no cookie for this origin, so it sends the same training token as suspend.
		let userId;
		if (token) {
			const validToken = await lookupToken(createSupabaseAdmin(), token);
			if (!validToken) return error(401, { message: 'Sign in to like a quiz' });
			userId = validToken.user_id;
		} else {
			const { session, user } = await locals.safeGetSession();
			if (!session || !user) return error(401, { message: 'Sign in to like a quiz' });
			userId = user.id;
		}

		if (likeState === undefined || ![1, 0].includes(likeState)) {
			return error(400, { message: 'Invalid likeState. Must be 1 (liked) or 0 (not liked)' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		let quizId = params.id;

		// If no ID provided, try to find quiz by identifiers from request body
		if (!quizId) {
			if (!name || !creatorUsername) {
				return error(400, { message: 'Missing required fields: name and creatorUsername' });
			}

			const cleanName = name.startsWith('AMQ+ ') ? name.substring(5) : name;

			quizId = await findQuizByIdentifiers(
				supabaseAdmin,
				cleanName,
				description || null,
				creatorUsername
			);

			// If not found and name was cleaned, try with original name
			if (!quizId && cleanName !== name) {
				quizId = await findQuizByIdentifiers(
					supabaseAdmin,
					name,
					description || null,
					creatorUsername
				);
			}

			if (!quizId) {
				return error(404, { message: 'Quiz not found with provided identifiers' });
			}
		}

		// Check if quiz exists
		const { data: quiz, error: fetchError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id')
			.eq('id', quizId)
			.single();

		if (fetchError || !quiz) {
			return error(404, { message: 'Quiz not found' });
		}

		let likeError;
		if (likeState === 1) {
			({ error: likeError } = await supabaseAdmin
				.from('quiz_likes')
				.upsert(
					{ user_id: userId, quiz_id: quizId },
					{ onConflict: 'user_id,quiz_id', ignoreDuplicates: true }
				));
		} else {
			({ error: likeError } = await supabaseAdmin
				.from('quiz_likes')
				.delete()
				.eq('user_id', userId)
				.eq('quiz_id', quizId));
		}

		if (likeError) {
			console.error('Error updating quiz like:', likeError);
			return error(500, { message: 'Failed to update like' });
		}

		const { data: updatedStats } = await supabaseAdmin
			.from('quiz_stats')
			.select('likes')
			.eq('quiz_id', quizId)
			.maybeSingle();

		return json({
			success: true,
			liked: likeState === 1,
			likes: updatedStats?.likes || 0,
			message: 'Like state updated'
		});
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('Error updating like state:', err);
		return error(500, { message: 'Failed to update like state' });
	}
}

/**
 * GET /api/quiz-configurations/[id]/stats
 * Gets statistics for a quiz configuration
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID
 * @returns {Promise<Response>} Quiz statistics
 */
export async function GET({ params }) {
	try {
		const { id } = params;
		const supabaseAdmin = createSupabaseAdmin();

		const { data: stats, error: fetchError } = await supabaseAdmin
			.from('quiz_stats')
			.select('likes, plays')
			.eq('quiz_id', id)
			.single();

		if (fetchError) {
			// Return default stats if record doesn't exist
			return json({ likes: 0, plays: 0 });
		}

		return json({
			likes: stats?.likes || 0,
			plays: stats?.plays || 0
		});
	} catch (err) {
		console.error('Error fetching quiz stats:', err);
		return error(500, { message: 'Failed to fetch quiz stats' });
	}
}
