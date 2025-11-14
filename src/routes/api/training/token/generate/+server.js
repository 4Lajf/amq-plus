/**
 * POST /api/training/token/generate
 * Generate a new training token for the authenticated user
 * Revokes any existing token before generating a new one
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateHighEntropyToken, hashToken } from '$lib/server/training/training-utils.js';

// @ts-ignore
export async function POST({ locals: { safeGetSession } }) {

  const { session } = await safeGetSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;


  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Delete any existing token for this user
    await supabaseAdmin
      .from('training_tokens')
      .delete()
      .eq('user_id', userId);

    // Generate new token
    const plainToken = generateHighEntropyToken();
    const tokenHash = await hashToken(plainToken);

    // Insert new token
    const { error: insertError } = await supabaseAdmin
      .from('training_tokens')
      .insert({
        user_id: userId,
        token_hash: tokenHash
      });

    if (insertError) {
      console.error('Error inserting token:', insertError);
      return json({ error: 'Failed to create token' }, { status: 500 });
    }

    // Return plaintext token (only time it will be shown)
    return json({
      token: plainToken,
      message: 'Token generated successfully. Save it securely - it will not be shown again.'
    });
  } catch (error) {
    console.error('Error generating token:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

