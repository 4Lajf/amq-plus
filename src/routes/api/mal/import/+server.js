import { json } from '@sveltejs/kit';
import { fetchMALData } from '$lib/utils/myanimelist.js';
// @ts-ignore
import { MAL_CLIENT_ID } from '$env/static/private';

/**
 * API endpoint for MAL import operations
 * Handles authentication with MAL API on server side
 */
// @ts-ignore
export async function POST({ request }) {
	try {
		const { action, username, selectedLists } = await request.json();

		if (!MAL_CLIENT_ID) {
			return json(
				{
					error: 'MAL API is not configured. Please contact administrator.'
				},
				{ status: 500 }
			);
		}

		switch (action) {
			case 'fetch_mal_list':
				return await handleMALListFetch(username, selectedLists);

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('MAL Import API Error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

/**
 * Handle MAL list fetching (without AniList enrichment - done client-side)
 */
async function handleMALListFetch(username, selectedLists) {
	try {
		if (!username?.trim()) {
			return json({ error: 'Username is required' }, { status: 400 });
		}

		// Fetch MAL list using server-side credentials
		// AniList enrichment will be done client-side to avoid rate limiting
		const malAnimeList = await fetchMALData(username, { selectedLists }, MAL_CLIENT_ID);

		return json({
			success: true,
			animeList: malAnimeList,
			count: malAnimeList.length
		});
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
