/**
 * DELETE /api/training/[quizId]/progress/song
 * Delete an entire song record and all its play history from a quiz
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function DELETE({ params, url, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();
  if (!session) throw error(401, { message: 'Unauthorized' });

  const userId = session.user.id;
  const { quizId } = params;
  const songAnnId = url.searchParams.get('songAnnId');
  const annSongId = url.searchParams.get('annSongId');
  const recordId = url.searchParams.get('recordId');

  const supabaseAdmin = createSupabaseAdmin();

  const { data: quiz } = await supabaseAdmin
    .from('quiz_configurations')
    .select('user_id')
    .eq('id', quizId)
    .single();

  if (!quiz || quiz.user_id !== userId) {
    throw error(403, { message: 'You do not have permission to modify this quiz\'s training.' });
  }

  // Allow deletion by recordId, songAnnId, or annSongId
  // At least one identifier must be provided
  if (!songAnnId && !annSongId && !recordId) {
    throw error(400, { message: 'songAnnId, annSongId, or recordId is required' });
  }

  try {
    console.log(`[DELETE SONG] Deleting song for user ${userId}, quiz ${quizId}. Identifiers: songAnnId=${songAnnId}, annSongId=${annSongId}, recordId=${recordId}`);

    // If recordId is provided, delete by primary key (most reliable for records without song IDs)
    if (recordId) {
      // First, get the record to find its song identifiers for play deletion
      const { data: progressRecord, error: fetchError } = await supabaseAdmin
        .from('training_progress')
        .select('song_ann_id, "annSongId"')
        .eq('id', recordId)
        .eq('user_id', userId)
        .eq('quiz_id', quizId)
        .single();

      if (fetchError || !progressRecord) {
        throw error(404, { message: 'Progress record not found' });
      }

      // Delete plays using the song identifiers from the record
      let playDeleteQuery = supabaseAdmin
        .from('training_session_plays')
        .delete()
        .eq('user_id', userId)
        .eq('quiz_id', quizId);

      if (progressRecord.song_ann_id) {
        playDeleteQuery = playDeleteQuery.eq('song_ann_id', progressRecord.song_ann_id);
      } else if (progressRecord.annSongId) {
        playDeleteQuery = playDeleteQuery.eq('annSongId', progressRecord.annSongId);
      } else {
        // If record has no song IDs, delete plays that also have NULL song IDs
        // This handles training data without song identifiers
        playDeleteQuery = playDeleteQuery.is('song_ann_id', null).is('annSongId', null);
      }

      const { error: playDeleteError } = await playDeleteQuery;
      if (playDeleteError) {
        console.error('[DELETE SONG] Error deleting plays:', playDeleteError);
        throw error(500, { message: 'Failed to delete play records' });
      }

      // Delete the progress record by ID
      const { error: progressDeleteError } = await supabaseAdmin
        .from('training_progress')
        .delete()
        .eq('id', recordId)
        .eq('user_id', userId)
        .eq('quiz_id', quizId);

      if (progressDeleteError) {
        console.error('[DELETE SONG] Error deleting progress:', progressDeleteError);
        throw error(500, { message: 'Failed to delete progress record' });
      }
    } else {
      // Original logic: delete by song identifiers
      // 1. Delete all plays for this song in this quiz
      let playDeleteQuery = supabaseAdmin
        .from('training_session_plays')
        .delete()
        .eq('user_id', userId)
        .eq('quiz_id', quizId);

      if (songAnnId) {
        playDeleteQuery = playDeleteQuery.eq('song_ann_id', parseInt(songAnnId));
      } else if (annSongId) {
        playDeleteQuery = playDeleteQuery.eq('annSongId', annSongId);
      }

      const { error: playDeleteError } = await playDeleteQuery;
      if (playDeleteError) {
        console.error('[DELETE SONG] Error deleting plays:', playDeleteError);
        throw error(500, { message: 'Failed to delete play records' });
      }

      // 2. Delete the progress record
      let progressDeleteQuery = supabaseAdmin
        .from('training_progress')
        .delete()
        .eq('user_id', userId)
        .eq('quiz_id', quizId);

      if (songAnnId) {
        progressDeleteQuery = progressDeleteQuery.eq('song_ann_id', parseInt(songAnnId));
      } else if (annSongId) {
        progressDeleteQuery = progressDeleteQuery.eq('annSongId', annSongId);
      }

      const { error: progressDeleteError } = await progressDeleteQuery;
      if (progressDeleteError) {
        console.error('[DELETE SONG] Error deleting progress:', progressDeleteError);
        throw error(500, { message: 'Failed to delete progress record' });
      }
    }

    return json({ 
      success: true, 
      message: 'Song record and all attempt history deleted successfully' 
    });
  } catch (err) {
    console.error('[DELETE SONG] Error in DELETE song record:', err);
    if (err.status) throw err;
    throw error(500, { message: 'Internal server error' });
  }
}

