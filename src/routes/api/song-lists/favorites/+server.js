import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/song-lists/favorites
 * Fetches all favorite song lists for the authenticated user
 * Requires authentication
 */
// @ts-ignore
export async function GET({ locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to view favorites' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch user's favorite song lists
		const { data, error: dbError } = await supabaseAdmin
			.from('user_favorite_lists')
			.select(
				`
				list_id,
				created_at,
				public_song_lists (*)
			`
			)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false });

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		// Extract the public_song_lists data
		const favorites = (data || [])
			.map((fav) => ({
				...fav.public_song_lists,
				favorited_at: fav.created_at
			}))
			.filter(Boolean);

		return json({ data: favorites });
	} catch (err) {
		console.error('Error fetching favorites:', err);
		return error(500, { message: 'Failed to fetch favorites' });
	}
}

/**
 * POST /api/song-lists/favorites
 * Adds a song list to favorites
 *
 * Request body:
 * {
 *   list_id: string
 * }
 */
// @ts-ignore
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	try {
		const body = await request.json();
		const { list_id } = body;

		if (!list_id) {
			return error(400, { message: 'Missing list_id' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Check if already favorited
		const { data: existing } = await supabaseAdmin
			.from('user_favorite_lists')
			.select('*')
			.eq('user_id', user.id)
			.eq('list_id', list_id)
			.single();

		if (existing) {
			return error(400, { message: 'List already in favorites' });
		}

		// Add to favorites
		const { data, error: dbError } = await supabaseAdmin
			.from('user_favorite_lists')
			.insert({
				user_id: user.id,
				list_id,
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ data, success: true });
	} catch (err) {
		console.error('Error adding to favorites:', err);
		return error(500, { message: 'Failed to add to favorites' });
	}
}

/**
 * DELETE /api/song-lists/favorites
 * Removes a song list from favorites
 *
 * Request body:
 * {
 *   list_id: string
 * }
 */
// @ts-ignore
export async function DELETE({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	try {
		const body = await request.json();
		const { list_id } = body;

		if (!list_id) {
			return error(400, { message: 'Missing list_id' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		const { error: dbError } = await supabaseAdmin
			.from('user_favorite_lists')
			.delete()
			.eq('user_id', user.id)
			.eq('list_id', list_id);

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error removing from favorites:', err);
		return error(500, { message: 'Failed to remove from favorites' });
	}
}
