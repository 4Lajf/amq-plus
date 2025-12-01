/**
 * Quiz Metadata API endpoint (by identifiers)
 * Fetches quiz metadata using name+description+creator
 * 
 * @module api/quiz-configurations/metadata
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateQuizMetadata } from '$lib/utils/quizMetadata.js';

/**
 * Find quiz by name, description, and creator username
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {string} name - Quiz name (without "AMQ+ " prefix)
 * @param {string} description - Quiz description
 * @param {string} creatorUsername - Creator username
 * @returns {Promise<Object|null>} Quiz data or null if not found
 */
async function findQuizByIdentifiers(supabaseAdmin, name, description, creatorUsername) {
  // Try exact match first (with description match if provided)
  let query = supabaseAdmin
    .from('quiz_configurations')
    .select('id, name, description, creator_username, configuration_data, created_at, is_public, allow_remixing')
    .eq('name', name)
    .eq('creator_username', creatorUsername);

  if (description && description !== "Imported from AMQ+") {
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
    return data;
  }
  return null;
}

/**
 * GET /api/quiz-configurations/metadata
 * Fetches quiz metadata for a quiz configuration identified by name+description+creator
 * 
 * @param {Object} event - Request event
 * @param {URL} event.url - Request URL with query parameters containing name, description, creatorUsername
 * @returns {Promise<Response>} JSON response with quiz metadata
 */
export async function GET({ url }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const name = url.searchParams.get('name');
    const description = url.searchParams.get('description') || null;
    const creatorUsername = url.searchParams.get('creatorUsername');

    if (!name || !creatorUsername) {
      return error(400, { message: 'Missing required fields: name and creatorUsername' });
    }

    const cleanName = name.startsWith('AMQ+ ') ? name.substring(5) : name;

    let quiz = await findQuizByIdentifiers(supabaseAdmin, cleanName, description, creatorUsername);

    // If not found and name was cleaned, try with original name
    if (!quiz && cleanName !== name) {
      quiz = await findQuizByIdentifiers(supabaseAdmin, name, description, creatorUsername);
    }

    if (!quiz) {
      return error(404, { message: 'Quiz not found with provided identifiers' });
    }

    // Fetch stats
    const { data: statsData } = await supabaseAdmin
      .from('quiz_stats')
      .select('likes, plays')
      .eq('quiz_id', quiz.id)
      .maybeSingle();

    const likes = statsData?.likes || 0;
    const plays = statsData?.plays || 0;

    // Generate metadata from configuration_data
    let quizMetadata = null;
    if (quiz.configuration_data) {
      try {
        quizMetadata = generateQuizMetadata(quiz.configuration_data);
      } catch (err) {
        console.error('Error generating quiz metadata:', err);
      }
    }

    return json({
      success: true,
      quiz: {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        creator_username: quiz.creator_username,
        created_at: quiz.created_at,
        is_public: quiz.is_public,
        allow_remixing: quiz.allow_remixing,
        likes: likes,
        plays: plays,
        quiz_metadata: quizMetadata
      }
    });
  } catch (err) {
    console.error('Error fetching quiz metadata:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return error(500, { message: `Failed to fetch quiz metadata: ${errorMessage}` });
  }
}

