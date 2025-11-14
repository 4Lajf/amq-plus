/**
 * GET /api/training/[quizId]/stats
 * Get detailed training statistics for a quiz
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { calculateQuizStats } from '$lib/server/training/training-utils.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';

// @ts-ignore
export async function GET({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  
  
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { quizId } = params;

    // Fetch progress
    const { data: progress, error: progressError } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId);

    if (progressError) {
      console.error('Error fetching progress:', progressError);
      return json({ error: 'Failed to fetch progress' }, { status: 500 });
    }

    // Calculate stats
    const stats = calculateQuizStats(progress || []);

    // Get forecast
    const forecast = trainingScheduler.getForecast(progress || [], 7);

    // Get performance over time (group by date)
    const performanceByDate = {};
    for (const record of progress || []) {
      for (const attempt of record.history || []) {
        const date = attempt.timestamp.split('T')[0];
        if (!performanceByDate[date]) {
          performanceByDate[date] = {
            date,
            attempts: 0,
            successes: 0
          };
        }
        performanceByDate[date].attempts++;
        if (attempt.success) {
          performanceByDate[date].successes++;
        }
      }
    }

    const performanceOverTime = Object.values(performanceByDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        date: day.date,
        accuracy: day.attempts > 0 ? Math.round((day.successes / day.attempts) * 100) : 0,
        attempts: day.attempts
      }));

    return json({
      stats,
      forecast,
      performanceOverTime
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

