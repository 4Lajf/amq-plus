/**
 * Quiz configuration load by share token API endpoint.
 * Fetches a specific quiz configuration's full data using a share token.
 *
 * @module quizConfigurationShareLoadAPI
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * Load response structure.
 * @typedef {Object} LoadResponse
 * @property {boolean} success - Whether the load was successful
 * @property {Object} configuration_data - Quiz configuration data (nodes, edges, metadata)
 * @property {string} name - Quiz name
 * @property {string} [error] - Error message if load failed
 */

/**
 * GET /api/quiz-configurations/share/[token]
 * Fetches a specific quiz configuration's full data using share token
 * No authentication required - share tokens provide access
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.token - Share token
 * @returns {Promise<Response>} Load response with configuration data
 */
export async function GET({ params }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the quiz configuration by share token
    const { data: quizData, error: dbError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, name, description, is_public, configuration_data, creator_username, share_token, play_token')
      .eq('share_token', params.token)
      .single();

    if (dbError) {
      // Return specific error based on database error code
      if (dbError.code === 'PGRST116') {
        // No rows returned - don't log this as it's expected when quizzes are deleted
        throw error(404, { message: 'Quiz not found with this share token' });
      }

      // Only log unexpected database errors
      console.error('Database error:', dbError);
      throw error(404, { message: 'Quiz configuration not found' });
    }

    if (!quizData) {
      throw error(404, { message: 'Quiz not found with this share token' });
    }

    return json({
      id: quizData.id,
      configuration_data: quizData.configuration_data,
      name: quizData.name,
      description: quizData.description,
      is_public: quizData.is_public,
      creator_username: quizData.creator_username,
      share_token: quizData.share_token,
      play_token: quizData.play_token
    });
  } catch (err) {
    // If it's already an HttpError, throw it without logging (404s are expected for deleted quizzes)
    if (err.status && err.body) {
      throw err;
    }

    // Only log unexpected errors
    console.error('Error loading quiz configuration by share token:', err);
    // For other errors, return proper error code
    throw error(500, { message: 'Failed to load quiz configuration' });
  }
}
