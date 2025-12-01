/**
 * Training Page - Server Load Function
 * Load user's token, overview stats, and quizzes
 */

import { redirect } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

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
    const { data: allProgress } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId);

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

    // Only fetch quizzes that have training data
    const { data: quizzes } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, name, description, created_at')
      .eq('user_id', userId)
      .in('id', trainedQuizIds)
      .order('created_at', { ascending: false });

    // Fetch training stats for each quiz
    const quizzesWithStats = await Promise.all(
      (quizzes || []).map(async (quiz) => {
        // Filter progress for this specific quiz from already loaded data
        const quizProgress = (allProgress || []).filter(p => p.quiz_id === quiz.id);

        // Calculate basic stats
        const totalSongs = quizProgress.length;
        let totalAttempts = 0;
        let totalSuccess = 0;
        let dueToday = 0;

        const now = new Date();

        // For last 10 attempts accuracy calculation
        let last10Success = 0;
        let last10Total = 0;

        for (const record of quizProgress) {
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
          const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
          if (dueDate && dueDate <= now) {
            dueToday++;
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

