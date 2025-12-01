/**
 * POST /api/training/[quizId]/reset-due
 * Reset all due songs by rescheduling them over the next 30 days
 * This helps users manage backlogs without discouragement
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// FSRS State constants
const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3
};

// @ts-ignore
export async function POST({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw error(401, { message: 'Unauthorized' });
  }

  const userId = session.user.id;
  const quizId = params.quizId;

  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch all due songs for this quiz
    const { data: progressRecords, error: fetchError } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId);

    if (fetchError) {
      console.error('[Reset Due Songs] Error fetching progress:', fetchError);
      throw error(500, { message: 'Failed to fetch training progress' });
    }

    if (!progressRecords || progressRecords.length === 0) {
      return json({
        success: true,
        message: 'No training progress found',
        resetCount: 0
      });
    }

    const now = new Date();
    const dueSongs = progressRecords.filter(record => {
      if (!record.fsrs_state?.due) return false;
      const dueDate = new Date(record.fsrs_state.due);
      return dueDate <= now;
    });

    if (dueSongs.length === 0) {
      return json({
        success: true,
        message: 'No due songs to reset',
        resetCount: 0
      });
    }

    console.log(`[Reset Due Songs] Found ${dueSongs.length} due songs to reset`);

    // Reschedule songs over the next 30 days
    const updates = [];
    const spreadDays = 30;
    const songsPerDay = Math.ceil(dueSongs.length / spreadDays);

    dueSongs.forEach((record, index) => {
      try {
        // Calculate which day to schedule this song
        const dayOffset = Math.floor(index / songsPerDay);

        // Create a new due date spread over the next 30 days
        const newDueDate = new Date(now);
        newDueDate.setDate(newDueDate.getDate() + dayOffset);
        newDueDate.setHours(0, 0, 0, 0);

        // Update FSRS state
        const updatedFsrsState = {
          ...record.fsrs_state,
          due: newDueDate.toISOString(),
          last_review: now.toISOString(),
          // Keep the card in Review state (State 2)
          state: State.Review
        };

        updates.push({
          song_ann_id: record.song_ann_id,
          fsrs_state: updatedFsrsState,
          updated_at: now.toISOString()
        });
      } catch (err) {
        console.error('[Reset Due Songs] Error processing song:', record.song_ann_id, err);
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
        .eq('song_ann_id', update.song_ann_id);

      if (updateError) {
        console.error('[Reset Due Songs] Error updating song:', update.song_ann_id, updateError);
      }
    }

    console.log(`[Reset Due Songs] Successfully reset ${updates.length} songs`);

    return json({
      success: true,
      message: `Reset ${updates.length} due songs, spread over ${spreadDays} days`,
      resetCount: updates.length,
      spreadDays
    });
  } catch (err) {
    console.error('[Reset Due Songs] Error:', err);
    if (err.status) {
      throw err;
    }
    throw error(500, { message: 'Failed to reset due songs' });
  }
}

