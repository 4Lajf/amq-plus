/**
 * User List Cache API endpoint for caching anime list data.
 * Handles caching of AniList/MAL user lists to reduce external API calls.
 * Cache is completely global and user-agnostic - no user_id is stored.
 * All users (authenticated and guests) can read and write to the same cache.
 * Cache expires after 24 hours per status.
 * Expired cache entries are cleaned up automatically by pg_cron scheduled job.
 * See DATA_STRUCTURES.md for cache-related types.
 *
 * @module api/user-list-cache
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchMALData } from '$lib/utils/myanimelist.js';
import { fetchFromPixeldrain } from '$lib/server/pixeldrain.js';
// @ts-ignore
import { MAL_CLIENT_ID, PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * @typedef {Object} CacheData
 * @property {any[]} animeList - Array of anime entries
 * @property {any[]} songsList - Array of song entries
 */

/**
 * @typedef {Object} FetchCacheRequest
 * @property {'anilist'|'mal'} platform - Platform name
 * @property {string} username - Username on the platform
 * @property {Object} selectedLists - Object mapping status to boolean (e.g., {completed: true, watching: true})
 * @property {boolean} [forceRefresh] - Force refresh and bypass cache
 * @property {'fetch'} [action] - Action type (defaults to 'fetch')
 */

/**
 * @typedef {Object} StoreCacheRequest
 * @property {'anilist'|'mal'} platform - Platform name
 * @property {string} username - Username on the platform
 * @property {Object<string, CacheData>} cacheData - Cache data grouped by status
 * @property {'store'} action - Action type
 */

/**
 * @typedef {Object} CacheFetchResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {Array} animeList - Combined anime list
 * @property {Array|null} songsList - Combined songs list (null if no songs)
 * @property {number} count - Total anime count
 * @property {number} songsCount - Total songs count
 * @property {boolean} cached - Whether any data was cached
 * @property {string[]} cachedStatuses - List of cached statuses
 * @property {string[]} uncachedStatuses - List of uncached statuses
 * @property {boolean} needsSongsFetch - Whether songs need to be fetched
 * @property {string} [error] - Error message if success is false
 */

/**
 * @typedef {Object} CacheStoreResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if success is false
 */

/**
 * Maps frontend status names to database status names.
 *
 * @param {string} frontendStatus - Frontend status (completed, watching, planning, on_hold, dropped)
 * @returns {'COMPLETED'|'CURRENT'|'PLANNING'|'PAUSED'|'DROPPED'|'REPEATING'} Database status name
 */
function mapStatusToDatabase(frontendStatus) {
	const statusMap = {
		completed: 'COMPLETED',
		watching: 'CURRENT',
		planning: 'PLANNING',
		on_hold: 'PAUSED',
		dropped: 'DROPPED',
		repeating: 'REPEATING',
		// Also handle if already in correct format
		COMPLETED: 'COMPLETED',
		CURRENT: 'CURRENT',
		PLANNING: 'PLANNING',
		PAUSED: 'PAUSED',
		DROPPED: 'DROPPED',
		REPEATING: 'REPEATING'
	};
	return statusMap[frontendStatus] || frontendStatus.toUpperCase();
}

/**
 * Maps database status names back to frontend status names.
 *
 * @param {'COMPLETED'|'CURRENT'|'PLANNING'|'PAUSED'|'DROPPED'|'REPEATING'} dbStatus - Database status
 * @returns {string} Frontend status name
 */
function mapStatusToFrontend(dbStatus) {
	const statusMap = {
		COMPLETED: 'completed',
		CURRENT: 'watching',
		PLANNING: 'planning',
		PAUSED: 'on_hold',
		DROPPED: 'dropped',
		REPEATING: 'repeating'
	};
	return statusMap[dbStatus] || dbStatus.toLowerCase();
}

/**
 * Fetch data for guest users (can read cache but cannot write)
 * @param {string} platform - Platform ('anilist' or 'mal')
 * @param {string} username - Username to fetch
 * @param {string[]} frontendStatuses - Array of frontend status names
 * @param {boolean} forceRefresh - Whether to bypass cache
 * @returns {Promise<Response>} JSON response with anime list data
 */
async function fetchFreshDataForGuest(platform, username, frontendStatuses, forceRefresh = false) {
	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Map frontend statuses to database format
		const requestedStatuses = frontendStatuses.map(mapStatusToDatabase);

		// Check cache first (unless force refresh)
		let cachedStatuses = {};
		let uncachedStatuses = [];

		if (!forceRefresh) {
			// Guests can read from ANY user's cache (not filtered by user_id)
			const { data, error } = await supabaseAdmin
				.from('user_list_cache')
				.select('*')
				.eq('platform', platform)
				.eq('username', username.trim())
				.gt('expires_at', new Date().toISOString()); // Only get non-expired entries

			if (error) {
				console.error('Error fetching cache for guest:', error);
			} else if (data && data.length > 0) {
				// Group by status
				for (const cacheEntry of data) {
					const status = cacheEntry.status;
					if (requestedStatuses.includes(status)) {
						cachedStatuses[status] = cacheEntry;
					}
				}
				uncachedStatuses = requestedStatuses.filter((status) => !cachedStatuses[status]);
			} else {
				uncachedStatuses = requestedStatuses;
			}
		} else {
			uncachedStatuses = requestedStatuses;
		}

		// If all statuses are cached, return combined data
		if (uncachedStatuses.length === 0) {
			const combinedAnimeList = [];
			const combinedSongsList = [];
			let totalAnimeCount = 0;
			let totalSongsCount = 0;

			// Fetch data from Pixeldrain for each cached status
			for (const [status, cacheData] of Object.entries(cachedStatuses)) {
				try {
					// Fetch anime list from Pixeldrain
					if (cacheData.anime_list_link) {
						const animeList = await fetchFromPixeldrain(cacheData.anime_list_link);
						combinedAnimeList.push(...animeList);
					}

					// Fetch songs list from Pixeldrain
					if (cacheData.songs_list_link) {
						const songsList = await fetchFromPixeldrain(cacheData.songs_list_link);
						combinedSongsList.push(...songsList);
					}

					totalAnimeCount += cacheData.anime_count || 0;
					totalSongsCount += cacheData.songs_count || 0;
				} catch (error) {
					console.error(`Error fetching cache data for ${status} from Pixeldrain:`, error);
					// If we can't fetch from Pixeldrain, treat it as cache miss
					uncachedStatuses.push(status);
					delete cachedStatuses[status];
				}
			}

			// If all cached data is accessible, return it
			if (uncachedStatuses.length === 0) {
				return json({
					success: true,
					animeList: combinedAnimeList,
					songsList: combinedSongsList.length > 0 ? combinedSongsList : null,
					count: totalAnimeCount,
					songsCount: totalSongsCount,
					cached: true,
					cachedStatuses: Object.keys(cachedStatuses),
					uncachedStatuses: [],
					needsSongsFetch: false
				});
			}
		}

		let freshAnimeList = [];
		let combinedAnimeList = [];

		if (platform === 'anilist') {
			combinedAnimeList = [];
		} else if (platform === 'mal') {
			if (!MAL_CLIENT_ID) {
				return json(
					{
						error: 'MAL API is not configured. Please contact administrator.'
					},
					{ status: 500 }
				);
			}
			const selectedLists = {};
			uncachedStatuses.forEach((status) => {
				const frontendStatus = mapStatusToFrontend(status);
				selectedLists[frontendStatus] = true;
			});
			freshAnimeList = await fetchMALData(username, { selectedLists }, MAL_CLIENT_ID);
			combinedAnimeList = [...freshAnimeList];
		}

		const combinedSongsList = [];

		// Fetch cached data from Pixeldrain and combine
		for (const [status, cacheData] of Object.entries(cachedStatuses)) {
			try {
				if (cacheData.anime_list_link) {
					const animeList = await fetchFromPixeldrain(cacheData.anime_list_link);
					combinedAnimeList.push(...animeList);
				}
				if (cacheData.songs_list_link) {
					const songsList = await fetchFromPixeldrain(cacheData.songs_list_link);
					combinedSongsList.push(...songsList);
				}
			} catch (error) {
				console.error(`Error fetching cached ${status} from Pixeldrain:`, error);
			}
		}

		return json({
			success: true,
			animeList: combinedAnimeList,
			songsList: combinedSongsList.length > 0 ? combinedSongsList : null,
			count: combinedAnimeList.length,
			songsCount: combinedSongsList.length,
			cached: Object.keys(cachedStatuses).length > 0,
			cachedStatuses: Object.keys(cachedStatuses),
			uncachedStatuses: uncachedStatuses, // Keep in database format (e.g., 'CURRENT') for server-side matching
			needsSongsFetch: uncachedStatuses.length > 0 // Need to fetch songs for uncached statuses
		});
	} catch (error) {
		console.error('Guest fetch error:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/user-list-cache (fetch cache)
 * Fetches user's anime list with per-status caching
 * - Returns cached data for statuses that are cached and not expired
 * - Indicates which statuses need fresh fetching from API
 * - Fetches fresh data if forceRefresh is true or if status not cached
 * - Works for both authenticated users (with caching) and guests (without caching)
 *
 * @param {Object} params - Request parameters
 * @param {Request|Object} params.request - Request object with JSON body (can be fake for delegation)
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} JSON response with cache data
 */
async function handleFetchCache({ request, locals }) {
	const { session, user } = await locals.safeGetSession();
	const isAuthenticated = !!(session && user);

	try {
		const { platform, username, selectedLists, forceRefresh } = await request.json();

		console.log('[API: User List Cache] Fetch request received:', {
			platform,
			username,
			selectedLists,
			forceRefresh,
			isAuthenticated
		});

		// Validate parameters
		if (!platform || !username) {
			console.warn('[API: User List Cache] Missing required parameters');
			return json({ error: 'Missing required parameters: platform and username' }, { status: 400 });
		}

		if (!['anilist', 'mal'].includes(platform)) {
			console.warn('[API: User List Cache] Invalid platform:', platform);
			return json({ error: 'Invalid platform. Must be "anilist" or "mal"' }, { status: 400 });
		}

		if (!selectedLists || typeof selectedLists !== 'object') {
			console.warn('[API: User List Cache] Invalid selectedLists');
			return json({ error: 'Invalid selectedLists' }, { status: 400 });
		}

		// Get list of requested statuses and map to database format
		const frontendStatuses = Object.keys(selectedLists).filter((status) => selectedLists[status]);
		const requestedStatuses = frontendStatuses.map(mapStatusToDatabase);

		console.log('[API: User List Cache] Requested statuses:', {
			frontendStatuses,
			requestedStatuses
		});

		if (requestedStatuses.length === 0) {
			console.warn('[API: User List Cache] No statuses selected');
			return json({ error: 'No statuses selected' }, { status: 400 });
		}

		// For guest users, they now have same cache access as authenticated users
		if (!isAuthenticated) {
			console.log(`[API: User List Cache] Guest user fetching ${platform}/${username} - global cache access`);
			return await fetchFreshDataForGuest(platform, username, frontendStatuses, forceRefresh);
		}

		// Authenticated users: use caching logic (same as guests now since cache is global)
		const supabaseAdmin = createSupabaseAdmin();

		if (forceRefresh) {
			for (const status of requestedStatuses) {
				try {
					// Use raw SQL to delete by platform/username/status without user_id filter
					const { error } = await supabaseAdmin
						.from('user_list_cache')
						.delete()
						.eq('platform', platform)
						.eq('username', username.trim())
						.eq('status', status);

					if (error) {
						console.error(`Error clearing cache for ${status}:`, error);
					}
				} catch (error) {
					console.error(`Error clearing cache for ${status}:`, error);
				}
			}
		}

		// Check for cached data per status (if not forcing refresh)
		let cachedStatuses = {};
		let uncachedStatuses = [];

		if (!forceRefresh) {
			const cacheResults = await getCachedListsByStatus(
				supabaseAdmin,
				user.id,
				platform,
				username,
				requestedStatuses
			);

			cachedStatuses = cacheResults.cached;
			uncachedStatuses = cacheResults.uncached;
		} else {
			uncachedStatuses = requestedStatuses;
			console.log(`Force refresh for ${platform}/${username} - fetching all statuses`);
		}

		// If all statuses are cached, return combined data
		if (uncachedStatuses.length === 0) {
			const combinedAnimeList = [];
			const combinedSongsList = [];
			let totalAnimeCount = 0;
			let totalSongsCount = 0;

			// Fetch data from Pixeldrain for each cached status
			for (const [status, cacheData] of Object.entries(cachedStatuses)) {
				try {
					// Fetch anime list from Pixeldrain
					if (cacheData.anime_list_link) {
						const animeList = await fetchFromPixeldrain(cacheData.anime_list_link);
						combinedAnimeList.push(...animeList);
					}

					// Fetch songs list from Pixeldrain
					if (cacheData.songs_list_link) {
						const songsList = await fetchFromPixeldrain(cacheData.songs_list_link);
						combinedSongsList.push(...songsList);
					}

					totalAnimeCount += cacheData.anime_count || 0;
					totalSongsCount += cacheData.songs_count || 0;

					// Touch cache entry to update last_accessed_at
					await supabaseAdmin.rpc('touch_cache_entry', { cache_id: cacheData.id });
				} catch (error) {
					console.error(`Error fetching cache data for ${status} from Pixeldrain:`, error);
					// If we can't fetch from Pixeldrain, treat it as cache miss
					uncachedStatuses.push(status);
					delete cachedStatuses[status];
				}
			}

			// If we had errors fetching from Pixeldrain, fall through to fetch fresh data
			if (uncachedStatuses.length > 0) {
				console.log(
					`Failed to fetch some cached data from Pixeldrain, fetching fresh:`,
					uncachedStatuses
				);
			} else {
				return json({
					success: true,
					animeList: combinedAnimeList,
					songsList: combinedSongsList,
					count: totalAnimeCount,
					songsCount: totalSongsCount,
					cached: true,
					cachedStatuses: Object.keys(cachedStatuses),
					uncachedStatuses: []
				});
			}
		}

		let freshAnimeList = [];
		let combinedAnimeList = [];

		if (platform === 'anilist') {
			combinedAnimeList = [];
		} else if (platform === 'mal') {
			if (!MAL_CLIENT_ID) {
				console.error('[API: User List Cache] MAL API not configured');
				return json(
					{
						error: 'MAL API is not configured. Please contact administrator.'
					},
					{ status: 500 }
				);
			}
			const uncachedSelectedLists = {};
			uncachedStatuses.forEach((status) => {
				const frontendStatus = mapStatusToFrontend(status);
				uncachedSelectedLists[frontendStatus] = true;
			});
			console.log('[API: User List Cache] Fetching from MAL API for statuses:', Object.keys(uncachedSelectedLists));
			freshAnimeList = await fetchMALData(
				username,
				{ selectedLists: uncachedSelectedLists },
				MAL_CLIENT_ID
			);
			console.log('[API: User List Cache] Fetched', freshAnimeList.length, 'anime entries from MAL');
			combinedAnimeList = [...freshAnimeList];
		}

		const combinedSongsList = [];

		// Fetch cached data from Pixeldrain and combine
		for (const [status, cacheData] of Object.entries(cachedStatuses)) {
			try {
				if (cacheData.anime_list_link) {
					const animeList = await fetchFromPixeldrain(cacheData.anime_list_link);
					combinedAnimeList.push(...animeList);
				}
				if (cacheData.songs_list_link) {
					const songsList = await fetchFromPixeldrain(cacheData.songs_list_link);
					combinedSongsList.push(...songsList);
				}
			} catch (error) {
				console.error(`Error fetching cached ${status} from Pixeldrain:`, error);
			}
		}

		return json({
			success: true,
			animeList: combinedAnimeList,
			songsList: combinedSongsList.length > 0 ? combinedSongsList : null,
			count: combinedAnimeList.length,
			songsCount: combinedSongsList.length,
			cached: Object.keys(cachedStatuses).length > 0,
			cachedStatuses: Object.keys(cachedStatuses),
			uncachedStatuses: uncachedStatuses, // Keep in database format (e.g., 'CURRENT') for server-side matching
			needsSongsFetch: uncachedStatuses.length > 0 // Need to fetch songs for uncached statuses
		});
	} catch (error) {
		console.error('User list cache error:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/user-list-cache
 * Handles both fetching and storing cache
 *
 * For FETCHING (action: 'fetch' or no action specified):
 * - platform: 'anilist' or 'mal'
 * - username: username on the platform
 * - selectedLists: object of selected list types
 * - forceRefresh: true to bypass cache and delete old entries (optional)
 *
 * For STORING (action: 'store'):
 * - platform: 'anilist' or 'mal'
 * - username: username on the platform
 * - cacheData: object mapping status to { animeList: [], songsList: [] }
 */
// @ts-ignore
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();

	try {
		const body = await request.json();
		const action = body.action || 'fetch'; // Default to fetch for backward compatibility

		// Store action works for both authenticated and guest users
		if (action === 'store') {
			// Create a new request wrapper for delegating
			const fakeRequest = {
				json: async () => body
			};
			return handleStoreCache({ request: fakeRequest, locals });
		} else {
			// Fetch action works for both authenticated and guest users
			// Create a new request wrapper for delegating
			const fakeRequest = {
				json: async () => body
			};
			return handleFetchCache({ request: fakeRequest, locals });
		}
	} catch (error) {
		console.error('POST error:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * Handle storing cache entries per status
 * Stores anime and song lists in Pixeldrain and records metadata in database
 * Cache is now global - guests can also write to cache
 * No user_id is stored in cache entries
 * 
 * @param {Object} params - Request parameters
 * @param {Request|Object} params.request - Request object with JSON body (can be fake for delegation)
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} JSON response with store result
 */
async function handleStoreCache({ request, locals }) {
	const { session, user } = await locals.safeGetSession();
	const userId = null; // Not used for global cache

	try {
		const { platform, username, cacheData } = await request.json();

		// Validate parameters
		if (!platform || !username || !cacheData) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (!['anilist', 'mal'].includes(platform)) {
			return json({ error: 'Invalid platform' }, { status: 400 });
		}

		if (typeof cacheData !== 'object' || Object.keys(cacheData).length === 0) {
			return json({ error: 'Invalid cacheData format' }, { status: 400 });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Store each status separately
		// Cache is global - guests and authenticated users can both write
		const results = await storeCachedListsByStatus(
			supabaseAdmin,
			userId,
			platform,
			username,
			cacheData
		);

		return json({
			success: true,
			message: 'Cache stored successfully',
			cachedStatuses: Object.keys(results),
			cacheDetails: results
		});
	} catch (error) {
		console.error('Error storing cache:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/user-list-cache
 * Clears cached data for a specific platform/username combination
 * Cache is global - any user (authenticated or guest) can clear it
 * Forces next request to fetch fresh data
 *
 * Query parameters:
 * - platform: 'anilist' or 'mal'
 * - username: username on the platform
 * - status: specific status to clear (optional, clears all if not provided)
 */
// @ts-ignore
export async function DELETE({ url, locals }) {
	// No authentication required - cache is global
	const { session, user } = await locals.safeGetSession();

	try {
		const platform = url.searchParams.get('platform');
		const username = url.searchParams.get('username');
		const status = url.searchParams.get('status') || null;

		if (!platform || !username) {
			return json({ error: 'Missing required parameters' }, { status: 400 });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Delete cache globally by platform/username/status (no user_id filter)
		let query = supabaseAdmin
			.from('user_list_cache')
			.delete()
			.eq('platform', platform)
			.eq('username', username.trim());

		if (status) {
			query = query.eq('status', status);
		}

		const { error: deleteError } = await query;

		if (deleteError) {
			console.error('Error clearing cache:', deleteError);
			return json({ error: 'Failed to clear cache' }, { status: 500 });
		}

		console.log(`Cleared cache entries for ${platform}/${username}${status ? `/${status}` : ''}`);

		return json({
			success: true,
			message: status ? `Cache cleared for status: ${status}` : 'All cache entries cleared',
			deletedCount: 1 // Supabase doesn't return count for DELETE
		});
	} catch (error) {
		console.error('Cache deletion error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

/**
 * Get cached lists by status from database
 * Cache is now global - shared across all users for the same platform/username/status
 * No user_id filtering - cache is completely user-agnostic
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string} userId - User ID (unused, kept for API compatibility)
 * @param {string} platform - Platform (anilist/mal)
 * @param {string} username - Username
 * @param {Array<string>} requestedStatuses - Array of status strings to fetch (in DB format)
 * @returns {Promise<Object>} Object with { cached: {...}, uncached: [...] }
 */
async function getCachedListsByStatus(supabase, userId, platform, username, requestedStatuses) {
	// Fetch cache entries globally (not filtered by user_id)
	const { data, error } = await supabase
		.from('user_list_cache')
		.select('*')
		.eq('platform', platform)
		.eq('username', username.trim())
		.gt('expires_at', new Date().toISOString()); // Only get non-expired entries

	if (error) {
		console.error('Error fetching cache by status:', error);
		return { cached: {}, uncached: requestedStatuses };
	}

	// Build result object
	const cached = {};
	const cachedStatusSet = new Set();

	if (data && data.length > 0) {
		// Filter by requested statuses
		data.forEach((entry) => {
			if (requestedStatuses.includes(entry.status)) {
				cached[entry.status] = entry;
				cachedStatusSet.add(entry.status);
			}
		});
	}

	// Find uncached statuses
	const uncached = requestedStatuses.filter((status) => !cachedStatusSet.has(status));

	return { cached, uncached };
}

/**
 * Store anime lists and songs lists in Pixeldrain cache per status
 * Cache is now global - shared across all users for the same platform/username/status
 * No user_id is stored - cache is completely user-agnostic
 * Expired entries are cleaned up by pg_cron scheduled job (not by triggers)
 *
 * @param {Object} supabase - Supabase admin client
 * @param {string|null} userId - User ID (unused, kept for API compatibility)
 * @param {string} platform - Platform (anilist/mal)
 * @param {string} username - Username
 * @param {Object} cacheData - Object mapping status to { animeList, songsList }
 * @returns {Promise<Object>} Object mapping status to cache entry details
 */
async function storeCachedListsByStatus(supabase, userId, platform, username, cacheData) {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

	if (!PIXELDRAIN_API_KEY) {
		throw new Error('Pixeldrain API is not configured');
	}

	const results = {};
	const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;

	// Store each status separately - upload to Pixeldrain
	for (const [status, data] of Object.entries(cacheData)) {
		const { animeList = [], songsList = [] } = data;

		try {
			// Create a cache identifier
			const timestamp = Date.now();
			const cacheId = `${platform}_${username}_${status}_${timestamp}`
				.toLowerCase()
				.replace(/[^a-z0-9_]/g, '_');

			// Upload anime list to Pixeldrain (song_cache folder)
			let animeListLink = null;
			if (animeList.length > 0) {
				const animeFilename = `${cacheId}_anime.json`;
				const animeUrl = `https://pixeldrain.com/api/filesystem/me/song_cache/${animeFilename}?make_parents=true`;

				const animeUpload = await fetch(animeUrl, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: authHeader
					},
					body: JSON.stringify(animeList)
				});

				if (!animeUpload.ok) {
					throw new Error(`Failed to upload anime list: ${animeUpload.statusText}`);
				}

				animeListLink = `https://pixeldrain.com/api/filesystem/me/song_cache/${encodeURIComponent(animeFilename)}`;
			}

			// Upload songs list to Pixeldrain (song_cache folder)
			let songsListLink = null;
			if (songsList.length > 0) {
				const songsFilename = `${cacheId}_songs.json`;
				const songsUrl = `https://pixeldrain.com/api/filesystem/me/song_cache/${songsFilename}?make_parents=true`;

				const songsUpload = await fetch(songsUrl, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Authorization: authHeader
					},
					body: JSON.stringify(songsList)
				});

				if (!songsUpload.ok) {
					throw new Error(`Failed to upload songs list: ${songsUpload.statusText}`);
				}

				songsListLink = `https://pixeldrain.com/api/filesystem/me/song_cache/${encodeURIComponent(songsFilename)}`;
			}

			// Store links in database using upsert
			// Cache is global - use platform, username, status as unique key (no user_id)
			const { data: insertedData, error } = await supabase
				.from('user_list_cache')
				.upsert(
					{
						platform: platform,
						username: username.trim(),
						status: status,
						anime_list_link: animeListLink,
						anime_count: animeList.length,
						songs_list_link: songsListLink,
						songs_count: songsList.length,
						expires_at: expiresAt.toISOString(),
						last_accessed_at: now.toISOString()
					},
					{
						onConflict: 'platform,username,status', // Global cache - unique by platform/username/status only
						ignoreDuplicates: false
					}
				)
				.select()
				.single();

			if (error) {
				console.error(`Error storing cache for status ${status}:`, error);
				throw new Error(`Failed to store cache entry for status: ${status}`);
			}

			results[status] = {
				id: insertedData.id,
				created_at: insertedData.created_at,
				expires_at: insertedData.expires_at,
				anime_count: insertedData.anime_count,
				songs_count: insertedData.songs_count,
				anime_list_link: animeListLink,
				songs_list_link: songsListLink
			};
		} catch (error) {
			console.error(`Error caching ${status}:`, error);
			throw error;
		}
	}

	return results;
}
