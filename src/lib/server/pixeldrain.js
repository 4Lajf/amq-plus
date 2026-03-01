// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * @typedef {Object} PixeldrainResponse
 * @property {string} id - File ID
 * @property {string} name - File name
 * @property {number} size - File size in bytes
 * @property {string} created - ISO timestamp of creation
 * @property {string} md5 - MD5 hash
 * @property {string} mimetype - MIME type
 * @property {string} thumbnail_href - Thumbnail URL (if available)
 * @property {string} download_url - Download URL
 */

/**
 * Fetch a file from Pixeldrain using Basic Auth
 * Uses the Pixeldrain API with authentication to retrieve file metadata and download URLs
 * Returns the JSON content from the Pixeldrain URL (typically an array of data)
 * 
 * @param {string} url - The Pixeldrain URL to fetch
 * @returns {Promise<any>} The parsed JSON response (typically an array)
 * @throws {Error} If API key is not configured or fetch fails
 */
export async function fetchFromPixeldrain(url) {
	if (!PIXELDRAIN_API_KEY) {
		throw new Error('Pixeldrain API is not configured');
	}

	const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;

	const response = await fetch(url, {
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

	return await response.json();
}
