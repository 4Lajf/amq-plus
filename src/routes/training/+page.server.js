/**
 * Training Page - Server Load Function
 * Load user's token, overview stats, and quizzes
 */

import { redirect } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';

function isPlayableProgressRecord(record) {
  return record?.is_active !== false && record?.song_ann_id != null;
}

// @ts-ignore
export async function load({ locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw redirect(303, '/auth');
  }

  const userId = session.user.id;


  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch user's training token
    const { data: token } = await supabaseAdmin
      .from('training_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    const hasToken = !!token;

    // Calculate overview stats directly from database
    // Use fetchAllPages to handle Supabase's 1000 row limit
    const { data: allProgress, error: progressError } = await fetchAllPages(() =>
      supabaseAdmin
        .from('training_progress')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true })
    );

    if (progressError) {
      console.error('Error fetching training progress:', progressError);
      // Continue with empty array if there's an error
    }

    const uniqueQuizzes = new Set((allProgress || []).map(p => p.quiz_id));
    const totalQuizzes = uniqueQuizzes.size;
    const totalSongs = allProgress?.length || 0;

    let totalAttempts = 0;
    let totalSuccess = 0;

    // For last 10 attempts accuracy calculation
    let last10Success = 0;
    let last10Total = 0;

    for (const record of allProgress || []) {
      totalAttempts += record.attempt_count || 0;
      totalSuccess += record.success_count || 0;

      // Calculate success rate from last 10 attempts only
      const history = record.history || [];
      const last10Attempts = history.slice(-10);
      for (const attempt of last10Attempts) {
        last10Total++;
        if (attempt.success) {
          last10Success++;
        }
      }
    }

    const overallAccuracy = last10Total > 0 ? Math.round((last10Success / last10Total) * 100) : 0;

    const overviewStats = {
      totalQuizzes,
      totalSongs,
      overallAccuracy,
      totalAttempts
    };

    // Get unique quiz IDs that have training progress
    const trainedQuizIds = Array.from(uniqueQuizzes);

    // Fetch quizzes that have training data (including shared quizzes from other users)
    let quizzes = [];
    if (trainedQuizIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('quiz_configurations')
        .select('id, name, description, created_at')
        .in('id', trainedQuizIds)
        .order('created_at', { ascending: false });
      quizzes = data || [];
    }

    // Fetch training stats for each quiz
    const quizzesWithStats = await Promise.all(
      (quizzes || []).map(async (quiz) => {
        // Filter progress for this specific quiz from already loaded data
        const quizProgress = (allProgress || []).filter(p => p.quiz_id === quiz.id);

        const playableProgress = quizProgress.filter(isPlayableProgressRecord);

        // Calculate basic stats
        const totalSongs = playableProgress.length;
        let totalAttempts = 0;
        let totalSuccess = 0;
        let dueToday = 0;

        const now = new Date();

        // For last 10 attempts accuracy calculation
        let last10Success = 0;
        let last10Total = 0;

        for (const record of playableProgress) {
          totalAttempts += record.attempt_count || 0;
          totalSuccess += record.success_count || 0;

          // Calculate success rate from last 10 attempts only
          const history = record.history || [];
          const last10Attempts = history.slice(-10);
          for (const attempt of last10Attempts) {
            last10Total++;
            if (attempt.success) {
              last10Success++;
            }
          }

          // Check if due today (use fsrs_state.due)
          // Use calendar day comparison (normalized to midnight) for consistency with forecast
          const dueDateTime = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
          if (dueDateTime) {
            const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (dueDate <= today) {
              dueToday++;
            }
          }
        }

        const accuracy = last10Total > 0 ? parseFloat(((last10Success / last10Total) * 100).toFixed(2)) : 0;

        // Get last trained date
        const { data: lastSession } = await supabaseAdmin
          .from('training_sessions')
          .select('ended_at')
          .eq('user_id', userId)
          .eq('quiz_id', quiz.id)
          .not('ended_at', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...quiz,
          stats: {
            totalSongs,
            accuracy,
            dueToday,
            lastTrained: lastSession?.ended_at || null
          }
        };
      })
    );

    return {
      hasToken,
      overviewStats,
      quizzes: quizzesWithStats
    };
  } catch (error) {
    console.error('Error loading training page:', error);
    return {
      hasToken: false,
      overviewStats: null,
      quizzes: []
    };
  }
}

