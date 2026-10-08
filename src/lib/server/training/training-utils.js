/**
 * Training Utilities - Helper functions for training mode
 * 
 * Includes token generation, hashing, progress merging, and statistics calculation
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { MAX_INTERVAL_DAYS, trainingScheduler, State } from './fsrs-service.js';
import { fetchAllPages } from '../utils/supabasePaging.js';
import { isPlayableProgressRecord } from './progress-filters.js';
import { utcStartOfDay, utcAddDays } from '$lib/utils/day-boundary.js';

/**
 * May this user act on this quiz's *own training data*?
 *
 * Owning the quiz is one way in. The other is having training progress on it,
 * which is how a shared quiz works: `/training/[quizId]` already admits anyone
 * with rows for that quiz, and every one of these actions writes only to that
 * caller's own `training_progress` (scoped by `user_id` as well as `quiz_id`),
 * so a trainee can never touch the owner's schedule or anyone else's.
 *
 * Deliberately **not** used for per-quiz settings (`daily_new_limit`, the goal,
 * the same-day toggle). Those live on `quiz_configurations` and are one shared
 * row — a trainee changing them would change them for the owner and every other
 * trainee. Settings stay owner-only.
 *
 * A user with no rows on someone else's quiz still gets refused, which is the
 * case `suspendFromConnector.test.js` pins.
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string} userId
 * @param {string} quizId
 * @returns {Promise<boolean>}
 */
export async function mayModifyOwnTrainingFor(supabase, userId, quizId) {
  const { data: quiz } = await supabase
    .from('quiz_configurations')
    .select('user_id')
    .eq('id', quizId)
    .single();

  if (!quiz) return false;
  if (quiz.user_id === userId) return true;

  const { count } = await supabase
    .from('training_progress')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('quiz_id', quizId);

  return (count ?? 0) > 0;
}

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
 * Deterministic lookup hash for a token.
 *
 * Tokens are 256 bits of CSPRNG output, so there is nothing to brute-force and
 * key stretching buys nothing. A plain sha256 gives us an indexable column and
 * turns authentication from an O(n) bcrypt scan into a single index hit.
 *
 * @param {string} token - Plaintext token
 * @returns {string} 64-character hex sha256 digest
 */
export function tokenLookupHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Every token ever issued comes from generateHighEntropyToken() - 32 bytes as hex. */
const TOKEN_FORMAT = /^[0-9a-f]{64}$/i;

/**
 * What the connector shows when a token does not resolve.
 *
 * W6a-bis: this used to be the bare string "Invalid token", which the
 * connector's generic error branch renders verbatim. That is a statement, not an
 * instruction - anyone who clears localStorage, switches browsers or mistypes a
 * token hits it with no idea what to do next. Tell them.
 */
export const INVALID_TOKEN_MESSAGE =
  'Your training token is no longer valid. Generate a new one at amqplus.moe/training and paste it into the AMQ+ config.';

/**
 * Short-lived memory of tokens that did not match anything.
 *
 * A wrong token always misses the token_sha256 index and then bcrypt-scans
 * every row that has not been backfilled yet. Rows belonging to users who never
 * come back are never backfilled, so that scan never drains - which leaves an
 * unauthenticated caller able to burn ~20s of CPU per request indefinitely.
 * Remembering recent misses turns a retry storm into one scan.
 *
 * Keyed by the sha256 lookup hash so no plaintext token sits in memory.
 *
 * @type {Map<string, number>}
 */
const failedLookups = new Map();
const FAILED_LOOKUP_TTL_MS = 5 * 60 * 1000;
const FAILED_LOOKUP_MAX = 1000;

function pruneFailedLookups(now = Date.now()) {
  for (const [hash, expiresAt] of failedLookups) {
    if (expiresAt <= now) failedLookups.delete(hash);
  }
  if (failedLookups.size <= FAILED_LOOKUP_MAX) return;
  // Oldest expiry first.
  const ordered = [...failedLookups.entries()].sort((a, b) => a[1] - b[1]);
  for (const [hash] of ordered.slice(0, failedLookups.size - FAILED_LOOKUP_MAX)) {
    failedLookups.delete(hash);
  }
}

/** Drop the negative cache. Called when a token is issued, and by tests. */
export function clearFailedTokenLookups() {
  failedLookups.clear();
}

/**
 * How many bcrypt compares to run at once during a legacy scan.
 *
 * W6b: bcrypt's node binding releases to libuv's threadpool, so compares really
 * do run in parallel - up to UV_THREADPOOL_SIZE, which defaults to 4. At ~60-100
 * ms per compare over the 222 un-backfilled rows in production, that is the
 * difference between a ~20 s first request users report as a bug and a ~5 s one
 * they do not notice.
 *
 * Deliberately not raising UV_THREADPOOL_SIZE globally: it is shared with
 * filesystem and DNS I/O, and this cohort shrinks to zero on its own as users
 * connect. Enlarging a global for a temporary cost is a bad trade.
 */
const BCRYPT_SCAN_CHUNK = 4;

/**
 * Find the row whose bcrypt hash matches this token, scanning in parallel chunks.
 *
 * Early exit is preserved at chunk granularity: once a chunk produces a match,
 * no later chunk starts. Within a chunk every compare runs regardless - that is
 * the cost of parallelism, and at chunk size 4 it is a rounding error against
 * the serial version.
 *
 * @param {string} token - Plaintext token from the connector
 * @param {Object[]} legacyTokens - Rows carrying only a bcrypt hash
 * @returns {Promise<Object|null>} The matching row, or null
 */
async function findTokenByBcryptScan(token, legacyTokens) {
  for (let i = 0; i < legacyTokens.length; i += BCRYPT_SCAN_CHUNK) {
    const chunk = legacyTokens.slice(i, i + BCRYPT_SCAN_CHUNK);
    const results = await Promise.all(
      chunk.map(async (dbToken) => ((await verifyToken(token, dbToken.token_hash)) ? dbToken : null))
    );

    // Keep the first match in row order so the result does not depend on which
    // compare happened to finish first.
    const match = results.find((row) => row !== null);
    if (match) return match;
  }

  return null;
}

/**
 * Resolve a plaintext connector token to its training_tokens row.
 *
 * Fast path is a single indexed lookup on token_sha256. Rows issued before that
 * column existed only have a bcrypt hash, so they still need a scan - but only
 * over the not-yet-backfilled rows, and a match backfills itself so the token
 * never pays that cost twice.
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string} token - Plaintext token from the connector
 * @returns {Promise<Object|null>} The matching training_tokens row, or null
 */
export async function lookupToken(supabase, token) {
  if (!token || typeof token !== 'string' || !TOKEN_FORMAT.test(token)) {
    return null;
  }

  const lookupHash = tokenLookupHash(token);

  pruneFailedLookups();
  if (failedLookups.has(lookupHash)) {
    return null;
  }

  const { data: match, error } = await supabase
    .from('training_tokens')
    .select('*')
    .eq('token_sha256', lookupHash)
    .eq('revoked', false)
    .maybeSingle();

  if (match) return match;

  // If the column is not there yet (code deployed ahead of the migration) this
  // errors. Degrade to the old full scan rather than locking everyone out.
  const columnMissing = !!error;
  if (columnMissing) {
    console.error(
      '[TRAINING AUTH] Indexed token lookup failed - has the token_sha256 migration run? Falling back to a full bcrypt scan:',
      error
    );
  }

  // Legacy path: bcrypt-only rows. Shrinks to zero as tokens get used.
  let legacyQuery = supabase.from('training_tokens').select('*').eq('revoked', false);
  if (!columnMissing) {
    legacyQuery = legacyQuery.is('token_sha256', null);
  }

  const { data: legacyTokens, error: legacyError } = await legacyQuery;

  if (legacyError) {
    console.error('[TRAINING AUTH] Legacy token fetch failed:', legacyError);
    return null;
  }

  if (!legacyTokens || legacyTokens.length === 0) {
    failedLookups.set(lookupHash, Date.now() + FAILED_LOOKUP_TTL_MS);
    return null;
  }

  console.warn(`[TRAINING AUTH] Falling back to bcrypt scan over ${legacyTokens.length} un-backfilled token(s)`);

  const matched = await findTokenByBcryptScan(token, legacyTokens);

  if (matched) {
    if (columnMissing) return matched;

    const { error: backfillError } = await supabase
      .from('training_tokens')
      .update({ token_sha256: lookupHash })
      .eq('id', matched.id);

    if (backfillError) {
      console.error('[TRAINING AUTH] token_sha256 backfill failed:', backfillError);
    }

    return { ...matched, token_sha256: lookupHash };
  }

  // Nothing matched after a full scan. Don't pay for it again on the next retry.
  failedLookups.set(lookupHash, Date.now() + FAILED_LOOKUP_TTL_MS);
  return null;
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
  const failures = [];

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
      // Omit defaulted columns entirely: PostgREST includes present undefined
      // keys in bulk-insert columns and writes NULL instead of their defaults.
      const { id, created_at, updated_at, ...sourceFields } = sourceRecord;
      const newRecord = {
        ...sourceFields,
        quiz_id: targetQuizId,
        is_active: true,
        inactivated_at: null
      };
      inserts.push(newRecord);
      addedCount++;
    }
  }

  // W7: apply updates in bulk. This used to be one `await update().eq('id')`
  // per row - the exact pattern Phase 1.7 replaced with bulkSetDueDates in
  // reset-due, clear-due and rescue-shelved. Merge was missed, so a large merge
  // could not finish inside Cloudflare's 100s window.
  const { applied: mergedApplied, failures: mergeFailures } = await applyMergeUpdates(
    supabase,
    userId,
    targetQuizId,
    updates
  );
  failures.push(...mergeFailures);

  // Apply inserts in chunks. A single insert of every new song is all-or-nothing:
  // one bad row (a duplicate that slipped past the merge key) used to discard the
  // whole batch, and the caller was still told the merge succeeded.
  let addedApplied = 0;
  const INSERT_CHUNK = 500;
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const chunk = inserts.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('training_progress').insert(chunk);

    if (error) {
      console.error(`Failed to insert records ${i}-${i + chunk.length}:`, error);
      failures.push(`insert ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      addedApplied += chunk.length;
    }
  }

  return {
    merged: mergedApplied,
    added: addedApplied,
    total: sourceProgress?.length || 0,
    // Counts the caller intended vs. what landed. A merge that silently wrote
    // nothing reported success for five months (3shine, 2026-03-05).
    attempted: { merged: mergedCount, added: addedCount },
    failures
  };
}

/** Rows per bulk_merge_training_progress call, matching bulk-reschedule.js. */
const MERGE_CHUNK_SIZE = 1000;

/**
 * Write merged progress rows in chunks through the bulk RPC.
 *
 * Falls back to the old row-at-a-time path if the function is not there yet -
 * the code can ship ahead of the migration, and losing a user's merge is worse
 * than being slow.
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string} userId
 * @param {string} targetQuizId
 * @param {Object[]} updates - Merged records carrying their existing row id
 * @returns {Promise<{applied: number, failures: string[]}>}
 */
async function applyMergeUpdates(supabase, userId, targetQuizId, updates) {
  if (!updates || updates.length === 0) {
    return { applied: 0, failures: [] };
  }

  let applied = 0;
  const failures = [];

  for (let i = 0; i < updates.length; i += MERGE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + MERGE_CHUNK_SIZE);
    const payload = chunk.map((record) => ({
      id: record.id,
      fsrs_state: record.fsrs_state,
      attempt_count: record.attempt_count,
      success_count: record.success_count,
      failure_count: record.failure_count,
      success_streak: record.success_streak,
      failure_streak: record.failure_streak,
      history: record.history,
      last_attempt_at: record.last_attempt_at
    }));

    const { data, error } = await supabase.rpc('bulk_merge_training_progress', {
      p_user_id: userId,
      p_quiz_id: targetQuizId,
      p_updates: payload
    });

    if (error) {
      console.error('[MERGE] Bulk RPC failed, falling back to per-row updates:', error);
      const fallback = await applyMergeUpdatesRowByRow(supabase, updates.slice(i));
      return {
        applied: applied + fallback.applied,
        failures: [...failures, ...fallback.failures]
      };
    }

    applied += typeof data === 'number' ? data : chunk.length;
  }

  // The bulk path cannot name the row that did not land - it only knows how many
  // did. Report the shortfall anyway: claiming a merge succeeded while writing
  // nothing is the exact failure this function already carries a regression test
  // for (3shine, 2026-03-05).
  if (applied < updates.length) {
    failures.push(`merge applied ${applied} of ${updates.length} update(s)`);
  }

  return { applied, failures };
}

/**
 * Pre-W7 path, kept as the fallback when the RPC is unavailable.
 * @param {Object} supabase - Supabase admin client
 * @param {Object[]} updates - Merged records carrying their existing row id
 * @returns {Promise<{applied: number, failures: string[]}>}
 */
async function applyMergeUpdatesRowByRow(supabase, updates) {
  let applied = 0;
  const failures = [];

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
        last_attempt_at: record.last_attempt_at,
        is_active: true,
        inactivated_at: null
      })
      .eq('id', record.id);

    if (error) {
      console.error(`Failed to update record ${record.id}:`, error);
      failures.push(`update ${record.id}: ${error.message}`);
    } else {
      applied++;
    }
  }

  return { applied, failures };
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
 * Filters out unavailable songs and de-duplicates by song_ann_id.
 * @param {Array} progressRecords - Array of training_progress records
 * @returns {Array} Normalized list of progress records
 */
export function normalizeProgressForQuizStats(progressRecords) {
  return deduplicateProgressRecords((progressRecords || []).filter(isPlayableProgressRecord));
}

/** Keep every status available for display and Resume, deduplicating legacy rows.
 * @param {Array} progressRecords
 * @returns {Array}
 */
export function deduplicateProgressRecords(progressRecords) {
  if (!progressRecords || progressRecords.length === 0) {
    return [];
  }

  const bySongId = new Map();

  for (const record of progressRecords) {
    const songAnnId = record.song_ann_id ?? record.id ?? record;

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
      freshDue: 0,
      catchUpQueue: 0,
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
  const today = utcStartOfDay(now);
  // Fresh = today + yesterday (≤1 calendar day overdue). Catch-Up = 2+ days overdue.
  const freshCutoff = utcAddDays(today, -1);

  let totalSongs = 0;
  let totalAttempts = 0;
  let totalSuccess = 0;
  let dueToday = 0;
  let freshDue = 0;
  let catchUpQueue = 0;
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

    // Calendar day comparison (UTC midnight). Includes overdue — same rule as
    // the quiz-page forecast day-0 bucket and trainingScheduler.getForecast.
    //
    // Split: freshDue (today + yesterday) vs catchUpQueue (older overdue) so the
    // UI can lead with Daily Goal psychology instead of a single debt number.
    // getDueSongs matches this for day-scale reviews; only same-day learning
    // steps still wait for their exact time (see isTrainingDue).
    const dueDateTime = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
    if (dueDateTime) {
      const dueDate = utcStartOfDay(dueDateTime);
      if (dueDate <= today) {
        dueToday++;
        if (dueDate < freshCutoff) {
          catchUpQueue++;
        } else {
          freshDue++;
        }
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
    freshDue,
    catchUpQueue,
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
    const parsedInterval = Number(oldData.interval);
    const interval = Number.isFinite(parsedInterval) && parsedInterval > 0
      ? Math.min(parsedInterval, MAX_INTERVAL_DAYS)
      : 1;
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
      const latestAllowedDue = new Date(Date.now() + MAX_INTERVAL_DAYS * 86_400_000);
      fsrsState.due = new Date(
        Math.min(dueDate.getTime(), latestAllowedDue.getTime())
      ).toISOString();

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

  // Deduplicate by song_ann_id: if multiple localStorage keys map to the same
  // AnisongDB song, keep only the one with the most attempts.
  const dedupedByAnnId = new Map();
  const noIdRecords = [];
  for (const record of imports) {
    if (record.song_ann_id == null) {
      noIdRecords.push(record);
      continue;
    }
    const key = `ann:${record.song_ann_id}`;
    const existing = dedupedByAnnId.get(key);
    if (!existing || (record.attempt_count || 0) > (existing.attempt_count || 0)) {
      dedupedByAnnId.set(key, record);
    }
  }
  const dedupedImports = [...Array.from(dedupedByAnnId.values()), ...noIdRecords];

  if (dedupedImports.length === 0) {
    return { imported: 0, failed: 0 };
  }

  const skipped = imports.length - dedupedImports.length;
  if (skipped > 0) {
    console.log(`[IMPORT] Deduplicated ${skipped} records (same song_ann_id from different keys)`);
  }

  console.log(`[IMPORT] Importing ${dedupedImports.length} training progress records`);

  const { error } = await supabase
    .from('training_progress')
    .insert(dedupedImports);

  if (error) {
    throw new Error(`Failed to import records: ${error.message}`);
  }

  return {
    imported: dedupedImports.length,
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
  // A rating can commit while history is being read. Only replace the version
  // observed before that read; a conflict must re-read both progress and plays.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryRecalculateSongProgress(supabase, userId, quizId, songAnnId);
    if (result !== RECALCULATION_CONFLICT) return result;
  }
  throw new Error('Training progress kept changing during recalculation; retry when ratings have settled.');
}

const RECALCULATION_CONFLICT = Symbol('recalculation conflict');

async function tryRecalculateSongProgress(supabase, userId, quizId, songAnnId) {
  const { data: previous, error: previousError } = await supabase
    .from('training_progress')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('song_ann_id', songAnnId)
    .maybeSingle();
  if (previousError) {
    throw new Error(`Failed to read progress for recalculation: ${previousError.message}`);
  }

  // 1. Fetch all remaining plays for this song, ordered by time
  const { data: plays, error: playsError } = await fetchAllPages(() =>
    supabase
      .from('training_session_plays')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('song_ann_id', songAnnId)
      .order('played_at', { ascending: true })
      .order('id', { ascending: true })
  );

  if (playsError) {
    throw new Error(`Failed to fetch plays for recalculation: ${playsError.message}`);
  }

  if (!previous) {
    if (plays.length) {
      throw new Error('Progress is missing for retained plays; reconciliation is required.');
    }
    return null;
  }

  // 2. If no plays left, delete the progress record
  if (!plays || plays.length === 0) {
    const { data: removed, error: deleteError } = await supabase
      .from('training_progress')
      .delete()
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('song_ann_id', songAnnId)
      .eq('id', previous.id)
      .eq('updated_at', previous.updated_at)
      .select('id');
    if (deleteError) {
      throw new Error(`Failed to remove progress record: ${deleteError.message}`);
    }
    return removed?.length === 1 ? null : RECALCULATION_CONFLICT;
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

  // The query uses timestamp + ID ordering so equal-time rows stay stable
  // across page boundaries and repeated recalculations.

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

  const { data: updated, error: updateError } = await supabase
    .from('training_progress')
    .update(updatedRecord)
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('song_ann_id', songAnnId)
    .eq('id', previous.id)
    .eq('updated_at', previous.updated_at)
    .select('id');

  if (updateError) {
    throw new Error(`Failed to update progress record: ${updateError.message}`);
  }

  return updated?.length === 1 ? updatedRecord : RECALCULATION_CONFLICT;
}
