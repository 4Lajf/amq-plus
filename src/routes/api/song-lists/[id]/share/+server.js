import { json, error } from '@sveltejs/kit';
import { generateShareToken } from '$lib/utils/token.js';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * POST /api/song-lists/[id]/share
 * Generates or retrieves share tokens for a song list
 * 
 * @param {Object} event - Request event
 */
export async function POST({ params, locals }) {
  try {
    const { id } = params;
    const { session, user } = await locals.safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the list to check authorization
    const { data: list, error: fetchError } = await supabaseAdmin
      .from('song_lists')
      .select('id, user_id, view_token, edit_token')
      .eq('id', id)
      .single();

    if (fetchError || !list) {
      return error(404, { message: 'List not found' });
    }

    // Authorization check: must be owner
    if (list.user_id !== user.id) {
      return error(403, { message: 'Only the owner can manage share links' });
    }

    // Check if tokens already exist
    let viewToken = list.view_token;
    let editToken = list.edit_token;
    let needsUpdate = false;

    // Generate missing tokens
    if (!viewToken) {
      viewToken = generateShareToken();
      needsUpdate = true;
    }
    if (!editToken) {
      editToken = generateShareToken();
      needsUpdate = true;
    }

    // Update list with generated tokens if needed
    if (needsUpdate) {
      const updateData = {};
      if (!list.view_token) updateData.view_token = viewToken;
      if (!list.edit_token) updateData.edit_token = editToken;
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('song_lists')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('Database error:', updateError);
        return error(500, { message: 'Failed to generate share tokens' });
      }
    }

    return json({ viewToken, editToken });
  } catch (err) {
    console.error('Error generating share tokens:', err);
    return error(500, { message: 'Internal server error' });
  }
}

/**
 * PUT /api/song-lists/[id]/share
 * Regenerates share tokens for a song list
 * 
 * Request body:
 * {
 *   tokenType: 'view' | 'edit' | 'both'
 * }
 */
export async function PUT({ params, locals, request }) {
  try {
    const { id } = params;
    const { session, user } = await locals.safeGetSession();

    if (!session || !user) {
      return error(401, { message: 'Unauthorized' });
    }

    const body = await request.json();
    const { tokenType } = body; // 'view', 'edit', or 'both'

    const supabaseAdmin = createSupabaseAdmin();

    // Fetch the list to check authorization
    const { data: list, error: fetchError } = await supabaseAdmin
      .from('song_lists')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !list) {
      return error(404, { message: 'List not found' });
    }

    // Authorization check: must be owner
    if (list.user_id !== user.id) {
      return error(403, { message: 'Only the owner can manage share links' });
    }

    let updateData = {
      updated_at: new Date().toISOString()
    };

    // Generate new tokens based on type
    if (tokenType === 'view' || tokenType === 'both') {
      updateData.view_token = generateShareToken();
    }
    if (tokenType === 'edit' || tokenType === 'both') {
      updateData.edit_token = generateShareToken();
    }

    // Update list with new tokens
    const { error: updateError } = await supabaseAdmin
      .from('song_lists')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Database error:', updateError);
      return error(500, { message: 'Failed to regenerate tokens' });
    }

    // Return the current tokens (updated ones)
    const result = {};
    if (tokenType === 'view' || tokenType === 'both') {
      result.viewToken = updateData.view_token;
    }
    if (tokenType === 'edit' || tokenType === 'both') {
      result.editToken = updateData.edit_token;
    }

    return json(result);
  } catch (err) {
    console.error('Error regenerating tokens:', err);
    return error(500, { message: 'Internal server error' });
  }
}

