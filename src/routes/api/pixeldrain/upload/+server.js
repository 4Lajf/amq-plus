/**
 * Pixeldrain upload API endpoint.
 * Handles uploading song list JSON files to Pixeldrain storage.
 *
 * @module pixeldrainUploadAPI
 */

import { json } from '@sveltejs/kit';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * Upload request parameters.
 * @typedef {Object} UploadRequest
 * @property {string} filename - Name of the file to upload
 * @property {string} content - JSON content to upload
 */

/**
 * Upload response structure.
 * @typedef {Object} UploadResponse
 * @property {boolean} success - Whether the upload was successful
 * @property {string} link - Public link to the uploaded file
 * @property {string} [error] - Error message if upload failed
 */

/**
 * API endpoint for uploading song lists to Pixeldrain.
 * @param {Object} params - Request parameters
 * @param {Request} params.request - HTTP request object
 * @param {URL} params.url - Request URL with search parameters
 * @param {Object} params.locals - SvelteKit locals with session and user data
 * @returns {Promise<Response>} Upload response
 */
export async function POST({ request, url, locals }) {
	// Check if user is authenticated
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		return json(
			{
				error: 'Authentication required. Please log in to upload files.'
			},
			{ status: 401 }
		);
	}
	try {
		const filename = url.searchParams.get('filename') || 'songlist.json';
		const jsonContent = await request.text();

		if (!filename) {
			return json(
				{
					error: 'filename is required'
				},
				{ status: 400 }
			);
		}

		if (!PIXELDRAIN_API_KEY) {
			return json(
				{
					error: 'Pixeldrain API is not configured. Please contact administrator.'
				},
				{ status: 500 }
			);
		}

		// Upload to Pixeldrain filesystem API
		const pixeldrainPath = `/song_lists/${filename}`;
		const uploadUrl = `https://pixeldrain.com/api/filesystem/me${pixeldrainPath}?make_parents=true`;

		// Use Basic Auth for Pixeldrain
		const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;
		const response = await fetch(uploadUrl, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: authHeader
			},
			body: jsonContent
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Pixeldrain upload error:', errorText);
			throw new Error(`Pixeldrain upload failed: ${response.status} ${response.statusText}`);
		}

		const result = await response.json();

		// Construct the public link with properly encoded filename
		const encodedFilename = encodeURIComponent(filename);
		const publicLink = `https://pixeldrain.com/api/filesystem/me/song_lists/${encodedFilename}`;

		return json({
			success: true,
			link: publicLink,
			filename: filename,
			size: jsonContent.length
		});
	} catch (error) {
		console.error('Pixeldrain upload API error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
