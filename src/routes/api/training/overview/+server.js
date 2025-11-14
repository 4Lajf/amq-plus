/**
 * GET /api/training/overview
 * Get cross-quiz training overview for user
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { getActivityCalendar } from '$lib/server/training/training-utils.js';

// @ts-ignore
export async function GET({ locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;


  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Get total quizzes with training
    const { data: quizzesWithTraining } = await supabaseAdmin
      .from('training_progress')
      .select('quiz_id')
      .eq('user_id', userId);

    const uniqueQuizzes = new Set((quizzesWithTraining || []).map((p) => p.quiz_id));
    const totalQuizzes = uniqueQuizzes.size;

    // Get total songs practiced
    const { data: allProgress } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId);

    const totalSongs = allProgress?.length || 0;

    // Calculate overall accuracy
    let totalAttempts = 0;
    let totalSuccess = 0;

    for (const record of allProgress || []) {
      totalAttempts += record.attempt_count || 0;
      totalSuccess += record.success_count || 0;
    }

    const overallAccuracy =
      totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

    // Get activity calendar
    const activityCalendar = await getActivityCalendar(supabaseAdmin, userId, 365);

    // Get recent sessions (last 10)
    const { data: recentSessions } = await supabaseAdmin
      .from('training_sessions')
      .select('*, quiz_configurations(name)')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(10);

    const recentSessionsSummary = (recentSessions || []).map((s) => {
      const totalAnswered = s.correct_songs + s.incorrect_songs;
      const accuracy =
        totalAnswered > 0 ? Math.round((s.correct_songs / totalAnswered) * 100) : 0;

      return {
        id: s.id,
        quizName: s.quiz_configurations?.name || 'Unknown Quiz',
        endedAt: s.ended_at,
        accuracy,
        totalSongs: s.total_songs
      };
    });

    return json({
      totalQuizzes,
      totalSongs,
      overallAccuracy,
      totalAttempts,
      activityCalendar,
      recentSessions: recentSessionsSummary
    });
  } catch (error) {
    console.error('Error getting overview:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

