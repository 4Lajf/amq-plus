/**
 * Temporary Quiz Configurations API endpoint
 * Allows non-logged-in users to save quizzes temporarily (deleted after 72 hours of inactivity)
 * 
 * @module api/quiz-configurations/temporary
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateShareToken } from '$lib/utils/token.js';

/**
 * POST /api/quiz-configurations/temporary
 * Creates a temporary quiz configuration without authentication
 * Will be automatically deleted after 72 hours of no plays
 * 
 * @param {Object} params - SvelteKit request parameters
 * @param {Request} params.request - Incoming request with JSON body
 * @returns {Promise<Response>} JSON response with created quiz configuration data
 * @throws {400} If required fields are missing
 * @throws {500} If database operation fails
 * 
 * Request body:
 * @typedef {Object} CreateTemporaryQuizRequest
 * @property {string} name - Quiz name
 * @property {string} [description] - Optional description
 * @property {Object} configuration_data - JSONB data containing nodes and edges
 * @property {string} creator_username - Username of creator (or 'Guest')
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const { name, description, configuration_data, quiz_metadata, creator_username } = body;

    // Validate required fields
    if (!name || !configuration_data) {
      return error(400, { message: 'Missing required fields (name, configuration_data)' });
    }

    // Validate name length (max 64 characters)
    if (name.trim().length > 64) {
      return error(400, { message: 'Quiz name must be 64 characters or less' });
    }

    // Validate description length (max 512 characters)
    if (description && description.length > 512) {
      return error(400, { message: 'Quiz description must be 512 characters or less' });
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Generate both share and play tokens for the temporary quiz
    const shareToken = generateShareToken();
    const playToken = generateShareToken();

    // Create temporary quiz (no user_id, always private)
    const { data, error: dbError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: null, // No user association
        name: name.trim(),
        description: description?.trim() || null,
        is_public: false, // Temporary quizzes are private, accessible via share token
        is_temporary: true, // Mark as temporary for automatic cleanup
        configuration_data,
        quiz_metadata: quiz_metadata || null,
        creator_username: creator_username || 'Guest',
        share_token: shareToken,
        play_token: playToken,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('[API: Temporary Quiz] Database error:', dbError);
      return error(500, { message: dbError.message });
    }

    console.log(`[API: Temporary Quiz] Created temporary quiz: ${data.id}`);

    return json({
      data,
      created: true,
      warning: 'This quiz will be deleted after 72 hours of inactivity. Sign in to save permanently.'
    });
  } catch (err) {
    console.error('[API: Temporary Quiz] Error saving temporary quiz:', err);
    return error(500, { message: 'Failed to save temporary quiz configuration' });
  }
}

