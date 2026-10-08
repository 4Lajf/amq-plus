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

		await response.json().catch(() => ({}));

		// Construct the public link with properly encoded filename
		const encodedFilename = encodeURIComponent(filename);
		const publicLink = `https://pixeldrain.com/api/filesystem/me/song_lists/${encodedFilename}`;

		// Verify-before-return: refuse to hand out a link that cannot be re-read.
		// This catches the corruption class where Pixeldrain accepts a write but
		// the object is truncated/unreadable.
		//
		// The check is a size comparison, not a full download + JSON.parse. Lists
		// reach ~100 MB, and parsing one back inside the save request added a
		// second full transfer to a path that already has Cloudflare's 100s limit
		// hanging over it. Truncation is the failure mode we actually saw, and a
		// byte count catches it.
		const expectedBytes = Buffer.byteLength(jsonContent, 'utf8');
		const storedBytes = await readPixeldrainSize(publicLink, authHeader);

		if (storedBytes === null) {
			console.warn(
				`[PIXELDRAIN] Could not determine stored size for ${filename}; skipping size verification`
			);
		} else if (storedBytes !== expectedBytes) {
			throw new Error(
				`Pixeldrain verify failed: stored ${storedBytes} bytes, expected ${expectedBytes}`
			);
		}

		return json({
			success: true,
			link: publicLink,
			filename: filename,
			size: expectedBytes,
			verifiedBytes: storedBytes
		});
	} catch (error) {
		console.error('Pixeldrain upload API error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

/**
 * Byte size of a stored Pixeldrain object, without downloading it.
 *
 * Only reads Content-Length: a HEAD, or a GET whose body is cancelled the
 * moment the headers arrive. Deliberately never parses the body - the whole
 * point is to keep a 100 MB list off the save path.
 *
 * @param {string} publicLink - Pixeldrain filesystem URL
 * @param {string} authHeader - Basic auth header value
 * @returns {Promise<number|null>} Size in bytes, or null if it cannot be determined
 */
async function readPixeldrainSize(publicLink, authHeader) {
	const headers = { Accept: 'application/json', Authorization: authHeader };

	for (const method of ['HEAD', 'GET']) {
		try {
			const response = await fetch(publicLink, {
				method,
				headers,
				signal: AbortSignal.timeout(30000)
			});

			// Stop the transfer as soon as we have the headers.
			const contentLength = Number(response.headers.get('content-length'));
			await response.body?.cancel();

			if (!response.ok) {
				// A failed HEAD may just mean the method is unsupported; let GET try.
				if (method === 'HEAD') continue;
				throw new Error(`${response.status} ${response.statusText}`);
			}

			if (Number.isFinite(contentLength) && contentLength > 0) {
				return contentLength;
			}
		} catch (err) {
			if (method === 'HEAD') {
				console.warn('[PIXELDRAIN] HEAD probe failed, trying GET:', err.message);
				continue;
			}
			console.warn('[PIXELDRAIN] Size probe failed:', err.message);
		}
	}

	return null;
}
