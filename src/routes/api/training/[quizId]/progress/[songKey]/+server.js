/**
 * DELETE /api/training/[quizId]/progress/[songKey]
 * Delete specific song from training history
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function DELETE({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  
  
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { quizId, songKey } = params;

    // URL decode the song key
    const decodedSongKey = decodeURIComponent(songKey);

    const { error } = await supabaseAdmin
      .from('training_progress')
      .delete()
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('song_key', decodedSongKey);

    if (error) {
      console.error('Error deleting song progress:', error);
      return json({ error: 'Failed to delete song progress' }, { status: 500 });
    }

    return json({ success: true, message: 'Song progress deleted' });
  } catch (error) {
    console.error('Error in DELETE song:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

