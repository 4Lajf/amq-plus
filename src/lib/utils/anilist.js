/**
 * AniList API utility functions.
 * Provides functions for fetching anime metadata and user lists from AniList GraphQL API.
 *
 * @module anilist
 */

const ANILIST_API_URL = 'https://graphql.anilist.co';

/** @typedef {import('../../types/types.js').AniListAnime} AniListAnime */
/** @typedef {import('../../types/types.js').UserAnimeData} UserAnimeData */

/**
 * GraphQL error response.
 * @typedef {Object} GraphQLError
 * @property {string} message - Error message
 * @property {number} [status] - HTTP status code
 */

/**
 * GraphQL response wrapper.
 * @typedef {Object} GraphQLResponse
 * @property {Object} [data] - Response data
 * @property {GraphQLError[]} [errors] - Array of errors
 */

/**
 * GraphQL response for Media query.
 * @typedef {Object} MediaGraphQLResponse
 * @property {Object} [data] - Response data
 * @property {AniListAnime} [data.Media] - Media data
 * @property {GraphQLError[]} [errors] - Array of errors
 */

/**
 * GraphQL response for batch Media queries.
 * @typedef {Object} BatchMediaGraphQLResponse
 * @property {Object} [data] - Response data
 * @property {Record<string, AniListAnime>} [data] - Media data keyed by query alias
 * @property {GraphQLError[]} [errors] - Array of errors
 */

/**
 * AniList fetch options.
 * @typedef {Object} AniListFetchOptions
 * @property {string[]} [selectedStatuses] - List statuses to include
 * @property {Object<string, boolean>} [selectedLists] - Selected lists by status
 * @property {Function} [onProgress] - Progress callback (current, total, eta)
 */

/**
 * Progress callback function for batch operations.
 * @typedef {Function} BatchProgressCallback
 * @param {number} current - Current batch number
 * @param {number} total - Total number of batches
 * @param {number} eta - Estimated time remaining in seconds
 * @returns {void}
 */

/**
 * Media list entry from AniList API.
 * @typedef {Object} AniListMediaEntry
 * @property {number} id - Entry ID
 * @property {string} status - Entry status
 * @property {number} score - User score
 * @property {number} progress - Episodes watched
 * @property {number} repeat - Rewatch count
 * @property {Object} startedAt - Start date
 * @property {number|null} startedAt.year - Start year
 * @property {number|null} startedAt.month - Start month
 * @property {number|null} startedAt.day - Start day
 * @property {Object} completedAt - Completion date
 * @property {number|null} completedAt.year - Completion year
 * @property {number|null} completedAt.month - Completion month
 * @property {number|null} completedAt.day - Completion day
 * @property {Object} media - Media data
 * @property {number} media.id - AniList ID
 * @property {number} media.idMal - MyAnimeList ID
 * @property {string} media.format - Media format
 * @property {string} media.status - Media status
 * @property {Object} media.startDate - Start date
 * @property {number|null} media.startDate.year - Start year
 * @property {number|null} media.episodes - Episode count
 * @property {number|null} media.duration - Duration in minutes
 * @property {string|null} media.source - Source material
 * @property {string[]} media.genres - Genre list
 * @property {number|null} media.averageScore - Average score
 * @property {number} media.popularity - Popularity count
 * @property {number} media.favourites - Favourites count
 * @property {Array<{name: string, rank: number}>} media.tags - Tag list
 */

/**
 * Media list from AniList API.
 * @typedef {Object} AniListMediaList
 * @property {string} name - List name
 * @property {string} status - List status
 * @property {AniListMediaEntry[]} entries - List entries
 */

/**
 * Media list collection from AniList API.
 * @typedef {Object} AniListMediaListCollection
 * @property {AniListMediaList[]} lists - Array of media lists
 */

/**
 * Status mapping object.
 * @typedef {Object<string, string>} StatusMapping
 */

/**
 * Fetches anime metadata by MAL ID from AniList.
 * Returns basic anime information including genres, tags, scores, and more.
 *
 * @param {number} malId - MyAnimeList ID to look up
 * @returns {Promise<AniListAnime|null>} Anime metadata object or null if not found
 * @throws {Error} If the API request fails
 */
export async function fetchAnimeMetadata(malId) {
	const query = `
        query ($malId: Int) {
            Media(idMal: $malId, type: ANIME) {
                id
                idMal
                format
                status
                startDate {
                    year
                }
                episodes
                duration
                source
                genres
                averageScore
                popularity
                favourites
                tags {
                    name
                    rank
                }
            }
        }
    `;

	/** @type {{malId: number}} */
	const variables = { malId };

	try {
		const response = await fetch(ANILIST_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ query, variables })
		});

		if (!response.ok) {
			throw new Error(`AniList API responded with status ${response.status}`);
		}

		/** @type {MediaGraphQLResponse} */
		const data = await response.json();

		if (data.errors) {
			console.warn('AniList API errors:', data.errors);
			return null;
		}

		return data.data?.Media || null;
	} catch (error) {
		console.error('Error fetching anime metadata from AniList:', error);
		return null;
	}
}

/**
 * Fetches a user's anime list from AniList.
 * Returns comprehensive user data including personal scores, progress, and anime metadata.
 *
 * @param {string} username - AniList username
 * @param {AniListFetchOptions} [options={}] - Filtering options
 * @returns {Promise<UserAnimeData[]>} Array of anime entries with user data
 * @throws {Error} If username is invalid or API request fails
 */
export async function fetchAniListData(username, options = {}) {
	if (!username?.trim()) {
		throw new Error('Username is required');
	}

	const query = `
        query ($userName: String, $type: MediaType) {
            MediaListCollection(userName: $userName, type: $type) {
                lists {
                    name
                    status
                    entries {
                        id
                        status
                        score
                        progress
                        repeat
                        private
                        hiddenFromStatusLists
                        startedAt {
                            year
                            month
                            day
                        }
                        completedAt {
                            year
                            month
                            day
                        }
                        updatedAt
                        createdAt
                        media {
                            id
                            idMal
                            format
                            status
                            startDate {
                                year
                            }
                            episodes
                            duration
                            source
                            genres
                            averageScore
                            popularity
                            favourites
                            tags {
                                name
                                rank
                            }
                        }
                    }
                }
            }
        }
    `;

	try {
		const response = await fetch(ANILIST_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				query,
				variables: {
					userName: username.trim(),
					type: 'ANIME'
				}
			})
		});

		if (!response.ok) {
			throw new Error(`AniList API error: ${response.status} ${response.statusText}`);
		}

		/** @type {GraphQLResponse & {data?: {MediaListCollection?: AniListMediaListCollection}}} */
		const result = await response.json();

		if (result.errors && result.errors.length > 0) {
			throw new Error(result.errors[0].message);
		}

		if (!result.data || !result.data.MediaListCollection) {
			throw new Error('User not found or list is private');
		}

		return processAniListData(result.data.MediaListCollection, options);
	} catch (error) {
		console.error('AniList fetch error:', error);
		throw new Error(`Failed to fetch AniList data: ${error.message}`);
	}
}

/**
 * Process AniList data and filter based on options
 * @param {AniListMediaListCollection} mediaListCollection - Raw AniList data
 * @param {AniListFetchOptions} [options={}] - Filter options
 * @returns {UserAnimeData[]} Processed anime list
 */
function processAniListData(mediaListCollection, options = {}) {
	/** @type {UserAnimeData[]} */
	const animeList = [];
	const statusFilter = options.selectedLists || {};

	// Map UI status keys to AniList API values
	/** @type {StatusMapping} */
	const statusMapping = {
		watching: 'current',
		completed: 'completed',
		planning: 'planning',
		on_hold: 'paused',
		dropped: 'dropped'
	};

	mediaListCollection.lists.forEach((list) => {
		list.entries.forEach((entry) => {
			const apiStatus = entry.status.toLowerCase();

			// Filter by status if specified - check if any UI status maps to this API status
			if (Object.keys(statusFilter).length > 0) {
				const shouldInclude = Object.entries(statusFilter).some(([uiStatus, enabled]) => {
					if (!enabled) return false;
					return statusMapping[uiStatus] === apiStatus;
				});
				if (!shouldInclude) {
					return;
				}
			}

			animeList.push({
				// Entry data
				entryId: entry.id,
				// @ts-ignore
				status: entry.status,
				score: entry.score,
				progress: entry.progress,
				repeat: entry.repeat,
				startedAt: entry.startedAt,
				completedAt: entry.completedAt,
				anilistId: entry.media.id,
				malId: entry.media.idMal,
				// @ts-ignore
				format: entry.media.format,
				mediaStatus: entry.media.status,
				startDate: entry.media.startDate,
				year: entry.media.startDate?.year,
				episodes: entry.media.episodes,
				duration: entry.media.duration,
				source: entry.media.source,
				genres: entry.media.genres || [],
				tags: (entry.media.tags || []).map((tag) => ({
					name: tag.name,
					rank: tag.rank
				})),
				averageScore: entry.media.averageScore,
				popularity: entry.media.popularity,
				favourites: entry.media.favourites
			});
		});
	});

	return animeList;
}

/**
 * Batch fetches anime metadata using AniList IDs (not MAL IDs).
 * Fetches metadata in chunks to avoid rate limits and provides progress tracking.
 *
 * @param {number[]} anilistIds - Array of AniList IDs to fetch
 * @param {BatchProgressCallback|null} [onProgress=null] - Progress callback function(current, total, eta)
 * @returns {Promise<Map<number, AniListAnime>>} Map of anilistId -> metadata object
 */
export async function batchFetchAnimeMetadataByAnilistIds(anilistIds, onProgress = null) {
	if (!anilistIds || anilistIds.length === 0) {
		return new Map();
	}

	console.log(`Starting AniList batch fetch for ${anilistIds.length} AniList IDs...`);

	/** @type {Map<number, AniListAnime>} */
	const resultMap = await fetchBatchMetadataByAnilistIds(anilistIds, onProgress);

	console.log(
		`AniList batch fetch complete: Successfully fetched ${resultMap.size}/${anilistIds.length} anime metadata`
	);

	return resultMap;
}

/**
 * Fetch metadata for AniList IDs in sub-batches
 * @param {number[]} anilistIds - Array of AniList IDs
 * @param {BatchProgressCallback|null} [onProgress=null] - Optional callback (current, total, eta)
 * @returns {Promise<Map<number, AniListAnime>>} Map of anilistId -> metadata
 */
async function fetchBatchMetadataByAnilistIds(anilistIds, onProgress = null) {
	/** @type {Map<number, AniListAnime>} */
	const resultMap = new Map();

	// Process in sub-batches to avoid query size issues
	// Fetch 29 anime at a time per GraphQL request
	const SUB_BATCH_SIZE = 29;
	const totalSubBatches = Math.ceil(anilistIds.length / SUB_BATCH_SIZE);
	const startTime = Date.now();

	console.log(
		`Processing ${anilistIds.length} AniList IDs in ${totalSubBatches} sub-batches of ${SUB_BATCH_SIZE}...`
	);

	for (let i = 0; i < anilistIds.length; i += SUB_BATCH_SIZE) {
		const subBatch = anilistIds.slice(i, i + SUB_BATCH_SIZE);
		const currentSubBatch = Math.floor(i / SUB_BATCH_SIZE) + 1;

		// Calculate and report progress with ETA
		if (onProgress && currentSubBatch > 1) {
			const elapsedTime = (Date.now() - startTime) / 1000;
			const meanTimePerBatch = elapsedTime / (currentSubBatch - 1);
			const remainingBatches = totalSubBatches - currentSubBatch + 1;
			const eta = Math.ceil(meanTimePerBatch * remainingBatches);
			onProgress(currentSubBatch - 1, totalSubBatches, eta);
		} else if (onProgress) {
			onProgress(0, totalSubBatches, 0);
		}

		// Build individual Media queries for this sub-batch using AniList IDs
		const queries = subBatch
			.map(
				(anilistId, index) => `
            media${index}: Media(id: ${anilistId}, type: ANIME) {
                id
                idMal
                format
                status
                startDate {
                    year
                }
                episodes
                duration
                source
                genres
                averageScore
                popularity
                favourites
                tags {
                    name
                    rank
                }
            }
        `
			)
			.join('\n');

		const query = `
            query {
                ${queries}
            }
        `;

		try {
			const response = await fetch(ANILIST_API_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ query })
			});

			/** @type {BatchMediaGraphQLResponse} */
			const data = await response.json();

			if (!response.ok) {
				console.error(
					`Sub-batch ${currentSubBatch}/${totalSubBatches} failed with status ${response.status}`
				);
				console.error('AniList API error response:', data);
				console.error('Failed query (first 500 chars):', query.substring(0, 500));
			} else {
				if (data.errors) {
					// Filter out 404 errors (expected when IDs don't exist)
					/** @type {GraphQLError[]} */
					const non404Errors = data.errors.filter((err) => err.status !== 404);
					if (non404Errors.length > 0) {
						console.warn('AniList API errors (non-404):', non404Errors);
						console.warn('Query that caused errors (first 500 chars):', query.substring(0, 500));
					}
				}

				// Process the results for this sub-batch
				let successCount = 0;
				subBatch.forEach((anilistId, index) => {
					/** @type {AniListAnime|undefined} */
					const mediaData = data.data?.[`media${index}`];
					if (mediaData && mediaData.id === anilistId) {
						resultMap.set(anilistId, mediaData);
						successCount++;
					}
				});

				console.log(
					`Sub-batch ${currentSubBatch}/${totalSubBatches}: Successfully fetched ${successCount}/${subBatch.length} anime from AniList`
				);
			}
		} catch (error) {
			console.error(`Error in sub-batch ${currentSubBatch}/${totalSubBatches}:`, error);
		}

		// Always add 2-second delay between requests to respect AniList rate limits
		if (i + SUB_BATCH_SIZE < anilistIds.length) {
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}

	// Final progress update
	if (onProgress) {
		onProgress(totalSubBatches, totalSubBatches, 0);
	}

	return resultMap;
}
