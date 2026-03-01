/**
 * Training Utilities - Helper functions for training mode
 * 
 * Includes token generation, hashing, progress merging, and statistics calculation
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { trainingScheduler, State } from './fsrs-service.js';
import { fetchAllPages } from '../utils/supabasePaging.js';

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
  const { data: sourceProgress, error: sourceError } = await fetchAllPages(() =>
    supabase
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', sourceQuizId)
      .order('id', { ascending: true })
  );

  if (sourceError) {
    throw new Error(`Failed to fetch source progress: ${sourceError.message}`);
  }

  // Fetch target progress
  const { data: targetProgress, error: targetError } = await fetchAllPages(() =>
    supabase
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', targetQuizId)
      .order('id', { ascending: true })
  );

  if (targetError) {
    throw new Error(`Failed to fetch target progress: ${targetError.message}`);
  }

  // Create map of target songs for fast lookup (song_ann_id primary, annSongId fallback)
  const targetMap = new Map();
  for (const record of targetProgress || []) {
    const key = getSongMergeKey(record);
    if (key) {
      targetMap.set(key, record);
    }
  }

  let mergedCount = 0;
  let addedCount = 0;
  const updates = [];
  const inserts = [];

  // Process each source record
  for (const sourceRecord of sourceProgress || []) {
    const sourceKey = getSongMergeKey(sourceRecord);
    if (!sourceKey) {
      continue;
    }

    const targetRecord = targetMap.get(sourceKey);

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
  const targetHistory = target.history || [];
  const sourceHistory = source.history || [];

  // During merge, we should NOT deduplicate attempts from different quizzes
  // because they represent separate training sessions, even if they have identical timestamps/ratings
  // Only deduplicate within each quiz's own history to prevent actual duplicates
  const dedupedTargetHistory = dedupeHistoryAttempts(targetHistory);
  const dedupedSourceHistory = dedupeHistoryAttempts(sourceHistory);
  const mergedHistory = [
    ...dedupedTargetHistory,
    ...dedupedSourceHistory
  ].sort((a, b) => {
    const aTime = new Date(a.timestamp || 0).getTime();
    const bTime = new Date(b.timestamp || 0).getTime();
    return aTime - bTime;
  });

  if (mergedHistory.length === 0) {
    return {
      ...target,
      history: []
    };
  }

  const songKey = target.song_ann_id ?? target.annSongId ?? source.song_ann_id ?? source.annSongId;
  const recomputed = recomputeProgressFromHistory(mergedHistory, songKey);

  return {
    ...target,
    fsrs_state: recomputed.fsrs_state,
    attempt_count: recomputed.attempt_count,
    success_count: recomputed.success_count,
    failure_count: recomputed.failure_count,
    success_streak: recomputed.success_streak,
    failure_streak: recomputed.failure_streak,
    history: recomputed.history,
    last_attempt_at: recomputed.last_attempt_at
  };
}

function getSongMergeKey(record) {
  if (!record) return null;
  if (record.song_ann_id) {
    return `ann:${record.song_ann_id}`;
  }
  if (record.annSongId) {
    return `key:${record.annSongId}`;
  }
  return null;
}

function dedupeHistoryAttempts(history) {
  const deduped = new Map();

  for (const attempt of history || []) {
    if (!attempt) continue;
    const rating = Number(attempt.rating);
    if (!Number.isFinite(rating)) {
      continue;
    }
    const timestamp = attempt.timestamp || '';
    const success = attempt.success ? 1 : 0;
    const key = `${timestamp}|${rating}|${success}`;
    if (!deduped.has(key)) {
      deduped.set(key, attempt);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = new Date(a.timestamp || 0).getTime();
    const bTime = new Date(b.timestamp || 0).getTime();
    return aTime - bTime;
  });
}

function recomputeProgressFromHistory(history, songKey) {
  let fsrsState = trainingScheduler.createNewCard(String(songKey || ''));
  let successCount = 0;
  let failureCount = 0;
  let successStreak = 0;
  let failureStreak = 0;
  let lastAttemptAt = null;

  for (const attempt of history) {
    const rating = Number(attempt.rating);
    const isSuccess = !!attempt.success;
    const timestamp = attempt.timestamp || new Date().toISOString();

    fsrsState = trainingScheduler.scheduleNext(fsrsState, rating, new Date(timestamp));

    if (isSuccess) {
      successCount++;
      successStreak++;
      failureStreak = 0;
    } else {
      failureCount++;
      failureStreak++;
      successStreak = 0;
    }

    lastAttemptAt = timestamp;
  }

  return {
    fsrs_state: fsrsState,
    attempt_count: history.length,
    success_count: successCount,
    failure_count: failureCount,
    success_streak: successStreak,
    failure_streak: failureStreak,
    history,
    last_attempt_at: lastAttemptAt
  };
}

/**
 * Normalize progress records for quiz stats.
 * Filters out inactive songs and de-duplicates by song_ann_id.
 * @param {Array} progressRecords - Array of training_progress records
 * @returns {Array} Normalized list of progress records
 */
export function normalizeProgressForQuizStats(progressRecords) {
  if (!progressRecords || progressRecords.length === 0) {
    return [];
  }

  const bySongId = new Map();

  for (const record of progressRecords) {
    if (record.is_active === false) {
      continue;
    }

    const songAnnId = record.song_ann_id;
    if (songAnnId === undefined || songAnnId === null) {
      continue;
    }

    const existing = bySongId.get(songAnnId);
    if (!existing) {
      bySongId.set(songAnnId, record);
      continue;
    }

    const existingTime = existing.last_attempt_at ? new Date(existing.last_attempt_at).getTime() : 0;
    const currentTime = record.last_attempt_at ? new Date(record.last_attempt_at).getTime() : 0;

    if (currentTime > existingTime) {
      bySongId.set(songAnnId, record);
      continue;
    }

    if (currentTime === existingTime) {
      const existingAttempts = existing.attempt_count || 0;
      const currentAttempts = record.attempt_count || 0;
      if (currentAttempts > existingAttempts) {
        bySongId.set(songAnnId, record);
      }
    }
  }

  return Array.from(bySongId.values());
}

/**
 * Calculate quiz stats using normalized progress and quiz pool size.
 * @param {Array} progressRecords - Array of training_progress records
 * @param {number} totalQuizSongs - Total songs in current quiz pool
 * @returns {Object} Statistics object
 */
export function calculateQuizStatsWithPool(progressRecords, totalQuizSongs = 0) {
  const normalized = normalizeProgressForQuizStats(progressRecords);
  const stats = calculateQuizStats(normalized);

  stats.totalSongs = normalized.length;
  stats.totalQuizSongs = totalQuizSongs;

  if (totalQuizSongs > 0 && stats.totalSongs > totalQuizSongs) {
    stats.totalSongs = totalQuizSongs;
  }

  return stats;
}

function isPlayableProgressRecord(record) {
  return record?.is_active !== false && record?.song_ann_id != null;
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
        new: 0,
        learning: 0,
        review: 0,
        relearning: 0
      }
    };
  }

  const now = new Date();

  let totalSongs = 0;
  let totalAttempts = 0;
  let totalSuccess = 0;
  let dueToday = 0;
  let totalDifficulty = 0;
  let songsWithDifficulty = 0;
  let masteryDistribution = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0
  };

  // For last 10 attempts accuracy calculation
  let last10Success = 0;
  let last10Total = 0;

  for (const record of progressRecords) {
    // Skip inactive or non-playable records for statistics
    if (!isPlayableProgressRecord(record)) continue;

    totalSongs++;
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

    // Track average difficulty
    if (record.fsrs_state?.difficulty) {
      totalDifficulty += record.fsrs_state.difficulty;
      songsWithDifficulty++;
    }

    // Categorize by FSRS state
    const fsrsState = record.fsrs_state?.state;
    if (fsrsState === 1) {
      masteryDistribution.learning++;
    } else if (fsrsState === 2) {
      masteryDistribution.review++;
    } else if (fsrsState === 3) {
      masteryDistribution.relearning++;
    } else if (fsrsState === 0) {
      masteryDistribution.new++;
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
 * Shift the due date of a song based on how long it was inactive
 * @param {Object} fsrsState - Current FSRS state
 * @param {string} inactivatedAt - ISO string of when it was inactivated
 * @param {Date} now - Current time
 * @returns {Object} Updated FSRS state
 */
export function shiftDueDate(fsrsState, inactivatedAt, now = new Date()) {
  if (!fsrsState || !fsrsState.due || !inactivatedAt) return fsrsState;

  const inactiveStart = new Date(inactivatedAt);
  const inactiveDurationMs = now.getTime() - inactiveStart.getTime();

  if (inactiveDurationMs <= 0) return fsrsState;

  const currentDue = new Date(fsrsState.due);
  const newDue = new Date(currentDue.getTime() + inactiveDurationMs);

  return {
    ...fsrsState,
    due: newDue.toISOString()
  };
}

/**
 * Reconstruct songs from localStorage by querying AnisongDB
 * 
 * @param {Object} localStorageData - Data from localStorage with format {songKey: {...}}
 * @returns {Promise<Object>} Map of songKey to AnisongDB song objects
 */
export async function reconstructSongsFromLocalStorage(localStorageData) {
  if (!localStorageData || typeof localStorageData !== 'object') {
    throw new Error('Invalid localStorage data format');
  }

  const songKeys = Object.keys(localStorageData);
  console.log(`[SONG RECONSTRUCTION] Reconstructing ${songKeys.length} songs from localStorage`);

  const reconstructedMap = {};
  const failedSongs = [];
  const normalizeQuery = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  // Process songs one by one to respect API limits
  for (let i = 0; i < songKeys.length; i++) {
    const songKey = songKeys[i];
    const currentIndex = i + 1;

    try {
      // Parse song key: artist_title format
      const lastUnderscoreIndex = songKey.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        console.warn(`[SONG RECONSTRUCTION] Invalid song key format: ${songKey}`);
        failedSongs.push(songKey);
        continue;
      }

      const artist = normalizeQuery(songKey.substring(0, lastUnderscoreIndex));
      const title = normalizeQuery(songKey.substring(lastUnderscoreIndex + 1));

      console.log(`[SONG RECONSTRUCTION] [${currentIndex}/${songKeys.length}] Querying AnisongDB for: ${artist} - ${title}`);

      const runSearch = async (partialMatch) => {
        const requestBody = {
          and_logic: true,
          ignore_duplicate: false,
          opening_filter: true,
          ending_filter: true,
          insert_filter: true,
          song_name_search_filter: {
            search: title,
            partial_match: partialMatch
          },
          artist_search_filter: {
            search: artist,
            partial_match: partialMatch,
            group_granularity: 0,
            max_other_artist: 99
          }
        };

        const response = await fetch('https://anisongdb.com/api/search_request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(43200000)
        });

        if (!response.ok) {
          console.error(`[SONG RECONSTRUCTION] AnisongDB request failed for ${songKey}: ${response.status}`);
          const responseText = await response.text();
          console.error(`[SONG RECONSTRUCTION] Request body:`, JSON.stringify(requestBody, null, 2));
          console.error(`[SONG RECONSTRUCTION] Response text:`, responseText);
          return null;
        }

        const results = await response.json();
        if (!results || results.length === 0) {
          return [];
        }

        return results;
      };

      // 1) Exact match
      let results = await runSearch(false);

      // 2) Fallback to partial match if exact match fails
      if (Array.isArray(results) && results.length === 0) {
        console.warn(`[SONG RECONSTRUCTION] No exact match for: ${artist} - ${title}. Retrying with partial match...`);
        results = await runSearch(true);
      }

      if (!results || results.length === 0) {
        console.warn(`[SONG RECONSTRUCTION] No results found for: ${artist} - ${title}`);
        failedSongs.push(songKey);
      } else {
        const song = results[0];
        console.log(`[SONG RECONSTRUCTION] Found song: ${song.animeENName} - ${song.songName}`);
        reconstructedMap[songKey] = song;
      }
    } catch (error) {
      console.error(`[SONG RECONSTRUCTION] Error processing ${songKey}:`, error);
      failedSongs.push(songKey);
    }

    // Delay 1 second between requests (except for the last one)
    if (i < songKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const reconstructedCount = Object.keys(reconstructedMap).length;
  console.log(`[SONG RECONSTRUCTION] Successfully reconstructed ${reconstructedCount}/${songKeys.length} songs`);
  if (failedSongs.length > 0) {
    console.warn(`[SONG RECONSTRUCTION] Failed to reconstruct ${failedSongs.length} songs:`, failedSongs);
  }

  return {
    songMap: reconstructedMap,
    failedSongs
  };
}

/**
 * Import training data from localStorage (old amqTrainingMode.js format)
 * 
 * @param {Object} supabase - Supabase client
 * @param {Object} localStorageData - Data from localStorage
 * @param {string} userId - User ID
 * @param {string} quizId - Quiz ID to import into
 * @param {Object} songMap - Map of songKey to AnisongDB song objects (for numeric IDs)
 * @returns {Promise<Object>} Import result with count of imported songs
 */
export async function importFromLocalStorage(supabase, localStorageData, userId, quizId, songMap = {}) {
  if (!localStorageData || typeof localStorageData !== 'object') {
    throw new Error('Invalid localStorage data format');
  }

  const imports = [];

  // Convert old format to new format
  for (const [songKey, oldData] of Object.entries(localStorageData)) {
    // Get numeric ID from reconstruction map if available
    const songData = songMap[songKey];
    const songAnnId = songData ? songData.annSongId : null;

    // Improved efactor to FSRS difficulty mapping
    // SM-2 efactor range: typically 1.3-2.5 (lower = harder)
    // FSRS difficulty range: 0-10 (higher = harder)
    // Better inverse mapping with proper scaling
    const efactor = oldData.efactor || 2.5;
    const difficulty = Math.max(0, Math.min(10, (2.5 - efactor) * 5 + 5));

    // Improved stability calculation from interval
    // Old interval is in days, FSRS stability is also in days but with better scaling
    const interval = oldData.interval || 1;
    const successCount = oldData.successCount || 0;

    // Calculate stability based on interval and success history
    // More successful attempts = higher stability multiplier
    const stabilityMultiplier = Math.min(1 + (successCount * 0.2), 3);
    const stability = Math.max(0.1, interval * stabilityMultiplier);

    // Create FSRS state
    const fsrsState = trainingScheduler.createNewCard(songKey);
    fsrsState.difficulty = difficulty;
    fsrsState.stability = stability;
    fsrsState.reps = successCount;
    fsrsState.lapses = oldData.failureCount || 0;

    // Improved state determination based on performance history
    const totalAttempts = successCount + (oldData.failureCount || 0);
    const successRate = totalAttempts > 0 ? successCount / totalAttempts : 0;

    if (successCount === 0) {
      fsrsState.state = State.New;
    } else if (successCount < 3 || successRate < 0.6) {
      fsrsState.state = State.Learning;
    } else if (interval >= 21 && successRate >= 0.8) {
      // Well-established cards with good performance
      fsrsState.state = State.Review;
    } else {
      fsrsState.state = State.Learning;
    }

    // Improved due date calculation
    if (oldData.date) {
      const lastReview = new Date(oldData.date);
      const intervalDays = interval;
      const dueDate = new Date(lastReview);
      dueDate.setDate(dueDate.getDate() + intervalDays);
      fsrsState.due = dueDate.toISOString();

      // Calculate elapsed days since last review
      const now = new Date();
      const elapsedMs = now.getTime() - lastReview.getTime();
      fsrsState.elapsed_days = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
      fsrsState.scheduled_days = intervalDays;
    } else {
      // No last review date, set as due now
      fsrsState.due = new Date().toISOString();
      fsrsState.elapsed_days = 0;
      fsrsState.scheduled_days = 0;
    }

    // Improved history conversion with better timestamp estimation
    const lastFiveTries = oldData.lastFiveTries || [];
    const history = [];

    if (lastFiveTries.length > 0 && oldData.date) {
      // Use actual last review date as anchor
      const baseDate = new Date(oldData.date);

      // Estimate timestamps working backwards from last review
      // Assume attempts were spaced out over the interval period
      const attemptSpacing = interval / Math.max(lastFiveTries.length, 1);

      lastFiveTries.forEach((attempt, index) => {
        const attemptDate = new Date(baseDate);
        const daysBack = (lastFiveTries.length - 1 - index) * attemptSpacing;
        attemptDate.setDate(attemptDate.getDate() - daysBack);

        // Map boolean success to FSRS ratings:
        // Success: rating 3-4 (Good to Easy) based on streak
        // Failure: rating 1-2 (Again to Hard)
        let rating;
        if (attempt) {
          // Success - use rating 3 (Good) or 4 (Easy) based on consecutive successes
          const consecutiveSuccesses = lastFiveTries.slice(0, index + 1).filter(a => a).length;
          rating = consecutiveSuccesses >= 3 ? 4 : 3;
        } else {
          // Failure - use rating 1 (Again)
          rating = 1;
        }

        history.push({
          timestamp: attemptDate.toISOString(),
          success: attempt,
          rating,
          time_spent: 0
        });
      });
    } else if (lastFiveTries.length > 0) {
      // No date available, use current time and work backwards
      const now = new Date();
      lastFiveTries.forEach((attempt, index) => {
        const attemptDate = new Date(now);
        attemptDate.setDate(attemptDate.getDate() - (lastFiveTries.length - 1 - index));

        history.push({
          timestamp: attemptDate.toISOString(),
          success: attempt,
          rating: attempt ? 3 : 1,
          time_spent: 0
        });
      });
    }

    // Use lastReviewDate if available, otherwise fall back to date
    const lastAttemptDate = oldData.lastReviewDate || oldData.date;

    const progressRecord = {
      user_id: userId,
      quiz_id: quizId,
      song_ann_id: songAnnId,
      fsrs_state: fsrsState,
      attempt_count: totalAttempts,
      success_count: successCount,
      failure_count: oldData.failureCount || 0,
      success_streak: oldData.successStreak || 0,
      failure_streak: oldData.failureStreak || 0,
      last_attempt_at: lastAttemptDate ? new Date(lastAttemptDate).toISOString() : null,
      history
    };

    imports.push(progressRecord);
  }

  if (imports.length === 0) {
    return { imported: 0, failed: 0 };
  }

  console.log(`[IMPORT] Importing ${imports.length} training progress records`);

  // Insert records directly (no unique constraint on user_id, quiz_id, song_ann_id in current schema)
  const { error } = await supabase
    .from('training_progress')
    .insert(imports);

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

/**
 * Rebuild training progress for a song from its play records
 * Used when a play is deleted to restore correct FSRS state and history
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} quizId - Quiz ID
 * @param {number} songAnnId - Song AMQ ID (numeric)
 */
export async function recalculateSongProgress(supabase, userId, quizId, songAnnId) {
  // 1. Fetch all remaining plays for this song, ordered by time
  const { data: plays, error: playsError } = await supabase
    .from('training_session_plays')
    .select('*')
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('song_ann_id', songAnnId)
    .order('played_at', { ascending: true });

  if (playsError) {
    throw new Error(`Failed to fetch plays for recalculation: ${playsError.message}`);
  }

  // 2. If no plays left, delete the progress record
  if (!plays || plays.length === 0) {
    await supabase
      .from('training_progress')
      .delete()
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('song_ann_id', songAnnId);
    return null;
  }

  // 3. Replay history to rebuild state
  // Start with a fresh card
  let fsrsState = trainingScheduler.createNewCard(String(songAnnId));
  let history = [];
  let successCount = 0;
  let failureCount = 0;
  let successStreak = 0;
  let failureStreak = 0;
  let lastAttemptAt = null;

  // Sort plays by time just in case DB sort failed (though query had order)
  plays.sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

  for (const play of plays) {
    const rating = play.rating;
    const isSuccess = play.success;
    const playedAt = play.played_at;

    // Re-schedule using the play timestamp as 'now'
    fsrsState = trainingScheduler.scheduleNext(fsrsState, rating, new Date(playedAt));

    // Update stats
    if (isSuccess) {
      successCount++;
      successStreak++;
      failureStreak = 0;
    } else {
      failureCount++;
      failureStreak++;
      successStreak = 0;
    }

    lastAttemptAt = playedAt;

    history.push({
      timestamp: playedAt,
      success: isSuccess,
      rating: rating
    });
  }

  // 4. Update training_progress
  const updatedRecord = {
    fsrs_state: fsrsState,
    attempt_count: plays.length,
    success_count: successCount,
    failure_count: failureCount,
    success_streak: successStreak,
    failure_streak: failureStreak,
    history: history,
    last_attempt_at: lastAttemptAt,
    updated_at: new Date().toISOString()
  };

  const { error: updateError } = await supabase
    .from('training_progress')
    .update(updatedRecord)
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('song_ann_id', songAnnId);

  if (updateError) {
    throw new Error(`Failed to update progress record: ${updateError.message}`);
  }

  return updatedRecord;
}
