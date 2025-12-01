/**
 * Utility functions for Song List node operations.
 * Handles user list imports, saved lists fetching, and song list loading.
 * Reuses logic from songlist/create route for consistency.
 *
 * @module songListUtils
 */

import { fetchAniListData } from '$lib/utils/anilist.js';

/**
 * Song data from AnisongDB API.
 * @typedef {Object} AnisongDBSong
 * @property {number} annId - Anime News Network ID
 * @property {number} annSongId - ANN Song ID
 * @property {number} amqSongId - AMQ Song ID
 * @property {string} animeENName - English anime title
 * @property {string} animeJPName - Japanese anime title
 * @property {string|null} animeAltName - Alternative title
 * @property {string} [animeRomajiName] - Romaji anime title
 * @property {string} [animeEnglishName] - Alternative English anime title
 * @property {number} [malId] - MyAnimeList ID
 * @property {string} animeVintage - Release season/year (e.g., "Fall 1995")
 * @property {string} animeType - Anime format (TV, Movie, OVA, etc.)
 * @property {string} animeCategory - Category classification
 * @property {string} songType - Song type (e.g., "Opening 1", "Ending 2")
 * @property {string} songName - Song title
 * @property {string} songArtist - Artist name
 * @property {string} songComposer - Composer name
 * @property {string} songArranger - Arranger name
 * @property {number} songDifficulty - Difficulty rating (0-100)
 * @property {string} songCategory - Category (Standard, Instrumental, Chanting, Character)
 * @property {number} songLength - Duration in seconds
 * @property {boolean} isDub - Whether it's a dub version
 * @property {boolean} isRebroadcast - Whether from rebroadcast
 * @property {string|null} HQ - High quality video filename
 * @property {string|null} MQ - Medium quality video filename
 * @property {string|null} audio - Audio filename
 * @property {{myanimelist: number|null, anidb: number|null, anilist: number|null, kitsu: number|null}} linked_ids - External IDs
 * @property {Array<{id: number, name: string, line_up_id: number, groups: Array}>} artists - Artist details
 * @property {Array<{start: number, end: number, randomStartPosition: boolean}>} [sampleRanges]
 */

/**
 * Enriched song with source anime data.
 * @typedef {AnisongDBSong & {
 *   source?: 'list' | 'global',
 *   sourceAnime?: import('../../../../../types/types.js').UserAnimeData | null
 * }} EnrichedSong
 */

/**
 * User list cache fetch response.
 * @typedef {Object} UserListCacheResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {import('../../../../../types/types.js').UserAnimeData[]} animeList - Array of anime entries
 * @property {AnisongDBSong[]|null} songsList - Array of song entries (null if no songs)
 * @property {number} count - Total anime count
 * @property {number} songsCount - Total songs count
 * @property {boolean} cached - Whether any data was cached
 * @property {string|null} [cachedAt] - ISO timestamp when cached
 * @property {string|null} [expiresAt] - ISO timestamp when cache expires
 * @property {string[]} cachedStatuses - List of cached statuses
 * @property {string[]} uncachedStatuses - List of uncached statuses
 * @property {boolean} needsSongsFetch - Whether songs need to be fetched
 * @property {string} [error] - Error message if success is false
 */

/**
 * Cache information object.
 * @typedef {Object} CacheInfo
 * @property {boolean} cached - Whether any data was cached
 * @property {string|null} cachedAt - ISO timestamp when cached
 * @property {string|null} expiresAt - ISO timestamp when cache expires
 * @property {string[]} cachedStatuses - List of cached statuses
 * @property {string[]} uncachedStatuses - List of uncached statuses
 * @property {'anilist'|'mal'} platform - Platform name
 * @property {string} username - Username on the platform
 */

/**
 * Selected lists configuration.
 * @typedef {Object} SelectedLists
 * @property {boolean} [completed] - Include completed anime
 * @property {boolean} [watching] - Include watching anime
 * @property {boolean} [planning] - Include planning anime
 * @property {boolean} [on_hold] - Include on-hold anime
 * @property {boolean} [dropped] - Include dropped anime
 */

/**
 * Import result object.
 * @typedef {Object} ImportUserListResult
 * @property {import('../../../../../types/types.js').UserAnimeData[]} animeList - Array of anime entries
 * @property {EnrichedSong[]} songsList - Array of enriched songs
 * @property {CacheInfo} cacheInfo - Cache information
 */

/**
 * Progress callback function.
 * @typedef {Function} ProgressCallback
 * @param {number} eta - Estimated time remaining in seconds
 * @returns {void}
 */

/**
 * Cache data structure for storing anime and songs by status.
 * @typedef {Object} StatusCacheData
 * @property {import('../../../../../types/types.js').UserAnimeData[]} animeList - Array of anime entries
 * @property {EnrichedSong[]} songsList - Array of song entries
 */

/**
 * Cache data grouped by status.
 * @typedef {Object<string, StatusCacheData>} CacheDataByStatus
 */

/**
 * Cache store response.
 * @typedef {Object} CacheStoreResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if success is false
 */

/**
 * Saved song list metadata.
 * @typedef {Object} SavedSongList
 * @property {string} id - List ID
 * @property {string} name - List name
 * @property {string} description - List description
 * @property {boolean} is_public - Whether list is public
 * @property {number} song_count - Number of songs in list
 * @property {string} created_at - ISO timestamp of creation
 */

/**
 * Public list filters.
 * @typedef {Object} PublicListFilters
 * @property {string} [search] - Search all fields
 * @property {string} [name] - Filter by name
 * @property {string} [description] - Filter by description
 * @property {string} [creator] - Filter by creator
 * @property {string} [dateFrom] - Filter by date from (ISO date string)
 * @property {string} [dateTo] - Filter by date to (ISO date string)
 * @property {number} [page] - Page number (default 1)
 * @property {number} [limit] - Items per page (default 10)
 */

/**
 * Pagination information.
 * @typedef {Object} PaginationInfo
 * @property {number} page - Current page number
 * @property {number} limit - Items per page
 * @property {number} total - Total number of items
 * @property {number} totalPages - Total number of pages
 */

/**
 * Public lists response.
 * @typedef {Object} PublicListsResponse
 * @property {SavedSongList[]} lists - Array of public song lists
 * @property {PaginationInfo} pagination - Pagination information
 */

/**
 * Load list songs response.
 * @typedef {Object} LoadListSongsResponse
 * @property {EnrichedSong[]} songs - Array of songs from the list
 * @property {ListMetadata} metadata - List metadata
 */

/**
 * List metadata.
 * @typedef {Object} ListMetadata
 * @property {string} id - List ID
 * @property {string} name - List name
 * @property {number} songCount - Number of songs
 */

/**
 * Masterlist metadata.
 * @typedef {Object} MasterlistMetadata
 * @property {string} name - Metadata name
 * @property {string} description - Metadata description
 * @property {string} source - Data source
 */

/**
 * Validation result.
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether configuration is valid
 * @property {string|null} error - Error message if invalid
 */

/**
 * Song list configuration.
 * @typedef {Object} SongListConfig
 * @property {'masterlist'|'user-lists'|'saved-lists'|'provider'} mode - List mode
 * @property {Object} [userListImport] - User list import config
 * @property {string} [userListImport.platform] - Platform ('anilist'|'mal')
 * @property {string} [userListImport.username] - Username
 * @property {SelectedLists} [userListImport.selectedLists] - Selected lists
 * @property {string} [selectedListId] - Selected list ID (for saved-lists mode)
 * @property {Object} [providerImport] - Provider import config
 */

/**
 * Import user anime list from AniList or MyAnimeList.
 * Fetches anime list with songs using the user-list-cache API endpoint.
 * If songs are not cached, fetches them from AnisongDB.
 *
 * @param {'anilist'|'mal'} platform - Platform to import from
 * @param {string} username - Username to import
 * @param {SelectedLists} selectedLists - List types to import
 * @param {boolean} [forceRefresh=false] - Whether to bypass cache
 * @param {ProgressCallback} [onProgress] - Optional callback for progress updates (eta in seconds)
 * @returns {Promise<ImportUserListResult>} Import result with anime list, songs list, and cache info
 * @throws {Error} If import fails
 */
export async function importUserList(
	platform,
	username,
	selectedLists,
	forceRefresh = false,
	onProgress = null
) {
	if (!username?.trim()) {
		throw new Error('Username is required');
	}

	try {
		const response = await fetch('/api/user-list-cache', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'fetch',
				platform,
				username: username.trim(),
				selectedLists,
				forceRefresh
			})
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to fetch user list');
		}

		/** @type {UserListCacheResponse} */
		const result = await response.json();

		if (!result.success) {
			throw new Error(result.error || 'Failed to fetch user list');
		}

		/** @type {import('../../../../../types/types.js').UserAnimeData[]} */
		let animeList = result.animeList || [];
		/** @type {EnrichedSong[]} */
		let songsList = result.songsList || [];

		/** @type {CacheInfo} */
		const cacheInfo = {
			cached: result.cached || false,
			cachedAt: result.cachedAt || null,
			expiresAt: result.expiresAt || null,
			cachedStatuses: result.cachedStatuses || [],
			uncachedStatuses: result.uncachedStatuses || [],
			platform,
			username: username.trim()
		};

		if (platform === 'anilist' && result.uncachedStatuses && result.uncachedStatuses.length > 0) {
			try {
				const freshAnimeList = await fetchAniListData(username.trim(), {
					selectedStatuses: result.uncachedStatuses
				});
				animeList = [...animeList, ...freshAnimeList];
			} catch (error) {
				throw new Error(`Failed to fetch AniList data: ${error.message}`);
			}
		}

		// If songs need to be fetched from AnisongDB
		if (result.needsSongsFetch && result.uncachedStatuses && result.uncachedStatuses.length > 0) {
			console.log('Fetching songs from AnisongDB for uncached statuses:', result.uncachedStatuses);

			// Determine which anime need song fetching (only uncached statuses)
			const uncachedStatusSet = new Set(result.uncachedStatuses.map((s) => s.toUpperCase()));
			/** @type {import('../../../../../types/types.js').UserAnimeData[]} */
			const animeNeedingSongs = animeList.filter(
				(anime) => anime.status && uncachedStatusSet.has(anime.status.toUpperCase())
			);

			// Extract MAL IDs from uncached anime only
			const malIds = animeNeedingSongs.map((a) => a.malId).filter(Boolean);

			if (malIds.length > 0) {
				// Fetch songs from AnisongDB
				/** @type {AnisongDBSong[]} */
				const fetchedSongs = await fetchSongsFromAnisongDB(malIds, onProgress);

				// Enrich songs with sourceAnime data
				/** @type {EnrichedSong[]} */
				const enrichedSongs = fetchedSongs.map((song) => {
					const songMalId = song.malId || song.linked_ids?.myanimelist;
					/** @type {import('../../../../../types/types.js').UserAnimeData|undefined} */
					const sourceAnime = animeList.find((a) => a.malId === songMalId);

					if (!sourceAnime) {
						console.warn(
							'Could not find sourceAnime for song:',
							song.songName,
							'MAL ID:',
							songMalId
						);
					}

					return { ...song, sourceAnime: sourceAnime || null, source: 'list' };
				});

				// Combine with any cached songs
				songsList = [...songsList, ...enrichedSongs];

				// Store the fetched data in cache for future use
				try {
					await storeFetchedDataInCache(
						platform,
						username,
						animeList,
						enrichedSongs,
						result.uncachedStatuses
					);
					console.log('Successfully cached fetched data');
				} catch (cacheError) {
					console.error('Failed to store cache (non-fatal):', cacheError);
					// Don't throw - caching is optional optimization
				}
			}
		}

		return {
			animeList,
			songsList,
			cacheInfo
		};
	} catch (error) {
		console.error('Error importing user list:', error);
		throw error;
	}
}

/**
 * Fetch songs from AnisongDB using MAL IDs.
 * Handles chunking requests into batches of 500 (API limit) with delays.
 *
 * @param {number[]} malIds - Array of MyAnimeList IDs
 * @param {ProgressCallback} [onProgress] - Optional callback for progress updates (eta in seconds)
 * @returns {Promise<AnisongDBSong[]>} Array of song objects from AnisongDB
 * @throws {Error} If fetch fails
 */
async function fetchSongsFromAnisongDB(malIds, onProgress = null) {
	const CHUNK_SIZE = 500;
	const DELAY_MS = 1000; // 1 second delay between requests

	// Chunk MAL IDs to handle API limit
	const malIdChunks = [];
	for (let i = 0; i < malIds.length; i += CHUNK_SIZE) {
		malIdChunks.push(malIds.slice(i, i + CHUNK_SIZE));
	}

	/** @type {AnisongDBSong[]} */
	const allSongs = [];
	const startTime = Date.now();

	for (let i = 0; i < malIdChunks.length; i++) {
		const chunk = malIdChunks[i];

		// Calculate and report ETA
		if (onProgress && i > 0) {
			const elapsedTime = (Date.now() - startTime) / 1000;
			const meanTimePerBatch = elapsedTime / i;
			const remainingBatches = malIdChunks.length - i;
			const eta = Math.ceil(meanTimePerBatch * remainingBatches);
			onProgress(eta);
		}

		// Fetch songs for this chunk
		const response = await fetch('https://anisongdb.com/api/mal_ids_request', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				mal_ids: chunk,
				and_logic: false,
				ignore_duplicate: false,
				opening_filter: true,
				ending_filter: true,
				insert_filter: true
			})
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.detail || `Failed to fetch batch ${i + 1}: ${response.status}`);
		}

		/** @type {AnisongDBSong[]} */
		const batchResult = await response.json();
		allSongs.push(...batchResult);

		// Add delay between requests (except after the last one)
		if (i < malIdChunks.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
		}
	}

	// Clear progress indicator
	if (onProgress) {
		onProgress(0);
	}

	return allSongs;
}

/**
 * Store fetched anime and songs data in cache, grouped by status.
 * Only caches the newly fetched statuses to avoid overwriting existing cache.
 *
 * @param {'anilist'|'mal'} platform - Platform name
 * @param {string} username - Username
 * @param {import('../../../../../types/types.js').UserAnimeData[]} animeList - Complete anime list
 * @param {EnrichedSong[]} enrichedSongs - Songs with sourceAnime data
 * @param {string[]} uncachedStatuses - Statuses that were freshly fetched
 * @returns {Promise<CacheStoreResponse>} Cache store response
 * @throws {Error} If cache store fails
 */
async function storeFetchedDataInCache(
	platform,
	username,
	animeList,
	enrichedSongs,
	uncachedStatuses
) {
	/** @type {CacheDataByStatus} */
	const cacheData = {};

	// Only cache statuses that were freshly fetched (not already cached)
	const statusesToCache = new Set(uncachedStatuses.map((s) => s.toUpperCase()));

	// Group anime by status (only uncached ones)
	for (const anime of animeList) {
		if (!anime.status) continue;
		const statusUpper = anime.status.toUpperCase();

		if (!statusesToCache.has(statusUpper)) {
			continue;
		}

		if (!cacheData[anime.status]) {
			cacheData[anime.status] = {
				animeList: [],
				songsList: []
			};
		}
		cacheData[anime.status].animeList.push(anime);
	}

	// Group songs by status (match with their source anime, only fresh ones)
	for (const song of enrichedSongs) {
		/** @type {import('../../../../../types/types.js').UserAnimeData|null|undefined} */
		const sourceAnime = song.sourceAnime;
		if (!sourceAnime || !sourceAnime.status) continue;
		const statusUpper = sourceAnime.status.toUpperCase();

		if (!statusesToCache.has(statusUpper)) {
			continue;
		}

		if (cacheData[sourceAnime.status]) {
			cacheData[sourceAnime.status].songsList.push(song);
		}
	}

	// Store in cache via API
	const cacheResponse = await fetch('/api/user-list-cache', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			action: 'store',
			platform,
			username: username.trim(),
			cacheData: cacheData
		})
	});

	if (!cacheResponse.ok) {
		const errorData = await cacheResponse.json();
		throw new Error(errorData.error || 'Failed to store cache');
	}

	/** @type {CacheStoreResponse} */
	return await cacheResponse.json();
}

/**
 * Fetch user's saved private song lists.
 *
 * @returns {Promise<SavedSongList[]>} Array of saved song lists
 * @throws {Error} If fetch fails
 */
export async function fetchSavedLists() {
	try {
		const response = await fetch('/api/song-lists', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.message || 'Failed to load lists');
		}

		/** @type {{data?: SavedSongList[]}} */
		const result = await response.json();
		return result.data || [];
	} catch (error) {
		console.error('Error fetching saved lists:', error);
		throw error;
	}
}

/**
 * Fetch public song lists with search and filter options.
 *
 * @param {PublicListFilters} [filters={}] - Optional filters
 * @returns {Promise<PublicListsResponse>} Public lists with pagination
 * @throws {Error} If fetch fails
 */
export async function fetchPublicLists(filters = {}) {
	try {
		const params = new URLSearchParams();

		if (filters.search) params.set('search', filters.search);
		if (filters.name) params.set('name', filters.name);
		if (filters.description) params.set('description', filters.description);
		if (filters.creator) params.set('creator', filters.creator);
		if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
		if (filters.dateTo) params.set('dateTo', filters.dateTo);
		if (filters.page) params.set('page', filters.page.toString());
		if (filters.limit) params.set('limit', filters.limit.toString());

		const response = await fetch(`/api/song-lists/public?${params.toString()}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.message || 'Failed to load public lists');
		}

		/** @type {{data?: SavedSongList[], pagination?: PaginationInfo}} */
		const result = await response.json();
		return {
			lists: result.data || [],
			pagination: result.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 }
		};
	} catch (error) {
		console.error('Error fetching public lists:', error);
		throw error;
	}
}

/**
 * Load songs from a specific saved list by ID.
 *
 * @param {string} listId - List ID to load
 * @returns {Promise<LoadListSongsResponse>} Songs and metadata from the list
 * @throws {Error} If load fails
 */
export async function loadListSongs(listId) {
	try {
		const response = await fetch(`/api/song-lists/${listId}/load`);

		if (!response.ok) {
			throw new Error('Failed to fetch song list');
		}

		/** @type {{songs?: EnrichedSong[], name?: string}} */
		const result = await response.json();

		return {
			songs: result.songs || [],
			metadata: {
				id: listId,
				name: result.name || '',
				songCount: result.songs?.length || 0
			}
		};
	} catch (error) {
		console.error('Error loading list songs:', error);
		throw error;
	}
}

/**
 * Gets metadata for the entire database song list
 * Note: Does not fetch actual database data (that happens server-side).
 *
 * @returns {MasterlistMetadata} Entire database metadata object
 */
export function getMasterlistMetadata() {
	/** @type {MasterlistMetadata} */
	return {
		name: 'Entire Database',
		description: 'All songs in the database',
		source: 'pixeldrain'
	};
}

/**
 * Validate song list configuration.
 *
 * @param {SongListConfig} config - Song list configuration to validate
 * @returns {ValidationResult} Validation result with valid flag and optional error message
 */
export function validateSongListConfig(config) {
	if (!config || !config.mode) {
		/** @type {ValidationResult} */
		return {
			valid: false,
			error: 'Song list mode is required'
		};
	}

	if (config.mode === 'user-lists') {
		if (!config.userListImport?.username?.trim()) {
			/** @type {ValidationResult} */
			return {
				valid: false,
				error: 'Username is required for user list import'
			};
		}
	}

	if (config.mode === 'saved-lists') {
		if (!config.selectedListId) {
			/** @type {ValidationResult} */
			return {
				valid: false,
				error: 'Exactly one list must be selected'
			};
		}
	}

	if (config.mode === 'provider') {
		/** @type {ValidationResult} */
		return {
			valid: false,
			error: ''
		};
	}

	/** @type {ValidationResult} */
	return {
		valid: true,
		error: null
	};
}
