import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * DELETE /api/song-lists/[id]
 * Deletes a song list by ID
 */
// @ts-ignore
export async function DELETE({ params, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	const { id } = params;

	if (!id) {
		return error(400, { message: 'Missing list ID' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		const { error: dbError } = await supabaseAdmin
			.from('song_lists')
			.delete()
			.eq('id', id)
			.eq('user_id', user.id); // Security: ensure user owns the list

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting song list:', err);
		return error(500, { message: 'Failed to delete song list' });
	}
}

/**
 * PATCH /api/song-lists/[id]
 * Updates song list settings (name, visibility, etc.)
 *
 * Request body:
 * {
 *   name?: string,
 *   is_public?: boolean
 * }
 */
// @ts-ignore
export async function PATCH({ params, request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	const { id } = params;

	if (!id) {
		return error(400, { message: 'Missing list ID' });
	}

	try {
		const body = await request.json();
		const { name, description, is_public } = body;

		// Build update object with only provided fields
		const updates = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) {
			updates.name = name.trim();
		}

		if (description !== undefined) {
			updates.description = description;
		}

		if (is_public !== undefined) {
			updates.is_public = is_public;
		}

		const supabaseAdmin = createSupabaseAdmin();

		const { data, error: dbError } = await supabaseAdmin
			.from('song_lists')
			.update(updates)
			.eq('id', id)
			.eq('user_id', user.id) // Security: ensure user owns the list
			.select()
			.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ data });
	} catch (err) {
		console.error('Error updating song list:', err);
		return error(500, { message: 'Failed to update song list' });
	}
}
