import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * API endpoint for song list operations
 */

/**
 * POST handler for song list API operations
 * @param {Object} params - Request parameters
 * @param {Request} params.request - HTTP request object
 * @param {Object} params.locals - SvelteKit locals object
 * @param {Object} params.locals.user - Authenticated user object
 * @returns {Promise<Response>} HTTP response
 */
// @ts-ignore
export async function POST({ request, locals: { user } }) {
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { action, ...data } = await request.json();

		switch (action) {
			case 'export_list':
				return await handleExportList(data, user);

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('API Error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

/**
 * Handle list export in various formats
 *
 * @param {Object} params - Parameters object
 * @param {string} params.listId - List ID to export
 * @param {string} params.format - Export format ('json', 'csv', 'txt')
 * @param {Object} user - Authenticated user object
 * @returns {Promise<Response>} HTTP response
 */
async function handleExportList({ listId, format }, user) {
	try {
		const supabaseAdmin = createSupabaseAdmin();
		const { data: list, error } = await supabaseAdmin
			.from('song_lists')
			.select('*')
			.eq('id', listId)
			.eq('user_id', user.id)
			.single();

		if (error) throw error;
		if (!list) throw new Error('List not found');

		switch (format) {
			case 'json':
				return json({
					success: true,
					data: list,
					filename: `${list.name.replace(/[^a-z0-9]/gi, '_')}.json`
				});

			case 'csv':
				const csvData = exportToCSV(list.songs);
				return json({
					success: true,
					data: csvData,
					filename: `${list.name.replace(/[^a-z0-9]/gi, '_')}.csv`
				});

			case 'txt':
				const txtData = exportToTXT(list.songs);
				return json({
					success: true,
					data: txtData,
					filename: `${list.name.replace(/[^a-z0-9]/gi, '_')}.txt`
				});

			default:
				throw new Error('Invalid export format');
		}
	} catch (error) {
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 400 }
		);
	}
}

/**
 * Export songs to CSV format
 *
 * @param {Array<Object>} songs - Array of song objects
 * @returns {string} CSV formatted string
 */
function exportToCSV(songs) {
	const headers = ['Anime (EN)', 'Anime (JP)', 'Song Name', 'Artist', 'Type', 'MAL ID'];
	const rows = songs.map((song) => [
		song.animeENName || '',
		song.animeJPName || '',
		song.songName || '',
		song.songArtist || '',
		song.songType || '',
		song.malId || ''
	]);

	return [headers, ...rows].map((row) => row.map((field) => `"${field}"`).join(',')).join('\n');
}

/**
 * Export songs to TXT format
 *
 * @param {Array<Object>} songs - Array of song objects
 * @returns {string} TXT formatted string
 */
function exportToTXT(songs) {
	return songs
		.map(
			(song) =>
				`${song.songArtist} - ${song.songName} [${song.animeENName || song.animeJPName}] (${song.songType})`
		)
		.join('\n');
}
