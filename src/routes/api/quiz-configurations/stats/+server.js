/**
 * Quiz Statistics API endpoint (by identifiers)
 * Handles tracking plays and likes for quiz configurations using name+description+creator
 * 
 * @module api/quiz-configurations/stats
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * Find quiz by name, description, and creator username
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {string} name - Quiz name (without "AMQ+ " prefix)
 * @param {string} description - Quiz description
 * @param {string} creatorUsername - Creator username
 * @returns {Promise<Object|null>} Quiz ID or null if not found
 */
async function findQuizByIdentifiers(supabaseAdmin, name, description, creatorUsername) {
  // Try exact match first (with description match if provided)
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

  let { data, error: dbError } = await query.limit(1).maybeSingle();

  if (dbError) {
    console.error('Error finding quiz by identifiers:', dbError);
    return null;
  }

  if (data?.id) {
    return data.id;
  }

  // If not found and description was provided, try without description (in case description was changed)
  if (description) {
    const fallbackQuery = supabaseAdmin
      .from('quiz_configurations')
      .select('id')
      .eq('name', name)
      .eq('creator_username', creatorUsername);

    const { data: fallbackData, error: fallbackError } = await fallbackQuery.limit(1).maybeSingle();

    if (!fallbackError && fallbackData?.id) {
      return fallbackData.id;
    }
  }

  return null;
}

/**
 * POST /api/quiz-configurations/stats
 * Records play(s) for a quiz configuration identified by name+description+creator
 * 
 * @param {Object} event - Request event
 * @param {Request} event.request - Request with JSON body containing name, description, creatorUsername, and optional playCount
 * @returns {Promise<Response>} Success response
 */
export async function POST({ request }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const body = await request.json();
    const { name, description, creatorUsername, playCount = 1 } = body;

    if (!name || !creatorUsername) {
      return error(400, { message: 'Missing required fields: name and creatorUsername' });
    }

    // Validate playCount
    const playsToAdd = Math.max(1, Math.min(parseInt(playCount) || 1, 100)); // Cap at 100 to prevent abuse

    const cleanName = name.startsWith('AMQ+ ') ? name.substring(5) : name;
    console.log(`[DEBUG] stats POST: name="${name}", cleanName="${cleanName}", creator="${creatorUsername}", desc="${description}"`);

    let quizId = await findQuizByIdentifiers(supabaseAdmin, cleanName, description || null, creatorUsername);
    console.log(`[DEBUG] First attempt (clean): quizId=${quizId}`);

    // If not found and name was cleaned, try with original name
    if (!quizId && cleanName !== name) {
      quizId = await findQuizByIdentifiers(supabaseAdmin, name, description || null, creatorUsername);
      console.log(`[DEBUG] Second attempt (original): quizId=${quizId}`);
    }

    if (!quizId) {
      return error(404, { message: 'Quiz not found with provided identifiers' });
    }

    // Increment play count by the specified amount (or create record if it doesn't exist)
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
        const errorMessage = updateError.message || 'Database update failed';
        return error(500, { message: `Failed to update quiz stats: ${errorMessage}` });
      }
    } else {
      // Create new record
      const { error: insertError } = await supabaseAdmin
        .from('quiz_stats')
        .insert({
          quiz_id: quizId,
          plays: playsToAdd,
          likes: 0
        });

      if (insertError) {
        console.error('Error creating quiz stats:', insertError);
        const errorMessage = insertError.message || 'Database insert failed';
        return error(500, { message: `Failed to create quiz stats: ${errorMessage}` });
      }
    }

    return json({ success: true, message: `${playsToAdd} play(s) recorded` });
  } catch (err) {
    console.error('Error recording play:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return error(500, { message: `Failed to record play: ${errorMessage}` });
  }
}

/**
 * PATCH /api/quiz-configurations/stats
 * Updates like/dislike state for a quiz configuration identified by name+description+creator
 * 
 * @param {Object} event - Request event
 * @param {Request} event.request - Request with JSON body containing likeState, name, description, creatorUsername
 * @returns {Promise<Response>} Success response with updated stats
 */
export async function PATCH({ request }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const body = await request.json();
    const { likeState, name, description, creatorUsername } = body; // 1 for like, -1 for dislike, 0 for neutral/remove

    if (likeState === undefined || ![1, -1, 0].includes(likeState)) {
      return error(400, { message: 'Invalid likeState. Must be 1 (like), -1 (dislike), or 0 (neutral)' });
    }

    if (!name || !creatorUsername) {
      return error(400, { message: 'Missing required fields: name and creatorUsername' });
    }

    const cleanName = name.startsWith('AMQ+ ') ? name.substring(5) : name;
    console.log(`[DEBUG] stats POST: name="${name}", cleanName="${cleanName}", creator="${creatorUsername}", desc="${description}"`);

    let quizId = await findQuizByIdentifiers(supabaseAdmin, cleanName, description || null, creatorUsername);
    console.log(`[DEBUG] First attempt (clean): quizId=${quizId}`);

    // If not found and name was cleaned, try with original name
    if (!quizId && cleanName !== name) {
      quizId = await findQuizByIdentifiers(supabaseAdmin, name, description || null, creatorUsername);
      console.log(`[DEBUG] Second attempt (original): quizId=${quizId}`);
    }

    if (!quizId) {
      return error(404, { message: 'Quiz not found with provided identifiers' });
    }

    // Get or create stats record
    const { data: existingStats, error: checkError } = await supabaseAdmin
      .from('quiz_stats')
      .select('id, likes')
      .eq('quiz_id', quizId)
      .single();

    let newLikes = 0;
    if (existingStats) {
      // Update existing record
      newLikes = Math.max(0, (existingStats.likes || 0) + likeState);
      const { error: updateError } = await supabaseAdmin
        .from('quiz_stats')
        .update({
          likes: newLikes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingStats.id);

      if (updateError) {
        console.error('Error updating quiz stats:', updateError);
        const errorMessage = updateError.message || 'Database update failed';
        return error(500, { message: `Failed to update quiz stats: ${errorMessage}` });
      }
    } else {
      // Create new record
      newLikes = likeState === 1 ? 1 : 0;
      const { error: insertError } = await supabaseAdmin
        .from('quiz_stats')
        .insert({
          quiz_id: quizId,
          likes: newLikes,
          plays: 0
        });

      if (insertError) {
        console.error('Error creating quiz stats:', insertError);
        const errorMessage = insertError.message || 'Database insert failed';
        return error(500, { message: `Failed to create quiz stats: ${errorMessage}` });
      }
    }

    return json({ success: true, likes: newLikes, message: 'Like state updated' });
  } catch (err) {
    console.error('Error updating like state:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return error(500, { message: `Failed to update like state: ${errorMessage}` });
  }
}

