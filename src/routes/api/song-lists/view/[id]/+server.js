import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { isAdmin } from '$lib/server/auth-utils.js';

/**
 * GET /api/song-lists/view/[id]
 * Fetches a specific song list with access control:
 * - Public lists: anyone can view
 * - Private lists: only the creator can view
 */
// @ts-ignore
export async function GET({ params, locals }) {
	const { id } = params;

	if (!id) {
		return error(400, { message: 'Missing list ID' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch the song list
		const { data: list, error: dbError } = await supabaseAdmin
			.from('song_lists')
			.select('*')
			.eq('id', id)
			.single();

		if (dbError) {
			if (dbError.code === 'PGRST116') {
				return error(404, { message: 'List not found' });
			}
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

	// Check access control
	if (!list.is_public) {
		// Private list - requires authentication and ownership (or admin)
		const { session, user } = await locals.safeGetSession();

		if (!session || !user) {
			return error(401, { message: 'This is a private list. You must be logged in to view it.' });
		}

		// Allow access if user is admin or owns the list
		if (!isAdmin(user) && list.user_id !== user.id) {
			return error(403, { message: 'You do not have permission to view this private list.' });
		}
	}

		// Public list or authorized private list
		return json({ data: list });
	} catch (err) {
		console.error('Error fetching song list:', err);
		return error(500, { message: 'Failed to fetch song list' });
	}
}
