/**
 * POST /api/training/token/validate
 * Validate a training token and return user info + quizzes
 * Used by the connector for authentication
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { calculateQuizStats } from '$lib/server/training/training-utils.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { getUserDisplayName } from '$lib/utils/user-display.js';

// @ts-ignore
export async function POST({ request }) {

  const supabaseAdmin = createSupabaseAdmin();
  try {
    const { token } = await request.json();

    if (!token) {
      return json({ error: 'Token required' }, { status: 400 });
    }

    const validToken = await lookupToken(supabaseAdmin, token);

    if (!validToken) {
      return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
    }

    // Update last_used_at
    await supabaseAdmin
      .from('training_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', validToken.id);

    // Fetch user info
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      validToken.user_id
    );

    if (userError || !userData) {
      console.error('Error fetching user:', userError);
      return json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch user's quizzes
    const { data: quizzes, error: quizzesError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, name, description, created_at, configuration_data, play_token')
      .eq('user_id', validToken.user_id)
      .order('created_at', { ascending: false });

    if (quizzesError) {
      console.error('Error fetching quizzes:', quizzesError);
      return json({ error: 'Failed to fetch quizzes' }, { status: 500 });
    }

    // Fetch training progress for each quiz to calculate stats
    const quizzesWithStats = await Promise.all(
      (quizzes || []).map(async (quiz) => {
        const { data: progress, error: progressError } = await fetchAllPages(() =>
          supabaseAdmin
            .from('training_progress')
            .select('*')
            .eq('user_id', validToken.user_id)
            .eq('quiz_id', quiz.id)
            .order('id', { ascending: true })
        );

        if (progressError) {
          throw progressError;
        }

        const stats = calculateQuizStats(progress || []);

        return {
          id: quiz.id,
          playToken: quiz.play_token,
          name: quiz.name,
          description: quiz.description,
          createdAt: quiz.created_at,
          stats
        };
      })
    );

    return json({
      userId: validToken.user_id,
      username: getUserDisplayName(userData.user),
      email: userData.user.email,
      quizzes: quizzesWithStats
    });
  } catch (error) {
    console.error('Error validating token:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

