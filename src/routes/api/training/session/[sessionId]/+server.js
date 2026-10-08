/**
 * DELETE /api/training/session/[sessionId]
 * Delete a training session and cascade to child plays, recalculating progress
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { deleteTrainingHistory } from '$lib/server/training/delete-history.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';

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
    const { data: plays, error: playsError } = await fetchAllPages(() =>
      supabaseAdmin
        .from('training_session_plays')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('played_at', { ascending: true })
        .order('id', { ascending: true })
    );

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
  if (!session) throw error(401, { message: 'Unauthorized' });
  return json(await deleteTrainingHistory(createSupabaseAdmin(), session.user.id, params.sessionId));
}
