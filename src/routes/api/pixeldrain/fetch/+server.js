import { json } from '@sveltejs/kit';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * API endpoint for fetching song lists from Pixeldrain
 */
// @ts-ignore
export async function GET({ url }) {
	try {
		const songListLink = url.searchParams.get('link');

		if (!songListLink) {
			return json({ error: 'link parameter is required' }, { status: 400 });
		}

		if (!PIXELDRAIN_API_KEY) {
			return json(
				{
					error: 'Pixeldrain API is not configured. Please contact administrator.'
				},
				{ status: 500 }
			);
		}

		// Fetch from Pixeldrain using Basic Auth
		const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;
		const response = await fetch(songListLink, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: authHeader
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Pixeldrain fetch error:', errorText);
			throw new Error(`Pixeldrain fetch failed: ${response.status} ${response.statusText}`);
		}

		const songs = await response.json();

		return json({
			success: true,
			songs: songs
		});
	} catch (error) {
		console.error('Pixeldrain fetch API error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
