/**
 * Quiz configuration load API endpoint.
 * Fetches a specific quiz configuration's full data including nodes and edges.
 *
 * @module quizConfigurationLoadAPI
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { isAdmin } from '$lib/server/auth-utils.js';

/**
 * Load response structure.
 * @typedef {Object} LoadResponse
 * @property {boolean} success - Whether the load was successful
 * @property {Object} configuration_data - Quiz configuration data (nodes, edges, metadata)
 * @property {string} name - Quiz name
 * @property {string} [error] - Error message if load failed
 */

/**
 * GET /api/quiz-configurations/[id]/load
 * Fetches a specific quiz configuration's full data
 * Requires authentication - only the owner can load their private quizzes
 * Public quizzes can be loaded by anyone
 *
 * @param {Object} event - Request event
 * @param {Object} event.params - Route parameters
 * @param {string} event.params.id - Quiz configuration ID
 * @param {Object} event.locals - SvelteKit locals object
 * @param {URL} event.url - Request URL
 * @returns {Promise<Response>} Load response with configuration data
 */
export async function GET({ params, locals, url }) {
	const { session, user } = await locals.safeGetSession();
	const shareToken = url.searchParams.get('share_token');

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch the quiz configuration
		const { data: quizData, error: dbError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id, user_id, name, description, is_public, allow_remixing, configuration_data, creator_username, play_token, share_token')
			.eq('id', params.id)
			.single();

		if (dbError) {
			// Return specific error based on database error code
			if (dbError.code === 'PGRST116') {
				// No rows returned - don't log this as it's expected when quizzes are deleted
				throw error(404, { message: 'Quiz not found' });
			}

			// Only log unexpected database errors
			console.error('Database error:', dbError);
			throw error(404, { message: 'Quiz configuration not found' });
		}

		if (!quizData) {
			throw error(404, { message: 'Quiz not found' });
		}

		// Check if share token is provided and valid
		const hasValidShareToken = shareToken && quizData.share_token === shareToken;
		const isOwner = session && user && quizData.user_id === user.id;
		const userIsAdmin = session && user && isAdmin(user);

		// Check permissions: must be owner, admin, have valid share token, or quiz must be public
		if (!quizData.is_public && !hasValidShareToken && !userIsAdmin) {
			if (!session || !user || quizData.user_id !== user.id) {
				throw error(403, { message: 'You do not have permission to load this quiz' });
			}
		}

		// Check if quiz allows remixing - non-owners cannot load configuration if allow_remixing is false
		// UNLESS they have a valid share token OR are admin
		if (quizData.allow_remixing === false && !isOwner && !hasValidShareToken && !userIsAdmin) {
			throw error(403, {
				message: 'This quiz does not allow remixing. You can only play it, not view or edit the configuration.'
			});
		}

		return json({
			configuration_data: quizData.configuration_data,
			name: quizData.name,
			description: quizData.description,
			is_public: quizData.is_public,
			allow_remixing: quizData.allow_remixing,
			user_id: quizData.user_id,
			creator_username: quizData.creator_username,
			play_token: quizData.play_token,
			// Only expose share_token for private quizzes when user is owner or has valid token
			share_token: !quizData.is_public && (isOwner || hasValidShareToken) ? quizData.share_token : undefined
		});
	} catch (err) {
		// If it's already an HttpError, throw it without logging (404s are expected for deleted quizzes)
		if (err.status && err.body) {
			throw err;
		}
		// Only log unexpected errors
		console.error('Error loading quiz configuration:', err);
		// For other errors, throw proper error code
		throw error(500, { message: 'Failed to load quiz configuration' });
	}
}
