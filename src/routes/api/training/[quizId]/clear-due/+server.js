/**
 * POST /api/training/[quizId]/clear-due
 * Clear all due songs by setting their due date to a far future date
 * Songs will no longer count as "due" until they are encountered again in training
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';

function isPlayableProgressRecord(record) {
  return record?.is_active !== false && record?.song_ann_id != null;
}

// FSRS State constants
const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3
};

// Far future date - year 2099
const FAR_FUTURE_DATE = new Date(2099, 0, 1, 0, 0, 0, 0);

// @ts-ignore
export async function POST({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw error(401, { message: 'Unauthorized' });
  }

  const userId = session.user.id;
  const quizId = params.quizId;

  const supabaseAdmin = createSupabaseAdmin();

  const { data: quiz } = await supabaseAdmin
    .from('quiz_configurations')
    .select('user_id')
    .eq('id', quizId)
    .single();

  if (!quiz || quiz.user_id !== userId) {
    throw error(403, { message: 'You do not have permission to modify this quiz\'s training.' });
  }

  try {
    // Fetch all due songs for this quiz
    const { data: progressRecords, error: fetchError } = await fetchAllPages(() =>
      supabaseAdmin
        .from('training_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('quiz_id', quizId)
        .order('id', { ascending: true })
    );

    if (fetchError) {
      console.error('[Clear Due Songs] Error fetching progress:', fetchError);
      throw error(500, { message: 'Failed to fetch training progress' });
    }

    if (!progressRecords || progressRecords.length === 0) {
      return json({
        success: true,
        message: 'No training progress found',
        clearedCount: 0
      });
    }

    const now = new Date();
    // Normalize to midnight for calendar day comparison (consistent with stats)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dueSongs = progressRecords.filter(record => {
      if (!isPlayableProgressRecord(record)) return false;
      if (!record.fsrs_state?.due) return false;
      const dueDateTime = new Date(record.fsrs_state.due);
      // Normalize due date to midnight for calendar day comparison
      const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
      return dueDate <= today;
    });

    if (dueSongs.length === 0) {
      return json({
        success: true,
        message: 'No due songs to clear',
        clearedCount: 0
      });
    }

    console.log(`[Clear Due Songs] Found ${dueSongs.length} due songs to clear`);

    // Set all due songs to far future date
    const updates = [];

    dueSongs.forEach((record) => {
      try {
        // Update FSRS state with far future due date
        // Keep the card in Review state so it maintains its learning progress
        const updatedFsrsState = {
          ...record.fsrs_state,
          due: FAR_FUTURE_DATE.toISOString(),
          // Keep existing state - don't change to Review if it was Learning/Relearning
          // This preserves the song's learning context for when it's encountered again
        };

        updates.push({
          id: record.id,
          fsrs_state: updatedFsrsState,
          updated_at: now.toISOString()
        });
      } catch (err) {
        console.error('[Clear Due Songs] Error processing song:', record.song_ann_id, err);
      }
    });

    // Batch update all records
    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from('training_progress')
        .update({
          fsrs_state: update.fsrs_state,
          updated_at: update.updated_at
        })
        .eq('user_id', userId)
        .eq('quiz_id', quizId)
        .eq('id', update.id);

      if (updateError) {
        console.error('[Clear Due Songs] Error updating song:', update.song_ann_id, updateError);
      }
    }

    console.log(`[Clear Due Songs] Successfully cleared ${updates.length} songs`);

    return json({
      success: true,
      message: `Cleared ${updates.length} due songs. They will be rescheduled when encountered in training.`,
      clearedCount: updates.length
    });
  } catch (err) {
    console.error('[Clear Due Songs] Error:', err);
    if (err.status) {
      throw err;
    }
    throw error(500, { message: 'Failed to clear due songs' });
  }
}

