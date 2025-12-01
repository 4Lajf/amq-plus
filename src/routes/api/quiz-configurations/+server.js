/**
 * Quiz Configurations API endpoint for managing user quiz configurations.
 * Handles CRUD operations for quiz configurations with authentication and authorization.
 *
 * @module api/quiz-configurations
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateShareToken } from '$lib/utils/token.js';
import { isAdmin } from '$lib/server/auth-utils.js';
import { validateSongListAccess, extractSongListIds } from '$lib/server/song-list-utils.js';

/**
 * GET /api/quiz-configurations
 * Fetches all quiz configurations for the authenticated user (private quizzes).
 *
 * @param {Object} params - SvelteKit request parameters
 * @param {Object} params.locals - Request locals containing session
 * @returns {Promise<Response>} JSON response with array of quiz configurations
 * @throws {401} If user is not authenticated
 * @throws {500} If database operation fails
 */
export async function GET({ locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to view your quizzes' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch user's quiz configurations (excluding configuration_data for list view)
		const { data, error: dbError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id, user_id, name, description, is_public, allow_remixing, created_at, updated_at, creator_username')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		if (dbError) {
			console.error('Database error:', dbError);
			throw error(500, { message: dbError.message });
		}

		return json({ data });
	} catch (err) {
		console.error('Error fetching quiz configurations:', err);
		// If it's already an HttpError, throw it
		if (err.status && err.body) {
			throw err;
		}
		// For other errors, throw proper error code
		throw error(500, { message: 'Failed to fetch quiz configurations' });
	}
}

/**
 * POST /api/quiz-configurations
 * Creates a new quiz configuration or updates an existing one.
 *
 * @param {Object} params - SvelteKit request parameters
 * @param {Request} params.request - Incoming request with JSON body
 * @param {Object} params.locals - Request locals containing session
 * @returns {Promise<Response>} JSON response with created/updated quiz configuration data
 * @throws {400} If required fields are missing
 * @throws {401} If user is not authenticated
 * @throws {500} If database operation fails
 *
 * Request body:
 * @typedef {Object} CreateQuizConfigurationRequest
 * @property {string} name - Quiz name
 * @property {string} [description] - Optional description
 * @property {boolean} [is_public] - Whether quiz is public
 * @property {boolean} [allow_remixing] - Whether quiz can be cloned/edited by others
 * @property {Object} configuration_data - JSONB data containing nodes and edges
 * @property {string} creator_username - Username of creator
 * @property {string} [existingQuizId] - Optional ID for updating existing quiz
 */
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	try {
		const body = await request.json();
		const { name, description, is_public, allow_remixing, configuration_data, quiz_metadata, creator_username, existingQuizId, share_token } =
			body;

		// Validate required fields
		if (!name || !configuration_data || !creator_username) {
			throw error(400, { message: 'Missing required fields' });
		}

		// Validate name length (max 64 characters)
		if (name.trim().length > 64) {
			throw error(400, { message: 'Quiz name must be 64 characters or less' });
		}

		// Validate description length (max 512 characters)
		if (description && description.length > 512) {
			throw error(400, { message: 'Quiz description must be 512 characters or less' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Validate song list access for authenticated users creating/updating quizzes
		// This ensures users can only reference song lists they have permission to use
		if (session && user) {
			const userIsAdmin = isAdmin(user);
			const songListIds = extractSongListIds(configuration_data);
			
			if (songListIds.length > 0) {
				const validationResults = await Promise.all(
					songListIds.map(listId => validateSongListAccess(listId, user.id, userIsAdmin))
				);
				
				const unauthorizedLists = validationResults.filter(result => !result.authorized);
				
				if (unauthorizedLists.length > 0) {
					const listNames = unauthorizedLists.map(r => `"${r.listName}" (${r.reason})`).join(', ');
					throw error(403, { 
						message: `You do not have permission to use the following song lists: ${listNames}` 
					});
				}
			}
		}

		if (existingQuizId) {
			// Update existing quiz
			let existingQuiz;
			let authMethod = null; // 'ownership' or 'share_token'

			// Check authentication method
			if (session && user) {
				// User is logged in - first try ownership, then share token if provided
				const { data: ownershipData, error: ownershipError } = await supabaseAdmin
					.from('quiz_configurations')
					.select('share_token, play_token, user_id, is_public')
					.eq('id', existingQuizId)
					.eq('user_id', user.id)
					.single();

				if (!ownershipError && ownershipData) {
					// User owns the quiz
					existingQuiz = ownershipData;
					authMethod = 'ownership';
				} else if (share_token) {
					// Not the owner, but has share token - verify it
					const { data: shareData, error: shareError } = await supabaseAdmin
						.from('quiz_configurations')
						.select('share_token, play_token, user_id, is_public')
						.eq('id', existingQuizId)
						.eq('share_token', share_token)
						.single();

					if (shareError || !shareData) {
						throw error(403, { message: 'Invalid share token' });
					}
					
					// Reject share_token authentication for public quizzes
					if (shareData.is_public) {
						throw error(403, { message: 'Public quizzes can only be edited by their owner' });
					}
					
					existingQuiz = shareData;
					authMethod = 'share_token';
				} else {
					throw error(404, { message: 'Quiz not found or access denied' });
				}
			} else if (share_token) {
				// User is not logged in - verify share token
				const { data, error: fetchError } = await supabaseAdmin
					.from('quiz_configurations')
					.select('share_token, play_token, user_id, is_public')
					.eq('id', existingQuizId)
					.eq('share_token', share_token)
					.single();

				if (fetchError || !data) {
					throw error(403, { message: 'Invalid share token' });
				}
				
				// Reject share_token authentication for public quizzes
				if (data.is_public) {
					throw error(403, { message: 'Public quizzes can only be edited by their owner' });
				}
				
				existingQuiz = data;
				authMethod = 'share_token';
			} else {
				throw error(401, { message: 'Authentication required' });
			}

			const updateData = {
				name,
				description: description || null,
				is_public: is_public || false,
				allow_remixing: allow_remixing || false,
				configuration_data,
				quiz_metadata: quiz_metadata || null,
				updated_at: new Date().toISOString(),
				creator_username
			};

			// Handle tokens based on visibility
			if (is_public) {
				// Public quizzes should not have share tokens
				updateData.share_token = null;
			} else {
				// Private quizzes: generate share token if missing
				if (!existingQuiz?.share_token) {
					updateData.share_token = generateShareToken();
				}
			}
			
			// Always generate play token if missing
			if (!existingQuiz?.play_token) {
				updateData.play_token = generateShareToken();
			}

			// Build the query conditionally based on authentication method
			let updateQuery = supabaseAdmin
				.from('quiz_configurations')
				.update(updateData)
				.eq('id', existingQuizId);

			// Add ownership check based on authentication method
			if (authMethod === 'ownership') {
				updateQuery = updateQuery.eq('user_id', user.id);
			} else if (authMethod === 'share_token') {
				updateQuery = updateQuery.eq('share_token', share_token);
			}

			const { data, error: dbError } = await updateQuery.select('id, name, description, is_public, allow_remixing, configuration_data, quiz_metadata, creator_username, share_token, play_token, user_id, created_at, updated_at').single();

			if (dbError) {
				console.error('Database error:', dbError);
				throw error(500, { message: dbError.message });
			}

			return json({ data, updated: true });
		} else {
			// Create new quiz - requires authentication
			if (!session || !user) {
				throw error(401, { message: 'You must be logged in to create quizzes' });
			}

			// Generate tokens based on visibility
			// Public quizzes don't get share tokens, private quizzes do
			const shareToken = is_public ? null : generateShareToken();
			const playToken = generateShareToken();

			const { data, error: dbError } = await supabaseAdmin
				.from('quiz_configurations')
				.insert({
					user_id: user.id,
					name,
					description: description || null,
					is_public: is_public || false,
					allow_remixing: allow_remixing || false,
					configuration_data,
					quiz_metadata: quiz_metadata || null,
					creator_username,
					share_token: shareToken,
					play_token: playToken,
					created_at: new Date().toISOString()
				})
				.select('id, name, description, is_public, allow_remixing, configuration_data, quiz_metadata, creator_username, share_token, play_token, user_id, created_at, updated_at')
				.single();

			if (dbError) {
				console.error('Database error:', dbError);
				throw error(500, { message: dbError.message });
			}

			return json({ data, created: true });
		}
	} catch (err) {
		console.error('Error saving quiz configuration:', err);
		// If it's already an HttpError, throw it
		if (err.status && err.body) {
			throw err;
		}
		// For other errors, throw proper error code
		throw error(500, { message: 'Failed to save quiz configuration' });
	}
}
