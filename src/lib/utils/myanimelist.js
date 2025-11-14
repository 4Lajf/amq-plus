/**
 * MyAnimeList API utility functions.
 * Provides functions for fetching user lists from MyAnimeList using the official MAL API v2.
 * Requires client credentials for authentication.
 *
 * @module myanimelist
 */

const MAL_API_URL = 'https://api.myanimelist.net/v2';

/** @typedef {import('../../types/types.js').UserAnimeData} UserAnimeData */

/**
 * Fetches a user's anime list from MyAnimeList using the official MAL API.
 * Returns user data including scores, progress, and anime metadata.
 *
 * @param {string} username - MyAnimeList username
 * @param {Object} [options={}] - Filtering options
 * @param {Object} [options.selectedLists] - Object mapping status to boolean (e.g., {completed: true, watching: true})
 * @param {string} clientId - MAL Client ID (required for API authentication)
 * @returns {Promise<UserAnimeData[]>} Array of anime entries with user data
 * @throws {Error} If username or clientId is missing, or API request fails
 */
export async function fetchMALData(username, options = {}, clientId = null) {
	if (!username?.trim()) {
		throw new Error('Username is required');
	}

	if (!clientId) {
		throw new Error('MAL Client ID is required. Please contact administrator.');
	}

	const selectedLists = options.selectedLists || {};
	let allEntries = [];

	try {
		// Get list of statuses to fetch
		const statusesToFetch = Object.entries(selectedLists)
			.filter(([_, enabled]) => enabled)
			.map(([status, _]) => mapStatusToMAL(status))
			.filter(Boolean);

		// If no statuses selected, fetch all
		if (statusesToFetch.length === 0) {
			statusesToFetch.push('watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch');
		}

		// Fetch each status separately (MAL API doesn't support multiple statuses in one request)
		for (const status of statusesToFetch) {
			let offset = 0;
			const limit = 1000; // MAL API allows up to 1000 per request
			let hasMore = true;

			while (hasMore) {
				const entries = await fetchMALPage(username.trim(), offset, limit, status, clientId);

				if (entries.length === 0) {
					hasMore = false;
					break;
				}

				allEntries.push(...entries);

				// If we got less than limit, we've reached the end for this status
				if (entries.length < limit) {
					hasMore = false;
				} else {
					offset += limit;
					// Small delay between pages to be respectful
					await sleep(500);
				}
			}

			// Small delay between different statuses
			await sleep(500);
		}

		if (allEntries.length === 0) {
			throw new Error('No anime found in the list or the list is private');
		}

		return processMALData(allEntries, options);
	} catch (error) {
		console.error('MAL fetch error:', error);
		throw new Error(`Failed to fetch MyAnimeList data: ${error.message}`);
	}
}

/**
 * Fetch a page of user's anime list from MAL API
 * @param {string} username - MAL username
 * @param {number} offset - Pagination offset
 * @param {number} limit - Number of entries per page
 * @param {string} status - Single status to fetch (watching, completed, etc.)
 * @param {string} clientId - MAL Client ID
 * @returns {Promise<Array>} Array of anime entries
 */
async function fetchMALPage(username, offset, limit, status, clientId) {
	const url = new URL(`${MAL_API_URL}/users/${username}/animelist`);
	url.searchParams.append('limit', limit.toString());
	url.searchParams.append('offset', offset.toString());
	url.searchParams.append(
		'fields',
		'list_status,media_type,num_episodes,start_date,end_date,mean,popularity,num_list_users,genres,start_season'
	);

	// Add single status filter
	if (status) {
		url.searchParams.append('status', status);
	}

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'X-MAL-CLIENT-ID': clientId
		}
	});

	if (!response.ok) {
		if (response.status === 404) {
			throw new Error('User not found or list is private');
		}
		if (response.status === 401 || response.status === 403) {
			throw new Error('Invalid MAL API credentials');
		}
		throw new Error(`MAL API error: ${response.status} ${response.statusText}`);
	}

	const result = await response.json();
	return result.data || [];
}

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map UI status keys to MAL API values (official API format)
 * @param {string} uiStatus - UI status key
 * @returns {string|null} MAL API status value
 */
function mapStatusToMAL(uiStatus) {
	const mapping = {
		watching: 'watching',
		completed: 'completed',
		planning: 'plan_to_watch',
		on_hold: 'on_hold',
		dropped: 'dropped'
	};
	return mapping[uiStatus] || null;
}

/**
 * Process MAL data and format it consistently with AniList data structure
 * @param {Array} data - Raw MAL data from official API
 * @param {Object} options - Filter options
 * @returns {UserAnimeData[]} Processed anime list
 */
function processMALData(data, options = {}) {
	const animeList = [];

	data.forEach((entry) => {
		// Official MAL API v2 structure
		const anime = entry.node;
		const listStatus = entry.list_status;
		const malId = anime.id;

		// Filter by score if specified
		if (options.minScore && listStatus.score < options.minScore) {
			return;
		}

		// Filter by year if specified
		const year = anime.start_date ? parseInt(anime.start_date.split('-')[0]) : null;
		if (options.minYear && (!year || year < options.minYear)) {
			return;
		}
		if (options.maxYear && (!year || year > options.maxYear)) {
			return;
		}

		// Map MAL format to AniList format for consistency
		const format = mapMALFormatToAniList(anime.media_type);

		// Determine status: if rewatching, use REPEATING status
		const isRewatching = listStatus.is_rewatching || false;
		const status = isRewatching ? 'REPEATING' : mapMALStatusToAniList(listStatus.status);

		animeList.push({
			// Entry data - matching AniList structure
			entryId: malId,
			status: status,
			score: listStatus.score || 0,
			progress: listStatus.num_episodes_watched || 0,
			repeat: listStatus.num_times_rewatched || 0,
			startedAt: parseMALDate(listStatus.start_date),
			completedAt: parseMALDate(listStatus.finish_date),

			// Media data - minimal fields needed, will be enriched from AniList
			malId: malId,
			format: format,
			year: year,
			episodes: anime.num_episodes || 0,

			// These will be enriched from AniList later
			anilistId: null,
			mediaStatus: anime.status || null,
			startDate: anime.start_date ? { year: year } : null,
			duration: null,
			source: null,
			genres: anime.genres ? anime.genres.map((g) => g.name) : [],
			tags: [],
			averageScore: anime.mean ? Math.round(anime.mean * 10) : null,
			popularity: anime.popularity || null,
			favourites: anime.num_list_users || null
		});
	});

	return animeList;
}

/**
 * Map MAL media type to AniList format
 * @param {string} malType - MAL media type
 * @returns {string} AniList format
 */
function mapMALFormatToAniList(malType) {
	const mapping = {
		tv: 'TV',
		ova: 'OVA',
		movie: 'MOVIE',
		special: 'SPECIAL',
		ona: 'ONA',
		music: 'MUSIC'
	};
	return mapping[malType?.toLowerCase()] || 'UNKNOWN';
}

/**
 * Map MAL list status to AniList status
 * @param {string} malStatus - MAL list status from official API
 * @returns {string} AniList status
 */
function mapMALStatusToAniList(malStatus) {
	const statusStr = malStatus?.toLowerCase();

	const mapping = {
		watching: 'CURRENT',
		completed: 'COMPLETED',
		on_hold: 'PAUSED',
		dropped: 'DROPPED',
		plan_to_watch: 'PLANNING'
	};
	return mapping[statusStr] || 'PLANNING';
}

/**
 * Parse MAL date string to AniList date object
 * @param {string} dateString - MAL date string (YYYY-MM-DD)
 * @returns {Object|null} Date object or null
 */
function parseMALDate(dateString) {
	if (!dateString) return null;

	const parts = dateString.split('-');
	if (parts.length !== 3) return null;

	return {
		year: parseInt(parts[0]),
		month: parseInt(parts[1]),
		day: parseInt(parts[2])
	};
}
