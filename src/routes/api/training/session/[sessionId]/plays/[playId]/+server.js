/**
 * DELETE /api/training/session/[sessionId]/plays/[playId]
 * Delete an individual play record and recalculate song progress
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { recalculateSongProgress } from '$lib/server/training/training-utils.js';

// @ts-ignore
export async function DELETE({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();
  if (!session) throw error(401, { message: 'Unauthorized' });

  const userId = session.user.id;
  const { sessionId, playId } = params;
  const supabaseAdmin = createSupabaseAdmin();

  try {
    // 1. Get the play to verify ownership and get song details
    const { data: play, error: fetchError } = await supabaseAdmin
      .from('training_session_plays')
      .select('id, user_id, quiz_id, song_ann_id')
      .eq('id', playId)
      .eq('session_id', sessionId)
      .single();

    if (fetchError || !play) {
      throw error(404, { message: 'Play record not found' });
    }

    if (play.user_id !== userId) {
      throw error(403, { message: 'Forbidden' });
    }

    // 2. Delete the play
    const { error: deleteError } = await supabaseAdmin
      .from('training_session_plays')
      .delete()
      .eq('id', playId);

    if (deleteError) {
      console.error('Error deleting play:', deleteError);
      throw error(500, { message: 'Failed to delete play record' });
    }

    // 3. Recalculate progress for this song
    try {
      await recalculateSongProgress(supabaseAdmin, userId, play.quiz_id, play.song_ann_id);
    } catch (recalcError) {
      console.error('Error recalculating progress:', recalcError);
      // Don't fail the request if deletion succeeded, but warn
    }

    return json({ success: true, message: 'Play deleted and progress updated' });
  } catch (err) {
    console.error('Error in DELETE play:', err);
    if (err.status) throw err;
    throw error(500, { message: 'Internal server error' });
  }
}

