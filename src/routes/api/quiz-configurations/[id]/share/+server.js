import { json, error } from '@sveltejs/kit';
import { generateShareToken } from '$lib/utils/token.js';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * POST /api/quiz-configurations/[id]/share
 * Generates or retrieves share tokens for a quiz configuration
 * 
 * @param {Object} event - Request event
 * @param {Object} event.params - Route parameters
 * @param {string} event.params.id - Quiz configuration ID
 * @param {Object} event.locals - SvelteKit locals object
 * @param {Request} event.request - Request object
 * @returns {Promise<Response>} Share token response
 */
export async function POST({ params, locals, request }) {
  try {
    const { id } = params;
    const { session, user } = await locals.safeGetSession();

    // Get share_token from request body if provided (for guest users)
    const body = await request.json().catch(() => ({}));
    const shareTokenFromBody = body.share_token;

    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the quiz to check authorization
    const { data: quiz, error: fetchError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, share_token, play_token, is_public')
      .eq('id', id)
      .single();

    if (fetchError || !quiz) {
      return error(404, { message: 'Quiz not found' });
    }

    // Authorization check: must be owner OR have valid share token
    const isOwner = session && user && quiz.user_id === user.id;
    const hasValidShareToken = shareTokenFromBody && quiz.share_token === shareTokenFromBody;

    if (!isOwner && !hasValidShareToken) {
      return error(401, { message: 'Unauthorized' });
    }

    // Public quizzes should not have share tokens
    if (quiz.is_public) {
      return error(403, { 
        message: 'Public quizzes do not use edit tokens. Only the quiz owner can edit public quizzes.' 
      });
    }

    // Check if tokens already exist
    let shareToken = quiz.share_token;
    let playToken = quiz.play_token;
    let needsUpdate = false;

    // Generate missing tokens
    if (!shareToken) {
      shareToken = generateShareToken();
      needsUpdate = true;
    }
    if (!playToken) {
      playToken = generateShareToken();
      needsUpdate = true;
    }

    // Update quiz with generated tokens if needed
    if (needsUpdate) {
      const updateData = {};
      if (!quiz.share_token) updateData.share_token = shareToken;
      if (!quiz.play_token) updateData.play_token = playToken;
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('quiz_configurations')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('Database error:', updateError);
        return error(500, { message: 'Failed to generate share tokens' });
      }
    }

    return json({ shareToken, playToken });
  } catch (err) {
    console.error('Error generating share token:', err);
    return error(500, { message: 'Internal server error' });
  }
}

/**
 * PUT /api/quiz-configurations/[id]/share
 * Regenerates share tokens for a quiz configuration
 * 
 * @param {Object} event - Request event
 * @param {Object} event.params - Route parameters
 * @param {string} event.params.id - Quiz configuration ID
 * @param {Object} event.locals - SvelteKit locals object
 * @param {Request} event.request - Request object
 * @returns {Promise<Response>} Updated share token response
 */
export async function PUT({ params, locals, request }) {
  try {
    const { id } = params;
    const { session, user } = await locals.safeGetSession();

    const body = await request.json();
    const { tokenType, share_token: shareTokenFromBody } = body; // 'share', 'play', or 'both'

    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the quiz to check authorization
    const { data: quiz, error: fetchError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, share_token, play_token, is_public')
      .eq('id', id)
      .single();

    if (fetchError || !quiz) {
      return error(404, { message: 'Quiz not found' });
    }

    // Authorization check: must be owner OR have valid share token
    const isOwner = session && user && quiz.user_id === user.id;
    const hasValidShareToken = shareTokenFromBody && quiz.share_token === shareTokenFromBody;

    if (!isOwner && !hasValidShareToken) {
      return error(401, { message: 'Unauthorized' });
    }

    // Public quizzes should not have share tokens
    if (quiz.is_public && (tokenType === 'share' || tokenType === 'both')) {
      return error(403, { 
        message: 'Public quizzes do not use edit tokens. Only the quiz owner can edit public quizzes.' 
      });
    }

    let updateData = {
      updated_at: new Date().toISOString()
    };

    // Generate new tokens based on type
    if (tokenType === 'share' || tokenType === 'both') {
      updateData.share_token = generateShareToken();
    }
    if (tokenType === 'play' || tokenType === 'both') {
      updateData.play_token = generateShareToken();
    }

    // Update quiz with new tokens
    const { error: updateError } = await supabaseAdmin
      .from('quiz_configurations')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Database error:', updateError);
      return error(500, { message: 'Failed to regenerate tokens' });
    }

    // Return the current tokens (updated ones)
    const result = {};
    if (tokenType === 'share' || tokenType === 'both') {
      result.shareToken = updateData.share_token;
    }
    if (tokenType === 'play' || tokenType === 'both') {
      result.playToken = updateData.play_token;
    }

    return json(result);
  } catch (err) {
    console.error('Error regenerating tokens:', err);
    return error(500, { message: 'Internal server error' });
  }
}
