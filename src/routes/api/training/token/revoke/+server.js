/**
 * POST /api/training/token/revoke
 * Revoke the current user's training token
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function POST({ locals: { safeGetSession } }) {

  const { session } = await safeGetSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;


  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Delete the token completely from the database
    const { error } = await supabaseAdmin
      .from('training_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error revoking token:', error);
      return json({ error: 'Failed to revoke token' }, { status: 500 });
    }

    return json({ message: 'Token revoked successfully' });
  } catch (error) {
    console.error('Error revoking token:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

