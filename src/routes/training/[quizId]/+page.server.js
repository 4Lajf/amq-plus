/**
 * Quiz Training Detail Page - Server Load Function
 * Load quiz details, training stats, progress records, and sessions
 */

import { redirect, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function load({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw redirect(303, '/auth');
  }

  const userId = session.user.id;
  const quizId = params.quizId;

  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch quiz basic info
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, name, description, configuration_data, created_at')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      throw error(404, { message: 'Quiz not found' });
    }

    // Count songs in the quiz configuration
    let totalQuizSongs = 0;
    try {
      if (quiz.configuration_data && quiz.configuration_data.songList) {
        totalQuizSongs = Array.isArray(quiz.configuration_data.songList)
          ? quiz.configuration_data.songList.length
          : 0;
      }
    } catch (e) {
      console.warn('[Training Detail] Error counting quiz songs:', e);
    }

    // Fetch all training progress for this quiz
    const { data: progress, error: progressError } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .order('last_attempt_at', { ascending: false, nullsFirst: false });

    if (progressError) {
      console.error('[Training Detail] Error fetching progress:', progressError);
      throw error(500, { message: 'Failed to load training progress' });
    }

    // Fetch recent sessions (limit to 10)
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('training_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(10);

    if (sessionsError) {
      console.error('[Training Detail] Error fetching sessions:', sessionsError);
    }

    // Format sessions with calculated stats
    const formattedSessions = (sessions || []).map(session => {
      const duration = session.ended_at
        ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
        : null;

      const totalAnswered = session.correct_songs + session.incorrect_songs;
      const accuracy = totalAnswered > 0 ? Math.round((session.correct_songs / totalAnswered) * 100) : 0;

      // Extract pool size from session_data
      const poolSize = session.session_data?.poolDistribution?.available?.total || null;

      return {
        id: session.id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        totalSongs: session.total_songs,
        correctSongs: session.correct_songs,
        incorrectSongs: session.incorrect_songs,
        accuracy,
        duration,
        poolSize
      };
    });

    // Get pool size from the most recent session, fallback to config count
    const latestPoolSize = formattedSessions.length > 0 && formattedSessions[0].poolSize 
      ? formattedSessions[0].poolSize 
      : totalQuizSongs;

    // Calculate statistics from progress records using latest pool size
    const stats = calculateStats(progress || [], latestPoolSize);

    // Calculate performance over time
    const performanceOverTime = calculatePerformanceOverTime(progress || []);

    // Calculate forecast (songs due in next 7 days)
    const forecast = calculateForecast(progress || []);

    return {
      quiz: {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        totalSongs: totalQuizSongs,
        createdAt: quiz.created_at
      },
      stats,
      progress: progress || [],
      performanceOverTime,
      forecast,
      sessions: formattedSessions
    };
  } catch (err) {
    console.error('[Training Detail] Error loading page:', err);
    if (err.status === 404) {
      throw err;
    }
    throw error(500, { message: 'Failed to load training data' });
  }
}

/**
 * Calculate training statistics from progress records
 */
function calculateStats(progressRecords, totalQuizSongs = 0) {
  const now = new Date();

  let totalSongs = progressRecords.length;
  let totalAttempts = 0;
  let totalSuccess = 0;
  let dueToday = 0;
  let totalDifficulty = 0;
  let songsWithDifficulty = 0;
  let masteryDistribution = {
    learning: 0,
    review: 0,
    mastered: 0
  };

  // For last 10 attempts accuracy calculation
  let last10Success = 0;
  let last10Total = 0;

  for (const record of progressRecords) {
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

    // Track average difficulty
    if (record.fsrs_state?.difficulty) {
      totalDifficulty += record.fsrs_state.difficulty;
      songsWithDifficulty++;
    }

    // Categorize by FSRS state (with separate "new" category)
    const fsrsState = record.fsrs_state?.state;
    if (fsrsState === undefined || fsrsState === null || fsrsState === 0) {
      masteryDistribution.learning++;
    } else if (fsrsState === 1) {
      masteryDistribution.learning++;
    } else if (fsrsState === 2) {
      masteryDistribution.review++;
    } else if (fsrsState === 3) {
      masteryDistribution.mastered++;
    } else {
      // Fallback for unknown states
      masteryDistribution.learning++;
    }
  }

  const accuracy = last10Total > 0 ? parseFloat(((last10Success / last10Total) * 100).toFixed(2)) : 0;
  const averageDifficulty = songsWithDifficulty > 0 ? (totalDifficulty / songsWithDifficulty).toFixed(1) : 0;

  return {
    totalSongs,
    totalQuizSongs,
    totalAttempts,
    totalSuccess,
    accuracy,
    last10Success,
    last10Total,
    dueToday,
    averageDifficulty,
    masteryDistribution
  };
}

/**
 * Calculate performance over time (accuracy by date)
 */
function calculatePerformanceOverTime(progressRecords) {
  const performanceByDate = {};

  for (const record of progressRecords) {
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

  return Object.values(performanceByDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      accuracy: day.attempts > 0 ? Math.round((day.successes / day.attempts) * 100) : 0,
      attempts: day.attempts
    }));
}

/**
 * Calculate forecast (songs due in next 7 days)
 */
function calculateForecast(progressRecords) {
  const now = new Date();
  // Get today's date at midnight in local timezone
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const forecast = [];

  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() + i);
    
    const nextDate = new Date(checkDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // Format date as MM/DD/YYYY for display
    const month = String(checkDate.getMonth() + 1).padStart(2, '0');
    const day = String(checkDate.getDate()).padStart(2, '0');
    const year = checkDate.getFullYear();
    const dateStr = `${month}/${day}/${year}`;
    
    let dueCount = 0;

    for (const record of progressRecords) {
      // Use fsrs_state.due instead of next_review_date
      if (!record.fsrs_state?.due) continue;
      
      const dueDateTime = new Date(record.fsrs_state.due);
      // Normalize to midnight in local timezone for comparison
      const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
      
      // Check if due on this specific day OR earlier (including overdue songs on first day)
      if (dueDate.getTime() === checkDate.getTime() || (i === 0 && dueDate < checkDate)) {
        dueCount++;
      }
    }

    forecast.push({
      date: dateStr,
      due: dueCount
    });
  }

  return forecast;
}

