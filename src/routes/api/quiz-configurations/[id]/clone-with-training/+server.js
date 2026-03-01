/**
 * POST /api/quiz-configurations/[id]/clone-with-training
 * Clones an existing quiz configuration and copies training data for the authenticated user.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateShareToken } from '$lib/utils/token.js';
import { cloneTrainingData } from '$lib/server/training/clone-training-data.js';

// @ts-ignore
export async function POST({ params, locals }) {
  const { session, user } = await locals.safeGetSession();

  if (!session || !user) {
    return error(401, { message: 'You must be logged in to clone quizzes' });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the original quiz configuration
    const { data: originalQuiz, error: fetchError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('name, description, is_public, allow_remixing, configuration_data, creator_username')
      .eq('id', params.id)
      .single();

    if (fetchError) {
      console.error('Database error:', fetchError);
      return error(404, { message: 'Quiz configuration not found' });
    }

    // Check if the user has permission to clone this quiz
    // Must be public with allow_remixing enabled, or owner
    if (!originalQuiz.is_public) {
      // For private quizzes, only the owner can clone
      const { data: ownerCheck, error: ownerCheckError } = await supabaseAdmin
        .from('quiz_configurations')
        .select('user_id')
        .eq('id', params.id)
        .single();

      if (ownerCheckError || ownerCheck.user_id !== user.id) {
        return error(403, { message: 'You do not have permission to clone this quiz' });
      }
    } else if (!originalQuiz.allow_remixing) {
      // For public quizzes, allow_remixing must be enabled to clone
      return error(403, { message: 'This quiz does not allow remixing' });
    }

    // Create the cloned quiz
    const clonedName = `${originalQuiz.name} (Copy)`;

    // Generate tokens for the cloned quiz
    const shareToken = generateShareToken();
    const playToken = generateShareToken();

    const { data: clonedQuiz, error: createError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: user.id,
        name: clonedName,
        description: originalQuiz.description,
        is_public: false,
        configuration_data: originalQuiz.configuration_data,
        creator_username: user.user_metadata?.username || originalQuiz.creator_username || 'Unknown',
        share_token: shareToken,
        play_token: playToken,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      return error(500, { message: createError.message });
    }

    const trainingClone = await cloneTrainingData(supabaseAdmin, {
      sourceQuizId: params.id,
      targetQuizId: clonedQuiz.id,
      userId: user.id
    });

    return json({ data: clonedQuiz, success: true, trainingClone });
  } catch (err) {
    console.error('Error cloning quiz with training data:', err);
    if (err.status && err.body) {
      throw err;
    }
    return error(500, { message: err.message || 'Failed to clone quiz configuration' });
  }
}
