import { error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * Load user dashboard data including quiz statistics
 */
// @ts-ignore
export const load = async ({ locals }) => {
  const { session, user } = await locals.safeGetSession();

  if (!session || !user) {
    throw error(401, { message: 'You must be logged in to access the dashboard' });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Fetch user's quizzes
    const { data: quizzes, error: quizzesError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id')
      .eq('user_id', user.id);

    if (quizzesError) {
      console.error('Error fetching user quizzes:', quizzesError);
      // Don't throw, just return empty stats
    }

    const quizIds = (quizzes || []).map((q) => q.id);
    let totalPlays = 0;
    let totalLikes = 0;

    // Fetch stats for user's quizzes
    if (quizIds.length > 0) {
      const { data: stats, error: statsError } = await supabaseAdmin
        .from('quiz_stats')
        .select('likes, plays')
        .in('quiz_id', quizIds);

      if (!statsError && stats) {
        totalPlays = stats.reduce((sum, stat) => sum + (stat.plays || 0), 0);
        totalLikes = stats.reduce((sum, stat) => sum + (stat.likes || 0), 0);
      }
    }

    return {
      stats: {
        quizCount: quizIds.length,
        totalPlays,
        totalLikes
      }
    };
  } catch (err) {
    console.error('Error loading dashboard data:', err);
    // Return default stats on error
    return {
      stats: {
        quizCount: 0,
        totalPlays: 0,
        totalLikes: 0
      }
    };
  }
};

