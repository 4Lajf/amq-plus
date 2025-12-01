/**
 * Quiz Training Detail Page - Server Load Function
 * Load quiz details, training stats, progress records, and sessions
 */

import { redirect, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function load({ params, url, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw redirect(303, '/auth');
  }

  const userId = session.user.id;
  const quizId = params.quizId;
  const selectedSessionId = url.searchParams.get('session');

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

    // Get pool size from the most recent session (any status)
    // This is updated every time a new training session starts
    const { data: latestSession } = await supabaseAdmin
      .from('training_sessions')
      .select('session_data')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Extract pool size from the most recent session's session_data
    let totalQuizSongs = latestSession?.session_data?.poolDistribution?.available?.total || 0;

    // Fallback: try songList if no session exists yet
    if (totalQuizSongs === 0 && quiz.configuration_data?.songList) {
      try {
        totalQuizSongs = Array.isArray(quiz.configuration_data.songList)
          ? quiz.configuration_data.songList.length
          : 0;
      } catch (e) {
        console.warn('[Training Detail] Error counting quiz songs:', e);
      }
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

    // Fetch all sessions (no limit - we paginate client-side)
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('training_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false });

    if (sessionsError) {
      console.error('[Training Detail] Error fetching sessions:', sessionsError);
    }

    // Format sessions with calculated stats
    const formattedSessions = (sessions || []).map(s => {
      const duration = s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;

      const totalAnswered = s.correct_songs + s.incorrect_songs;
      const accuracy = totalAnswered > 0 ? Math.round((s.correct_songs / totalAnswered) * 100) : 0;

      // Extract pool size from session_data
      const poolSize = s.session_data?.poolDistribution?.available?.total || null;

      return {
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        totalSongs: s.total_songs,
        correctSongs: s.correct_songs,
        incorrectSongs: s.incorrect_songs,
        accuracy,
        duration,
        poolSize,
        composition: s.session_data?.composition || { due: 0, new: 0, revision: 0 }
      };
    });

    // If a session is selected via query param, load its plays
    let selectedSession = null;
    let sessionPlays = [];

    if (selectedSessionId) {
      // Find the session in our list
      const foundSession = formattedSessions.find(s => s.id === selectedSessionId);
      
      if (foundSession) {
        selectedSession = foundSession;
        
        // Fetch plays for this session
        const { data: plays, error: playsError } = await supabaseAdmin
          .from('training_session_plays')
          .select('*')
          .eq('session_id', selectedSessionId)
          .order('played_at', { ascending: true });

        if (playsError) {
          console.error('[Training Detail] Error fetching session plays:', playsError);
        } else {
          sessionPlays = plays || [];
        }
      }
    }

    // Calculate statistics from progress records using total quiz songs from latest session
    const stats = calculateStats(progress || [], totalQuizSongs);

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
      sessions: formattedSessions,
      selectedSession,
      sessionPlays
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

