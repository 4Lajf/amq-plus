/**
 * DELETE /api/training/session/[sessionId]
 * Delete a training session
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

export async function DELETE({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    throw error(401, { message: 'Unauthorized' });
  }

  const userId = session.user.id;
  const sessionId = params.sessionId;

  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Verify the session belongs to the user
    const { data: trainingSession, error: fetchError } = await supabaseAdmin
      .from('training_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !trainingSession) {
      throw error(404, { message: 'Session not found' });
    }

    if (trainingSession.user_id !== userId) {
      throw error(403, { message: 'Not authorized to delete this session' });
    }

    // Delete the session
    const { error: deleteError } = await supabaseAdmin
      .from('training_sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      console.error('[Training Session Delete] Database error:', deleteError);
      throw error(500, { message: 'Failed to delete session' });
    }

    return json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (err) {
    console.error('[Training Session Delete] Error:', err);
    if (err.status) {
      throw err;
    }
    throw error(500, { message: 'Failed to delete session' });
  }
}

