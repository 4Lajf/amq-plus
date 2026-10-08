/**
 * POST /api/training/session/[sessionId]/finish
 * Finish an in-progress training session by setting completion date to NOW
 * and updating total_songs to the actual number played (correct + incorrect)
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function POST({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw error(401, { message: 'Unauthorized' });
  }

  const userId = session.user.id;
  const sessionId = params.sessionId;
  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch the session to verify ownership and get current values
    const { data: trainingSession, error: fetchError } = await supabaseAdmin
      .from('training_sessions')
      .select('id, user_id, correct_songs, incorrect_songs, total_songs, ended_at')
      .eq('id', sessionId)
      .single();

    if (fetchError || !trainingSession) {
      throw error(404, { message: 'Session not found' });
    }

    if (trainingSession.user_id !== userId) {
      throw error(403, { message: 'Not authorized to finish this session' });
    }

    // Check if session is already completed
    if (trainingSession.ended_at) {
      return json({ error: 'Session is already completed' }, { status: 400 });
    }

    // Calculate actual number of songs played
    const actualSongsPlayed = trainingSession.correct_songs + trainingSession.incorrect_songs;

    // Get existing session_data or initialize empty object
    const { data: fullSession } = await supabaseAdmin
      .from('training_sessions')
      .select('session_data')
      .eq('id', sessionId)
      .single();

    const sessionData = fullSession?.session_data || {};

    // Mark as manually finished so duration shows as N/A
    sessionData.manuallyFinished = true;

    // Update session: set ended_at to NOW, update total_songs to actual played count, and mark as manually finished
    const { error: updateError } = await supabaseAdmin
      .from('training_sessions')
      .update({
        ended_at: new Date().toISOString(),
        total_songs: actualSongsPlayed,
        session_data: sessionData
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error finishing session:', updateError);
      throw error(500, { message: 'Failed to finish session' });
    }

    return json({
      success: true,
      message: 'Session finished successfully',
      session: {
        id: sessionId,
        totalSongs: actualSongsPlayed,
        correctSongs: trainingSession.correct_songs,
        incorrectSongs: trainingSession.incorrect_songs,
        completedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Finish Session] Error:', err);
    if (err.status) {
      throw err;
    }
    throw error(500, { message: 'Failed to finish session' });
  }
}
