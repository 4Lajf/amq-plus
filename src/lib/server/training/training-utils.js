/**
 * Training Utilities - Helper functions for training mode
 * 
 * Includes token generation, hashing, progress merging, and statistics calculation
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { trainingScheduler, State } from './fsrs-service.js';

/**
 * Generate a high-entropy random token
 * @returns {string} 64-character hexadecimal token (32 bytes = 256 bits)
 */
export function generateHighEntropyToken() {
  // Generate 32 random bytes and convert to hex
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using bcrypt for secure storage
 * @param {string} token - Plaintext token
 * @returns {Promise<string>} Hashed token
 */
export async function hashToken(token) {
  const saltRounds = 10;
  return await bcrypt.hash(token, saltRounds);
}

/**
 * Verify a token against its hash
 * @param {string} token - Plaintext token to verify
 * @param {string} hash - Hashed token to compare against
 * @returns {Promise<boolean>} True if token matches hash
 */
export async function verifyToken(token, hash) {
  return await bcrypt.compare(token, hash);
}

/**
 * Merge training progress from source quiz to target quiz
 * 
 * Strategy:
 * - If song exists in both: Average FSRS states, merge history arrays
 * - If song only in source: Copy to target
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} targetQuizId - Target quiz ID
 * @param {string} sourceQuizId - Source quiz ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result with counts of merged, added, and conflicted songs
 */
export async function mergeProgress(supabase, targetQuizId, sourceQuizId, userId) {
  // Fetch source progress
  const { data: sourceProgress, error: sourceError } = await supabase
    .from('training_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('quiz_id', sourceQuizId);

  if (sourceError) {
    throw new Error(`Failed to fetch source progress: ${sourceError.message}`);
  }

  // Fetch target progress
  const { data: targetProgress, error: targetError } = await supabase
    .from('training_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('quiz_id', targetQuizId);

  if (targetError) {
    throw new Error(`Failed to fetch target progress: ${targetError.message}`);
  }

  // Create map of target songs for fast lookup
  const targetMap = new Map();
  for (const record of targetProgress || []) {
    targetMap.set(record.song_key, record);
  }

  let mergedCount = 0;
  let addedCount = 0;
  const updates = [];
  const inserts = [];

  // Process each source record
  for (const sourceRecord of sourceProgress || []) {
    const targetRecord = targetMap.get(sourceRecord.song_key);

    if (targetRecord) {
      // Song exists in both - merge data
      const mergedRecord = mergeSongProgress(targetRecord, sourceRecord);
      mergedRecord.quiz_id = targetQuizId;
      updates.push(mergedRecord);
      mergedCount++;
    } else {
      // Song only in source - copy to target
      const newRecord = {
        ...sourceRecord,
        id: undefined, // Let database generate new ID
        quiz_id: targetQuizId,
        created_at: undefined,
        updated_at: undefined
      };
      inserts.push(newRecord);
      addedCount++;
    }
  }

  // Apply updates
  for (const record of updates) {
    const { error } = await supabase
      .from('training_progress')
      .update({
        fsrs_state: record.fsrs_state,
        attempt_count: record.attempt_count,
        success_count: record.success_count,
        failure_count: record.failure_count,
        success_streak: record.success_streak,
        failure_streak: record.failure_streak,
        history: record.history,
        last_attempt_at: record.last_attempt_at
      })
      .eq('id', record.id);

    if (error) {
      console.error(`Failed to update record ${record.id}:`, error);
    }
  }

  // Apply inserts
  if (inserts.length > 0) {
    const { error } = await supabase
      .from('training_progress')
      .insert(inserts);

    if (error) {
      console.error('Failed to insert new records:', error);
    }
  }

  return {
    merged: mergedCount,
    added: addedCount,
    total: sourceProgress?.length || 0
  };
}

/**
 * Merge two song progress records
 * Average FSRS states and combine histories
 * 
 * @param {Object} target - Target record
 * @param {Object} source - Source record
 * @returns {Object} Merged record
 */
function mergeSongProgress(target, source) {
  // Average FSRS state values
  const mergedFsrsState = {
    state: Math.max(target.fsrs_state.state, source.fsrs_state.state),
    due: new Date(Math.min(
      new Date(target.fsrs_state.due || Date.now()).getTime(),
      new Date(source.fsrs_state.due || Date.now()).getTime()
    )).toISOString(),
    stability: (target.fsrs_state.stability + source.fsrs_state.stability) / 2,
    difficulty: (target.fsrs_state.difficulty + source.fsrs_state.difficulty) / 2,
    elapsed_days: Math.max(target.fsrs_state.elapsed_days || 0, source.fsrs_state.elapsed_days || 0),
    scheduled_days: (target.fsrs_state.scheduled_days + source.fsrs_state.scheduled_days) / 2,
    reps: target.fsrs_state.reps + source.fsrs_state.reps,
    lapses: target.fsrs_state.lapses + source.fsrs_state.lapses
  };

  // Merge histories
  const mergedHistory = [
    ...(target.history || []),
    ...(source.history || [])
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Use most recent last_attempt_at
  const lastAttempt = target.last_attempt_at && source.last_attempt_at
    ? new Date(Math.max(
      new Date(target.last_attempt_at).getTime(),
      new Date(source.last_attempt_at).getTime()
    )).toISOString()
    : target.last_attempt_at || source.last_attempt_at;

  return {
    ...target,
    fsrs_state: mergedFsrsState,
    attempt_count: target.attempt_count + source.attempt_count,
    success_count: target.success_count + source.success_count,
    failure_count: target.failure_count + source.failure_count,
    success_streak: Math.max(target.success_streak, source.success_streak),
    failure_streak: Math.max(target.failure_streak, source.failure_streak),
    history: mergedHistory,
    last_attempt_at: lastAttempt
  };
}

/**
 * Calculate comprehensive statistics for a quiz
 * Matches the format used by /training/[quizId] page
 * 
 * @param {Array} progressRecords - Array of training_progress records
 * @returns {Object} Statistics object
 */
export function calculateQuizStats(progressRecords) {
  if (!progressRecords || progressRecords.length === 0) {
    return {
      totalSongs: 0,
      totalAttempts: 0,
      totalSuccess: 0,
      accuracy: 0,
      last10Success: 0,
      last10Total: 0,
      dueToday: 0,
      averageDifficulty: 0,
      masteryDistribution: {
        learning: 0,
        review: 0,
        mastered: 0
      }
    };
  }

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

    // Categorize by FSRS state (without separate "new" category)
    const fsrsState = record.fsrs_state?.state;
    if (fsrsState === undefined || fsrsState === null || fsrsState === 0 || fsrsState === 1) {
      masteryDistribution.learning++;
    } else if (fsrsState === 2) {
      masteryDistribution.review++;
    } else if (fsrsState === 3) {
      masteryDistribution.mastered++;
    } else {
      masteryDistribution.learning++; // Fallback
    }
  }

  const accuracy = last10Total > 0 ? parseFloat(((last10Success / last10Total) * 100).toFixed(2)) : 0;
  const averageDifficulty = songsWithDifficulty > 0 ? parseFloat((totalDifficulty / songsWithDifficulty).toFixed(1)) : 0;

  return {
    totalSongs,
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
 * Import training data from localStorage (old amqTrainingMode.js format)
 * 
 * @param {Object} supabase - Supabase client
 * @param {Object} localStorageData - Data from localStorage
 * @param {string} userId - User ID
 * @param {string} quizId - Quiz ID to import into
 * @returns {Promise<Object>} Import result with count of imported songs
 */
export async function importFromLocalStorage(supabase, localStorageData, userId, quizId) {
  if (!localStorageData || typeof localStorageData !== 'object') {
    throw new Error('Invalid localStorage data format');
  }

  const imports = [];

  // Convert old format to new format
  for (const [songKey, oldData] of Object.entries(localStorageData)) {
    // Map old efactor to FSRS difficulty (inverted scale)
    const difficulty = Math.max(0, Math.min(10, (5 - oldData.efactor) * 2));

    // Estimate stability from interval
    const stability = oldData.interval || 1;

    // Create FSRS state
    const fsrsState = trainingScheduler.createNewCard(songKey);
    fsrsState.difficulty = difficulty;
    fsrsState.stability = stability;
    fsrsState.reps = oldData.successCount || 0;
    fsrsState.lapses = oldData.failureCount || 0;

    // Determine state based on success count
    if (oldData.successCount === 0) {
      fsrsState.state = State.New;
    } else if (oldData.successCount < 3) {
      fsrsState.state = State.Learning;
    } else {
      fsrsState.state = State.Review;
    }

    // Calculate due date from last review and interval
    if (oldData.date) {
      const lastReview = new Date(oldData.date);
      const intervalDays = oldData.interval || 1;
      const dueDate = new Date(lastReview);
      dueDate.setDate(dueDate.getDate() + intervalDays);
      fsrsState.due = dueDate.toISOString();
    }

    // Convert history
    const history = (oldData.lastFiveTries || []).map((attempt, index) => ({
      timestamp: new Date(Date.now() - (4 - index) * 86400000).toISOString(), // Estimate timestamps
      success: attempt,
      rating: attempt ? 3 : 1,
      time_spent: 0
    }));

    imports.push({
      user_id: userId,
      quiz_id: quizId,
      song_key: songKey,
      fsrs_state: fsrsState,
      attempt_count: (oldData.successCount || 0) + (oldData.failureCount || 0),
      success_count: oldData.successCount || 0,
      failure_count: oldData.failureCount || 0,
      success_streak: oldData.successStreak || 0,
      failure_streak: oldData.failureStreak || 0,
      last_attempt_at: oldData.lastReviewDate ? new Date(oldData.lastReviewDate).toISOString() : null,
      history
    });
  }

  if (imports.length === 0) {
    return { imported: 0, failed: 0 };
  }

  // Insert records (upsert to handle conflicts)
  const { data, error } = await supabase
    .from('training_progress')
    .upsert(imports, {
      onConflict: 'user_id,quiz_id,song_key',
      ignoreDuplicates: false
    });

  if (error) {
    throw new Error(`Failed to import records: ${error.message}`);
  }

  return {
    imported: imports.length,
    failed: 0
  };
}

/**
 * Generate masked token for display (show first and last 4 chars)
 * @param {string} token - Full token
 * @returns {string} Masked token like "a1b2****c3d4"
 */
export function maskToken(token) {
  if (!token || token.length < 12) {
    return '****';
  }
  return `${token.substring(0, 4)}${'*'.repeat(token.length - 8)}${token.substring(token.length - 4)}`;
}

/**
 * Calculate training activity for calendar heatmap
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {number} days - Number of days to fetch (default 365)
 * @returns {Promise<Array>} Array of {date, songCount, sessionCount}
 */
export async function getActivityCalendar(supabase, userId, days = 365) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch sessions in date range
  const { data: sessions, error } = await supabase
    .from('training_sessions')
    .select('started_at, total_songs')
    .eq('user_id', userId)
    .gte('started_at', startDate.toISOString())
    .order('started_at');

  if (error) {
    console.error('Failed to fetch activity:', error);
    return [];
  }

  // Group by date
  const activityMap = new Map();

  for (const session of sessions || []) {
    const date = session.started_at.split('T')[0];

    if (!activityMap.has(date)) {
      activityMap.set(date, { date, songCount: 0, sessionCount: 0 });
    }

    const activity = activityMap.get(date);
    activity.songCount += session.total_songs || 0;
    activity.sessionCount++;
  }

  return Array.from(activityMap.values());
}

