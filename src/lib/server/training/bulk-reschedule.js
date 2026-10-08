/**
 * Bulk due-date rescheduling for training_progress.
 *
 * reset-due, clear-due and rescue-shelved all used to end in a per-row
 * `await update().eq('id')` loop - 416 serialised round trips for zCrimlet's
 * 416-song reset, and unfinishable inside Cloudflare's 100s window for a
 * 2,000-song quiz. This routes through a single Postgres statement instead.
 *
 * @module lib/server/training/bulk-reschedule
 */

/** Rows per RPC call. Keeps the jsonb payload well under any statement limit. */
const CHUNK_SIZE = 1000;

/**
 * Apply new due dates to many training_progress rows.
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string} userId
 * @param {string} quizId
 * @param {Array<{ id: string, due: string }>} updates - Row id and new ISO due date
 * @returns {Promise<{ updated: number, failed: number }>}
 */
export async function bulkSetDueDates(supabase, userId, quizId, updates) {
  if (!updates || updates.length === 0) {
    return { updated: 0, failed: 0 };
  }

  let updated = 0;

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);

    const { data, error } = await supabase.rpc('bulk_set_training_due', {
      p_user_id: userId,
      p_quiz_id: quizId,
      p_updates: chunk
    });

    if (error) {
      // The function may not exist yet if the code shipped ahead of the
      // migration. Fall back to the old row-at-a-time path rather than
      // silently dropping the reschedule.
      console.error('[BULK RESCHEDULE] RPC failed, falling back to per-row updates:', error);
      const fallback = await updateRowByRow(supabase, userId, quizId, updates.slice(i));
      return { updated: updated + fallback.updated, failed: fallback.failed };
    }

    updated += typeof data === 'number' ? data : chunk.length;
  }

  return { updated, failed: updates.length - updated };
}

/**
 * @param {Object} supabase
 * @param {string} userId
 * @param {string} quizId
 * @param {Array<{ id: string, due: string }>} updates
 * @returns {Promise<{ updated: number, failed: number }>}
 */
async function updateRowByRow(supabase, userId, quizId, updates) {
  let updated = 0;
  let failed = 0;

  for (const update of updates) {
    const { data: existing } = await supabase
      .from('training_progress')
      .select('fsrs_state')
      .eq('id', update.id)
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .maybeSingle();

    if (!existing) {
      failed++;
      continue;
    }

    const { error } = await supabase
      .from('training_progress')
      .update({
        fsrs_state: { ...existing.fsrs_state, due: update.due },
        updated_at: new Date().toISOString()
      })
      .eq('id', update.id)
      .eq('user_id', userId)
      .eq('quiz_id', quizId);

    if (error) {
      console.error('[BULK RESCHEDULE] Row update failed:', update.id, error);
      failed++;
    } else {
      updated++;
    }
  }

  return { updated, failed };
}
