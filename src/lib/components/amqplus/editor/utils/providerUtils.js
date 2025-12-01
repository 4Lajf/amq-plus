/**
 * Provider utilities for handling different data formats
 * Based on providers.js detection functions and data processing
 * Normalizes data to match AnisongDB format and fetches missing data
 */

import { batchFetchAnimeMetadataByAnilistIds } from '$lib/utils/anilist.js';

/**
 * Universal song template matching AnisongDB structure
 * @typedef {Object} UniversalSong
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
 * @property {Array<{id: number, names: Array<string>, line_up_id: number, groups: Array, members: Array}>} artists - Artist details
 * @property {Array<{id: number, names: Array<string>, line_up_id: number, groups: Array, members: Array}>} composers - Composer details
 * @property {Array<{id: number, names: Array<string>, line_up_id: number, groups: Array, members: Array}>} arrangers - Arranger details
 * @property {string} source - Source provider ('amq-export' | 'joseph-song-ui' | 'blissfullyoshi-ranked' | 'kempanator-answer-stats')
 * @property {number} [sampleStart] - Sample start time
 * @property {number} [sampleEnd] - Sample end time
 * @property {number} [guessTime] - Guess time
 * @property {boolean} [guessTimeRandom] - Random guess time
 */

/**
 * Detects if data is from AMQ official export
 * @param {any} data - Data to check
 * @returns {boolean} True if AMQ data
 */
export function isAMQData(data) {
	return typeof data === 'object' && data.roomName && data.startTime && data.songs;
}

/**
 * Detects if data is from Joseph Song UI export
 * @param {any} data - Data to check
 * @returns {boolean} True if Joseph Song UI data
 */
export function isJosephSongUIData(data) {
	return Array.isArray(data) && data.length && data[0].gameMode;
}

/**
 * Detects if data is from Kempanator Answer Stats export
 * @param {any} data - Data to check
 * @returns {boolean} True if Kempanator Answer Stats data
 */
export function isKempanatorAnswerStatsData(data) {
	return typeof data === 'object' && data.songHistory && data.playerInfo;
}

/**
 * Detects if data is from Blissfullyoshi Ranked export
 * @param {any} data - Data to check
 * @returns {boolean} True if Blissfullyoshi Ranked data
 */
export function isBlissfullyoshiRankedData(data) {
	return Array.isArray(data) && data.length && data[0].animeRomaji;
}

/**
 * Fetches songs from AnisongDB using MAL IDs
 * @param {Array<number>} malIds - Array of MyAnimeList IDs
 * @param {Function} [onProgress] - Optional callback for progress updates
 * @returns {Promise<Array>} Array of song objects from AnisongDB
 */
async function fetchSongsFromAnisongDB(malIds, onProgress = null) {
	const CHUNK_SIZE = 500;
	const DELAY_MS = 1000; // 1 second delay between requests

	// Chunk MAL IDs to handle API limit
	const malIdChunks = [];
	for (let i = 0; i < malIds.length; i += CHUNK_SIZE) {
		malIdChunks.push(malIds.slice(i, i + CHUNK_SIZE));
	}

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
			throw new Error(`Failed to fetch songs from AnisongDB: ${response.status}`);
		}

		const result = await response.json();
		allSongs.push(...result);

		// Add delay between requests (except for the last one)
		if (i < malIdChunks.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
		}
	}

	return allSongs;
}

/**
 * Convert numeric song type to string format
 * @param {number|string} type - Song type (1=Opening, 2=Ending, 3=Insert) or string
 * @param {number|null} typeNumber - Type number (e.g., 3 for "Opening 3")
 * @returns {string} Formatted song type (e.g., "Opening 3", "Ending 1", "Insert Song")
 */
function convertSongTypeToString(type, typeNumber) {
	// If already a string, return as-is
	if (typeof type === 'string') {
		return type;
	}

	// Convert numeric type to string
	switch (type) {
		case 1:
			return typeNumber ? `Opening ${typeNumber}` : 'Opening';
		case 2:
			return typeNumber ? `Ending ${typeNumber}` : 'Ending';
		case 3:
			return 'Insert Song';
		default:
			return String(type) || '';
	}
}

/**
 * Normalizes a song to the universal template format
 * @param {Object} song - Raw song data from provider
 * @param {string} source - Source provider identifier
 * @returns {UniversalSong} Normalized song data
 */
function normalizeSongToUniversal(song, source) {
	// Extract IDs for linked_ids structure
	const malId = song.malId || song.mal_id || song.linked_ids?.myanimelist || null;
	const anilistId = song.aniListId || song.anilist_id || song.linked_ids?.anilist || null;
	const kitsuId = song.kitsuId || song.kitsu_id || song.linked_ids?.kitsu || null;
	const annId = song.annId || song.ann_id || null;

	// Build normalized song matching standard format
	let normalized = {
		// Basic identifiers
		annId: annId,
		annSongId: song.annSongId || song.ann_song_id || null,
		amqSongId: song.amqSongId || song.amq_song_id || null,

		// Anime information (standard fields only)
		animeENName: song.animeENName || song.anime_english_name || song.animeEnglishName || '',
		animeJPName: song.animeJPName || song.anime_japanese_name || song.animeRomajiName || '',
		animeAltName: song.animeAltName || song.anime_alt_name || null,

		// Anime metadata
		animeVintage: song.animeVintage || song.anime_vintage || song.vintage || '',
		animeType: song.animeType || song.anime_type || '',
		animeCategory: song.animeCategory || song.anime_category || '',

		// Linked IDs structure (standard format - no redundant top-level IDs)
		linked_ids: {
			myanimelist: malId,
			anidb: song.linked_ids?.anidb || annId,
			anilist: anilistId,
			kitsu: kitsuId
		},

		// Song information
		songName: song.songName || song.song_name || song.name || '',
		songArtist: song.songArtist || song.song_artist || song.artist || '',
		songComposer: song.songComposer || song.song_composer || song.composer || '',
		songArranger: song.songArranger || song.song_arranger || song.arranger || '',
		songType: convertSongTypeToString(
			song.songType || song.song_type || song.type || '',
			song.typeNumber || song.type_number || null
		),
		songDifficulty: song.songDifficulty || song.song_difficulty || song.difficulty || 0,
		songCategory: song.songCategory || song.song_category || '',
		songLength: song.songLength || song.song_length || song.length || 90,

		// Media files
		audio: song.audio || song.audio_url || null,
		HQ: song.HQ || song.hq || song.video720 || song.video_720 || null,
		MQ: song.MQ || song.mq || song.video480 || song.video_480 || null,

		// Flags
		isDub: song.isDub || song.is_dub || song.dub || false,
		isRebroadcast: song.isRebroadcast || song.is_rebroadcast || song.rebroadcast || false,

		// Artists, composers, and arrangers arrays (will be enriched from AnisongDB)
		artists: song.artists || [],
		composers: song.composers || [],
		arrangers: song.arrangers || [],

		// Source and additional fields
		source: source,

		// Sample and timing settings (only include if explicitly set)
		...(song.sampleStart !== undefined && song.sampleStart !== null && song.sampleStart !== 0 
			? { sampleStart: song.sampleStart } 
			: song.startPoint !== undefined && song.startPoint !== null && song.startPoint !== 0
				? { sampleStart: song.startPoint }
				: {}),
		...(song.sampleEnd !== undefined && song.sampleEnd !== null ? { sampleEnd: song.sampleEnd } : {}),
		...(song.guessTime !== undefined && song.guessTime !== null ? { guessTime: song.guessTime } : {}),
		...(song.extraGuessTime !== undefined && song.extraGuessTime !== null ? { extraGuessTime: song.extraGuessTime } : {}),
		...(song.guessTimeRandom !== undefined && song.guessTimeRandom === true ? { guessTimeRandom: song.guessTimeRandom } : {})
	};

	// Note: sourceAnime will be added later by AniList enrichment
	// Note: animeTags, animeGenre, animeScore are NOT included - they come from sourceAnime

	return normalized;
}

/**
 * Processes AMQ official export data
 * @param {Object} data - AMQ export data
 * @returns {Array} Processed song list
 */
export function processAMQData(data) {
	const songs = [];

	for (let song of data.songs) {
		// Handle enriched format (flattened masterlist structure)
		if (song.annSongId && song.annId !== undefined && song.animeENName !== undefined) {
			// This is already enriched and flattened - use directly with minimal normalization
			const normalizedSong = normalizeSongToUniversal(song, 'amq-export');

			// Preserve enriched fields that might not be in normalizeSongToUniversal
			// @ts-ignore - These are valid enriched fields
			if (song.sourceAnime) {
				// @ts-ignore
				normalizedSong.sourceAnime = song.sourceAnime;
			}
			if (song.sampleRanges) {
				// @ts-ignore
				normalizedSong.sampleRanges = song.sampleRanges;
			}
			if (song.playbackSpeed) {
				// @ts-ignore
				normalizedSong.playbackSpeed = song.playbackSpeed;
			}

			songs.push(normalizedSong);
		}
		// Handle simplified format (just annSongId and settings)
		else if (song.annSongId && !song.songInfo) {
			// This is a simplified export format, will be enriched by API
			const normalizedSong = normalizeSongToUniversal(
				{
					annSongId: song.annSongId,
					startPoint: song.startPoint || 0,
					guessTime: song.guessTime || null,
					extraGuessTime: song.extraGuessTime || null,
					sampleEnd: song.sampleEnd || null
				},
				'amq-export'
			);
			songs.push(normalizedSong);
		} else {
			// Handle full AMQ export format
			const normalizedSong = normalizeSongToUniversal(
				{
					// Map AMQ specific fields to universal template
					annId: song.songInfo.siteIds.annId,
					annSongId: song.annSongId || song.songInfo.siteIds.annSongId || null,
					// Use linked_ids structure instead of top-level IDs
					linked_ids: {
						myanimelist: song.songInfo.siteIds.malId,
						anidb: song.songInfo.siteIds.annId,
						anilist: song.songInfo.siteIds.aniListId,
						kitsu: song.songInfo.siteIds.kitsuId
					},
					// Anime info
					animeJPName: song.songInfo.animeNames.romaji,
					animeENName: song.songInfo.animeNames.english,
					animeAltName: song.songInfo.altAnimeNames?.[0] || null,
					animeType: song.songInfo.animeType,
					animeVintage: song.songInfo.vintage,
					// Song info
					songName: song.songInfo.songName,
					songArtist: song.songInfo.artist,
					songType: song.songInfo.type,
					typeNumber: song.songInfo.typeNumber,
					songDifficulty: song.songInfo.animeDifficulty,
					// Timing settings from top-level song object
					startPoint: song.startPoint,
					guessTime: song.guessTime !== undefined && song.guessTime !== null ? song.guessTime : null,
					extraGuessTime: song.extraGuessTime !== undefined && song.extraGuessTime !== null ? song.extraGuessTime : null
					// Note: animeScore, animeTags, animeGenre will come from sourceAnime via AniList
				},
				'amq-export'
			);

			songs.push(normalizedSong);
		}
	}

	return songs;
}

/**
 * Processes Joseph Song UI export data
 * @param {Array} data - Joseph Song UI export data
 * @returns {Array} Processed song list
 */
export function processJosephSongUIData(data) {
	const songs = [];

	for (let song of data) {
		const normalizedSong = normalizeSongToUniversal(
			{
				// Map Joseph Song UI specific fields to universal template
				annId: song.siteIds.annId,
				linked_ids: {
					myanimelist: song.siteIds.malId,
					anidb: song.siteIds.annId,
					anilist: song.siteIds.aniListId,
					kitsu: song.siteIds.kitsuId
				},
				animeJPName: song.anime.romaji,
				animeENName: song.anime.english,
				songName: song.name,
				songArtist: song.artist,
				songType: Object({ O: 1, E: 2, I: 3 })[song.type[0]],
				typeNumber: song.type[0] === 'I' ? null : parseInt(song.type.split(' ')[1]),
				songDifficulty: song.difficulty === 'Unrated' ? 0 : song.difficulty,
				animeType: song.animeType,
				animeVintage: song.vintage,
				startPoint: song.startSample,
				audio: song.urls?.[0] || null,
				MQ: song.urls?.[480] || null,
				HQ: song.urls?.[720] || null
			},
			'joseph-song-ui'
		);

		songs.push(normalizedSong);
	}

	return songs;
}

/**
 * Processes Blissfullyoshi Ranked export data
 * @param {Array} data - Blissfullyoshi Ranked export data
 * @returns {Array} Processed song list
 */
export function processBlissfullyoshiRankedData(data) {
	const songs = [];

	for (let song of data) {
		const normalizedSong = normalizeSongToUniversal(
			{
				// Map Blissfullyoshi Ranked specific fields to universal template
				annId: song.annId,
				linked_ids: {
					myanimelist: song.malId,
					anidb: song.annId,
					anilist: song.aniListId,
					kitsu: song.kitsuId
				},
				animeJPName: song.animeRomaji,
				animeENName: song.animeEng,
				songName: song.songName,
				songArtist: song.artist,
				songType: Object({ O: 1, E: 2, I: 3 })[song.type[0]],
				songDifficulty: song.songDifficulty,
				animeVintage: song.vintage,
				audio: song.LinkMp3,
				HQ: song.LinkVideo
			},
			'blissfullyoshi-ranked'
		);

		songs.push(normalizedSong);
	}

	return songs;
}

/**
 * Processes Kempanator Answer Stats export data
 * @param {Object} data - Kempanator Answer Stats export data
 * @returns {Array} Processed song list
 */
export function processKempanatorAnswerStatsData(data) {
	const songs = [];

	for (let song of Object.values(data.songHistory)) {
		const normalizedSong = normalizeSongToUniversal(
			{
				// Map Kempanator Answer Stats specific fields to universal template
				annId: song.annId,
				linked_ids: {
					myanimelist: song.malId,
					anidb: song.annId,
					anilist: song.aniListId,
					kitsu: song.kitsuId
				},
				animeJPName: song.animeRomajiName,
				animeENName: song.animeEnglishName,
				songName: song.songName,
				songArtist: song.songArtist,
				songType: song.songType,
				songDifficulty: song.songDifficulty,
				animeType: song.animeType,
				animeVintage: song.animeVintage,
				isRebroadcast: song.rebroadcast,
				isDub: song.dub,
				audio: song.audio,
				MQ: song.video480,
				HQ: song.video720
			},
			'kempanator-answer-stats'
		);

		songs.push(normalizedSong);
	}

	return songs;
}

/**
 * Enriches provider songs with missing data from AnisongDB
 * @param {Array<UniversalSong>} songs - Normalized songs from provider
 * @param {Function} [onProgress] - Optional callback for progress updates
 * @returns {Promise<Array<UniversalSong>>} Enriched songs with AnisongDB data
 */
export async function enrichProviderSongsWithAnisongDB(songs, onProgress = null) {
	// Extract MAL IDs from songs that have them
	const malIds = songs
		.map((song) => song.linked_ids?.myanimelist)
		.filter((id) => id && typeof id === 'number')
		.filter((id, index, array) => array.indexOf(id) === index);

	if (malIds.length === 0) {
		console.warn('No MAL IDs found in provider songs, skipping AnisongDB enrichment');
		return songs;
	}

	try {
		// Fetch songs from AnisongDB using MAL IDs
		const anisongDBSongs = await fetchSongsFromAnisongDB(malIds, onProgress);

		// Create a lookup map by annSongId for exact matching
		const anisongDBByAnnSongId = new Map();
		// Create a lookup map by MAL ID + song name for fallback matching
		const anisongDBByMalIdAndSong = new Map();
		
		anisongDBSongs.forEach((song) => {
			// Primary key: annSongId (most accurate)
			if (song.annSongId) {
				anisongDBByAnnSongId.set(song.annSongId, song);
			}
			
			// Secondary key: MAL ID + normalized song name
			const malId = song.linked_ids?.myanimelist;
			const songName = (song.songName || '').toLowerCase().trim();
			if (malId && songName) {
				const key = `${malId}:${songName}`;
				anisongDBByMalIdAndSong.set(key, song);
			}
		});

		// Enrich provider songs with AnisongDB data
		const enrichedSongs = songs.map((song) => {
			// Try to find matching AnisongDB song
			let anisongDBSong = null;
			
			// 1. First try exact match by annSongId
			if (song.annSongId) {
				anisongDBSong = anisongDBByAnnSongId.get(song.annSongId);
			}
			
			// 2. Fallback: match by MAL ID + song name
			if (!anisongDBSong) {
				const malId = song.linked_ids?.myanimelist;
				const songName = (song.songName || '').toLowerCase().trim();
				if (malId && songName) {
					anisongDBSong = anisongDBByMalIdAndSong.get(`${malId}:${songName}`);
				}
			}

			if (!anisongDBSong) {
				return song; // Return original song if no match found
			}

			// Merge AnisongDB data into provider song
			// Start with AnisongDB base, then override with provider data
			const enrichedSong = {
				// Core identifiers from AnisongDB
				annId: anisongDBSong.annId || song.annId,
				annSongId: anisongDBSong.annSongId || song.annSongId,
				amqSongId: anisongDBSong.amqSongId || song.amqSongId,
				
				// Anime info - use provider data as base, fill from AnisongDB
				animeENName: song.animeENName || anisongDBSong.animeENName,
				animeJPName: song.animeJPName || anisongDBSong.animeJPName,
				animeAltName: song.animeAltName || anisongDBSong.animeAltName,
				animeVintage: song.animeVintage || anisongDBSong.animeVintage,
				animeType: song.animeType || anisongDBSong.animeType,
				animeCategory: song.animeCategory || anisongDBSong.animeCategory,
				
				// Linked IDs - merge both
				linked_ids: {
					myanimelist: song.linked_ids?.myanimelist || anisongDBSong.linked_ids?.myanimelist,
					anidb: song.linked_ids?.anidb || anisongDBSong.linked_ids?.anidb,
					anilist: song.linked_ids?.anilist || anisongDBSong.linked_ids?.anilist,
					kitsu: song.linked_ids?.kitsu || anisongDBSong.linked_ids?.kitsu
				},
				
				// Song info - use provider data as base, fill from AnisongDB
				songName: song.songName || anisongDBSong.songName,
				songArtist: song.songArtist || anisongDBSong.songArtist,
				songComposer: song.songComposer || anisongDBSong.songComposer || '',
				songArranger: song.songArranger || anisongDBSong.songArranger || '',
				songType: song.songType || anisongDBSong.songType,
				songDifficulty: anisongDBSong.songDifficulty ?? song.songDifficulty ?? 0,
				songCategory: song.songCategory || anisongDBSong.songCategory || 'Standard',
				songLength: anisongDBSong.songLength ?? song.songLength ?? 90,
				
				// Media files - prefer AnisongDB as it's more up-to-date
				audio: anisongDBSong.audio || song.audio,
				HQ: anisongDBSong.HQ || song.HQ,
				MQ: anisongDBSong.MQ || song.MQ,
				
				// Flags
				isDub: song.isDub ?? anisongDBSong.isDub ?? false,
				isRebroadcast: song.isRebroadcast ?? anisongDBSong.isRebroadcast ?? false,
				
				// Artists, composers, arrangers - USE AnisongDB data (this is the key part!)
				artists: anisongDBSong.artists || song.artists || [],
				composers: anisongDBSong.composers || song.composers || [],
				arrangers: anisongDBSong.arrangers || song.arrangers || [],
				
				// Preserve source from provider
				source: song.source,
				
				// Preserve timing settings from provider
				...(song.sampleStart !== undefined ? { sampleStart: song.sampleStart } : {}),
				...(song.sampleEnd !== undefined ? { sampleEnd: song.sampleEnd } : {}),
				...(song.guessTime !== undefined ? { guessTime: song.guessTime } : {}),
				...(song.extraGuessTime !== undefined ? { extraGuessTime: song.extraGuessTime } : {}),
				...(song.guessTimeRandom !== undefined ? { guessTimeRandom: song.guessTimeRandom } : {}),
				
				// Preserve sourceAnime if already set
				...(song.sourceAnime ? { sourceAnime: song.sourceAnime } : {})
			};

			return enrichedSong;
		});

		const matchedCount = enrichedSongs.filter((s, i) => s.annSongId !== songs[i].annSongId || s.artists?.length > 0).length;
		console.log(`Enriched ${matchedCount}/${enrichedSongs.length} songs with AnisongDB data`);
		return enrichedSongs;
	} catch (error) {
		console.error('Failed to enrich songs with AnisongDB data:', error);
		// Return original songs if enrichment fails
		return songs;
	}
}

/**
 * Detects and processes data from any supported provider
 * @param {any} data - Raw data to process
 * @param {Object} [options] - Processing options
 * @param {boolean} [options.enrichWithAnisongDB=true] - Whether to enrich with AnisongDB data
 * @param {Function} [options.onProgress] - Optional callback for progress updates
 * @returns {Promise<Object>} Processing result with songs and metadata
 */
export async function processProviderData(data, options = {}) {
	const { enrichWithAnisongDB = true, onProgress = null } = options;
	if (!data) {
		return { songs: [], error: 'No data provided' };
	}

	try {
		let songs = [];
		let provider = null;
		let metadata = {};
		let needsEnrichment = false;

		if (isAMQData(data)) {
			provider = 'amq-export';

			// Check if this is a simplified export format (needs server enrichment)
			// Enriched format has annId and animeENName, simplified format only has annSongId
			if (data.songs && data.songs.length > 0 && data.songs[0].annSongId && !data.songs[0].songInfo && !data.songs[0].annId) {
				needsEnrichment = true;
				// Enrich with server API first
				try {
					const response = await fetch('/api/enrich-amq-export', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ songs: data.songs })
					});

					if (response.ok) {
						const enriched = await response.json();
						const enrichedSongs = Array.isArray(enriched) ? enriched : enriched.songs || [];
						const anilistIds = enriched.anilistIds || [];

						if (anilistIds.length > 0) {
							try {
								const anilistMetadataMap = await batchFetchAnimeMetadataByAnilistIds(anilistIds, onProgress);
								
								data.songs = enrichedSongs.map((song) => {
									if (song.anilistId && anilistMetadataMap.has(song.anilistId)) {
										const anilistData = anilistMetadataMap.get(song.anilistId);
										song.sourceAnime = {
											id: anilistData.id,
											idMal: anilistData.idMal,
											format: anilistData.format,
											status: anilistData.status,
											startDate: anilistData.startDate,
											episodes: anilistData.episodes,
											duration: anilistData.duration,
											source: anilistData.source,
											genres: anilistData.genres || [],
											averageScore: anilistData.averageScore || null,
											popularity: anilistData.popularity || null,
											favourites: anilistData.favourites || null,
											tags: (anilistData.tags || []).map((tag) => ({
												name: tag.name,
												rank: tag.rank
											}))
										};
									}
									delete song.anilistId;
									return song;
								});
								metadata.enrichedWithAnilist = true;
							} catch (error) {
								console.warn('Failed to fetch AniList metadata:', error);
								data.songs = enrichedSongs.map((song) => {
									delete song.anilistId;
									return song;
								});
							}
						} else {
							data.songs = enrichedSongs;
						}
						metadata.enrichedWithServer = true;
					} else {
						console.warn('Failed to enrich with server, using basic processing');
					}
				} catch (error) {
					console.warn('Error enriching with server:', error);
				}
			}

			songs = processAMQData(data);
			metadata = {
				roomName: data.roomName,
				startTime: data.startTime,
				totalSongs: data.songs?.length || 0
			};
		} else if (isJosephSongUIData(data)) {
			provider = 'joseph-song-ui';
			songs = processJosephSongUIData(data);
			metadata = {
				totalSongs: data.length
			};
		} else if (isBlissfullyoshiRankedData(data)) {
			provider = 'blissfullyoshi-ranked';
			songs = processBlissfullyoshiRankedData(data);
			metadata = {
				totalSongs: data.length
			};
		} else if (isKempanatorAnswerStatsData(data)) {
			provider = 'kempanator-answer-stats';
			songs = processKempanatorAnswerStatsData(data);
			metadata = {
				playerInfo: data.playerInfo,
				totalSongs: Object.keys(data.songHistory).length
			};
		} else {
			return {
				songs: [],
				error:
					'Unsupported data format. Please ensure the JSON file matches one of the supported provider formats.'
			};
		}

		// =============================================================
		// UNIFIED ENRICHMENT PROCESS FOR ALL PROVIDERS
		// Step 1: AnisongDB enrichment (artists, composers, arrangers, media files)
		// Step 2: AniList enrichment (sourceAnime with genres, tags, scores)
		// =============================================================

		// Step 1: Enrich with AnisongDB data (for ALL providers)
		// This fills in artists, composers, arrangers, and updates media files
		if (enrichWithAnisongDB && songs.length > 0) {
			try {
				console.log(`[PROVIDER IMPORT] Step 1: Enriching ${songs.length} songs with AnisongDB data...`);
				songs = await enrichProviderSongsWithAnisongDB(songs, onProgress);
				metadata.enrichedWithAnisongDB = true;
			} catch (error) {
				console.warn('[PROVIDER IMPORT] Failed to enrich with AnisongDB data:', error);
				metadata.enrichedWithAnisongDB = false;
				metadata.enrichmentError = error.message;
			}
		}

		// Step 2: Enrich with AniList metadata (for ALL providers)
		// This adds sourceAnime with genres, tags, averageScore, popularity, etc.
		if (songs.length > 0 && !metadata.enrichedWithAnilist) {
			// Extract unique AniList IDs from songs (use linked_ids structure)
			const anilistIds = [...new Set(songs.map(song => 
				song.linked_ids?.anilist
			).filter(Boolean))];

			if (anilistIds.length > 0) {
				console.log(`[PROVIDER IMPORT] Step 2: Enriching ${songs.length} songs with AniList data (${anilistIds.length} unique IDs)...`);
				try {
					const anilistMetadataMap = await batchFetchAnimeMetadataByAnilistIds(anilistIds, onProgress);
					
					songs = songs.map(song => {
						const anilistId = song.linked_ids?.anilist;
						if (anilistId && anilistMetadataMap.has(anilistId)) {
							const anilistData = anilistMetadataMap.get(anilistId);
							return {
								...song,
								sourceAnime: {
									id: anilistData.id,
									idMal: anilistData.idMal,
									format: anilistData.format,
									status: anilistData.status,
									startDate: anilistData.startDate,
									episodes: anilistData.episodes,
									duration: anilistData.duration,
									source: anilistData.source,
									genres: anilistData.genres || [],
									averageScore: anilistData.averageScore || null,
									popularity: anilistData.popularity || null,
									favourites: anilistData.favourites || null,
									tags: (anilistData.tags || []).map(tag => ({
										name: tag.name,
										rank: tag.rank
									}))
								}
							};
						}
						return song;
					});
					
					metadata.enrichedWithAnilist = true;
					console.log(`[PROVIDER IMPORT] Successfully enriched with AniList data (${anilistMetadataMap.size} metadata entries)`);
				} catch (error) {
					console.warn('[PROVIDER IMPORT] Failed to enrich with AniList data:', error);
					metadata.enrichedWithAnilist = false;
				}
			} else {
				console.warn('[PROVIDER IMPORT] No AniList IDs found in songs, skipping AniList enrichment');
			}
		}

		return {
			songs,
			provider,
			metadata: {
				...metadata,
				processedAt: new Date().toISOString()
			}
		};
	} catch (error) {
		return {
			songs: [],
			error: `Error processing data: ${error.message}`
		};
	}
}

/**
 * Provider information for UI display
 */
export const PROVIDER_INFO = {
	'amq-export': {
		name: 'AMQ Official Export',
		description: 'Official AMQ room export data',
		icon: '🎵',
		color: '#3b82f6'
	},
	'joseph-song-ui': {
		name: 'Joseph Song UI',
		description: 'Joseph Song UI export format',
		icon: '🎶',
		color: '#10b981'
	},
	'blissfullyoshi-ranked': {
		name: 'Blissfullyoshi Ranked',
		description: 'Blissfullyoshi ranked data export',
		icon: '🏆',
		color: '#f59e0b'
	},
	'kempanator-answer-stats': {
		name: 'Kempanator Answer Stats',
		description: 'Kempanator answer statistics export',
		icon: '📊',
		color: '#8b5cf6'
	}
};
