/**
 * DELETE /api/training/session/[sessionId]
 * Delete a training session and cascade to child plays, recalculating progress
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { recalculateSongProgress } from '$lib/server/training/training-utils.js';

// GET: Get session details and plays
// @ts-ignore
export async function GET({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();
  if (!session) throw error(401, { message: 'Unauthorized' });

  const userId = session.user.id;
  const sessionId = params.sessionId;
  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch session
    const { data: trainingSession, error: sessionError } = await supabaseAdmin
      .from('training_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !trainingSession) {
      throw error(404, { message: 'Session not found' });
    }
    if (trainingSession.user_id !== userId) {
      throw error(403, { message: 'Forbidden' });
    }

    // Fetch plays
    const { data: plays, error: playsError } = await supabaseAdmin
      .from('training_session_plays')
      .select('*')
      .eq('session_id', sessionId)
      .order('played_at', { ascending: true });

    if (playsError) {
      console.error('Error fetching plays:', playsError);
      throw error(500, { message: 'Failed to load plays' });
    }

    return json({ session: trainingSession, plays });
  } catch (err) {
    console.error('[Session Details] Error:', err);
    if (err.status) throw err;
    throw error(500, { message: 'Internal server error' });
  }
}

// @ts-ignore
export async function DELETE({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw error(401, { message: 'Unauthorized' });
  }

  const userId = session.user.id;
  const sessionId = params.sessionId;

  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Verify the session belongs to the user and get quiz_id
    const { data: trainingSession, error: fetchError } = await supabaseAdmin
      .from('training_sessions')
      .select('id, user_id, quiz_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !trainingSession) {
      throw error(404, { message: 'Session not found' });
    }

    if (trainingSession.user_id !== userId) {
      throw error(403, { message: 'Not authorized to delete this session' });
    }

    const quizId = trainingSession.quiz_id;

    // 1. Fetch all plays for this session to know which songs are affected
    const { data: plays, error: playsError } = await supabaseAdmin
      .from('training_session_plays')
      .select('id, quiz_id, song_ann_id')
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (playsError) {
      console.error('[Training Session Delete] Error fetching plays:', playsError);
      throw error(500, { message: 'Failed to fetch session plays' });
    }

    // 2. Build set of unique (quiz_id, song_ann_id) pairs affected
    const affectedSongs = new Map();
    (plays || []).forEach(play => {
      const key = `${play.quiz_id}:${play.song_ann_id}`;
      if (!affectedSongs.has(key)) {
        affectedSongs.set(key, { quizId: play.quiz_id, songAnnId: play.song_ann_id });
      }
    });

    console.log('[Training Session Delete] Session has', plays?.length || 0, 'plays affecting', affectedSongs.size, 'unique songs');

    // 3. Delete all plays for this session
    if (plays && plays.length > 0) {
      const { error: deletePlaysError } = await supabaseAdmin
        .from('training_session_plays')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', userId);

      if (deletePlaysError) {
        console.error('[Training Session Delete] Error deleting plays:', deletePlaysError);
        throw error(500, { message: 'Failed to delete session plays' });
      }

      console.log('[Training Session Delete] Deleted', plays.length, 'plays');
    }

    // 4. Delete the session itself
    const { error: deleteError } = await supabaseAdmin
      .from('training_sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      console.error('[Training Session Delete] Database error:', deleteError);
      throw error(500, { message: 'Failed to delete session' });
    }

    // 5. Recalculate progress for each affected song
    // This will rebuild FSRS state from remaining plays or delete progress if no plays remain
    let recalcSuccessCount = 0;
    let recalcErrorCount = 0;

    for (const songInfo of affectedSongs.values()) {
      try {
        await recalculateSongProgress(supabaseAdmin, userId, songInfo.quizId, songInfo.songAnnId);
        recalcSuccessCount++;
      } catch (recalcError) {
        console.error('[Training Session Delete] Error recalculating progress for', songInfo.songAnnId, ':', recalcError);
        recalcErrorCount++;
        // Continue with other songs - don't fail the whole request
      }
    }

    console.log('[Training Session Delete] Recalculated progress for', recalcSuccessCount, 'songs,', recalcErrorCount, 'errors');

    return json({
      success: true,
      message: `Session and ${plays?.length || 0} play records deleted successfully`,
      deletedPlays: plays?.length || 0,
      recalculatedSongs: recalcSuccessCount,
      recalculationErrors: recalcErrorCount
    });
  } catch (err) {
    console.error('[Training Session Delete] Error:', err);
    if (err.status) {
      throw err;
    }
    throw error(500, { message: 'Failed to delete session' });
  }
}

