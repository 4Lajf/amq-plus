/**
 * Server-side song filtering engine for AMQ+ quiz generation
 * Uses a basket-based approach: collect eligible songs, then distribute to overlapping baskets
 * 
 * @module lib/server/songFiltering
 */

import masterlistData from './masterlist.json';
import { createSupabaseAdmin } from './supabase-admin.js';
import { fetchFromPixeldrain } from './pixeldrain.js';
import { fetchAniListData, batchFetchAnimeMetadataByAnilistIds } from '$lib/utils/anilist.js';
import {
  normalizePlayerScore,
  normalizeAnimeScore,
  calculateCountOrPercentage,
  calculateRangeFromSettings,
  createBasket,
  getBasketType,
  recordFilterStat,
  createScoreBaskets,
  fetchAndEnrichSongs,
  expandUserListNode
} from './utils/index.js';

/**
 * @typedef {Object} Vintage
 * @property {string} season - Season name ('Winter', 'Spring', 'Summer', 'Fall')
 * @property {number} year - Year number
 */

/**
 * @typedef {Object} TagObject
 * @property {string} name - Tag name
 * @property {number} rank - Tag rank/relevance (0-100)
 */

/**
 * @typedef {string|Object} Genre
 * @property {string} name - Genre name (if object)
 */

/**
 * @typedef {Object} SourceAnime
 * @property {number} malId - MyAnimeList ID
 * @property {string} status - User list status ('COMPLETED', 'CURRENT', 'PAUSED', 'DROPPED', 'PLANNING')
 * @property {number} score - User's score (0-10)
 * @property {number} averageScore - Average community score (0-100)
 * @property {string[]|Object[]} genres - Array of genre names or objects
 * @property {TagObject[]} tags - Array of tag objects with rank
 * @property {Object} [title] - Title object (for AniList data)
 * @property {string} [title.english] - English title
 * @property {string} [title.romaji] - Romaji title
 */

/**
 * @typedef {Object} Song
 * @property {string} annSongId - Anime News Network song ID
 * @property {string} songName - Song name
 * @property {string} animeENName - English anime name
 * @property {string} songType - Song type ('Opening 1', 'Ending 1', 'Insert Song', etc.)
 * @property {string} songCategory - Song category
 * @property {number|null} songDifficulty - Song difficulty (0-100)
 * @property {string} animeType - Anime type ('TV', 'Movie', 'OVA', etc.)
 * @property {string} animeVintage - Vintage string (e.g., 'Fall 2023')
 * @property {SourceAnime} sourceAnime - Anime metadata attached to song
 * @property {string} source - Source of song ('list' for user lists, etc.)
 * @property {number} [malId] - MyAnimeList ID (from AnisongDB)
 * @property {Object} [linked_ids] - Linked IDs object
 * @property {number} [linked_ids.myanimelist] - MyAnimeList ID
 * @property {boolean} [isDub] - Whether the song is from a dubbed version
 * @property {boolean} [isRebroadcast] - Whether the anime is a rebroadcast
 * @property {string} [_sourceId] - Internal property: source node ID for basket matching
 * @property {string} [_basketSourceId] - Internal property: basket source node ID (for grouped batch nodes)
 * @property {string} [_sourceInfo] - Internal property: source list info for tracking
 * @property {string} [_sourceType] - Internal property: source type ('random' | 'watched')
 */

/**
 * @typedef {Object} VintageRange
 * @property {Vintage} from - Start vintage
 * @property {Vintage} to - End vintage
 * @property {number} [value] - Static value for song count
 * @property {Object} [valueRange] - Range object with min/max
 * @property {number} valueRange.min - Minimum song count
 * @property {number} valueRange.max - Maximum song count
 */

/**
 * @typedef {Object} SongListSettings
 * @property {string} nodeId - Node ID
 * @property {string} nodeType - Node type ('song-list', 'batch-user-list', 'live-node')
 * @property {string} mode - Mode ('masterlist', 'saved-lists', 'user-lists')
 * @property {boolean} useEntirePool - Whether to use entire pool
 * @property {number|null} [songPercentage] - Percentage of songs to pick from this list (0-100, null = not using percentages)
 * @property {string} [selectedListId] - Selected list ID (for saved-lists)
 * @property {string} [selectedListName] - Selected list name (for saved-lists)
 * @property {Object} [userListImport] - User list import settings
 * @property {string} userListImport.platform - Platform ('anilist' | 'mal')
 * @property {string} userListImport.username - Username
 * @property {Object} userListImport.selectedLists - Selected status lists
 * @property {Array} [userEntries] - User entries
 * @property {'default'|'many-lists'|'few-lists'} [songSelectionMode] - Song selection mode for batch-user-list and live-node types
 */

/**
 * @typedef {Object} SavedSongListResponse
 * @property {Song[]} songs - Array of song objects
 * @property {boolean} [supports_player_score] - Whether the list supports player score
 * @property {string} [name] - List name
 */

/**
 * @typedef {Object} UserListCacheResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {any[]} animeList - Array of anime entries
 * @property {any[]|null} songsList - Array of song entries (null if no songs)
 * @property {number} count - Total anime count
 * @property {number} songsCount - Total songs count
 * @property {boolean} cached - Whether any data was cached
 * @property {string[]} cachedStatuses - List of cached statuses
 * @property {string[]} uncachedStatuses - List of uncached statuses
 * @property {boolean} needsSongsFetch - Whether songs need to be fetched
 */

/**
 * @typedef {Object} FilterConfiguration
 * @property {string} definitionId - Filter definition ID
 * @property {string} instanceId - Filter instance ID
 * @property {Object} settings - Filter settings (varies by filter type)
 * @property {string|null} [targetSourceId] - Optional source node ID to scope filter to specific source
 * @property {string[]|null} [targetSourceIds] - Optional list of source node IDs to scope filter to multiple sources (union)
 * 
 * Note: The individual filter settings typedefs below (SongsAndTypesSettings, etc.) are for documentation purposes only.
 * They describe the structure of settings for each filter type, but are not used in type checking because
 * settings are accessed dynamically based on definitionId. See the typedefs below for each filter's settings structure.
 */

/**
 * Songs and types filter settings (from 'songs-and-types' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} SongsAndTypesSettings
 * @property {'count'|'percentage'} mode - Allocation mode
 * @property {number} total - Total song count
 * @property {Object} [types] - Song type distribution
 * @property {number} [types.openings] - Openings count
 * @property {number} [types.endings] - Endings count
 * @property {number} [types.inserts] - Inserts count
 * @property {Object} [typesRanges] - Song type ranges
 * @property {{min: number, max: number}} [typesRanges.openings] - Openings range
 * @property {{min: number, max: number}} [typesRanges.endings] - Endings range
 * @property {{min: number, max: number}} [typesRanges.inserts] - Inserts range
 */

/**
 * Vintage filter settings (from 'vintage' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} VintageSettings
 * @property {'count'|'percentage'} mode - Allocation mode
 * @property {number} total - Total song count
 * @property {Array<VintageRange>} [ranges] - Year/season ranges
 */

/**
 * Song difficulty filter settings (from 'song-difficulty' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} SongDifficultySettings
 * @property {'basic'|'advanced'} viewMode - View mode
 * @property {'count'|'percentage'} mode - Allocation mode
 * @property {number} total - Total song count
 * @property {Object} [difficulties] - Basic mode difficulties
 * @property {number} [difficulties.easy] - Easy difficulty count
 * @property {number} [difficulties.medium] - Medium difficulty count
 * @property {number} [difficulties.hard] - Hard difficulty count
 * @property {Array<{from: number, to: number, songCount?: number, songCountRange?: {min: number, max: number}}>} [ranges] - Advanced mode ranges
 */

/**
 * Player score filter settings (from 'player-score' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} PlayerScoreSettings
 * @property {'basic'|'advanced'} mode - Mode (basic = range only, advanced = distribution)
 * @property {number} min - Minimum score
 * @property {number} max - Maximum score
 * @property {number[]} [disabled] - Disabled scores
 * @property {Object<string, number>} [counts] - Score-specific counts (advanced mode)
 * @property {Object<string, number>} [percentages] - Score-specific percentages (advanced mode)
 */

/**
 * Anime score filter settings (from 'anime-score' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} AnimeScoreSettings
 * @property {number} min - Minimum score
 * @property {number} max - Maximum score
 * @property {number[]} [disabled] - Disabled scores
 * @property {Object<string, number>} [counts] - Score-specific counts
 */

/**
 * Anime type filter settings (from 'anime-type' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} AnimeTypeSettings
 * @property {'basic'|'advanced'} mode - View mode
 * @property {string[]} [enabled] - Enabled types (basic mode)
 * @property {Object<string, number>} [types] - Type distribution (advanced mode)
 * @property {Object<string, {min: number, max: number}>} [typesRanges] - Type ranges (advanced mode)
 * @property {number} [total] - Total song count (advanced mode)
 */

/**
 * Song categories filter settings (from 'song-categories' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} SongCategoriesSettings
 * @property {'basic'|'advanced'} mode - View mode
 * @property {Object} [enabled] - Enabled categories (basic mode: {openings: {category: boolean}, endings: {category: boolean}, inserts: {category: boolean}})
 * @property {Object<string, Object<string, number>>} [categories] - Category distribution (advanced mode)
 * @property {Object<string, Object<string, {min: number, max: number}>>} [categoriesRanges] - Category ranges (advanced mode)
 * @property {number} [total] - Total song count (advanced mode)
 */

/**
 * Genres filter settings (from 'genres' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} GenresSettings
 * @property {'basic'|'advanced'} mode - View mode
 * @property {string[]} [included] - Included genres (basic mode)
 * @property {string[]} [excluded] - Excluded genres (basic mode)
 * @property {string[]} [optional] - Optional genres (basic mode)
 * @property {boolean} [showRates] - Whether to show rates/percentages (advanced mode)
 * @property {Array<{label: string, status: 'include'|'exclude'|'optional', value: number}>} [items] - Genre items with counts (advanced mode)
 */

/**
 * Tags filter settings (from 'tags' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} TagsSettings
 * @property {'basic'|'advanced'} mode - View mode
 * @property {string[]} [included] - Included tags (basic mode)
 * @property {string[]} [excluded] - Excluded tags (basic mode)
 * @property {string[]} [optional] - Optional tags (basic mode)
 * @property {boolean} [showRates] - Whether to show rates/percentages (advanced mode)
 * @property {Array<{label: string, status: 'include'|'exclude'|'optional', value: number}>} [items] - Tag items with counts (advanced mode)
 */

/**
 * @typedef {Object} SimulatedConfig
 * @property {string} timestamp - Timestamp string
 * @property {string} seed - Seed string
 * @property {Object|null} router - Router settings
 * @property {Object} basicSettings - Basic quiz settings
 * @property {number} numberOfSongs - Target number of songs
 * @property {FilterConfiguration[]} filters - Array of filter configurations
 * @property {SongListSettings[]} songLists - Array of song list configurations
 * @property {boolean} [trainingMode] - Whether training mode is enabled
 */

/**
 * @typedef {Object} FilterStatistics
 * @property {string} name - Filter name
 * @property {number} before - Count before filtering
 * @property {number} after - Count after filtering
 * @property {number} removed - Count removed
 * @property {Object} details - Additional filter details
 */

/**
 * @typedef {Object} LoadingError
 * @property {number} listIndex - List index (1-based)
 * @property {string} listInfo - List information string
 * @property {string} error - Error message
 * @property {string} mode - List mode
 */

/**
 * @typedef {Object} Basket
 * @property {string} id - Basket ID
 * @property {string} type - Basket type ('range')
 * @property {number} min - Minimum song count
 * @property {number} max - Maximum song count
 * @property {number} current - Current song count
 * @property {Function} matcher - Function to check if song matches basket
 */

/**
 * @typedef {Object} BasketStatus
 * @property {string} id - Basket ID
 * @property {number} current - Current song count
 * @property {number} min - Minimum song count
 * @property {number} max - Maximum song count
 * @property {boolean} meetsMin - Whether minimum was met
 * @property {number} percentageOfMax - Percentage of max filled
 */

/**
 * @typedef {Object} SongLoadResult
 * @property {Song[]} songs - Array of songs
 * @property {boolean} supportsPlayerScore - Whether player score is available
 */

/**
 * @typedef {Object} FilterResult
 * @property {Song[]} songs - Filtered songs
 * @property {FilterStatistics[]} filterStatistics - Filter statistics
 */

/**
 * @typedef {Object} GenerationMetadata
 * @property {number} attempts - Number of generation attempts
 * @property {string} finalSeed - Final seed used
 * @property {boolean} success - Whether generation was successful
 * @property {number} targetCount - Target song count
 * @property {number} finalCount - Final song count
 * @property {number} sourceSongCount - Source song count
 * @property {number} eligibleSongCount - Eligible song count after global filters
 * @property {BasketStatus[]} basketStatus - Basket fill status
 * @property {BasketStatus[]} failedBaskets - Baskets that failed to meet minimum
 * @property {FilterStatistics[]} filterStatistics - Filter statistics
 * @property {LoadingError[]} loadingErrors - Loading errors
 * @property {Array} songsBySource - Array of song sources with their songs
 * @property {Array} songSourceMap - Mapping of annSongId to source info
 */

/**
 * @typedef {Object} GenerationResult
 * @property {Song[]} songs - Generated songs
 * @property {GenerationMetadata} metadata - Generation metadata
 */

// ========================================
// SECTION 1: CORE UTILITIES
// ========================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m'
};

/**
 * Create a seeded random number generator for reproducible results
 * @param {string} seed - Seed string for RNG
 * @returns {() => number} RNG function that returns numbers between 0 and 1
 */
export function makeRng(seed) {
  let state = hashString(seed);

  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Hash a string to a number for seeding
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Shuffle array using Fisher-Yates algorithm with seeded RNG
 * @template T
 * @param {T[]} array - Array to shuffle
 * @param {() => number} rng - Random number generator function
 * @returns {T[]} Shuffled array (modifies in place and returns)
 */
function shuffleArray(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Parse vintage string to season and year
 * @param {string} vintageStr - Vintage string like "Fall 2023"
 * @returns {Vintage} Object with season and year properties
 */
export function parseVintage(vintageStr) {
  if (!vintageStr) return { season: 'Winter', year: 1944 };
  const parts = vintageStr.split(' ');
  if (parts.length < 2) return { season: 'Winter', year: 1944 };
  return { season: parts[0], year: parseInt(parts[1]) };
}

/**
 * Check if vintage is within range
 * @param {string} vintage - Vintage string like "Fall 2023"
 * @param {Vintage} from - Start of range {season, year}
 * @param {Vintage} to - End of range {season, year}
 * @returns {boolean} True if vintage is in range
 */
export function isInVintageRange(vintage, from, to) {
  const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];
  const v = parseVintage(vintage);

  const vValue = v.year * 4 + seasons.indexOf(v.season);
  const fromValue = from.year * 4 + seasons.indexOf(from.season);
  const toValue = to.year * 4 + seasons.indexOf(to.season);

  return vValue >= fromValue && vValue <= toValue;
}

/**
 * Extract song list settings from simulated configuration
 * @param {SimulatedConfig} simulatedConfig - Simulated quiz configuration
 * @returns {SongListSettings[]} Array of song list configurations
 */
function extractSongListSettings(simulatedConfig) {
  const songListNodes = simulatedConfig.songLists || [];

  if (songListNodes.length === 0) {
    throw new Error('No song list nodes found in configuration');
  }

  return songListNodes;
}

/**
 * Fetch songs from AnisongDB using MAL IDs
 * @param {number[]} malIds - Array of MyAnimeList IDs
 * @returns {Promise<Song[]>} Array of song objects from AnisongDB
 */
async function fetchSongsFromAnisongDB(malIds) {
  const CHUNK_SIZE = 500;
  const DELAY_MS = 1000; // 1 second delay between requests

  // Chunk MAL IDs to handle API limit
  const malIdChunks = [];
  for (let i = 0; i < malIds.length; i += CHUNK_SIZE) {
    malIdChunks.push(malIds.slice(i, i + CHUNK_SIZE));
  }

  const allSongs = [];

  for (let i = 0; i < malIdChunks.length; i++) {
    const chunk = malIdChunks[i];

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

// ========================================
// SECTION 2: FILTER REGISTRY & PROCESSORS
// ========================================

/**
 * @typedef {Object} FilterContext
 * @property {boolean} supportsPlayerScore - Whether player score is available
 * @property {number} numberOfSongs - Target number of songs
 * @property {boolean} useManyListsMode - Whether to use many-lists mode
 * @property {SimulatedConfig} simulatedConfig - Full simulated configuration
 */

/**
 * @typedef {Object} FilterProcessor
 * @property {Function} [applyGlobalFilter] - Apply global filtering (returns {songs, stats})
 * @property {Function} [buildBaskets] - Build baskets for this filter (returns Basket[])
 * @property {Object} metadata - Filter metadata (name, category, etc.)
 */

/**
 * Helper to get song type group (openings/endings/inserts)
 * @param {string} songType - Song type string
 * @returns {string} Song type group
 */
function getSongTypeGroup(songType) {
  if (!songType) return 'inserts';
  if (songType.startsWith('Opening')) return 'openings';
  if (songType.startsWith('Ending')) return 'endings';
  return 'inserts';
}

/**
 * Wrap a basket matcher with source checking
 * @param {Function} baseMatcher - Base matcher function
 * @param {string|null|string[]} targetSourceId - Target source ID(s) to scope to. Can be string, null, or array of strings.
 * @returns {Function} Wrapped matcher function
 */
function wrapMatcherWithSourceCheck(baseMatcher, targetSourceId) {
  // If null, undefined, or empty array, no source restriction
  if (!targetSourceId || (Array.isArray(targetSourceId) && targetSourceId.length === 0)) {
    return baseMatcher;
  }

  // Normalize to array of IDs
  const targetIds = Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId];

  return (song) => {
    const sourceId = song._basketSourceId || song._sourceId;
    return targetIds.includes(sourceId) && baseMatcher(song);
  };
}

/**
 * Create an include/exclude/optional filter processor
 * Generic handler for filters with include/exclude/optional logic (genres, tags)
 * @param {Object} config - Filter configuration
 * @param {string} config.name - Filter display name
 * @param {Function} config.extractData - Function to extract array data from song
 * @param {Function} [config.extractSettings] - Function to extract settings from filter settings
 * @param {Function} [config.buildBasketMatcher] - Function to build basket matcher
 * @returns {FilterProcessor} Filter processor
 */
function createIncludeExcludeFilterProcessor(config) {
  const { name, extractData, extractSettings, buildBasketMatcher } = config;

  return {
    applyGlobalFilter: (songs, settings, targetSourceId) => {
      const extracted = extractSettings ? extractSettings(settings) : {
        included: settings.included || [],
        excluded: settings.excluded || [],
        optional: settings.optional || []
      };

      const { included, excluded, optional, items, showRates } = settings;
      let { included: includedItems, excluded: excludedItems, optional: optionalItems } = extracted;

      // Extract from items array if showRates is enabled (advanced mode)
      if (showRates && items && Array.isArray(items)) {
        includedItems = items.filter(i => i.status === 'include').map(i => i.label);
        excludedItems = items.filter(i => i.status === 'exclude').map(i => i.label);
        optionalItems = items.filter(i => i.status === 'optional').map(i => i.label);
      }

      console.log(`[GLOBAL FILTERS] ${name} filter: included=${includedItems.length}, excluded=${excludedItems.length}, optional=${optionalItems.length}`);

      if (includedItems.length === 0 && excludedItems.length === 0 && optionalItems.length === 0) {
        return { songs, stats: null };
      }

      const beforeCount = songs.length;
      const filtered = songs.filter(song => {
        const data = extractData(song);

        // Must have all included items
        if (includedItems.length > 0 && !includedItems.every(item => data.includes(item))) {
          return false;
        }

        // Must not have any excluded items
        if (excludedItems.length > 0 && excludedItems.some(item => data.includes(item))) {
          return false;
        }

        // Must have at least one optional item
        if (optionalItems.length > 0 && !optionalItems.some(item => data.includes(item))) {
          return false;
        }

        return true;
      });

      console.log(`[GLOBAL FILTERS] ${name} filter: ${filtered.length}/${beforeCount} songs`);

      const stats = recordFilterStat(name, beforeCount, filtered.length, {
        included: includedItems.length > 0 ? includedItems : null,
        excluded: excludedItems.length > 0 ? excludedItems : null,
        optional: optionalItems.length > 0 ? optionalItems : null
      });

      return { songs: filtered, stats };
    },

    buildBaskets: buildBasketMatcher ? (settings, targetSourceId) => {
      const baskets = [];

      if (!settings.showRates || !settings.items || !Array.isArray(settings.items)) {
        return baskets;
      }

      const itemsWithCounts = settings.items.filter(item => item.value > 0);
      console.log(`[BASKETS] Creating ${name} baskets from ${itemsWithCounts.length} items with counts`);

      itemsWithCounts.forEach(item => {
        const itemName = item.label;
        const songCount = item.value;

        baskets.push(createBasket(
          `${name.toLowerCase()}-${itemName}-${targetSourceId || 'all'}`,
          songCount,
          songCount,
          wrapMatcherWithSourceCheck(buildBasketMatcher(itemName), targetSourceId)
        ));
      });

      return baskets;
    } : undefined,

    metadata: { name, category: 'include-exclude' }
  };
}

/**
 * Create a score range filter processor
 * Generic handler for score-based filters (player score, anime score)
 * @param {Object} config - Filter configuration
 * @param {string} config.name - Filter display name
 * @param {'player'|'anime'} config.scoreType - Score type
 * @param {Function} config.normalizeScore - Function to normalize score value
 * @param {Function} config.extractScore - Function to extract score from song
 * @returns {FilterProcessor} Filter processor
 */
function createScoreRangeFilterProcessor(config) {
  const { name, scoreType, normalizeScore, extractScore } = config;

  return {
    applyGlobalFilter: (songs, settings, targetSourceId, context) => {
      const { min, max, disabled, percentages, counts } = settings;

      // Only apply as global filter if no percentage/count distribution (basic mode)
      if ((percentages && Object.keys(percentages).length > 0) || (counts && Object.keys(counts).length > 0)) {
        return { songs, stats: null };
      }

      const isFullRange = scoreType === 'player' ? (min === 1 && max === 10) : (min === 1 && max === 10);
      const beforeCount = songs.length;

      const filtered = songs.filter(song => {
        const rawScore = extractScore(song);

        // Handle missing scores
        if (rawScore === undefined || rawScore === null) {
          return isFullRange;
        }

        const score = normalizeScore(rawScore);
        if (score === null) return isFullRange;

        const inRange = score >= min && score <= max;
        const notDisabled = !(disabled || []).includes(score);

        return inRange && notDisabled;
      });

      console.log(`[GLOBAL FILTERS] ${name} filter: ${filtered.length}/${beforeCount} songs (range: ${min}-${max})`);

      const stats = recordFilterStat(name, beforeCount, filtered.length, {
        range: `${min}-${max}`,
        disabled: disabled?.length > 0 ? disabled : null
      });

      return { songs: filtered, stats };
    },

    buildBaskets: (settings, targetSourceId, context) => {
      const baskets = [];

      if (!settings.counts || Object.keys(settings.counts).length === 0) {
        return baskets;
      }

      // Normalize targetSourceId to targetSourceIds array
      const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
      // Create suffix for basket IDs (use + to join multiple IDs)
      const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

      if (context.useManyListsMode) {
        // MANY-LISTS MODE: Create aggregate basket
        const { min = 1, max = scoreType === 'player' ? 10 : 10 } = settings;
        const baseMatcher = (song) => {
          const rawScore = extractScore(song);
          const score = normalizeScore(rawScore);
          return score !== null && score >= min && score <= max;
        };

        baskets.push(createBasket(
          `${scoreType}-score-aggregate-${min}-${max}-${sourceSuffix}`,
          0,
          context.numberOfSongs,
          targetSourceIds ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song) : baseMatcher
        ));
        console.log(`[BASKETS] Created aggregate ${name} basket: ${min}-${max}`);
      } else {
        // DEFAULT MODE: Create score-specific baskets using utility
        // createScoreBaskets handles targetSourceId as array now
        const scoreBaskets = createScoreBaskets(scoreType, settings, context.numberOfSongs, targetSourceId);
        baskets.push(...scoreBaskets);
      }

      return baskets;
    },

    metadata: { name, category: 'score-range', scoreType }
  };
}

/**
 * Filter Registry
 * Maps filter definitionId to its processor implementation
 */
const FILTER_REGISTRY = {
  'genres': createIncludeExcludeFilterProcessor({
    name: 'Genres',
    extractData: (song) => song.sourceAnime?.genres || [],
    extractSettings: (settings) => ({
      included: settings.included || [],
      excluded: settings.excluded || [],
      optional: settings.optional || []
    }),
    buildBasketMatcher: (genreName) => (song) => {
      const genres = song.sourceAnime?.genres || [];
      return genres.includes(genreName);
    }
  }),

  'tags': createIncludeExcludeFilterProcessor({
    name: 'Tags',
    extractData: (song) => {
      const tagObjects = song.sourceAnime?.tags || [];
      const validTags = tagObjects.filter(t => (t.rank || 0) > 60);

      // If filtering by tags and anime has no valid tags, return empty array
      if (validTags.length === 0) {
        return [];
      }

      return validTags.map(t => t.name);
    },
    extractSettings: (settings) => ({
      included: settings.included || [],
      excluded: settings.excluded || [],
      optional: settings.optional || []
    }),
    buildBasketMatcher: (tagName) => (song) => {
      const tagObjects = song.sourceAnime?.tags || [];
      const validTags = tagObjects.filter(t => (t.rank || 0) > 60);
      const tags = validTags.map(t => t.name);
      return tags.includes(tagName);
    }
  }),

  'player-score': createScoreRangeFilterProcessor({
    name: 'Player Score',
    scoreType: 'player',
    normalizeScore: normalizePlayerScore,
    extractScore: (song) => song.sourceAnime?.score
  }),

  'anime-score': createScoreRangeFilterProcessor({
    name: 'Anime Score',
    scoreType: 'anime',
    normalizeScore: normalizeAnimeScore,
    extractScore: (song) => {
      // First try sourceAnime.averageScore (AniList format, 0-100 scale)
      if (song.sourceAnime?.averageScore !== undefined && song.sourceAnime?.averageScore !== null) {
        return song.sourceAnime.averageScore;
      }
      // Fallback to direct animeScore (AMQ format, 1-10 scale)
      // Convert to 0-100 scale to match normalizeAnimeScore expectation
      if (song.animeScore !== undefined && song.animeScore !== null) {
        return song.animeScore * 10;
      }
      return null;
    }
  }),

  'anime-type': {
    applyGlobalFilter: (songs, settings) => {
      // Only apply in basic mode - advanced mode is basket-based
      if (settings.mode !== 'basic') {
        return { songs, stats: null };
      }

      const { enabled, rebroadcast, dubbed } = settings;
      if (!enabled || enabled.length === 0) {
        return { songs, stats: null };
      }

      // DEBUG: Log raw values for rebroadcast and dubbed
      console.log(`[GLOBAL FILTERS] DEBUG Anime Type settings: rebroadcast = ${JSON.stringify(rebroadcast)} (type: ${typeof rebroadcast}), dubbed = ${JSON.stringify(dubbed)} (type: ${typeof dubbed})`);

      const beforeCount = songs.length;
      const filtered = songs.filter(song => {
        // Check anime type (TV, Movie, OVA, etc.)
        const type = (song.animeType || '').toLowerCase();
        if (!enabled.includes(type)) {
          return false;
        }

        // Check rebroadcast filter (if set to false, exclude rebroadcasts)
        if (rebroadcast === false && song.isRebroadcast === true) {
          return false;
        }

        // Check dubbed filter (if set to false, exclude dubs)
        if (dubbed === false && song.isDub === true) {
          return false;
        }

        return true;
      });

      console.log(`[GLOBAL FILTERS] Anime Type filter: ${filtered.length}/${beforeCount} songs (rebroadcast: ${rebroadcast !== false ? 'included' : 'excluded'}, dubbed: ${dubbed !== false ? 'included' : 'excluded'})`);

      const stats = recordFilterStat('Anime Type', beforeCount, filtered.length, {
        enabled: enabled,
        rebroadcast: rebroadcast !== false,
        dubbed: dubbed !== false
      });

      return { songs: filtered, stats };
    },

    buildBaskets: (settings, targetSourceId, context) => {
      const baskets = [];

      // Only build baskets in advanced mode
      if (settings.mode !== 'advanced') {
        return baskets;
      }

      const { types, typesRanges, total, mode } = settings;

      Object.entries(types || {}).forEach(([type, quota]) => {
        const rangeOrValue = typesRanges?.[type] || quota;
        const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

        if (max > 0) {
          const baseMatcher = (song) => (song.animeType || '').toLowerCase() === type.toLowerCase();

          baskets.push(createBasket(
            `animeType-${type}-${targetSourceId || 'all'}`,
            min,
            max,
            wrapMatcherWithSourceCheck(baseMatcher, targetSourceId)
          ));
        }
      });

      return baskets;
    },

    metadata: { name: 'Anime Type', category: 'type' }
  },

  'song-categories': {
    applyGlobalFilter: (songs, settings) => {
      // Only apply in basic mode - advanced mode is basket-based
      if (settings.mode !== 'basic') {
        return { songs, stats: null };
      }

      const { enabled } = settings;
      if (!enabled) {
        return { songs, stats: null };
      }

      const beforeCount = songs.length;
      const filtered = songs.filter(song => {
        const group = getSongTypeGroup(song.songType);
        const category = (song.songCategory || '').toLowerCase();
        return enabled?.[group]?.[category] === true;
      });

      console.log(`[GLOBAL FILTERS] Song Categories filter: ${filtered.length}/${beforeCount} songs`);

      const stats = recordFilterStat('Song Categories', beforeCount, filtered.length, {
        enabledCategories: Object.keys(enabled || {}).length > 0 ? Object.keys(enabled) : null
      });

      return { songs: filtered, stats };
    },

    buildBaskets: (settings, targetSourceId, context) => {
      const baskets = [];

      // Only build baskets in advanced mode
      if (settings.mode !== 'advanced') {
        return baskets;
      }

      const { mode, categories, categoriesRanges, total } = settings;

      // Normalize targetSourceId to targetSourceIds array
      const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
      // Create suffix for basket IDs (use + to join multiple IDs)
      const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

      Object.entries(categories || {}).forEach(([songType, cats]) => {
        Object.entries(cats).forEach(([category, quota]) => {
          const rangeOrValue = categoriesRanges?.[songType]?.[category] || quota;
          const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

          if (max > 0) {
            const baseMatcher = (song) => {
              const group = getSongTypeGroup(song.songType);
              const cat = (song.songCategory || '').toLowerCase();
              return group === songType && cat === category.toLowerCase();
            };

            baskets.push(createBasket(
              `category-${songType}-${category}-${sourceSuffix}`,
              min,
              max,
              wrapMatcherWithSourceCheck(baseMatcher, targetSourceIds)
            ));
          }
        });
      });

      return baskets;
    },

    metadata: { name: 'Song Categories', category: 'category' }
  },

  'songs-and-types': {
    // No global filtering (this filter only creates baskets)
    applyGlobalFilter: null,

    buildBaskets: (settings, targetSourceId, context) => {
      const baskets = [];
      const { mode, total, types, typesRanges, songSelection, songSelectionRanges } = settings;

      // Normalize targetSourceId to targetSourceIds array
      const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
      // Create suffix for basket IDs (use + to join multiple IDs)
      const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

      // Build song type baskets (openings/endings/inserts)
      ['openings', 'endings', 'inserts'].forEach(typeKey => {
        const rangeOrValue = typesRanges?.[typeKey] || (types?.[typeKey] !== undefined ? types[typeKey] : null);
        if (!rangeOrValue) return;

        const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

        if (max > 0) {
          const baseMatcher = (song) => {
            const songType = song.songType || '';
            if (typeKey === 'openings') return songType.startsWith('Opening');
            if (typeKey === 'endings') return songType.startsWith('Ending');
            if (typeKey === 'inserts') return songType.includes('Insert');
            return false;
          };

          baskets.push(createBasket(
            `songType-${typeKey}-${sourceSuffix}`,
            min,
            max,
            wrapMatcherWithSourceCheck(baseMatcher, targetSourceIds)
          ));
        }
      });

      // Build song selection baskets (random vs watched)
      if (songSelection && (songSelection.random > 0 || songSelection.watched > 0)) {
        // Check if there are masterlist source nodes
        const songListSettings = extractSongListSettings(context.simulatedConfig);
        const hasMasterlistNodes = songListSettings.some(s => s.mode === 'masterlist');

        let adjustedRandom = songSelection.random || 0;
        let adjustedWatched = songSelection.watched || 0;

        if (hasMasterlistNodes && adjustedRandom > 0) {
          console.log(`[BASKETS] Masterlist source node(s) detected - converting ${adjustedRandom} random songs to watched`);
          adjustedWatched = adjustedWatched + adjustedRandom;
          adjustedRandom = 0;
        }

        // Create random basket
        if (adjustedRandom > 0) {
          const randomRange = songSelectionRanges?.random || { min: songSelection.random, max: songSelection.random };
          const { min, max } = calculateRangeFromSettings(randomRange, mode, total);

          if (max > 0) {
            const baseMatcher = (song) => song._sourceType === 'random';
            baskets.push(createBasket(
              `songSelection-random-${sourceSuffix}`,
              min,
              max,
              wrapMatcherWithSourceCheck(baseMatcher, targetSourceIds)
            ));
          }
        }

        // Create watched basket
        if (adjustedWatched > 0) {
          let watchedRange = songSelectionRanges?.watched || { min: songSelection.watched || 0, max: songSelection.watched || 0 };
          if (hasMasterlistNodes && songSelection.random > 0) {
            const randomRange = songSelectionRanges?.random || { min: songSelection.random || 0, max: songSelection.random || 0 };
            watchedRange = {
              min: (watchedRange.min || 0) + (randomRange.min || 0),
              max: (watchedRange.max || 0) + (randomRange.max || 0)
            };
          }
          const { min, max } = calculateRangeFromSettings(watchedRange, mode, total);

          if (max > 0) {
            const baseMatcher = (song) => song._sourceType === 'watched';
            baskets.push(createBasket(
              `songSelection-watched-${sourceSuffix}`,
              min,
              max,
              wrapMatcherWithSourceCheck(baseMatcher, targetSourceIds)
            ));
          }
        }
      }

      return baskets;
    },

    metadata: { name: 'Songs & Types', category: 'song-type' }
  },

  'song-difficulty': {
    // No global filtering (only basket-based)
    applyGlobalFilter: null,

    buildBaskets: (settings, targetSourceId, context) => {
      const baskets = [];
      const { mode, viewMode, difficulties, ranges, total } = settings;
      const { useManyListsMode, numberOfSongs } = context;

      // Normalize targetSourceId to targetSourceIds array
      const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
      // Create suffix for basket IDs (use + to join multiple IDs)
      const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

      if (useManyListsMode) {
        // MANY-LISTS MODE: Create baskets with quotas
        if (viewMode === 'basic' && difficulties) {
          const basicRanges = [
            { label: 'easy', diffMin: 60, diffMax: 100, quota: difficulties.easy, enabled: difficulties.easy?.enabled !== false },
            { label: 'medium', diffMin: 25, diffMax: 60, quota: difficulties.medium, enabled: difficulties.medium?.enabled !== false },
            { label: 'hard', diffMin: 0, diffMax: 25, quota: difficulties.hard, enabled: difficulties.hard?.enabled !== false }
          ];

          basicRanges.forEach(range => {
            if (!range.enabled) return;

            const diffSettings = range.quota || {};
            let rangeOrValue;

            if (diffSettings.randomRange) {
              if (mode === 'percentage') {
                rangeOrValue = {
                  min: diffSettings.minPercentage ?? diffSettings.min ?? 0,
                  max: diffSettings.maxPercentage ?? diffSettings.max ?? 0
                };
              } else {
                rangeOrValue = {
                  min: diffSettings.minCount ?? diffSettings.min ?? 0,
                  max: diffSettings.maxCount ?? diffSettings.max ?? 0
                };
              }
            } else {
              const value = mode === 'percentage'
                ? (diffSettings.percentageValue ?? diffSettings.percentage ?? 0)
                : (diffSettings.countValue ?? diffSettings.count ?? 0);
              rangeOrValue = value;
            }

            const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

            if (max > 0) {
              const baseMatcher = (song) => {
                const diff = song.songDifficulty;
                return diff !== null && diff !== undefined && diff >= range.diffMin && diff <= range.diffMax;
              };

              baskets.push(createBasket(
                `difficulty-${range.label}-${sourceSuffix}`,
                min,
                max,
                targetSourceIds ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song) : baseMatcher
              ));
            }
          });
        } else if (ranges && ranges.length > 0) {
          // Advanced mode
          ranges.forEach((range) => {
            const rangeOrValue = range.songCountRange || (range.songCount !== undefined ? range.songCount : null);
            if (!rangeOrValue) return;

            const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

            if (max > 0) {
              const baseMatcher = (song) => {
                const diff = song.songDifficulty;
                return diff !== null && diff !== undefined && diff >= range.from && diff <= range.to;
              };

              baskets.push(createBasket(
                `difficulty-${range.from}-${range.to}-${sourceSuffix}`,
                min,
                max,
                targetSourceIds ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song) : baseMatcher
              ));
            }
          });
        }
      } else {
        // DEFAULT MODE: Create resolved sub-range baskets
        if (viewMode === 'basic' && difficulties) {
          const basicRanges = [
            { label: 'easy', diffMin: 60, diffMax: 100, quota: difficulties.easy || 0 },
            { label: 'medium', diffMin: 25, diffMax: 60, quota: difficulties.medium || 0 },
            { label: 'hard', diffMin: 0, diffMax: 25, quota: difficulties.hard || 0 }
          ];

          basicRanges.forEach(range => {
            const quota = calculateCountOrPercentage(range.quota, mode, total);

            if (quota > 0) {
              const baseMatcher = (song) => {
                const diff = song.songDifficulty;
                return diff !== null && diff !== undefined && diff >= range.diffMin && diff <= range.diffMax;
              };

              baskets.push(createBasket(
                `difficulty-${range.label}-${sourceSuffix}`,
                quota,
                quota,
                targetSourceIds ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song) : baseMatcher
              ));
            }
          });
        } else if (ranges && ranges.length > 0) {
          ranges.forEach((range) => {
            const rangeOrValue = range.songCountRange || (range.songCount !== undefined ? range.songCount : null);
            if (!rangeOrValue) return;

            const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

            if (max > 0) {
              const baseMatcher = (song) => {
                const diff = song.songDifficulty;
                return diff !== null && diff !== undefined && diff >= range.from && diff <= range.to;
              };

              baskets.push(createBasket(
                `difficulty-${range.from}-${range.to}-${sourceSuffix}`,
                min,
                max,
                targetSourceIds ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song) : baseMatcher
              ));
            }
          });
        }
      }

      return baskets;
    },

    metadata: { name: 'Song Difficulty', category: 'difficulty' }
  },

  'vintage': {
    // No global filtering (only basket-based)
    applyGlobalFilter: null,

    buildBaskets: (settings, targetSourceId) => {
      const baskets = [];
      const { mode, ranges, total } = settings;

      if (ranges && ranges.length > 0) {
        ranges.forEach((range) => {
          const rangeOrValue = range.valueRange || (range.value !== undefined ? range.value : null);
          if (!rangeOrValue) return;

          const { min, max } = calculateRangeFromSettings(rangeOrValue, mode, total);

          if (max > 0) {
            const baseMatcher = (song) => isInVintageRange(song.animeVintage, range.from, range.to);

            // Normalize targetSourceId to targetSourceIds array
            const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
            // Create suffix for basket IDs (use + to join multiple IDs)
            const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

            baskets.push(createBasket(
              `vintage-${range.from.season}${range.from.year}-${range.to.season}${range.to.year}-${sourceSuffix}`,
              min,
              max,
              wrapMatcherWithSourceCheck(baseMatcher, targetSourceIds)
            ));
          }
        });
      }

      return baskets;
    },

    metadata: { name: 'Vintage', category: 'vintage' }
  }
};

// ========================================
// SECTION 3: USER LIST MANAGEMENT HELPERS
// ========================================

/**
 * Fetch user list with cache support
 * @param {string} platform - Platform ('anilist' | 'mal')
 * @param {string} username - Username
 * @param {Object} selectedLists - Selected status lists
 * @param {typeof fetch} fetchFn - Fetch function to use
 * @param {boolean} forceRefresh - Whether to force refresh cache
 * @returns {Promise<UserListCacheResponse>} Cache response data
 */
async function fetchUserListWithCache(platform, username, selectedLists, fetchFn, forceRefresh = false) {
  const requestBody = {
    action: 'fetch',
    platform,
    username,
    selectedLists,
    forceRefresh
  };

  const response = await fetchFn('/api/user-list-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Failed to load user list for ${username}`);
  }

  return await response.json();
}

/**
 * Enrich uncached songs by fetching from AniList and AnisongDB
 * @param {SourceAnime[]} cachedAnimeList - Anime list from cache
 * @param {string[]} uncachedStatuses - Statuses that need fetching
 * @param {string} platform - Platform ('anilist' | 'mal')
 * @param {string} username - Username
 * @returns {Promise<{animeList: SourceAnime[], enrichedSongs: Song[]}>} Complete anime list and enriched songs
 */
async function enrichUncachedSongs(cachedAnimeList, uncachedStatuses, platform, username) {
  let animeList = [...cachedAnimeList];

  // For AniList, fetch missing data server-side
  if (platform === 'anilist' && uncachedStatuses && uncachedStatuses.length > 0) {
    try {
      console.log(`[SONG LOADING] Fetching AniList data for ${username} with statuses:`, uncachedStatuses);
      const freshAnimeList = await fetchAniListData(username, {
        selectedStatuses: uncachedStatuses
      });
      console.log(`[SONG LOADING] Fetched ${freshAnimeList.length} anime from AniList for ${username}`);
      animeList = [...animeList, ...freshAnimeList];
    } catch (error) {
      console.error(`[SONG LOADING] Failed to fetch AniList data for ${username}:`, error);
    }
  }

  console.log(`[SONG LOADING] Total anime list for ${username}: ${animeList.length} entries`);

  // Determine which anime need song fetching (only uncached statuses)
  const uncachedStatusSet = new Set(uncachedStatuses.map((s) => s.toUpperCase()));
  const animeNeedingSongs = animeList.filter(
    (anime) => anime.status && uncachedStatusSet.has(anime.status.toUpperCase())
  );

  console.log(`[SONG LOADING] Anime needing songs for ${username}: ${animeNeedingSongs.length} entries (uncached statuses: ${Array.from(uncachedStatusSet).join(', ')})`);

  // Sample first few anime to check their structure
  if (animeNeedingSongs.length > 0) {
    const sampleAnime = animeNeedingSongs.slice(0, 3);
    console.log(`[SONG LOADING] Sample anime for ${username}:`, sampleAnime.map(a => ({
      title: a.title?.english || a.title?.romaji || 'Unknown',
      status: a.status,
      malId: a.malId
    })));
  }

  // Extract MAL IDs from uncached anime only
  const malIds = animeNeedingSongs.map((a) => a.malId).filter(Boolean);
  console.log(`[SONG LOADING] Found ${malIds.length} MAL IDs out of ${animeNeedingSongs.length} anime for ${username}`);

  // Log anime without MAL IDs for debugging
  if (malIds.length < animeNeedingSongs.length) {
    const animeMissingMalIds = animeNeedingSongs.filter(a => !a.malId);
    console.log(`[SONG LOADING] ${animeMissingMalIds.length} anime missing MAL IDs for ${username}:`);
    animeMissingMalIds.forEach((anime, index) => {
      // @ts-ignore - These properties exist on AniList anime objects but aren't in typedef
      const title = anime.title?.english || anime.title?.romaji || anime.title?.native || 'No title available';
      // @ts-ignore - anilistId exists on cached anime objects
      const anilistId = anime.anilistId || anime.id || 'N/A';
      // @ts-ignore - format exists on cached anime objects
      const format = anime.format || 'Unknown';

      console.log(`  [${index + 1}] AniList ID: ${anilistId} | Format: ${format} | Status: ${anime.status || 'Unknown'}`);
    });
  }

  let enrichedSongs = [];
  if (malIds.length > 0) {
    try {
      // Fetch songs from AnisongDB and enrich with sourceAnime data
      enrichedSongs = await fetchAndEnrichSongs(malIds, animeList, fetchSongsFromAnisongDB);
    } catch (fetchError) {
      console.error(`[SONG LOADING] Failed to fetch songs from AnisongDB for ${username}:`, fetchError);
      // Don't throw - return empty songs and let the caller handle it
    }
  } else {
    console.log(`[SONG LOADING] No MAL IDs found for ${username}, caching anime data with empty songs list`);
  }

  return { animeList, enrichedSongs };
}

/**
 * Store fetched anime and songs data in cache, grouped by status
 * @param {string} platform - Platform ('anilist' | 'mal')
 * @param {string} username - Username
 * @param {SourceAnime[]} animeList - Complete anime list
 * @param {Song[]} enrichedSongs - Songs with sourceAnime data
 * @param {string[]} uncachedStatuses - Statuses that were freshly fetched
 * @param {typeof fetch} fetchFn - Fetch function to use
 * @returns {Promise<Object>} Cache response data
 */
async function storeFetchedDataInCache(
  platform,
  username,
  animeList,
  enrichedSongs,
  uncachedStatuses,
  fetchFn = fetch
) {
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

  // Store in cache via API using fetchFn
  const cacheResponse = await fetchFn('/api/user-list-cache', {
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

  return await cacheResponse.json();
}

/**
 * Load saved list directly from database (server-side only, bypasses auth)
 * @param {string} listId - Song list ID
 * @returns {Promise<{songs: Song[], name: string}>} Songs and list name
 */
async function loadSavedListDirect(listId) {
  const supabaseAdmin = createSupabaseAdmin();

  // Fetch the list metadata (bypass auth check - server has admin access)
  const { data: listData, error: dbError } = await supabaseAdmin
    .from('song_lists')
    .select('id, name, songs_list_link')
    .eq('id', listId)
    .single();

  if (dbError) {
    console.error('[SONG LOADING] Database error loading saved list:', {
      listId,
      error: dbError,
      code: dbError.code,
      message: dbError.message,
      details: dbError.details
    });

    if (dbError.code === 'PGRST116') {
      throw new Error(`Failed to load saved list: List with ID "${listId}" not found in database`);
    } else {
      throw new Error(`Failed to load saved list from database: ${dbError.message || dbError.code || 'Unknown database error'}`);
    }
  }

  if (!listData) {
    throw new Error(`Failed to load saved list: List with ID "${listId}" not found`);
  }

  // Fetch songs from Pixeldrain
  let songs = [];
  if (listData.songs_list_link) {
    try {
      songs = await fetchFromPixeldrain(listData.songs_list_link);
      console.log(`[SONG LOADING] Successfully loaded ${songs.length} songs from Pixeldrain for list "${listData.name}" (ID: ${listId})`);
      
      // Enrich songs with AniList metadata if they have aniListId but no sourceAnime
      const songsNeedingEnrichment = songs.filter(song => {
        const hasAnilistId = song.aniListId || song.linked_ids?.anilist || song.siteIds?.aniListId;
        const hasSourceAnime = song.sourceAnime?.averageScore !== undefined;
        return hasAnilistId && !hasSourceAnime;
      });
      
      if (songsNeedingEnrichment.length > 0) {
        // Extract unique AniList IDs
        const anilistIds = [...new Set(songsNeedingEnrichment.map(song => 
          song.aniListId || song.linked_ids?.anilist || song.siteIds?.aniListId
        ).filter(Boolean))];
        
        console.log(`[SONG LOADING] Enriching ${songsNeedingEnrichment.length} songs with AniList data (${anilistIds.length} unique IDs)`);
        
        try {
          const anilistMetadataMap = await batchFetchAnimeMetadataByAnilistIds(anilistIds);
          
          // Attach sourceAnime to songs
          songs = songs.map(song => {
            const anilistId = song.aniListId || song.linked_ids?.anilist || song.siteIds?.aniListId;
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
          
          console.log(`[SONG LOADING] Successfully enriched songs with AniList data (${anilistMetadataMap.size} metadata entries)`);
        } catch (enrichError) {
          console.warn('[SONG LOADING] Failed to enrich with AniList data (non-fatal):', enrichError.message);
          // Continue without enrichment - filters will use fallback animeScore if available
        }
      }
    } catch (err) {
      console.error('[SONG LOADING] Failed to fetch songs from Pixeldrain:', {
        listId,
        listName: listData.name,
        pixeldrainUrl: listData.songs_list_link,
        error: err.message,
        stack: err.stack
      });
      throw new Error(`Failed to load songs from storage (Pixeldrain) for list "${listData.name}": ${err.message || 'Unknown error'}`);
    }
  } else {
    console.warn(`[SONG LOADING] List "${listData.name}" (ID: ${listId}) has no songs_list_link, returning empty songs array`);
  }

  return { songs, name: listData.name };
}

/**
 * Load songs from a single song list configuration
 * @param {SongListSettings} songListSettings - Single song list configuration
 * @param {typeof fetch} fetchFn - Fetch function to use (event.fetch in server context)
 * @returns {Promise<SongLoadResult>} Object with songs array and supportsPlayerScore flag
 */
async function loadSingleSongList(songListSettings, fetchFn = fetch) {
  if (songListSettings.mode === 'masterlist') {
    const songs = Array.isArray(masterlistData) ? masterlistData : [];
    return {
      songs,
      supportsPlayerScore: false
    };
  } else if (songListSettings.mode === 'saved-lists') {
    try {
      // Since this is server-side code, always use direct database access
      // This bypasses authentication checks - server has admin privileges
      const result = await loadSavedListDirect(songListSettings.selectedListId);
      return {
        songs: Array.isArray(result.songs) ? result.songs : [],
        supportsPlayerScore: false
      };
    } catch (error) {
      const listId = songListSettings.selectedListId;
      const listName = songListSettings.selectedListName || 'unknown';
      console.error(`[SONG LOADING] Error loading saved list "${listName}" (ID: ${listId}):`, {
        error: error.message,
        stack: error.stack,
        listId,
        listName
      });
      throw new Error(`Failed to load saved list "${listName}": ${error.message}`);
    }
  } else if (songListSettings.mode === 'user-lists' || songListSettings.nodeType === 'batch-user-list' || songListSettings.nodeType === 'live-node') {
    try {
      const platform = songListSettings.userListImport?.platform || 'anilist';
      const username = songListSettings.userListImport?.username || '';
      const selectedLists = songListSettings.userListImport?.selectedLists || {};

      // Try initial fetch
      let data = await fetchUserListWithCache(platform, username, selectedLists, fetchFn, false);
      let songs = Array.isArray(data.songsList) ? data.songsList : [];

      // Process uncached statuses if needed
      const hasUncachedStatuses = data.needsSongsFetch && data.uncachedStatuses && data.uncachedStatuses.length > 0;

      if (hasUncachedStatuses) {
        console.log('[SONG LOADING] Some statuses are not cached. Fetching songs from AnisongDB for uncached statuses:', data.uncachedStatuses);

        const animeList = Array.isArray(data.animeList) ? data.animeList : [];
        const { animeList: completeAnimeList, enrichedSongs } = await enrichUncachedSongs(
          animeList,
          data.uncachedStatuses,
          platform,
          username
        );

        // Combine with cached songs
        songs = [...songs, ...enrichedSongs];

        // Store in cache if we have data
        if (completeAnimeList.length > 0) {
          try {
            await storeFetchedDataInCache(platform, username, completeAnimeList, enrichedSongs, data.uncachedStatuses, fetchFn);
            console.log('[SONG LOADING] Successfully cached fetched data');
          } catch (cacheError) {
            console.error('[SONG LOADING] Failed to store cache (non-fatal):', cacheError);
          }
        } else {
          console.warn('[SONG LOADING] No anime data to cache (animeList is empty)');
        }
      } else if (songs.length === 0) {
        // Retry with force refresh if we got 0 songs
        console.warn('[SONG LOADING] Got 0 songs from cache, retrying with force refresh...');

        data = await fetchUserListWithCache(platform, username, selectedLists, fetchFn, true);
        songs = Array.isArray(data.songsList) ? data.songsList : [];

        // Process uncached statuses on retry
        const hasUncachedStatusesRetry = data.needsSongsFetch && data.uncachedStatuses && data.uncachedStatuses.length > 0;

        if (hasUncachedStatusesRetry) {
          console.log('[SONG LOADING] Force refresh: Some statuses are not cached. Fetching songs from AnisongDB for uncached statuses:', data.uncachedStatuses);

          const animeList = Array.isArray(data.animeList) ? data.animeList : [];
          const { animeList: completeAnimeList, enrichedSongs } = await enrichUncachedSongs(
            animeList,
            data.uncachedStatuses,
            platform,
            username
          );

          // Combine with cached songs
          songs = [...songs, ...enrichedSongs];

          // Store in cache if we have data
          if (completeAnimeList.length > 0) {
            try {
              await storeFetchedDataInCache(platform, username, completeAnimeList, enrichedSongs, data.uncachedStatuses, fetchFn);
              console.log('[SONG LOADING] Force refresh: Successfully cached fetched data');
            } catch (cacheError) {
              console.error('[SONG LOADING] Force refresh: Failed to store cache (non-fatal):', cacheError);
            }
          } else {
            console.warn('[SONG LOADING] Force refresh: No anime data to cache (animeList is empty)');
          }
        }
      }

      return {
        songs,
        supportsPlayerScore: true
      };
    } catch (error) {
      console.error('[SONG LOADING] Error loading user list:', error);
      throw new Error(`Failed to load user list: ${error.message}`);
    }
  }

  throw new Error(`Invalid song list mode: ${songListSettings.mode || 'undefined'}`);
}

/**
 * Expand batch user lists into individual source entries
 * @param {SongListSettings[]} songListSettings - Raw song list settings
 * @returns {Array<{settings: SongListSettings, percentage: number|null, listInfo: string}>} Expanded list entries
 */
function expandSongListSettings(songListSettings) {
  const expanded = [];

  for (const settings of songListSettings) {
    if (settings.nodeType === 'batch-user-list' && Array.isArray(settings.userEntries)) {
      // Log expansion details for batch-user-list
      const hasNodeLevelPercentage = settings.songPercentage !== null && settings.songPercentage !== undefined;
      const hasPerUserPercentages = settings.userEntries.some(entry => entry.songPercentage !== null && entry.songPercentage !== undefined);

      console.log(`${colors.cyan}[EXPANSION] Batch User List node: ${settings.nodeId}${colors.reset}`);
      console.log(`  Node-level percentage: ${hasNodeLevelPercentage ? JSON.stringify(settings.songPercentage) : 'none'}`);
      console.log(`  Per-user percentages: ${hasPerUserPercentages ? 'yes' : 'no'}`);
      console.log(`  User entries: ${settings.userEntries.length}`);
      settings.userEntries.forEach((entry, i) => {
        const percentageInfo = entry.songPercentage !== null && entry.songPercentage !== undefined
          ? (typeof entry.songPercentage === 'object'
            ? JSON.stringify(entry.songPercentage)
            : `${entry.songPercentage}`)
          : 'none';
        console.log(`    User ${i}: ${entry.username} (${entry.platform}) - percentage: ${percentageInfo}`);
      });

      // Use utility function for expansion
      const batchExpanded = expandUserListNode(settings, 'batch-user-list', 'Batch User List');
      expanded.push(...batchExpanded);
    } else if (settings.nodeType === 'live-node' && Array.isArray(settings.userEntries)) {
      // Use utility function for expansion
      const liveExpanded = expandUserListNode(settings, 'live-node', 'Live Node');
      expanded.push(...liveExpanded);
    } else {
      // Regular song list
      expanded.push({
        settings: settings,
        percentage: settings.songPercentage || null,
        listInfo: settings.mode === 'saved-lists'
          ? `Saved list: ${settings.selectedListName || settings.selectedListId}`
          : settings.mode === 'user-lists'
            ? `User list: ${settings.userListImport?.username || 'unknown'}`
            : `Song list`
      });
    }
  }

  return expanded;
}

/**
 * Batch fetch user lists to reduce round trips
 * Groups all user list requests and fetches them efficiently
 * @param {Array<{settings: SongListSettings, listInfo: string, percentage: number|null, index: number}>} userListSources - Array of user list sources to fetch
 * @param {typeof fetch} fetchFn - Fetch function to use
 * @returns {Promise<Map<number, SongLoadResult>>} Map of source index to SongLoadResult
 */
async function batchFetchUserLists(userListSources, fetchFn = fetch) {
  const results = new Map();

  // Group user entries by unique platform/username/selectedLists combination
  const userRequestMap = new Map(); // key: `${platform}:${username}:${JSON.stringify(selectedLists)}`, value: {indices: Set, ...}

  for (const source of userListSources) {
    const settings = source.settings;
    const platform = settings.userListImport?.platform || 'anilist';
    const username = settings.userListImport?.username || '';
    const selectedLists = settings.userListImport?.selectedLists || {};

    const key = `${platform}:${username}:${JSON.stringify(selectedLists)}`;
    if (!userRequestMap.has(key)) {
      userRequestMap.set(key, {
        platform,
        username,
        selectedLists,
        indices: new Set(),
        sources: []
      });
    }
    const requestData = userRequestMap.get(key);
    requestData.indices.add(source.index);
    requestData.sources.push(source);
  }

  console.log(`[BATCH FETCH] Fetching ${userRequestMap.size} unique user list(s) for ${userListSources.length} source(s)`);

  // Fetch all user lists in parallel
  const fetchPromises = Array.from(userRequestMap.entries()).map(async ([key, requestData]) => {
    try {
      // Check if username is missing or empty - this means user hasn't synced lists
      if (!requestData.username || requestData.username.trim() === '') {
        throw new Error('Please sync player lists in the lobby. Open AMQ+ settings and click "Sync Now" to gather player lists for the Live Node.');
      }

      // Try initial fetch
      let data = await fetchUserListWithCache(
        requestData.platform,
        requestData.username,
        requestData.selectedLists,
        fetchFn,
        false
      );
      let songs = Array.isArray(data.songsList) ? data.songsList : [];

      // Process uncached statuses if needed
      const hasUncachedStatuses = data.needsSongsFetch && data.uncachedStatuses && data.uncachedStatuses.length > 0;

      if (hasUncachedStatuses) {
        console.log(`[BATCH FETCH] Some statuses are not cached for ${requestData.username}. Fetching songs from AnisongDB for uncached statuses:`, data.uncachedStatuses);

        const animeList = Array.isArray(data.animeList) ? data.animeList : [];
        const { animeList: completeAnimeList, enrichedSongs } = await enrichUncachedSongs(
          animeList,
          data.uncachedStatuses,
          requestData.platform,
          requestData.username
        );

        // Combine with cached songs
        songs = [...songs, ...enrichedSongs];

        // Store in cache if we have data
        if (completeAnimeList.length > 0) {
          try {
            await storeFetchedDataInCache(
              requestData.platform,
              requestData.username,
              completeAnimeList,
              enrichedSongs,
              data.uncachedStatuses,
              fetchFn
            );
            console.log(`[BATCH FETCH] Successfully cached fetched data for ${requestData.username}`);
          } catch (cacheError) {
            console.error(`[BATCH FETCH] Failed to store cache for ${requestData.username} (non-fatal):`, cacheError);
          }
        } else {
          console.warn(`[BATCH FETCH] No anime data to cache for ${requestData.username} (animeList is empty)`);
        }
      } else if (songs.length === 0) {
        // Retry with force refresh if we got 0 songs
        console.warn(`[BATCH FETCH] Got 0 songs from cache for ${requestData.username}, retrying with force refresh...`);

        data = await fetchUserListWithCache(
          requestData.platform,
          requestData.username,
          requestData.selectedLists,
          fetchFn,
          true
        );
        songs = Array.isArray(data.songsList) ? data.songsList : [];

        // Process uncached statuses on retry
        const hasUncachedStatusesRetry = data.needsSongsFetch && data.uncachedStatuses && data.uncachedStatuses.length > 0;

        if (hasUncachedStatusesRetry) {
          console.log(`[BATCH FETCH] Force refresh: Some statuses are not cached for ${requestData.username}. Fetching songs from AnisongDB for uncached statuses:`, data.uncachedStatuses);

          const animeList = Array.isArray(data.animeList) ? data.animeList : [];
          const { animeList: completeAnimeList, enrichedSongs } = await enrichUncachedSongs(
            animeList,
            data.uncachedStatuses,
            requestData.platform,
            requestData.username
          );

          // Combine with cached songs
          songs = [...songs, ...enrichedSongs];

          // Store in cache if we have data
          if (completeAnimeList.length > 0) {
            try {
              await storeFetchedDataInCache(
                requestData.platform,
                requestData.username,
                completeAnimeList,
                enrichedSongs,
                data.uncachedStatuses,
                fetchFn
              );
              console.log(`[BATCH FETCH] Force refresh: Successfully cached fetched data for ${requestData.username}`);
            } catch (cacheError) {
              console.error(`[BATCH FETCH] Force refresh: Failed to store cache for ${requestData.username} (non-fatal):`, cacheError);
            }
          } else {
            console.warn(`[BATCH FETCH] Force refresh: No anime data to cache for ${requestData.username} (animeList is empty)`);
          }
        }
      }

      // Return result for all sources that requested this user list
      const result = {
        songs,
        supportsPlayerScore: true
      };

      return { key, result, sources: requestData.sources };
    } catch (error) {
      console.error(`[BATCH FETCH] Error loading user list for ${requestData.username}:`, error);
      // Return error result for all sources
      return {
        key,
        result: { songs: [], supportsPlayerScore: true, error: error.message },
        sources: requestData.sources
      };
    }
  });

  const fetchResults = await Promise.all(fetchPromises);

  // Map results back to source indices
  for (const { result, sources } of fetchResults) {
    for (const source of sources) {
      results.set(source.index, result);
    }
  }

  return results;
}

/**
 * Load all source songs from configured song lists
 * Optimized to batch user list requests to reduce round trips
 * @param {SimulatedConfig} simulatedConfig - Simulated configuration
 * @param {typeof fetch} fetchFn - Fetch function
 * @returns {Promise<{songs: Song[], supportsPlayerScore: boolean, loadingErrors: LoadingError[], songsBySource: Array}>} Object with songs array, supportsPlayerScore flag, loadingErrors array, and songsBySource array
 */
export async function loadSourceSongs(simulatedConfig, fetchFn = fetch) {
  const songListSettings = extractSongListSettings(simulatedConfig);
  const expandedSources = expandSongListSettings(songListSettings);

  let anySupportsPlayerScore = false;
  const loadingErrors = [];
  const songsBySource = [];

  // Separate user lists from other sources for batch processing
  const userListSources = [];
  const otherSources = [];

  for (let i = 0; i < expandedSources.length; i++) {
    const source = expandedSources[i];
    const settings = source.settings;

    if (settings.mode === 'user-lists' || settings.nodeType === 'batch-user-list' || settings.nodeType === 'live-node') {
      userListSources.push({
        settings,
        listInfo: source.listInfo,
        percentage: source.percentage,
        index: i
      });
    } else {
      otherSources.push({ source, index: i });
    }
  }

  // Batch fetch all user lists in parallel
  const batchResults = userListSources.length > 0
    ? await batchFetchUserLists(userListSources, fetchFn)
    : new Map();

  // Process user list results
  // Group by nodeId first to handle batch nodes with node-level percentages
  const songsByNodeId = new Map();
  const nodesToGroup = new Set(); // Track which base nodeIds should be grouped

  // First, identify which nodes should have their users grouped together
  // Group when: node-level percentage exists OR no percentages at all
  for (const settings of songListSettings) {
    if (settings.nodeType === 'batch-user-list' || settings.nodeType === 'live-node') {
      const hasNodeLevelPercentage = settings.songPercentage !== null && settings.songPercentage !== undefined;
      const hasPerUserPercentages = settings.userEntries?.some(entry =>
        entry.songPercentage !== null && entry.songPercentage !== undefined
      );

      console.log(`[GROUPING DECISION] Node ${settings.nodeId}: node-level=${hasNodeLevelPercentage}, per-user=${hasPerUserPercentages}`);

      // Group users together if:
      // 1. There's a node-level percentage but no per-user percentages, OR
      // 2. There are no percentages at all (default behavior)
      // Do NOT group if there are per-user percentages (each user needs their own basket)
      if ((hasNodeLevelPercentage && !hasPerUserPercentages) || (!hasNodeLevelPercentage && !hasPerUserPercentages)) {
        nodesToGroup.add(settings.nodeId);
        console.log(`[GROUPING DECISION] → Will group users together for node ${settings.nodeId}`);
      } else {
        console.log(`[GROUPING DECISION] → Will keep users separate for node ${settings.nodeId} (per-user percentages detected)`);
      }
    }
  }

  for (const userListSource of userListSources) {
    const result = batchResults.get(userListSource.index);

    if (result && result.error) {
      loadingErrors.push({
        listIndex: userListSource.index + 1,
        listInfo: userListSource.listInfo,
        error: result.error,
        mode: userListSource.settings.mode,
        details: result.error
      });
      continue;
    }

    if (result) {
      const fullNodeId = userListSource.settings.nodeId || `source-${userListSource.index}`;

      // Extract base nodeId (remove -user-X suffix if present)
      const baseNodeId = fullNodeId.replace(/-user-\d+$/, '');

      // Determine if this node should be grouped
      const shouldGroup = nodesToGroup.has(baseNodeId);

      console.log(`[USER ENTRY] Processing ${userListSource.listInfo} (fullNodeId: ${fullNodeId}, baseNodeId: ${baseNodeId}, shouldGroup: ${shouldGroup}, percentage: ${userListSource.percentage})`);

      // Use base nodeId for grouping, full nodeId for separate tracking
      const groupingNodeId = shouldGroup ? baseNodeId : fullNodeId;

      // Tag songs with their source ID for basket matching
      // Keep original _sourceInfo for logging purposes even when grouped
      // For many-lists mode: ALWAYS use fullNodeId so each user is counted separately
      // For basket matching: use groupingNodeId so batch nodes work together
      const taggedSongs = result.songs.map(song => ({
        ...song,
        _sourceId: fullNodeId, // Always use user-specific ID for many-lists mode to count overlaps
        _basketSourceId: groupingNodeId, // Use base nodeId when grouped for basket matching
        _sourceInfo: userListSource.listInfo // Preserve original user-specific info for display
      }));

      // Group songs by the grouping nodeId
      if (!songsByNodeId.has(groupingNodeId)) {
        songsByNodeId.set(groupingNodeId, {
          songs: [],
          percentage: userListSource.percentage,
          nodeId: groupingNodeId,
          listInfo: userListSource.listInfo.split(' - ')[0] || userListSource.listInfo, // Base name for basket
          supportsPlayerScore: false
        });
      }

      const nodeGroup = songsByNodeId.get(groupingNodeId);
      nodeGroup.songs.push(...taggedSongs);

      // When NOT grouping (per-user percentages), preserve user-specific info
      if (!shouldGroup) {
        // Keep the full listInfo with username for separate entries
        nodeGroup.listInfo = userListSource.listInfo;
        // Ensure the percentage is from this specific user entry
        nodeGroup.percentage = userListSource.percentage;
        console.log(`[USER ENTRY] → Created separate entry for ${userListSource.listInfo} with ${userListSource.percentage}% (${nodeGroup.songs.length} songs total)`);
      } else {
        // Update listInfo to show it's a batch (keep base name)
        const baseName = userListSource.listInfo.split(' - ')[0];
        if (baseName && nodeGroup.listInfo !== baseName) {
          nodeGroup.listInfo = baseName;
        }
        console.log(`[USER ENTRY] → Added to grouped entry "${nodeGroup.listInfo}" (${nodeGroup.songs.length} songs total)`);
      }

      if (result.supportsPlayerScore) {
        nodeGroup.supportsPlayerScore = true;
        anySupportsPlayerScore = true;
      }
    }
  }

  // Convert grouped songs back to songsBySource array
  console.log(`[SONGS BY SOURCE] Converting ${songsByNodeId.size} node group(s) to songsBySource array`);
  for (const [nodeId, nodeGroup] of songsByNodeId) {
    console.log(`[SONGS BY SOURCE] → Adding: nodeId="${nodeGroup.nodeId}", listInfo="${nodeGroup.listInfo}", percentage=${nodeGroup.percentage}, songs=${nodeGroup.songs.length}`);
    songsBySource.push({
      songs: nodeGroup.songs,
      percentage: nodeGroup.percentage,
      nodeId: nodeGroup.nodeId,
      listInfo: nodeGroup.listInfo
    });

    if (nodeGroup.supportsPlayerScore) {
      anySupportsPlayerScore = true;
    }
  }

  // Load non-user-list sources sequentially (masterlist, saved-lists)
  for (const { source, index: i } of otherSources) {
    try {
      const result = await loadSingleSongList(source.settings, fetchFn);

      // Tag songs with their source ID for basket matching
      const taggedSongs = result.songs.map(song => ({
        ...song,
        _sourceId: source.settings.nodeId || `source-${i}`,
        _sourceInfo: source.listInfo
      }));

      songsBySource.push({
        songs: taggedSongs,
        percentage: source.percentage,
        nodeId: source.settings.nodeId || `source-${i}`,
        listInfo: source.listInfo
      });

      if (result.supportsPlayerScore) {
        anySupportsPlayerScore = true;
      }
    } catch (error) {
      const errorDetails = {
        listIndex: i + 1,
        listInfo: source.listInfo,
        error: error.message,
        mode: source.settings.mode,
        nodeId: source.settings.nodeId,
        stack: error.stack
      };

      console.error(`[SONG LOADING] Error loading ${source.listInfo}:`, errorDetails);

      loadingErrors.push({
        listIndex: i + 1,
        listInfo: source.listInfo,
        error: error.message,
        mode: source.settings.mode,
        details: error.stack ? `Error: ${error.message}` : error.message
      });
      // Continue with other lists
    }
  }

  // Check if songSelection (random/watched) is configured
  const songsAndTypesFilter = simulatedConfig.filters?.find(f => f.definitionId === 'songs-and-types');
  const hasSongSelection = songsAndTypesFilter?.settings?.songSelection;
  const hasRandom = hasSongSelection?.random > 0;
  const hasWatched = hasSongSelection?.watched > 0;

  if (hasSongSelection && (hasRandom || hasWatched)) {
    console.log(`[SONG LOADING] Song selection detected: Random=${hasSongSelection.random || 0}, Watched=${hasSongSelection.watched || 0}`);

    // Identify masterlist source nodes (Entire Database) - these should always be treated as 'watched'
    const masterlistNodeIds = new Set();
    for (const { source, index: i } of otherSources) {
      if (source.settings.mode === 'masterlist') {
        const nodeId = source.settings.nodeId || `source-${i}`;
        masterlistNodeIds.add(nodeId);
        console.log(`[SONG LOADING] Found masterlist source node: ${nodeId} - will be treated as 'watched'`);
      }
    }

    // Tag existing songs: masterlist sources as 'watched', others as 'watched' (from user lists/saved lists)
    for (const source of songsBySource) {
      const isMasterlistSource = masterlistNodeIds.has(source.nodeId);
      source.songs = source.songs.map(song => ({
        ...song,
        _sourceType: 'watched' // All sources (including masterlist) are treated as 'watched'
      }));
      if (isMasterlistSource) {
        console.log(`[SONG LOADING] Tagged ${source.songs.length} songs from masterlist source '${source.nodeId}' as 'watched'`);
      }
    }

    // If random is enabled, only load masterlist if there's no masterlist source node already
    // If a masterlist source node exists, it's already tagged as 'watched' above
    if (hasRandom && masterlistNodeIds.size === 0) {
      console.log('[SONG LOADING] Loading masterlist for random song selection...');

      const masterlistSongs = Array.isArray(masterlistData) ? masterlistData : [];

      // Create a set of annSongIds already in user lists for fast lookup
      const existingAnnSongIds = new Set();
      for (const source of songsBySource) {
        for (const song of source.songs) {
          if (song.annSongId) {
            existingAnnSongIds.add(song.annSongId);
          }
        }
      }

      // Filter masterlist to exclude songs already in user lists
      const uniqueMasterlistSongs = masterlistSongs.filter(song =>
        song.annSongId && !existingAnnSongIds.has(song.annSongId)
      );

      console.log(`[SONG LOADING] Masterlist: ${masterlistSongs.length} total songs, ${uniqueMasterlistSongs.length} unique songs (excluded ${existingAnnSongIds.size} duplicates)`);

      // Tag masterlist songs as 'random' and add as a separate source
      const taggedMasterlistSongs = uniqueMasterlistSongs.map(song => ({
        ...song,
        _sourceId: 'random-masterlist',
        _sourceInfo: 'Random',
        _sourceType: 'random'
      }));

      songsBySource.push({
        songs: taggedMasterlistSongs,
        percentage: null, // Will be handled by songSelection baskets
        nodeId: 'random-masterlist',
        listInfo: 'Random'
      });
    } else if (hasRandom && masterlistNodeIds.size > 0) {
      console.log(`[SONG LOADING] Skipping random masterlist loading - ${masterlistNodeIds.size} masterlist source node(s) already exist and will be treated as 'watched'`);
    }
  }

  // Always return songs grouped by source (basket logic will handle distribution)
  let finalSongs = [];
  for (const source of songsBySource) {
    finalSongs.push(...source.songs);
  }

  return {
    songs: finalSongs,
    supportsPlayerScore: anySupportsPlayerScore,
    loadingErrors: loadingErrors,
    songsBySource: songsBySource // Include for basket creation
  };
}

// ========================================
// SECTION 4: FILTER APPLICATION (GLOBAL FILTERING)
// ========================================

/**
 * Apply global filters that eliminate songs entirely (not basket-based)
 * Uses the FILTER_REGISTRY to dispatch to appropriate filter processors
 * @param {Song[]} songs - Input songs
 * @param {FilterConfiguration[]} filters - Filter configurations
 * @param {boolean} supportsPlayerScore - Whether player score is available
 * @returns {FilterResult} Object with filtered songs and filter statistics
 */
function applyGlobalFilters(songs, filters, supportsPlayerScore) {
  let filtered = [...songs];
  const filterStatistics = [];
  const context = { supportsPlayerScore };

  console.log(`[GLOBAL FILTERS] Starting with ${filtered.length} songs`);

  for (const filter of filters) {
    // Normalize targetSourceId to targetSourceIds array
    const { definitionId, settings, targetSourceId, targetSourceIds: rawTargetSourceIds } = filter;

    // Determine effective source IDs (union of all target sources)
    let targetSourceIds = null;
    if (rawTargetSourceIds && Array.isArray(rawTargetSourceIds) && rawTargetSourceIds.length > 0) {
      targetSourceIds = rawTargetSourceIds;
    } else if (targetSourceId) {
      targetSourceIds = [targetSourceId];
    }

    console.log(`[GLOBAL FILTERS] Processing filter: ${definitionId}, targetSourceIds=${targetSourceIds ? targetSourceIds.join('+') : 'all sources'}`);

    // Get filter processor from registry
    const processor = FILTER_REGISTRY[definitionId];
    if (!processor || !processor.applyGlobalFilter) {
      // Filter doesn't have global filtering (might be basket-only)
      continue;
    }

    // If this filter has targetSourceIds, we only apply it to songs from those sources
    let songsToFilter = filtered;
    let songsNotToFilter = [];

    if (targetSourceIds) {
      songsToFilter = filtered.filter(s => targetSourceIds.includes(s._sourceId));
      songsNotToFilter = filtered.filter(s => !targetSourceIds.includes(s._sourceId));
      console.log(`[GLOBAL FILTERS] Filter scoped to sources ${targetSourceIds.join(', ')}: filtering ${songsToFilter.length} songs, keeping ${songsNotToFilter.length} songs untouched`);
    }

    // Apply filter using processor
    // Pass targetSourceIds as the third argument (backward compatibility: some processors might expect single ID, but we'll update them)
    // We pass the array if available, or null. The processor should handle it.
    const result = processor.applyGlobalFilter(songsToFilter, settings, targetSourceIds, context);

    // Update filtered songs
    if (targetSourceIds) {
      filtered = [...result.songs, ...songsNotToFilter];
      console.log(`[GLOBAL FILTERS] Merged back: ${result.songs.length} filtered + ${songsNotToFilter.length} untouched = ${filtered.length} total`);
    } else {
      filtered = result.songs;
    }

    // Record statistics if provided
    if (result.stats) {
      filterStatistics.push(result.stats);
    }
  }

  console.log(`[GLOBAL FILTERS] Final result: ${filtered.length} songs after ${filters.length} filters`);
  return {
    songs: filtered,
    filterStatistics: filterStatistics
  };
}

/**
 * Build only song list baskets (for source nodes)
 * Used when useEntirePool is enabled to respect source percentages while skipping filters
 * @param {SimulatedConfig} simulatedConfig - Simulated configuration
 * @param {() => number} rng - RNG function for picking random values within ranges
 * @param {Array} songsBySource - Songs grouped by source for creating song list baskets
 * @returns {Basket[]} Array of song list basket definitions
 */
function buildSongListBaskets(simulatedConfig, rng, songsBySource) {
  const { numberOfSongs, filters } = simulatedConfig;
  const baskets = [];

  // Check if songSelection is configured (skip song list baskets if so)
  const songsAndTypesFilter = filters?.find(f => f.definitionId === 'songs-and-types');
  const hasSongSelection = songsAndTypesFilter?.settings?.songSelection;
  const hasSongSelectionConfigured = hasSongSelection && (hasSongSelection.random > 0 || hasSongSelection.watched > 0);

  // Check if any sources have per-user or per-source percentages
  const hasSourcePercentages = songsBySource && songsBySource.some(source =>
    source.percentage !== null && source.percentage !== undefined
  );

  // Skip song list baskets ONLY if songSelection is configured AND no source percentages exist
  const shouldSkipSongListBaskets = hasSongSelectionConfigured && !hasSourcePercentages;

  if (shouldSkipSongListBaskets) {
    console.log('[BASKETS] SongSelection is configured with no source percentages, skipping song list percentage baskets');
    return baskets;
  } else if (hasSongSelectionConfigured && hasSourcePercentages) {
    console.log('[BASKETS] SongSelection is configured BUT source percentages exist, creating song list baskets');
  }

  // Create baskets for individual song lists if percentages are defined
  if (songsBySource && Array.isArray(songsBySource)) {
    // First pass: calculate all rounded values
    const sourceBaskets = [];
    for (const source of songsBySource) {
      if (source.percentage !== null && source.percentage !== undefined) {
        // After simulation, all percentages are plain numbers
        const percentageValue = Number(source.percentage);
        const roundedValue = Math.round(numberOfSongs * (percentageValue / 100));
        sourceBaskets.push({
          source: source,
          roundedValue: roundedValue,
          originalPercentage: percentageValue
        });
      }
    }

    // Calculate total and adjust if needed to ensure sum equals numberOfSongs
    if (sourceBaskets.length > 0) {
      let total = sourceBaskets.reduce((sum, b) => sum + b.roundedValue, 0);
      let remainingDifference = total - numberOfSongs;

      console.log(`[BASKETS] Song list baskets before adjustment (target: ${numberOfSongs} songs):`);
      sourceBaskets.forEach(b => {
        const calculation = `${b.originalPercentage}% = ${(numberOfSongs * (b.originalPercentage / 100)).toFixed(2)} songs → rounded to ${b.roundedValue} songs`;
        console.log(`  ${b.source.listInfo}: ${calculation}`);
      });
      console.log(`[BASKETS] Total before adjustment: ${total}, difference: ${remainingDifference}`);

      // Adjust if needed
      if (remainingDifference !== 0) {
        let index = 0;
        let attempts = 0;
        const maxAttempts = sourceBaskets.length * 2; // Prevent infinite loops

        while (remainingDifference !== 0 && attempts < maxAttempts) {
          if (remainingDifference > 0) {
            const beforeValue = sourceBaskets[index].roundedValue;
            sourceBaskets[index].roundedValue += 1;
            remainingDifference -= 1;
            console.log(`[BASKETS] Adjusted ${sourceBaskets[index].source.listInfo}: ${beforeValue} → ${sourceBaskets[index].roundedValue} songs (remaining: ${remainingDifference})`);
          } else {
            // Only subtract if the basket has at least 1 song
            if (sourceBaskets[index].roundedValue > 0) {
              const beforeValue = sourceBaskets[index].roundedValue;
              sourceBaskets[index].roundedValue -= 1;
              remainingDifference += 1;
              console.log(`[BASKETS] Adjusted ${sourceBaskets[index].source.listInfo}: ${beforeValue} → ${sourceBaskets[index].roundedValue} songs (remaining: ${remainingDifference})`);
            }
          }
          index = (index + 1) % sourceBaskets.length;
          attempts++;
        }
      }

      // Create baskets with adjusted values
      for (const basketData of sourceBaskets) {
        const min = basketData.roundedValue;
        const max = basketData.roundedValue;

        if (max > 0) {
          console.log(`[BASKETS] Creating song list basket: ${basketData.source.listInfo} with ${min}-${max} songs (${basketData.originalPercentage}%)`);

          baskets.push(createBasket(
            `songList-${basketData.source.nodeId}`,
            min,
            max,
            (song) => {
              // Use _basketSourceId for basket matching (allows batch grouping)
              // Fall back to _sourceId for backward compatibility
              const sourceId = song._basketSourceId || song._sourceId;
              return sourceId === basketData.source.nodeId;
            }
          ));
        }
      }
    }
  }

  return baskets;
}

// ========================================
// SECTION 5: BASKET BUILDING (REGISTRY-BASED)
// ========================================

/**
 * Build all baskets from configuration filters
 * Uses FILTER_REGISTRY to dispatch to appropriate basket builders
 * @param {SimulatedConfig} simulatedConfig - Simulated configuration
 * @param {() => number} rng - RNG function for picking random values within ranges
 * @param {Array} [songsBySource] - Optional songs grouped by source for creating song list baskets
 * @param {string} [songSelectionMode] - Song selection mode ('default' | 'many-lists' | 'few-lists')
 * @returns {Basket[]} Array of basket definitions
 */
function buildBaskets(simulatedConfig, rng, songsBySource = null, songSelectionMode = 'default') {
  const { filters, numberOfSongs } = simulatedConfig;
  const baskets = [];

  const useManyListsMode = songSelectionMode === 'many-lists' || songSelectionMode === 'few-lists';
  if (useManyListsMode) {
    console.log(`[BASKETS] Building baskets in ${songSelectionMode} mode: using aggregate baskets for flexible distribution`);
  }

  console.log(`[BASKETS] Building baskets from ${filters.length} filters`);

  // Build context for basket builders
  const context = {
    numberOfSongs,
    useManyListsMode,
    simulatedConfig
  };

  // Process each filter and build appropriate baskets using registry
  for (const filter of filters) {
    // Normalize targetSourceId to targetSourceIds array
    const { definitionId, settings, targetSourceId, targetSourceIds: rawTargetSourceIds } = filter;

    // Determine effective source IDs (union of all target sources)
    let targetSourceIds = null;
    if (rawTargetSourceIds && Array.isArray(rawTargetSourceIds) && rawTargetSourceIds.length > 0) {
      targetSourceIds = rawTargetSourceIds;
    } else if (targetSourceId) {
      targetSourceIds = [targetSourceId];
    }

    console.log(`[BASKETS] Processing filter: ${definitionId}, targetSourceIds=${targetSourceIds ? targetSourceIds.join('+') : 'all'}`);

    // Get filter processor from registry
    const processor = FILTER_REGISTRY[definitionId];
    if (!processor || !processor.buildBaskets) {
      // Filter doesn't have basket building (might be global-only)
      continue;
    }

    // Build baskets using processor
    const filterBaskets = processor.buildBaskets(settings, targetSourceIds, context);
    baskets.push(...filterBaskets);
  }

  // Check if songSelection is configured (skip song list baskets if so)
  const songsAndTypesFilter = filters.find(f => f.definitionId === 'songs-and-types');
  const hasSongSelection = songsAndTypesFilter?.settings?.songSelection;
  const hasSongSelectionConfigured = hasSongSelection && (hasSongSelection.random > 0 || hasSongSelection.watched > 0);

  // Check if any sources have per-user or per-source percentages
  const hasSourcePercentages = songsBySource && songsBySource.some(source =>
    source.percentage !== null && source.percentage !== undefined
  );

  // Skip song list baskets ONLY if songSelection is configured AND no source percentages exist
  // If per-user/per-source percentages are set, we must create baskets even with songSelection
  const shouldSkipSongListBaskets = hasSongSelectionConfigured && !hasSourcePercentages;

  if (shouldSkipSongListBaskets) {
    console.log('[BASKETS] SongSelection is configured with no source percentages, skipping song list percentage baskets');
  } else if (hasSongSelectionConfigured && hasSourcePercentages) {
    console.log('[BASKETS] SongSelection is configured BUT source percentages exist, creating song list baskets');
  }

  // Create baskets for individual song lists if percentages are defined
  // Skip if songSelection is configured WITHOUT any source percentages
  if (songsBySource && Array.isArray(songsBySource) && !shouldSkipSongListBaskets) {
    // First pass: calculate all rounded values
    const sourceBaskets = [];
    for (const source of songsBySource) {
      if (source.percentage !== null && source.percentage !== undefined) {
        // After simulation, all percentages are plain numbers
        const percentageValue = Number(source.percentage);
        const roundedValue = Math.round(numberOfSongs * (percentageValue / 100));

        console.log(`[BASKETS] Source "${source.listInfo}" (nodeId: ${source.nodeId}): ${percentageValue}% → ${roundedValue} songs`);

        sourceBaskets.push({
          source: source,
          roundedValue: roundedValue,
          originalPercentage: percentageValue
        });
      }
    }

    // Calculate total and adjust if needed to ensure sum equals numberOfSongs
    if (sourceBaskets.length > 0) {
      let total = sourceBaskets.reduce((sum, basket) => sum + basket.roundedValue, 0);
      const difference = numberOfSongs - total;

      // Log initial state for debugging
      if (sourceBaskets.length > 0) {
        console.log(`[BASKETS] Song list baskets before adjustment (target: ${numberOfSongs} songs):`);
        sourceBaskets.forEach(basket => {
          const calculated = numberOfSongs * (basket.originalPercentage / 100);
          console.log(`  ${basket.source.listInfo}: ${basket.originalPercentage}% = ${calculated.toFixed(2)} songs → rounded to ${basket.roundedValue} songs`);
        });
        console.log(`[BASKETS] Total before adjustment: ${total}, difference: ${difference}`);
      }

      // Adjust baskets to make up the difference
      if (difference !== 0) {
        // Sort by rounded value (descending) to adjust larger baskets first
        sourceBaskets.sort((a, b) => b.roundedValue - a.roundedValue);

        // Add difference to baskets, starting with the largest
        let remainingDifference = difference;
        let index = 0;
        let attempts = 0;
        const maxAttempts = sourceBaskets.length * 2; // Prevent infinite loops

        while (remainingDifference !== 0 && attempts < maxAttempts) {
          if (remainingDifference > 0) {
            const beforeValue = sourceBaskets[index].roundedValue;
            sourceBaskets[index].roundedValue += 1;
            remainingDifference -= 1;
            console.log(`[BASKETS] Adjusted ${sourceBaskets[index].source.listInfo}: ${beforeValue} → ${sourceBaskets[index].roundedValue} songs (remaining: ${remainingDifference})`);
          } else {
            // Only subtract if the basket has at least 1 song
            if (sourceBaskets[index].roundedValue > 0) {
              const beforeValue = sourceBaskets[index].roundedValue;
              sourceBaskets[index].roundedValue -= 1;
              remainingDifference += 1;
              console.log(`[BASKETS] Adjusted ${sourceBaskets[index].source.listInfo}: ${beforeValue} → ${sourceBaskets[index].roundedValue} songs (remaining: ${remainingDifference})`);
            }
          }
          index = (index + 1) % sourceBaskets.length;
          attempts++;
        }
      }

      // Create baskets with adjusted values
      for (const basketData of sourceBaskets) {
        const min = basketData.roundedValue;
        const max = basketData.roundedValue;

        if (max > 0) {
          console.log(`[BASKETS] Creating song list basket: ${basketData.source.listInfo} with ${min}-${max} songs (${basketData.originalPercentage}%)`);

          baskets.push(createBasket(
            `songList-${basketData.source.nodeId}`,
            min,
            max,
            (song) => {
              // Use _basketSourceId for basket matching (allows batch grouping)
              // Fall back to _sourceId for backward compatibility
              const sourceId = song._basketSourceId || song._sourceId;
              return sourceId === basketData.source.nodeId;
            }
          ));
        }
      }
    }
  }

  return baskets;
}

/**
 * Get all applicable baskets for a song
 * @param {Song} song - Song to check
 * @param {Basket[]} baskets - All baskets
 * @returns {Basket[]} Applicable baskets
 */
function getApplicableBaskets(song, baskets) {
  return baskets.filter(basket => basket.matcher(song));
}

/**
 * Check if song can be added to baskets
 * A song can only be added if it matches ALL baskets that define constraints
 * (e.g., if there's a difficulty basket, song MUST match it)
 * @param {Song} song - Song to check
 * @param {Basket[]} applicableBaskets - Baskets that apply to this song
 * @param {Basket[]} allBaskets - All baskets in the system
 * @returns {boolean} True if song matches all constraint baskets AND all applicable baskets have space
 */
function allBasketsHaveSpace(song, applicableBaskets, allBaskets) {
  // If there are no baskets at all, allow any song
  if (allBaskets.length === 0) {
    return true;
  }

  // A song must satisfy ALL baskets that define overlapping constraints
  // For example, if there's a difficulty basket, song type basket, and vintage basket,
  // the song must match ALL of them to be selectable

  // Get all basket types that exist
  const basketTypes = new Set(allBaskets.map(b => getBasketType(b.id)));

  // Get applicable basket types for this song
  const applicableTypes = new Set(applicableBaskets.map(b => getBasketType(b.id)));

  // Song must match at least one constraint type
  if (applicableTypes.size === 0) {
    return false;
  }

  // If there are baskets of a certain type in the system, song must match at least one of them
  for (const type of basketTypes) {
    if (type !== 'other' && !applicableTypes.has(type)) {
      // There's a basket type the song doesn't match
      return false;
    }
  }

  // All applicable baskets must have space
  for (const basket of applicableBaskets) {
    if (basket.current >= basket.max) {
      return false;
    }
  }
  return true;
}

/**
 * Get basket display name for logging
 * @param {Basket} basket - Basket object
 * @returns {string} Formatted basket name
 */
function getBasketDisplayName(basket) {
  if (basket.id.startsWith('songList-')) {
    // Extract source info from basket if available
    return basket.id.replace('songList-', '');
  }
  return basket.id;
}

/**
 * Get basket color for logging
 * @param {Basket} basket - Basket object
 * @returns {string} Color code
 */
function getBasketColor(basket) {
  const type = getBasketType(basket.id);
  switch (type) {
    case 'songList':
      return colors.brightMagenta; // Purple for song list baskets
    case 'songType':
      return colors.brightCyan; // Cyan for song type
    case 'difficulty':
      return colors.brightYellow; // Yellow for difficulty
    case 'vintage':
      return colors.brightGreen; // Green for vintage
    case 'genre':
    case 'tag':
      return colors.brightBlue; // Blue for genres and tags
    default:
      return colors.cyan; // Default cyan
  }
}

// ========================================
// SECTION 6: DISTRIBUTION LOGIC HELPERS
// ========================================

/**
 * Perform aggressive swap mechanism to replace lower-tier songs with higher-tier songs
 * @param {Song[]} selectedSongs - Array of currently selected songs (will be modified)
 * @param {Set<string>} selectedIds - Set of selected song IDs (will be modified)
 * @param {Object} currentTierGroup - Current tier group with songs
 * @param {Array<Object>} orderedGroups - All tier groups ordered by user count
 * @param {Basket[]} baskets - Array of baskets
 * @param {boolean} allowDuplicateShows - Whether duplicate shows are allowed
 * @param {Map<string, number>} animeCount - Map of anime ID to count (will be modified)
 * @param {Set<string>} selectedAnime - Set of selected anime IDs (will be modified)
 * @param {() => number} rng - Random number generator function
 * @param {number} maxSwaps - Maximum number of swaps to attempt
 * @returns {{swapsMade: number, failures: Object}} Swap results with counts and failures
 */
function performAggressiveSwap(
  selectedSongs,
  selectedIds,
  currentTierGroup,
  orderedGroups,
  baskets,
  allowDuplicateShows,
  animeCount,
  selectedAnime,
  rng,
  maxSwaps
) {
  let swapsMade = 0;

  // Track swap failure reasons
  const swapFailures = {
    alreadySelected: 0,
    differentBaskets: 0,
    duplicateAnime: 0,
    rerollFailed: 0,
    noBasketSpace: 0
  };

  // Find songs in selectedSongs that are from lower tiers
  const lowerTierSongs = selectedSongs
    .map((song, index) => ({ song, index, tier: null }))
    .filter(item => {
      // Check which tier this song belongs to
      for (const otherGroup of orderedGroups) {
        if (otherGroup.songs.some(s => s.annSongId === item.song.annSongId)) {
          item.tier = otherGroup.count;
          return otherGroup.count < currentTierGroup.count; // Lower tier = fewer users
        }
      }
      return false;
    })
    .sort((a, b) => a.tier - b.tier); // Sort by tier (lowest first)

  if (lowerTierSongs.length === 0) {
    return { swapsMade, failures: swapFailures };
  }

  console.log(`${colors.cyan}[SWAP] Found ${lowerTierSongs.length} lower-tier songs (${lowerTierSongs[0].tier} to ${lowerTierSongs[lowerTierSongs.length - 1].tier} users) that could be replaced${colors.reset}`);

  // Try to swap each lower-tier song with a current-tier song
  for (const lowerTierItem of lowerTierSongs) {
    if (swapsMade >= maxSwaps) break;

    const lowerTierSong = lowerTierItem.song;
    const animeIdToRemove = String(lowerTierSong.malId || lowerTierSong.linked_ids?.myanimelist || lowerTierSong.animeENName);
    const applicableBasketsToRemove = getApplicableBaskets(lowerTierSong, baskets);
    const songListBasketsToRemove = applicableBasketsToRemove.filter(b => b.id.startsWith('songList-'));

    // Try to find a current-tier song that matches the same baskets
    for (const higherTierSong of currentTierGroup.songs) {
      if (selectedIds.has(higherTierSong.annSongId)) {
        swapFailures.alreadySelected++;
        continue;
      }

      const animeIdToAdd = String(higherTierSong.malId || higherTierSong.linked_ids?.myanimelist || higherTierSong.animeENName);
      const applicableBasketsToAdd = getApplicableBaskets(higherTierSong, baskets);
      const songListBasketsToAdd = applicableBasketsToAdd.filter(b => b.id.startsWith('songList-'));

      // Check if this song fills the same song-list baskets (most important for user-specific lists)
      const sameSongListBaskets = songListBasketsToRemove.length === songListBasketsToAdd.length &&
        songListBasketsToRemove.every(b => songListBasketsToAdd.some(ab => ab.id === b.id));

      if (!sameSongListBaskets) {
        swapFailures.differentBaskets++;
        continue;
      }

      // Check duplicate show logic for the new song
      let canAdd = true;
      if (!allowDuplicateShows) {
        if (selectedAnime.has(animeIdToAdd) && animeIdToAdd !== animeIdToRemove) {
          swapFailures.duplicateAnime++;
          canAdd = false;
        }
      } else {
        const currentCount = animeCount.get(animeIdToAdd) || 0;
        if (currentCount > 0 && animeIdToAdd !== animeIdToRemove) {
          const rerollChance = currentCount / (currentCount + 1);
          if (rng() < rerollChance) {
            swapFailures.rerollFailed++;
            canAdd = false;
          }
        }
      }

      if (!canAdd) continue;

      // Check basket space
      if (!allBasketsHaveSpace(higherTierSong, applicableBasketsToAdd, baskets)) {
        swapFailures.noBasketSpace++;
        continue;
      }

      // Perform the swap
      selectedSongs[lowerTierItem.index] = higherTierSong;
      selectedIds.delete(lowerTierSong.annSongId);
      selectedIds.add(higherTierSong.annSongId);

      // Update anime tracking
      if (!allowDuplicateShows) {
        if (animeIdToAdd !== animeIdToRemove) {
          selectedAnime.delete(animeIdToRemove);
          selectedAnime.add(animeIdToAdd);
        }
      } else {
        if (animeIdToAdd !== animeIdToRemove) {
          const removeCount = animeCount.get(animeIdToRemove) || 0;
          if (removeCount <= 1) {
            animeCount.delete(animeIdToRemove);
          } else {
            animeCount.set(animeIdToRemove, removeCount - 1);
          }
          animeCount.set(animeIdToAdd, (animeCount.get(animeIdToAdd) || 0) + 1);
        }
      }

      swapsMade++;
      const lowerSongName = lowerTierSong.songName?.substring(0, 25) || 'Unknown';
      const higherSongName = higherTierSong.songName?.substring(0, 25) || 'Unknown';
      const basketName = songListBasketsToRemove.length > 0 ? getBasketDisplayName(songListBasketsToRemove[0]) : 'unknown';
      console.log(`${colors.brightGreen}[SWAP]${colors.reset} ${lowerSongName} (${lowerTierItem.tier}-user) → ${higherSongName} (${currentTierGroup.count}-user) [${basketName}]`);

      break; // Found a swap for this lower-tier song
    }
  }

  return { swapsMade, failures: swapFailures };
}

/**
 * Score an attempt's quality for comparison
 * @param {Basket[]} baskets - Baskets with current state
 * @param {Song[]} selectedSongs - Array of selected songs
 * @param {Song[]} eligibleSongs - All eligible songs (to count user overlap across pool)
 * @returns {Object} Score object with comparison metrics
 */
function scoreAttempt(baskets, selectedSongs, eligibleSongs) {
  const basketsMeetingMin = baskets.filter(b => b.current >= b.min).length;
  const totalBaskets = baskets.length;
  const songsSelected = selectedSongs.length;

  // Calculate how close failed baskets are to minimum
  let proximityScore = 0;
  baskets.forEach(basket => {
    if (basket.current < basket.min) {
      // Penalize based on how far from minimum (0 to 1, where 1 is closest)
      proximityScore += basket.min > 0 ? basket.current / basket.min : 0;
    } else {
      proximityScore += 1;
    }
  });

  // Calculate user overlap score: sum of unique users per song
  // Build map from ALL eligible songs to get true user counts
  const songUserCounts = new Map(); // Map<annSongId, Set<_sourceId>>

  for (const song of eligibleSongs) {
    if (song.annSongId) {
      if (!songUserCounts.has(song.annSongId)) {
        songUserCounts.set(song.annSongId, new Set());
      }
      if (song._sourceId) {
        songUserCounts.get(song.annSongId).add(song._sourceId);
      }
    }
  }

  // Sum up unique user counts for all selected songs
  let userOverlapScore = 0;
  for (const song of selectedSongs) {
    if (song.annSongId && songUserCounts.has(song.annSongId)) {
      const uniqueUserCount = songUserCounts.get(song.annSongId).size;
      userOverlapScore += uniqueUserCount > 0 ? uniqueUserCount : 1;
    } else {
      // Songs without annSongId or _sourceId count as 1 user
      userOverlapScore += 1;
    }
  }

  return {
    basketsMeetingMin,
    totalBaskets,
    songsSelected,
    proximityScore,
    userOverlapScore,
    isComplete: basketsMeetingMin === totalBaskets
  };
}

/**
 * Compare two attempt scores
 * @param {Object} scoreA - First score
 * @param {Object} scoreB - Second score
 * @returns {number} Positive if A is better, negative if B is better, 0 if equal
 */
function compareScores(scoreA, scoreB) {
  // Primary: higher user overlap score (more songs on more user lists)
  if (scoreA.userOverlapScore !== scoreB.userOverlapScore) {
    return scoreA.userOverlapScore - scoreB.userOverlapScore;
  }

  // Secondary: more baskets meeting minimum
  if (scoreA.basketsMeetingMin !== scoreB.basketsMeetingMin) {
    return scoreA.basketsMeetingMin - scoreB.basketsMeetingMin;
  }

  // Tertiary: more songs selected
  if (scoreA.songsSelected !== scoreB.songsSelected) {
    return scoreA.songsSelected - scoreB.songsSelected;
  }

  // Quaternary: closer to minimum for failed baskets
  return scoreA.proximityScore - scoreB.proximityScore;
}

/**
 * Distribute songs to baskets using two-phase approach with multi-attempt retry
 * Phase 1: Prioritize filling all baskets to their minimum
 * Phase 2: Fill remaining space randomly up to max
 * Multi-attempt with backtracking for better basket satisfaction
 * 
 * @param {Song[]} eligibleSongs - All eligible songs (already filtered)
 * @param {Basket[]} baskets - All basket definitions with min/max
 * @param {number} maxTotal - Maximum total songs
 * @param {() => number} rng - RNG function
 * @param {boolean} allowDuplicateShows - Whether to allow duplicate shows (default: true)
 * @param {string} songSelectionMode - Song selection mode: 'default' | 'many-lists' | 'few-lists' (default: 'default')
 * @param {number} maxAttempts - Maximum number of attempts (default: 10)
 * @param {Song[]} sourceSongs - All source songs (before filtering) for accurate user counting
 * @returns {Song[]} Selected songs
 */
function distributeToBaskets(eligibleSongs, baskets, maxTotal, rng, allowDuplicateShows = true, songSelectionMode = 'default', maxAttempts = 100, sourceSongs = null) {
  // Check if we have song list baskets (for colorful logging)
  const hasSongListBaskets = baskets.some(b => b.id.startsWith('songList-'));
  if (hasSongListBaskets) {
    const songListBaskets = baskets.filter(b => b.id.startsWith('songList-'));
    console.log(`\n${colors.brightMagenta}[SONG SELECTION] Tracking ${songListBaskets.length} song list basket(s):${colors.reset}`);
    songListBaskets.forEach(b => {
      const basketName = getBasketDisplayName(b);
      const basketColor = getBasketColor(b);
      console.log(`  ${basketColor}${basketName}${colors.reset} [${b.min}-${b.max}]`);
    });
  }

  console.log(`\n${colors.brightCyan}[DISTRIBUTION] Starting distribution with up to ${maxAttempts} attempts...${colors.reset}`);

  let bestResult = null;
  let bestScore = null;

  // Try multiple attempts with different shuffle orderings
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`\n${colors.blue}[DISTRIBUTION] Attempt ${attempt + 1}/${maxAttempts}${colors.reset}`);

    // Create a derived RNG for this attempt to maintain determinism
    const attemptRng = makeRng(`attempt-${attempt}-${rng()}`);

    // Reset baskets for this attempt
    baskets.forEach(b => b.current = 0);

    // Try single distribution attempt
    const result = distributeSingleAttempt(
      eligibleSongs,
      baskets,
      maxTotal,
      attemptRng,
      allowDuplicateShows,
      songSelectionMode,
      attempt + 1,
      sourceSongs
    );

    // Score this attempt
    const score = scoreAttempt(baskets, result, sourceSongs || eligibleSongs);

    console.log(`${colors.dim}[DISTRIBUTION] Attempt ${attempt + 1} score: ${score.basketsMeetingMin}/${score.totalBaskets} baskets, ${score.songsSelected} songs, user overlap: ${score.userOverlapScore}, proximity: ${score.proximityScore.toFixed(2)}${colors.reset}`);

    // Track best result
    if (bestScore === null || compareScores(score, bestScore) > 0) {
      // Deep copy baskets state
      const basketsCopy = baskets.map(b => ({ ...b }));
      bestResult = { songs: result, baskets: basketsCopy, score };
      bestScore = score;
      console.log(`${colors.brightGreen}[DISTRIBUTION] New best result found!${colors.reset}`);
    }

    // If this attempt satisfied all baskets, we're done
    if (score.isComplete) {
      console.log(`${colors.bgGreen}${colors.black}[DISTRIBUTION] SUCCESS! All baskets met minimum on attempt ${attempt + 1}.${colors.reset}`);
      break;
    }
  }

  // Restore best result's basket state
  if (bestResult) {
    baskets.forEach((basket, i) => {
      basket.current = bestResult.baskets[i].current;
    });
  }

  console.log(`\n${colors.brightMagenta}[DISTRIBUTION] Using best result: ${bestScore.basketsMeetingMin}/${bestScore.totalBaskets} baskets satisfied${colors.reset}`);

  // Log final basket status
  logBasketStatus(baskets);

  return bestResult ? bestResult.songs : [];
}

/**
 * Prioritize songs by user overlap count
 * @param {Song[]} eligibleSongs - Eligible songs to prioritize
 * @param {Song[]} sourceSongs - Source songs for accurate user counting
 * @param {string} songSelectionMode - 'many-lists' | 'few-lists' | 'default'
 * @param {() => number} rng - RNG function
 * @returns {{orderedGroups: Array|null, shuffled: Song[]|null}} Prioritized song groups or shuffled array
 */
function prioritizeSongsByUserOverlap(eligibleSongs, sourceSongs, songSelectionMode, rng) {
  if (songSelectionMode === 'default') {
    // Default mode: just shuffle normally
    return { orderedGroups: null, shuffled: shuffleArray([...eligibleSongs], rng) };
  }

  // Count unique user sources for each song by annSongId
  const songsToCountFrom = sourceSongs || eligibleSongs;
  if (sourceSongs) {
    console.log(`${colors.brightCyan}[USER COUNTING] Using ${sourceSongs.length} source songs (before filtering) for accurate user overlap counts${colors.reset}`);
  }

  const songUserSources = new Map(); // Map<annSongId, Set<_sourceId>>
  for (const song of songsToCountFrom) {
    if (song.annSongId) {
      if (!songUserSources.has(song.annSongId)) {
        songUserSources.set(song.annSongId, new Set());
      }
      if (song._sourceId) {
        songUserSources.get(song.annSongId).add(song._sourceId);
      }
    }
  }

  // Group songs by their unique user count
  const songsByCount = new Map();
  for (const song of eligibleSongs) {
    const count = song.annSongId && songUserSources.has(song.annSongId)
      ? songUserSources.get(song.annSongId).size
      : 1;
    if (!songsByCount.has(count)) {
      songsByCount.set(count, []);
    }
    songsByCount.get(count).push(song);
  }

  // Sort counts based on mode
  const sortedCounts = Array.from(songsByCount.keys()).sort((a, b) => {
    if (songSelectionMode === 'many-lists') {
      return b - a; // Descending: higher counts first
    } else { // 'few-lists'
      return a - b; // Ascending: lower counts first
    }
  });

  // Keep groups separate for tier-based iteration
  const orderedGroups = sortedCounts.map(count => ({
    count,
    songs: shuffleArray([...songsByCount.get(count)], rng),
    totalSongs: songsByCount.get(count).length
  }));

  // Log distribution
  const groupDistribution = sortedCounts.map(count =>
    `${count} user${count !== 1 ? 's' : ''}: ${songsByCount.get(count).length} songs`
  ).join(', ');
  console.log(`${colors.cyan}[DISTRIBUTION] Prioritized songs by ${songSelectionMode} mode: ${sortedCounts.length} groups (${groupDistribution})${colors.reset}`);

  return { orderedGroups, shuffled: null };
}

/**
 * Create song addition context with tracking state
 * @param {number} maxTotal - Maximum total songs
 * @param {Basket[]} baskets - Baskets array
 * @returns {Object} Context object with state and helper methods
 */
function createSongAdditionContext(maxTotal, baskets) {
  const selectedSongs = [];
  const selectedIds = new Set();
  const animeCount = new Map();
  const selectedAnime = new Set();

  const rejectionStats = {
    maxReached: 0,
    alreadySelected: 0,
    duplicateAnime: 0,
    rerollFailed: 0,
    noMinBaskets: 0,
    noBasketSpace: 0
  };

  const perBasketNoSpace = new Map();
  baskets.forEach(b => perBasketNoSpace.set(b.id, 0));

  return {
    selectedSongs,
    selectedIds,
    animeCount,
    selectedAnime,
    rejectionStats,
    perBasketNoSpace,
    maxTotal
  };
}

/**
 * Create song adder function with closure over context
 * @param {Object} context - Song addition context
 * @param {Basket[]} baskets - Baskets array
 * @param {boolean} allowDuplicateShows - Whether to allow duplicate shows
 * @param {() => number} rng - RNG function
 * @returns {Function} tryAddSong function
 */
function createSongAdder(context, baskets, allowDuplicateShows, rng) {
  const { selectedSongs, selectedIds, animeCount, selectedAnime, rejectionStats, perBasketNoSpace, maxTotal } = context;

  return (song, phase, tierUserCount = null, trackRejections = false) => {
    if (selectedSongs.length >= maxTotal) {
      if (trackRejections) rejectionStats.maxReached++;
      return false;
    }
    if (selectedIds.has(song.annSongId)) {
      if (trackRejections) rejectionStats.alreadySelected++;
      return false;
    }

    // Get anime ID for duplicate show tracking
    const animeId = song.malId || song.linked_ids?.myanimelist || song.animeENName;

    // Apply duplicate show logic
    if (!allowDuplicateShows) {
      if (selectedAnime.has(animeId)) {
        if (trackRejections) rejectionStats.duplicateAnime++;
        return false;
      }
    } else {
      const currentCount = animeCount.get(animeId) || 0;
      if (currentCount > 0) {
        const rerollChance = currentCount / (currentCount + 1);
        if (rng() < rerollChance) {
          if (trackRejections) rejectionStats.rerollFailed++;
          return false;
        }
      }
    }

    // Find applicable baskets
    const applicableBaskets = getApplicableBaskets(song, baskets);

    if (phase === 1) {
      const basketsNeedingMinimum = applicableBaskets.filter(b => b.current < b.min);
      if (basketsNeedingMinimum.length === 0) {
        if (trackRejections) rejectionStats.noMinBaskets++;
        return false;
      }
    }

    // Check basket space
    if (!allBasketsHaveSpace(song, applicableBaskets, baskets)) {
      if (trackRejections) {
        rejectionStats.noBasketSpace++;
        applicableBaskets.forEach(b => {
          if (b.current >= b.max) {
            perBasketNoSpace.set(b.id, (perBasketNoSpace.get(b.id) || 0) + 1);
          }
        });
      }
      return false;
    }

    // Add the song
    selectedSongs.push(song);
    selectedIds.add(song.annSongId);

    // Log song list baskets
    const songListBaskets = applicableBaskets.filter(b => b.id.startsWith('songList-'));
    if (songListBaskets.length > 0) {
      const basketNames = songListBaskets.map(b => {
        const basketColor = getBasketColor(b);
        const basketName = getBasketDisplayName(b);
        return `${basketColor}${basketName}${colors.reset}`;
      }).join(', ');
      const songName = song.songName?.substring(0, 30) || 'Unknown';
      const animeName = song.animeENName?.substring(0, 20) || 'Unknown';
      console.log(`  ${colors.dim}→${colors.reset} ${colors.bright}${songName}${colors.reset} ${colors.cyan}(${animeName})${colors.reset} → ${basketNames}`);
    }

    applicableBaskets.forEach(b => b.current++);

    // Track anime
    if (!allowDuplicateShows) {
      selectedAnime.add(animeId);
    } else {
      animeCount.set(animeId, (animeCount.get(animeId) || 0) + 1);
    }

    return true;
  };
}

/**
 * Process a single tier in Phase 1 (fill to minimum)
 * @param {Object} tierGroup - Tier group with songs
 * @param {Function} tryAddSong - Song addition function
 * @param {Basket[]} baskets - Baskets array
 * @param {Object} context - Song addition context
 * @param {number} maxTotal - Maximum total songs
 * @param {number} maxUserCount - Maximum user count across all tiers
 * @param {Array} orderedGroups - All ordered tier groups
 * @param {boolean} allowDuplicateShows - Whether to allow duplicate shows
 * @param {() => number} rng - RNG function
 * @returns {number} Number of songs added from this tier
 */
function processTierPhase1(tierGroup, tryAddSong, baskets, context, maxTotal, maxUserCount, orderedGroups, allowDuplicateShows, rng) {
  const { selectedSongs, selectedIds, animeCount, selectedAnime, rejectionStats } = context;

  console.log(`${colors.magenta}[TIER] Processing ${tierGroup.count}-user tier (${tierGroup.songs.length} songs available)${colors.reset}`);

  // Analyze song distribution
  const songListBaskets = baskets.filter(b => b.id.startsWith('songList-'));
  const basketDistribution = new Map();
  songListBaskets.forEach(b => {
    basketDistribution.set(b.id, { count: 0, basketName: getBasketDisplayName(b) });
  });

  for (const song of tierGroup.songs) {
    const applicableBaskets = getApplicableBaskets(song, baskets);
    const songListBasketsForSong = applicableBaskets.filter(b => b.id.startsWith('songList-'));
    songListBasketsForSong.forEach(b => {
      if (basketDistribution.has(b.id)) {
        basketDistribution.get(b.id).count++;
      }
    });
  }

  // Log distribution
  const distributionStr = Array.from(basketDistribution.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, data]) => `${data.basketName}=${data.count}`)
    .join(', ');
  console.log(`${colors.cyan}[TIER DISTRIBUTION] Songs per basket: ${distributionStr}${colors.reset}`);

  // Reset rejection stats
  Object.keys(rejectionStats).forEach(key => rejectionStats[key] = 0);
  const perBasketRejections = new Map();
  songListBaskets.forEach(b => {
    perBasketRejections.set(b.id, { noMinBasket: 0, basketName: getBasketDisplayName(b) });
  });

  let tierProgress = true;
  let tierIterations = 0;
  let tierSongsAdded = 0;
  const maxTierIterations = Math.max(10, Math.ceil(tierGroup.songs.length / 10));

  // Iterate through tier until no progress
  while (tierProgress && selectedSongs.length < maxTotal && tierIterations < maxTierIterations) {
    tierProgress = false;
    tierIterations++;

    for (const song of tierGroup.songs) {
      const added = tryAddSong(song, 1, tierGroup.count, true);

      if (!added) {
        const applicableBaskets = getApplicableBaskets(song, baskets);
        const basketsNeedingMinimum = applicableBaskets.filter(b => b.current < b.min);
        if (basketsNeedingMinimum.length === 0 && applicableBaskets.length > 0) {
          const songListBasketsForSong = applicableBaskets.filter(b => b.id.startsWith('songList-'));
          songListBasketsForSong.forEach(b => {
            if (perBasketRejections.has(b.id)) {
              perBasketRejections.get(b.id).noMinBasket++;
            }
          });
        }
      } else {
        tierProgress = true;
        tierSongsAdded++;
      }

      if (selectedSongs.length >= maxTotal) break;
    }

    // Check if all baskets met minimum
    const basketsNeedingMin = baskets.filter(b => b.current < b.min);
    if (basketsNeedingMin.length === 0) {
      console.log(`${colors.brightGreen}[TIER] All baskets met minimum! Stopping Phase 1.${colors.reset}`);
      break;
    }
  }

  // Log tier statistics
  const tierUtilization = ((tierSongsAdded / tierGroup.songs.length) * 100).toFixed(1);
  console.log(`${colors.dim}[TIER] ${tierGroup.count}-user tier: ${tierSongsAdded}/${tierGroup.songs.length} songs added (${tierUtilization}%) after ${tierIterations} iteration(s)${colors.reset}`);

  console.log(`${colors.yellow}[TIER STATS] Rejections:${colors.reset} ` +
    `AlreadySelected=${rejectionStats.alreadySelected}, ` +
    `DuplicateAnime=${rejectionStats.duplicateAnime}, ` +
    `RerollFailed=${rejectionStats.rerollFailed}, ` +
    `NoMinBaskets=${rejectionStats.noMinBaskets}, ` +
    `NoBasketSpace=${rejectionStats.noBasketSpace}, ` +
    `MaxReached=${rejectionStats.maxReached}`
  );

  // Log per-basket rejections
  const perBasketStr = Array.from(perBasketRejections.entries())
    .filter(([id, data]) => data.noMinBasket > 0)
    .sort((a, b) => b[1].noMinBasket - a[1].noMinBasket)
    .map(([id, data]) => `${data.basketName}=${data.noMinBasket}`)
    .join(', ');
  if (perBasketStr) {
    console.log(`${colors.yellow}[TIER STATS] Rejected (basket full): ${perBasketStr}${colors.reset}`);
  }

  // Aggressive swap at max tier
  if (selectedSongs.length > 0 && tierGroup.count === maxUserCount) {
    console.log(`${colors.brightCyan}[SWAP] Attempting to replace lower-tier songs with ${tierGroup.count}/${maxUserCount}-user songs (MAX TIER)...${colors.reset}`);

    const maxSwaps = Math.min(20, Math.ceil(tierGroup.songs.length / 10));
    const { swapsMade, failures } = performAggressiveSwap(
      selectedSongs,
      selectedIds,
      tierGroup,
      orderedGroups,
      baskets,
      allowDuplicateShows,
      animeCount,
      selectedAnime,
      rng,
      maxSwaps
    );

    if (swapsMade > 0) {
      console.log(`${colors.brightGreen}[SWAP] Successfully swapped ${swapsMade} songs to ${tierGroup.count}-user alternatives${colors.reset}`);
    } else {
      console.log(`${colors.yellow}[SWAP] No valid swaps found. Failures: DifferentBaskets=${failures.differentBaskets}, DuplicateAnime=${failures.duplicateAnime}, RerollFailed=${failures.rerollFailed}, NoBasketSpace=${failures.noBasketSpace}, AlreadySelected=${failures.alreadySelected}${colors.reset}`);
    }
  }

  // Log baskets still needing minimum
  const basketsNeedingMin = baskets.filter(b => b.current < b.min);
  if (basketsNeedingMin.length > 0) {
    const basketInfo = basketsNeedingMin.map(b => `${b.id}(${b.current}/${b.min})`).join(', ');
    console.log(`${colors.yellow}[TIER] Baskets still needing minimum: ${basketInfo}${colors.reset}`);
  }

  return tierSongsAdded;
}

/**
 * Process a single tier in Phase 2 (fill to maximum)
 * @param {Object} tierGroup - Tier group with songs
 * @param {Function} tryAddSong - Song addition function
 * @param {Basket[]} baskets - Baskets array
 * @param {Object} context - Song addition context
 * @param {number} maxTotal - Maximum total songs
 * @param {number} maxUserCount - Maximum user count across all tiers
 * @param {() => number} rng - RNG function
 * @returns {number} Number of songs added from this tier
 */
function processTierPhase2(tierGroup, tryAddSong, baskets, context, maxTotal, maxUserCount, rng) {
  const { selectedSongs, selectedIds, rejectionStats, perBasketNoSpace, selectedAnime } = context;

  if (selectedSongs.length >= maxTotal) return 0;

  // Analyze max tier
  if (tierGroup.count === maxUserCount) {
    console.log(`${colors.brightCyan}[MAX TIER ANALYSIS] Analyzing ${tierGroup.songs.length} songs from ${maxUserCount}-user tier${colors.reset}`);
    const basketCounts = new Map();
    let songsWithNoApplicableBaskets = 0;
    let songsWithFullBaskets = 0;

    for (const song of tierGroup.songs) {
      const applicableBaskets = getApplicableBaskets(song, baskets);
      if (applicableBaskets.length === 0) {
        songsWithNoApplicableBaskets++;
      } else {
        const hasSpace = allBasketsHaveSpace(song, applicableBaskets, baskets);
        if (!hasSpace) {
          songsWithFullBaskets++;
        }
        applicableBaskets.forEach(b => {
          basketCounts.set(b.id, (basketCounts.get(b.id) || 0) + 1);
        });
      }
    }

    console.log(`${colors.cyan}  Songs with no applicable baskets: ${songsWithNoApplicableBaskets}${colors.reset}`);
    console.log(`${colors.cyan}  Songs with full baskets: ${songsWithFullBaskets}${colors.reset}`);
    console.log(`${colors.cyan}  Basket match distribution:${colors.reset}`);
    Array.from(basketCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([basketId, count]) => {
        const basket = baskets.find(b => b.id === basketId);
        const space = basket ? basket.max - basket.current : 0;
        console.log(`    ${basketId}: ${count} songs match (${space} slots available)`);
      });
  }

  // Reset rejection stats
  Object.keys(rejectionStats).forEach(key => rejectionStats[key] = 0);

  const shuffledSongs = shuffleArray([...tierGroup.songs], rng);
  let tierSongsAdded = 0;
  let tierIterations = 0;
  const maxTierIterations = tierGroup.count === maxUserCount ? 10 : 1;
  let tierProgress = true;

  while (tierProgress && selectedSongs.length < maxTotal && tierIterations < maxTierIterations) {
    tierProgress = false;
    tierIterations++;

    let iterationAdded = 0;
    const iterationRejections = {
      alreadySelected: 0,
      duplicateAnime: 0,
      rerollFailed: 0,
      noBasketSpace: 0,
      maxReached: 0
    };

    for (const song of shuffledSongs) {
      if (tryAddSong(song, 2, tierGroup.count, tierIterations === 1)) {
        tierSongsAdded++;
        iterationAdded++;
        tierProgress = true;
      } else {
        // Track rejection reasons
        if (selectedSongs.length >= maxTotal) {
          iterationRejections.maxReached++;
        } else if (selectedIds.has(song.annSongId)) {
          iterationRejections.alreadySelected++;
        } else {
          const animeId = song.malId || song.linked_ids?.myanimelist || song.animeENName;
          if (!context.allowDuplicateShows && selectedAnime.has(animeId)) {
            iterationRejections.duplicateAnime++;
          } else {
            const applicableBaskets = getApplicableBaskets(song, baskets);
            if (!allBasketsHaveSpace(song, applicableBaskets, baskets)) {
              iterationRejections.noBasketSpace++;
            } else {
              iterationRejections.rerollFailed++;
            }
          }
        }
      }
      if (selectedSongs.length >= maxTotal) break;
    }

    // Log iteration details for max tier
    if (tierGroup.count === maxUserCount) {
      console.log(`${colors.dim}  [TIER ITER ${tierIterations}] Added ${iterationAdded} songs. Rejections: AlreadySelected=${iterationRejections.alreadySelected}, DuplicateAnime=${iterationRejections.duplicateAnime}, RerollFailed=${iterationRejections.rerollFailed}, NoBasketSpace=${iterationRejections.noBasketSpace}, MaxReached=${iterationRejections.maxReached}${colors.reset}`);
    }

    if (tierGroup.count < maxUserCount) break;
  }

  // Log tier summary
  if (tierSongsAdded > 0 || (rejectionStats.alreadySelected + rejectionStats.duplicateAnime + rejectionStats.rerollFailed + rejectionStats.noBasketSpace) > 0) {
    const tierLabel = tierGroup.count === maxUserCount ? `${tierGroup.count}-user tier (MAX, ${tierIterations} iterations)` : `${tierGroup.count}-user tier`;
    console.log(`${colors.dim}[TIER] Phase 2: ${tierLabel} added ${tierSongsAdded} songs${colors.reset}`);

    const totalRejections = rejectionStats.duplicateAnime + rejectionStats.rerollFailed + rejectionStats.noBasketSpace;
    if (totalRejections > 0) {
      console.log(`${colors.yellow}[TIER STATS P2] Rejections:${colors.reset} ` +
        `AlreadySelected=${rejectionStats.alreadySelected}, ` +
        `DuplicateAnime=${rejectionStats.duplicateAnime}, ` +
        `RerollFailed=${rejectionStats.rerollFailed}, ` +
        `NoBasketSpace=${rejectionStats.noBasketSpace}`
      );

      const basketsWithRejections = Array.from(perBasketNoSpace.entries())
        .filter(([id, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);
      if (basketsWithRejections.length > 0) {
        const basketStr = basketsWithRejections
          .map(([id, count]) => {
            const basket = baskets.find(b => b.id === id);
            const name = basket ? getBasketDisplayName(basket) : id;
            return `${name}=${count}`;
          })
          .join(', ');
        console.log(`${colors.yellow}[TIER STATS P2] NoBasketSpace by basket:${colors.reset} ${basketStr}`);
      }
    }
  }

  return tierSongsAdded;
}

/**
 * Log final tier distribution
 * @param {Array} orderedGroups - Ordered tier groups
 * @param {Song[]} selectedSongs - Selected songs
 * @param {string} songSelectionMode - Song selection mode
 * @returns {void}
 */
function logFinalTierDistribution(orderedGroups, selectedSongs, songSelectionMode) {
  if (!orderedGroups || selectedSongs.length === 0) return;

  console.log(`${colors.brightMagenta}[FINAL TIER DISTRIBUTION] Selected songs by user overlap:${colors.reset}`);
  const tierDistribution = new Map();

  // Count selected songs by tier
  for (const selectedSong of selectedSongs) {
    let foundTier = null;
    for (const group of orderedGroups) {
      if (group.songs.some(s => s.annSongId === selectedSong.annSongId)) {
        foundTier = group.count;
        break;
      }
    }
    if (foundTier !== null) {
      tierDistribution.set(foundTier, (tierDistribution.get(foundTier) || 0) + 1);
    }
  }

  // Sort by tier
  const sortedTiers = Array.from(tierDistribution.entries()).sort((a, b) => {
    if (songSelectionMode === 'many-lists') {
      return b[0] - a[0]; // Descending
    } else {
      return a[0] - b[0]; // Ascending
    }
  });

  sortedTiers.forEach(([tier, count]) => {
    const percentage = ((count / selectedSongs.length) * 100).toFixed(1);
    console.log(`  ${colors.brightCyan}${tier}-user songs:${colors.reset} ${count}/${selectedSongs.length} (${percentage}%)`);
  });
}

/**
 * Perform a single distribution attempt
 * @param {Song[]} eligibleSongs - All eligible songs
 * @param {Basket[]} baskets - Baskets to fill (state will be modified)
 * @param {number} maxTotal - Maximum total songs
 * @param {() => number} rng - RNG function for this attempt
 * @param {boolean} allowDuplicateShows - Whether to allow duplicate shows
 * @param {string} songSelectionMode - Song selection mode: 'default' | 'many-lists' | 'few-lists'
 * @param {number} attemptNumber - Current attempt number (for logging)
 * @param {Song[]} sourceSongs - All source songs (before filtering) for accurate user counting
 * @returns {Song[]} Selected songs
 */
function distributeSingleAttempt(eligibleSongs, baskets, maxTotal, rng, allowDuplicateShows, songSelectionMode, attemptNumber, sourceSongs = null) {
  // Step 1: Prioritize songs by user overlap
  const { orderedGroups, shuffled } = prioritizeSongsByUserOverlap(eligibleSongs, sourceSongs, songSelectionMode, rng);

  // Step 2: Create context for song addition
  const context = createSongAdditionContext(maxTotal, baskets);
  context.allowDuplicateShows = allowDuplicateShows; // Add for Phase 2 rejection tracking

  // Step 3: Create song adder function
  const tryAddSong = createSongAdder(context, baskets, allowDuplicateShows, rng);

  // PHASE 1: Fill all baskets to their minimum
  console.log(`${colors.blue}[DISTRIBUTION] Attempt ${attemptNumber} - Phase 1: Filling to minimum...${colors.reset}`);

  const maxUserCount = orderedGroups ? Math.max(...orderedGroups.map(g => g.count)) : 1;

  if (orderedGroups) {
    console.log(`${colors.brightMagenta}[TIER INFO] Maximum user count across all tiers: ${maxUserCount}${colors.reset}`);

    for (const group of orderedGroups) {
      processTierPhase1(group, tryAddSong, baskets, context, maxTotal, maxUserCount, orderedGroups, allowDuplicateShows, rng);

      // Check if all baskets met minimum
      const basketsNeedingMin = baskets.filter(b => b.current < b.min);
      if (basketsNeedingMin.length === 0) {
        break;
      }
    }
  } else {
    // DEFAULT MODE: Single linear pass
    for (const song of shuffled) {
      tryAddSong(song, 1, null, false);
      if (context.selectedSongs.length >= maxTotal) break;
    }
  }

  // PHASE 2: Fill remaining space
  console.log(`${colors.blue}[DISTRIBUTION] Attempt ${attemptNumber} - Phase 2: Filling remaining space...${colors.reset}`);

  console.log(`${colors.cyan}[BASKETS BEFORE P2] Current fill: ${context.selectedSongs.length}/${maxTotal} songs${colors.reset}`);
  baskets.forEach(basket => {
    const percentFull = basket.max > 0 ? Math.round((basket.current / basket.max) * 100) : 0;
    console.log(`  ${colors.dim}${basket.id}: ${basket.current}/${basket.max} (${percentFull}%)${colors.reset}`);
  });

  if (orderedGroups) {
    for (const group of orderedGroups) {
      processTierPhase2(group, tryAddSong, baskets, context, maxTotal, maxUserCount, rng);
    }

    // PHASE 2 SWAP: Run after all tiers processed
    if (context.selectedSongs.length > 0 && orderedGroups.length > 0) {
      const maxTierGroup = orderedGroups[0];
      if (maxTierGroup.count === maxUserCount) {
        console.log(`${colors.brightCyan}[SWAP P2] Attempting to replace lower-tier songs with ${maxTierGroup.count}/${maxUserCount}-user songs (MAX TIER)...${colors.reset}`);

        const maxSwaps = Math.min(20, Math.ceil(maxTierGroup.songs.length / 10));
        const { swapsMade, failures } = performAggressiveSwap(
          context.selectedSongs,
          context.selectedIds,
          maxTierGroup,
          orderedGroups,
          baskets,
          allowDuplicateShows,
          context.animeCount,
          context.selectedAnime,
          rng,
          maxSwaps
        );

        if (swapsMade > 0) {
          console.log(`${colors.brightGreen}[SWAP P2] Successfully swapped ${swapsMade} songs to ${maxTierGroup.count}-user alternatives${colors.reset}`);
        } else {
          console.log(`${colors.yellow}[SWAP P2] No valid swaps found. Failures: DifferentBaskets=${failures.differentBaskets}, DuplicateAnime=${failures.duplicateAnime}, RerollFailed=${failures.rerollFailed}, NoBasketSpace=${failures.noBasketSpace}, AlreadySelected=${failures.alreadySelected}${colors.reset}`);
        }
      }
    }
  } else {
    // DEFAULT MODE: Single linear pass
    for (const song of shuffled) {
      tryAddSong(song, 2, null, false);
      if (context.selectedSongs.length >= maxTotal) break;
    }
  }

  // Log final tier distribution
  logFinalTierDistribution(orderedGroups, context.selectedSongs, songSelectionMode);

  return context.selectedSongs;
}

/**
 * Log basket fill status
 * @param {Basket[]} baskets - Baskets to log
 * @returns {void}
 */
function logBasketStatus(baskets) {
  console.log(`${colors.magenta}[BASKETS] Fill Status:${colors.reset}`);
  const failedBaskets = [];
  baskets.forEach(basket => {
    const percentageOfMax = basket.max > 0 ? Math.round((basket.current / basket.max) * 100) : 0;
    const metMin = basket.current >= basket.min;
    const statusSymbol = metMin ? `${colors.brightGreen}✁E{colors.reset}` : `${colors.brightRed}✁E{colors.reset}`;
    const countColor = metMin ? colors.brightGreen : colors.brightYellow;
    console.log(`  ${statusSymbol} ${colors.cyan}${basket.id}${colors.reset}: ${countColor}${basket.current}${colors.reset} [${basket.min}-${basket.max}] ${percentageOfMax}%`);
    if (!metMin) {
      failedBaskets.push(basket.id);
    }
  });

  // If all baskets met their minimum, we're done
  if (failedBaskets.length === 0) {
    console.log(`\n${colors.bgGreen}${colors.black}[DISTRIBUTION] SUCCESS! All baskets met minimum.${colors.reset}`);
  } else {
    // Log failed baskets
    const failedList = failedBaskets.join(`, ${colors.red}`);
    console.log(`${colors.brightYellow}[DISTRIBUTION] ${failedBaskets.length} basket(s) failed to meet minimum: ${colors.red}${failedList}${colors.reset}`);
  }
}

// ========================================
// SECTION 7: DISPLAY AND STATISTICS
// ========================================

/**
 * Build a map from annSongId to array of users who have this song
 * @param {Array} songsBySource - Array of song sources with their songs
 * @returns {Map<string, Array>} Map from annSongId to user info array
 */
function buildSongToUsersMap(songsBySource) {
  const songToUsersMap = new Map();

  if (!songsBySource || !Array.isArray(songsBySource)) {
    return songToUsersMap;
  }

  songsBySource.forEach(source => {
    if (source.songs && Array.isArray(source.songs)) {
      source.songs.forEach(sourceSong => {
        if (sourceSong.annSongId) {
          if (!songToUsersMap.has(sourceSong.annSongId)) {
            songToUsersMap.set(sourceSong.annSongId, []);
          }
          // Use _sourceInfo from the song itself (preserves user-specific info)
          // Fall back to source.listInfo if _sourceInfo is not available
          const songSourceInfo = sourceSong._sourceInfo || source.listInfo || 'Unknown';
          const username = extractUsernameFromSourceInfo(songSourceInfo);

          // Check if this entry already exists (avoid duplicates)
          const existingEntries = songToUsersMap.get(sourceSong.annSongId);
          const alreadyExists = existingEntries.some(e =>
            e.username === username && e.nodeId === source.nodeId
          );

          if (!alreadyExists) {
            songToUsersMap.get(sourceSong.annSongId).push({
              listInfo: songSourceInfo,
              nodeId: source.nodeId,
              username: username
            });
          }
        }
      });
    }
  });

  return songToUsersMap;
}

/**
 * Collect statistics from songs array
 * @param {Song[]} songs - Array of songs
 * @returns {Object} Statistics object with various counts
 */
function collectSongStatistics(songs) {
  const stats = {
    animeTypeCount: {},
    songTypeCount: { openings: 0, endings: 0, inserts: 0 },
    difficultyStats: { min: 100, max: 0, total: 0, count: 0 },
    playerScoreCount: {},
    animeScoreCount: {},
    genreCount: {},
    tagCount: {},
    selectedFromUserCount: {}
  };

  songs.forEach((song) => {
    // Track which user list this song was selected from
    if (song._sourceId) {
      stats.selectedFromUserCount[song._sourceId] = (stats.selectedFromUserCount[song._sourceId] || 0) + 1;
    }

    // Anime type
    stats.animeTypeCount[song.animeType] = (stats.animeTypeCount[song.animeType] || 0) + 1;

    // Song type
    const songType = song.songType || '';
    if (songType.startsWith('Opening')) stats.songTypeCount.openings++;
    else if (songType.startsWith('Ending')) stats.songTypeCount.endings++;
    else if (songType.includes('Insert')) stats.songTypeCount.inserts++;

    // Difficulty
    if (song.songDifficulty !== null && song.songDifficulty !== undefined) {
      stats.difficultyStats.min = Math.min(stats.difficultyStats.min, song.songDifficulty);
      stats.difficultyStats.max = Math.max(stats.difficultyStats.max, song.songDifficulty);
      stats.difficultyStats.total += song.songDifficulty;
      stats.difficultyStats.count++;
    }

    // Player score
    if (song.sourceAnime?.score !== null && song.sourceAnime?.score !== undefined) {
      const playerScore = normalizePlayerScore(song.sourceAnime.score);
      if (playerScore !== null) {
        stats.playerScoreCount[playerScore] = (stats.playerScoreCount[playerScore] || 0) + 1;
      }
    }

    // Anime score
    if (song.sourceAnime?.averageScore !== null && song.sourceAnime?.averageScore !== undefined) {
      const animeScore = normalizeAnimeScore(song.sourceAnime.averageScore);
      if (animeScore !== null) {
        stats.animeScoreCount[animeScore] = (stats.animeScoreCount[animeScore] || 0) + 1;
      }
    }

    // Genres
    if (song.sourceAnime?.genres && Array.isArray(song.sourceAnime.genres)) {
      song.sourceAnime.genres.forEach(genre => {
        // @ts-ignore
        const genreName = genre.name || genre;
        stats.genreCount[genreName] = (stats.genreCount[genreName] || 0) + 1;
      });
    }

    // Tags (only those with rank > 60)
    if (song.sourceAnime?.tags && Array.isArray(song.sourceAnime.tags)) {
      song.sourceAnime.tags.forEach(tag => {
        const tagRank = tag.rank || 0;
        if (tagRank > 60) {
          const tagName = tag.name || tag;
          stats.tagCount[tagName] = (stats.tagCount[tagName] || 0) + 1;
        }
      });
    }
  });

  return stats;
}

/**
 * Display collected statistics
 * @param {Object} stats - Statistics object from collectSongStatistics
 * @param {Song[]} songs - Array of songs (for percentage calculations)
 * @param {Array} songsBySource - Array of song sources
 * @returns {void}
 */
function displaySongStatistics(stats, songs, songsBySource) {
  console.log(`\n${colors.bright}${colors.magenta}📊 STATISTICS:${colors.reset}`);
  console.log(`  ${colors.brightGreen}Openings:${colors.reset} ${colors.cyan}${stats.songTypeCount.openings}${colors.reset}`);
  console.log(`  ${colors.brightGreen}Endings:${colors.reset} ${colors.cyan}${stats.songTypeCount.endings}${colors.reset}`);
  console.log(`  ${colors.brightGreen}Inserts:${colors.reset} ${colors.cyan}${stats.songTypeCount.inserts}${colors.reset}`);

  console.log(`  ${colors.brightGreen}Anime Types:${colors.reset}`);
  Object.entries(stats.animeTypeCount).forEach(([type, count]) => {
    console.log(`    • ${colors.cyan}${type}${colors.reset}: ${colors.yellow}${count}${colors.reset}`);
  });

  if (stats.difficultyStats.count > 0) {
    const avgDifficulty = (stats.difficultyStats.total / stats.difficultyStats.count).toFixed(1);
    console.log(`  ${colors.brightGreen}Difficulty:${colors.reset} min=${colors.brightRed}${stats.difficultyStats.min}${colors.reset}, avg=${colors.brightYellow}${avgDifficulty}${colors.reset}, max=${colors.brightGreen}${stats.difficultyStats.max}${colors.reset}`);
  }

  if (Object.keys(stats.playerScoreCount).length > 0) {
    console.log(`  ${colors.brightGreen}Player Score:${colors.reset}`);
    Object.entries(stats.playerScoreCount).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([score, count]) => {
      console.log(`    • ${colors.cyan}${score}${colors.reset}: ${colors.yellow}${count}${colors.reset}`);
    });
  }

  if (Object.keys(stats.animeScoreCount).length > 0) {
    console.log(`  ${colors.brightGreen}Anime Score:${colors.reset}`);
    Object.entries(stats.animeScoreCount).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([score, count]) => {
      console.log(`    • ${colors.cyan}${score}${colors.reset}: ${colors.yellow}${count}${colors.reset}`);
    });
  }

  if (Object.keys(stats.genreCount).length > 0) {
    console.log(`  ${colors.brightGreen}Genres:${colors.reset}`);
    const sortedGenres = Object.entries(stats.genreCount).sort((a, b) => b[1] - a[1]);
    sortedGenres.forEach(([genre, count]) => {
      const percentage = ((count / songs.length) * 100).toFixed(1);
      console.log(`    • ${colors.cyan}${genre}${colors.reset}: ${colors.yellow}${count}${colors.reset} ${colors.dim}(${percentage}%)${colors.reset}`);
    });
  }

  if (Object.keys(stats.tagCount).length > 0) {
    console.log(`  ${colors.brightGreen}Tags:${colors.reset}`);
    const sortedTags = Object.entries(stats.tagCount).sort((a, b) => b[1] - a[1]);
    sortedTags.forEach(([tag, count]) => {
      const percentage = ((count / songs.length) * 100).toFixed(1);
      console.log(`    • ${colors.cyan}${tag}${colors.reset}: ${colors.yellow}${count}${colors.reset} ${colors.dim}(${percentage}%)${colors.reset}`);
    });
  }

  // Display song distribution by user source
  if (songsBySource && Object.keys(stats.selectedFromUserCount).length > 0) {
    console.log(`\n${colors.bright}${colors.magenta}👥 SONG DISTRIBUTION BY USER:${colors.reset}`);

    // Create a map of nodeId to source info for better display
    const sourceInfoMap = {};
    songsBySource.forEach(source => {
      sourceInfoMap[source.nodeId] = source.listInfo || 'Unknown';
    });

    // Sort by count (descending)
    const sortedSources = Object.entries(stats.selectedFromUserCount).sort((a, b) => b[1] - a[1]);

    sortedSources.forEach(([nodeId, count]) => {
      const sourceName = sourceInfoMap[nodeId] || nodeId;
      const percentage = ((count / songs.length) * 100).toFixed(1);
      console.log(`  ${colors.brightYellow}${sourceName}${colors.reset}: ${colors.cyan}${count}${colors.reset} songs ${colors.dim}(${percentage}%)${colors.reset}`);
    });

    // Show total unique sources
    console.log(`  ${colors.dim}Total sources used: ${sortedSources.length}/${songsBySource.length}${colors.reset}`);
  }
}

/**
 * Display final song list with colors and metadata
 * @param {Song[]} songs - Final selected songs
 * @param {number} targetCount - Target number of songs
 * @param {Array} songsBySource - Array of song sources with their songs
 * @returns {void}
 */
function displayFinalSongList(songs, targetCount, songsBySource = null) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(100)}${colors.reset}`);
  console.log(`${colors.bright}${colors.brightGreen}✨ FINAL SONG LIST${colors.reset} ${colors.dim}(${songs.length}/${targetCount})${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(100)}${colors.reset}`);

  // Build song-to-users map and collect statistics
  const songToUsersMap = buildSongToUsersMap(songsBySource);
  const stats = collectSongStatistics(songs);

  songs.forEach((song, index) => {
    // Display song with color
    const songType = song.songType || '';
    const diffColor = song.songDifficulty >= 60 ? colors.brightGreen : song.songDifficulty >= 25 ? colors.brightYellow : colors.brightRed;
    const typeColor = songType.startsWith('Opening') ? colors.brightCyan : songType.startsWith('Ending') ? colors.brightMagenta : colors.brightBlue;
    const animeTypeColor = colors.brightMagenta;

    // Calculate player score for display
    let playerScoreDisplay = '?';
    if (song.sourceAnime?.score !== null && song.sourceAnime?.score !== undefined) {
      const playerScore = normalizePlayerScore(song.sourceAnime.score);
      if (playerScore !== null) {
        playerScoreDisplay = String(playerScore);
      }
    }

    // Calculate anime score for display
    let animeScoreDisplay = '?';
    if (song.sourceAnime?.averageScore !== null && song.sourceAnime?.averageScore !== undefined) {
      const animeScore = normalizeAnimeScore(song.sourceAnime.averageScore);
      if (animeScore !== null) {
        animeScoreDisplay = String(animeScore);
      }
    }

    // Calculate genres for display
    let genresDisplay = '-';
    if (song.sourceAnime?.genres && Array.isArray(song.sourceAnime.genres) && song.sourceAnime.genres.length > 0) {
      const genreNames = song.sourceAnime.genres.map(g => g.name || g).slice(0, 2);
      genresDisplay = genreNames.join(', ');
      if (genresDisplay.length > 15) genresDisplay = genresDisplay.substring(0, 13) + '..';
    }

    // Calculate tags for display (only rank > 60)
    let tagsDisplay = '-';
    if (song.sourceAnime?.tags && Array.isArray(song.sourceAnime.tags)) {
      const validTags = song.sourceAnime.tags
        .filter(tag => (tag.rank || 0) > 60)
        .map(tag => {
          const tagName = tag.name || tag;
          const tagRank = tag.rank || 0;
          return `${tagName}(${tagRank}%)`;
        })
        .slice(0, 2);
      if (validTags.length > 0) {
        tagsDisplay = validTags.join(', ');
        if (tagsDisplay.length > 18) tagsDisplay = tagsDisplay.substring(0, 16) + '..';
      }
    }

    console.log(
      `  ${colors.dim}${String(index + 1).padStart(3, ' ')}.${colors.reset} ` +
      `${colors.bright}${song.songName.substring(0, 28).padEnd(28, ' ')}${colors.reset} ` +
      `${colors.cyan}${song.animeENName.substring(0, 16).padEnd(16, ' ')}${colors.reset} ` +
      `${typeColor}${(song.songType || 'Unknown').substring(0, 8).padEnd(8, ' ')}${colors.reset} ` +
      `${animeTypeColor}${(song.animeType || '?').substring(0, 6).padEnd(6, ' ')}${colors.reset} ` +
      `${diffColor}${String(song.songDifficulty || '?').padStart(3, ' ')}${colors.reset} ` +
      `${colors.yellow}${(song.songCategory || '?').substring(0, 6).padEnd(6, ' ')}${colors.reset} ` +
      `${colors.brightMagenta}PS:${playerScoreDisplay.padStart(2, ' ')}${colors.reset} ` +
      `${colors.brightBlue}AS:${animeScoreDisplay.padStart(2, ' ')}${colors.reset} ` +
      `${colors.green}G:${genresDisplay.padEnd(13, ' ')}${colors.reset} ` +
      `${colors.blue}T:${tagsDisplay.padEnd(18, ' ')}${colors.reset}`
    );

    // Display source information if available
    if (songsBySource) {
      // Find which user list this song was selected from
      // Prioritize _sourceInfo (preserves user-specific info) over grouped listInfo
      let selectedFromInfo = song._sourceInfo;
      if (!selectedFromInfo && song._sourceId && songsBySource) {
        const matchingSource = songsBySource.find(s => s.nodeId === song._sourceId);
        if (matchingSource) {
          selectedFromInfo = matchingSource.listInfo;
        }
      }
      if (!selectedFromInfo) {
        selectedFromInfo = 'Unknown';
      }

      // Get all users who have this song
      const usersWithSong = song.annSongId ? songToUsersMap.get(song.annSongId) : null;

      if (usersWithSong && usersWithSong.length > 0) {
        // Extract usernames, prioritizing username field, then extracting from listInfo
        const usernames = usersWithSong.map(u => {
          if (u.username) return u.username;
          // Extract username from listInfo (e.g., "Batch User List - Endranii" -> "Endranii")
          return extractUsernameFromSourceInfo(u.listInfo) || u.listInfo;
        }).filter(Boolean);
        const uniqueUsernames = [...new Set(usernames)]; // Remove duplicates

        // Count total unique users across all sources (not just songsBySource.length)
        // This is more accurate when batch nodes are grouped
        const totalUniqueUsers = new Set();
        if (songsBySource) {
          songsBySource.forEach(source => {
            if (source.songs && source.songs.length > 0) {
              source.songs.forEach(song => {
                const sourceInfo = song._sourceInfo || source.listInfo;
                const username = extractUsernameFromSourceInfo(sourceInfo);
                if (username) totalUniqueUsers.add(username);
              });
            }
          });
        }
        const totalUsers = totalUniqueUsers.size || songsBySource?.length || 0;

        console.log(
          `      ${colors.dim}Selected from:${colors.reset} ${colors.brightYellow}${selectedFromInfo}${colors.reset} ` +
          `${colors.dim}| On lists:${colors.reset} ${colors.brightCyan}${uniqueUsernames.join(', ')}${colors.reset} ` +
          `${colors.dim}(${uniqueUsernames.length}/${totalUsers} users)${colors.reset}`
        );
      } else {
        console.log(
          `      ${colors.dim}Selected from:${colors.reset} ${colors.brightYellow}${selectedFromInfo}${colors.reset}`
        );
      }
    }
  });

  // Display statistics using helper function
  displaySongStatistics(stats, songs, songsBySource);

  // Display complete anime names
  console.log(`\n${colors.bright}${colors.brightYellow}📺 COMPLETE ANIME NAMES${colors.reset}`);
  console.log(`${colors.cyan}${'─'.repeat(100)}${colors.reset}`);

  // Collect unique anime names
  const animeNamesMap = new Map();
  songs.forEach(song => {
    const enName = song.animeENName || song.sourceAnime?.title?.english || '';
    const romajiName = song.sourceAnime?.title?.romaji || '';
    const key = `${enName}|${romajiName}`;

    if (!animeNamesMap.has(key)) {
      animeNamesMap.set(key, { enName, romajiName });
    }
  });

  // Display anime names
  const animeNames = Array.from(animeNamesMap.values());
  animeNames.forEach((anime, index) => {
    if (anime.enName && anime.romajiName && anime.enName !== anime.romajiName) {
      console.log(`  ${colors.dim}${String(index + 1).padStart(3, ' ')}.${colors.reset} ${colors.brightGreen}${anime.enName}${colors.reset} ${colors.dim}(${anime.romajiName})${colors.reset}`);
    } else if (anime.enName) {
      console.log(`  ${colors.dim}${String(index + 1).padStart(3, ' ')}.${colors.reset} ${colors.brightGreen}${anime.enName}${colors.reset}`);
    } else if (anime.romajiName) {
      console.log(`  ${colors.dim}${String(index + 1).padStart(3, ' ')}.${colors.reset} ${colors.brightGreen}${anime.romajiName}${colors.reset}`);
    }
  });

  console.log(`${colors.dim}Total unique anime: ${animeNames.length}${colors.reset}`);

  console.log(`${colors.bright}${colors.cyan}${'='.repeat(100)}${colors.reset}\n`);
}

// ========================================
// SECTION 8: MAIN ENTRY POINT
// ========================================

/**
 * Generate a random seed string of 16 letters
 * @returns {string} 16-character random letter string
 */
function generateRandomSeed() {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += letters[Math.floor(Math.random() * letters.length)];
  }
  return result;
}

/**
 * Generate quiz songs using basket-based approach
 * Handles retries with different seeds if initial attempt doesn't meet requirements
 * @param {SimulatedConfig} simulatedConfig - Simulated quiz configuration
 * @param {typeof fetch} fetchFn - Fetch function
 * @param {string|null} baseSeed - Base seed for generation (optional)
 * @returns {Promise<GenerationResult>} Object with songs array and metadata
 */
export async function generateQuizSongs(simulatedConfig, fetchFn = fetch, baseSeed = null) {
  const { numberOfSongs, filters } = simulatedConfig;
  // Generate 16 random letters if no seed provided
  const seed = baseSeed || generateRandomSeed();
  const rng = makeRng(seed);

  console.log(`[SONG GENERATION] Starting (seed: ${seed}, target: ${numberOfSongs} songs)`);
  const isTrainingMode = simulatedConfig.trainingMode === true;

  // PHASE 1: Load source songs
  let { songs: sourceSongs, supportsPlayerScore, loadingErrors, songsBySource } = await loadSourceSongs(simulatedConfig, fetchFn);

  songsBySource = songsBySource || [];

  console.log(`[SONG GENERATION] Loaded ${sourceSongs.length} source songs`);

  // Check if any song list has useEntirePool enabled - if so, bypass all filters
  const songListSettings = extractSongListSettings(simulatedConfig);
  const hasUseEntirePool = songListSettings.some(settings => settings.useEntirePool === true);

  // PHASE 2: Apply global filters (skip if useEntirePool is enabled)
  let eligibleSongs;
  let filterStatistics = [];

  if (hasUseEntirePool) {
    console.log(`[SONG GENERATION] useEntirePool enabled - bypassing filter nodes but respecting source node percentages`);
    // Skip global filters, use all source songs
    eligibleSongs = sourceSongs;
  } else {
    const filterResult = applyGlobalFilters(sourceSongs, filters, supportsPlayerScore);
    eligibleSongs = filterResult.songs;
    filterStatistics = filterResult.filterStatistics;
  }

  if (eligibleSongs.length === 0) {
    console.error('[SONG GENERATION] No eligible songs after global filters!');
    return {
      songs: [],
      metadata: {
        attempts: 1,
        finalSeed: seed,
        success: false,
        targetCount: numberOfSongs,
        finalCount: 0,
        sourceSongCount: sourceSongs.length,
        eligibleSongCount: 0,
        basketStatus: [],
        failedBaskets: [],
        filterStatistics: filterStatistics,
        loadingErrors: loadingErrors,
        songsBySource: songsBySource || [],
        songSourceMap: []
      }
    };
  }

  console.log(`[SONG GENERATION] ${eligibleSongs.length} eligible songs after ${hasUseEntirePool ? 'bypassing filters' : 'global filters'}`);

  let selectedSongs;
  let basketStatus = [];
  let failedBaskets = [];
  let songSelectionMode = 'default';

  // Extract duplicate shows setting from basic settings (default to true for backward compatibility)
  const allowDuplicateShows = simulatedConfig.basicSettings?.duplicateShows ?? true;
  console.log(`[SONG GENERATION] DEBUG: duplicateShows raw value = ${JSON.stringify(simulatedConfig.basicSettings?.duplicateShows)}, type = ${typeof simulatedConfig.basicSettings?.duplicateShows}`);
  console.log(`[SONG GENERATION] Duplicate shows: ${allowDuplicateShows ? 'ENABLED (with reroll logic)' : 'DISABLED (unique anime only)'}`);

  // Extract song selection mode BEFORE building baskets (needed for basket strategy)
  songSelectionMode = songListSettings.find(settings =>
    (settings.nodeType === 'batch-user-list' || settings.nodeType === 'live-node') &&
    settings.songSelectionMode
  )?.songSelectionMode || 'default';
  console.log(`[SONG GENERATION] Song selection mode: ${songSelectionMode}`);

  // PHASE 3: Build baskets
  // When useEntirePool is enabled, only build song list baskets (source percentages), skip filter baskets
  // For many-lists/few-lists modes, use flexible aggregate baskets instead of resolved sub-ranges
  const baskets = hasUseEntirePool
    ? buildSongListBaskets(simulatedConfig, rng, songsBySource)
    : buildBaskets(simulatedConfig, rng, songsBySource, songSelectionMode);
  console.log(`[SONG GENERATION] Created ${baskets.length} baskets${hasUseEntirePool ? ' (source nodes only)' : ''}`);

  if (isTrainingMode) {
    console.log('[SONG GENERATION] Training mode detected – filtering songs by basket criteria (ignoring min/max)');

    // Filter eligible songs to only those that match basket criteria
    // A song must match at least one basket of each basket type (e.g., at least one songType basket, one difficulty basket, etc.)
    const trainingPool = eligibleSongs.filter(song => {
      if (baskets.length === 0) {
        return true; // No baskets = all songs eligible
      }

      const applicableBaskets = getApplicableBaskets(song, baskets);

      // Get all basket types that exist
      const basketTypes = new Set(baskets.map(b => getBasketType(b.id)));

      // Get applicable basket types for this song
      const applicableTypes = new Set(applicableBaskets.map(b => getBasketType(b.id)));

      // Song must match at least one basket of each type (except 'other' type)
      for (const type of basketTypes) {
        if (type !== 'other' && !applicableTypes.has(type)) {
          // There's a basket type the song doesn't match
          return false;
        }
      }

      return true;
    });

    console.log(`[SONG GENERATION] Training pool size: ${trainingPool.length} songs (filtered from ${eligibleSongs.length} eligible songs)`);

    // Deduplicate by annSongId - same song from different sources should only appear once
    // Keep the first occurrence (preserves source info from first source)
    const seenAnnSongIds = new Set();
    const deduplicatedPool = trainingPool.filter(song => {
      if (!song.annSongId) {
        // Songs without annSongId are kept (they'll be filtered out later if needed)
        return true;
      }
      if (seenAnnSongIds.has(song.annSongId)) {
        return false;
      }
      seenAnnSongIds.add(song.annSongId);
      return true;
    });

    const duplicateCount = trainingPool.length - deduplicatedPool.length;
    if (duplicateCount > 0) {
      console.log(`[SONG GENERATION] Removed ${duplicateCount} duplicate songs (same annSongId from multiple sources)`);
    }

    console.log(`[SONG GENERATION] Deduplicated training pool: ${deduplicatedPool.length} unique songs`);

    // In training mode, we return the pool for FSRS to select from
    // The actual selection will happen in the training endpoint after FSRS processes the pool
    selectedSongs = deduplicatedPool;
  } else {
    // PHASE 4: Distribute songs to baskets (includes internal retry logic)
    // Pass sourceSongs for accurate user counting in many-lists/few-lists mode
    selectedSongs = distributeToBaskets(eligibleSongs, baskets, numberOfSongs, rng, allowDuplicateShows, songSelectionMode, 100, sourceSongs);

    console.log(`[SONG GENERATION] Selected ${selectedSongs.length}/${numberOfSongs} songs`);

    // Shuffle songs if songSelection is configured to mix random and watched songs
    // BUT skip shuffling if songSelectionMode is 'many-lists' to maintain ordering by user overlap
    const songsAndTypesFilterForShuffle = filters.find(f => f.definitionId === 'songs-and-types');
    const hasSongSelectionForShuffle = songsAndTypesFilterForShuffle?.settings?.songSelection;
    const hasSongSelectionConfiguredForShuffle = hasSongSelectionForShuffle && (hasSongSelectionForShuffle.random > 0 || hasSongSelectionForShuffle.watched > 0);

    if (hasSongSelectionConfiguredForShuffle && selectedSongs.length > 0 && songSelectionMode !== 'many-lists') {
      console.log('[SONG GENERATION] Shuffling songs to mix random and watched songs');
      // Fisher-Yates shuffle using seeded RNG for reproducibility
      for (let i = selectedSongs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [selectedSongs[i], selectedSongs[j]] = [selectedSongs[j], selectedSongs[i]];
      }
    } else if (songSelectionMode === 'many-lists') {
      console.log('[SONG GENERATION] Skipping shuffle to maintain ordering by user overlap (many-lists mode)');
    }

    // Collect basket status information
    basketStatus = baskets.map(basket => {
      const percentageOfMax = basket.max > 0 ? Math.round((basket.current / basket.max) * 100) : 0;
      const meetsMin = basket.current >= basket.min;
      console.log(`[BASKET] ${basket.id}: ${basket.current} [min:${basket.min} max:${basket.max}] ${percentageOfMax}% of max ${meetsMin ? '✓' : '✗'}`);

      return {
        id: basket.id,
        current: basket.current,
        min: basket.min,
        max: basket.max,
        meetsMin: meetsMin,
        percentageOfMax: percentageOfMax
      };
    });

    // Identify failed baskets
    failedBaskets = basketStatus.filter(b => !b.meetsMin);
  }

  // Display final song list if we got any songs
  if (selectedSongs.length > 0 && !isTrainingMode) {
    displayFinalSongList(selectedSongs, numberOfSongs, songsBySource);
  }
  if (isTrainingMode) {
    const sampleCount = Math.min(10, selectedSongs.length);
    console.log(`[SONG GENERATION] Training mode sample (${sampleCount}/${selectedSongs.length} songs):`);
    for (let i = 0; i < sampleCount; i++) {
      const song = selectedSongs[i];
      console.log(`  ${i + 1}. ${song.songName || 'Unknown'} | type: ${song.songType || 'Unknown'}`);
    }
    if (selectedSongs.length > sampleCount) {
      console.log(`[SONG GENERATION] ... ${selectedSongs.length - sampleCount} additional songs omitted from log`);
    }
  }

  // Map annSongId to source info for client-side tracking
  const songSourceMapping = new Map();
  const selectedSongIds = new Set(selectedSongs.map(s => s.annSongId).filter(Boolean));

  selectedSongs.forEach(song => {
    if (song.annSongId) {
      // Prioritize song's own _sourceInfo property (most accurate after tagging)
      if (song._sourceInfo) {
        songSourceMapping.set(song.annSongId, {
          sourceInfo: song._sourceInfo,
          nodeId: song._sourceId || song._basketSourceId || 'unknown',
          username: extractUsernameFromSourceInfo(song._sourceInfo)
        });
      } else if (song._sourceId || song._basketSourceId) {
        // Fallback: find from songsBySource if _sourceInfo not set
        const sourceId = song._sourceId || song._basketSourceId;
        const matchingSource = songsBySource.find(s => s.nodeId === sourceId);
        if (matchingSource) {
          songSourceMapping.set(song.annSongId, {
            sourceInfo: matchingSource.listInfo || 'Unknown source',
            nodeId: matchingSource.nodeId,
            username: extractUsernameFromSourceInfo(matchingSource.listInfo)
          });
        } else {
          // Source not found in songsBySource - use Unknown source
          songSourceMapping.set(song.annSongId, {
            sourceInfo: 'Unknown source',
            nodeId: sourceId || 'unknown',
            username: null
          });
        }
      } else {
        // Last resort: mark as unknown if no source info available
        songSourceMapping.set(song.annSongId, {
          sourceInfo: 'Unknown source',
          nodeId: 'unknown',
          username: null
        });
      }
    }
  });

  // Verify all selected songs have mappings
  const songsWithoutMapping = selectedSongs.filter(s => s.annSongId && !songSourceMapping.has(s.annSongId));
  if (songsWithoutMapping.length > 0) {
    console.warn(`${colors.yellow}[SONG SOURCE MAP] Warning: ${songsWithoutMapping.length} selected song(s) missing source mapping${colors.reset}`);
  }

  // Log song source mapping for AMQ+ connector
  console.log(`\n${colors.brightMagenta}[SONG SOURCE MAP] Building mapping for AMQ+ connector (ONLY selected songs)${colors.reset}`);
  console.log(`${colors.cyan}[SONG SOURCE MAP] Selected songs: ${selectedSongs.length}, Mappings created: ${songSourceMapping.size}${colors.reset}`);

  // Verify mapping matches selected songs
  const songsWithAnnSongId = selectedSongs.filter(s => s.annSongId);
  const uniqueAnnSongIds = new Set(songsWithAnnSongId.map(s => s.annSongId));
  const mappingMatchesSelection = songSourceMapping.size === uniqueAnnSongIds.size;

  if (!mappingMatchesSelection) {
    const missingCount = uniqueAnnSongIds.size - songSourceMapping.size;
    console.warn(`${colors.yellow}[SONG SOURCE MAP] Warning: Mapping count (${songSourceMapping.size}) doesn't match unique annSongIds (${uniqueAnnSongIds.size}) - ${missingCount} songs missing mappings${colors.reset}`);

    // Log which annSongIds are missing mappings
    if (missingCount <= 20) {
      const missingIds = Array.from(uniqueAnnSongIds).filter(id => !songSourceMapping.has(id));
      console.warn(`${colors.yellow}[SONG SOURCE MAP] Missing annSongIds: ${missingIds.join(', ')}${colors.reset}`);
    }
  } else {
    console.log(`${colors.brightGreen}[SONG SOURCE MAP] ✓ Verification passed: Mapping contains exactly ${songSourceMapping.size} entries (one per selected song)${colors.reset}`);
  }

  // Convert to array for logging and return
  const songSourceMapArray = Array.from(songSourceMapping.entries()).map(([annSongId, info]) => ({
    annSongId,
    ...info
  }));

  // Verify all entries are from selected songs
  const entriesNotInSelection = songSourceMapArray.filter(entry => !selectedSongIds.has(entry.annSongId));
  if (entriesNotInSelection.length > 0) {
    console.error(`${colors.red}[SONG SOURCE MAP] ERROR: Found ${entriesNotInSelection.length} mapping entries NOT in selected songs!${colors.reset}`);
    entriesNotInSelection.forEach(entry => {
      console.error(`  ${colors.red}Invalid entry: ${entry.annSongId} → ${entry.sourceInfo}${colors.reset}`);
    });
  } else {
    console.log(`${colors.brightGreen}[SONG SOURCE MAP] ✓ Verification passed: All ${songSourceMapArray.length} entries are from selected songs${colors.reset}`);
  }

  // Log all mappings (all selected songs)
  if (songSourceMapArray.length > 0) {
    if (!isTrainingMode || songSourceMapArray.length <= 50) {
      console.log(`${colors.cyan}[SONG SOURCE MAP] All entries (${songSourceMapArray.length} selected songs):${colors.reset}`);
      songSourceMapArray.forEach((entry, idx) => {
        const songName = selectedSongs.find(s => s.annSongId === entry.annSongId)?.songName?.substring(0, 30) || 'Unknown';
        console.log(`  ${colors.dim}${String(idx + 1).padStart(2, ' ')}.${colors.reset} ${colors.brightCyan}${entry.annSongId}${colors.reset} → ${colors.brightYellow}${entry.sourceInfo}${colors.reset} ${colors.dim}(${entry.username || 'no username'})${colors.reset} - ${colors.cyan}${songName}${colors.reset}`);
      });
    } else {
      console.log(`${colors.cyan}[SONG SOURCE MAP] Entries (${songSourceMapArray.length}) omitted from detailed log in training mode to avoid excessive output${colors.reset}`);
    }

    // Group by source for summary
    const sourceCounts = new Map();
    songSourceMapArray.forEach(entry => {
      const key = entry.sourceInfo || 'Unknown source';
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
    });

    console.log(`${colors.cyan}[SONG SOURCE MAP] Distribution by source (selected songs only):${colors.reset}`);
    Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        const percentage = ((count / songSourceMapArray.length) * 100).toFixed(1);
        console.log(`  ${colors.brightYellow}${source}${colors.reset}: ${colors.cyan}${count}${colors.reset} songs ${colors.dim}(${percentage}%)${colors.reset}`);
      });

    console.log(`${colors.brightGreen}[SONG SOURCE MAP] ✓ Connector script will receive ${songSourceMapArray.length} entries (truncated to selected songs only)${colors.reset}`);
  } else {
    console.log(`${colors.yellow}[SONG SOURCE MAP] No source mappings found${colors.reset}`);
  }

  return {
    songs: selectedSongs,
    metadata: {
      attempts: 1,
      finalSeed: seed,
      success: selectedSongs.length >= numberOfSongs,
      targetCount: numberOfSongs,
      finalCount: selectedSongs.length,
      sourceSongCount: sourceSongs.length,
      eligibleSongCount: eligibleSongs.length,
      basketStatus: basketStatus,
      failedBaskets: failedBaskets,
      filterStatistics: filterStatistics,
      loadingErrors: loadingErrors,
      songsBySource: songsBySource, // Include source information
      songSourceMap: songSourceMapArray // Array of {annSongId, sourceInfo, nodeId, username} for AMQ+ connector
    }
  };
}

/**
 * Extract username from source info string
 * @param {string} sourceInfo - Source info string like "Live Node - PlayerName" or "Batch User List - PlayerName"
 * @returns {string|null} Extracted username or null
 */
function extractUsernameFromSourceInfo(sourceInfo) {
  if (!sourceInfo) return null;

  // Extract username from patterns like "Live Node - PlayerName" or "Batch User List - PlayerName"
  const match = sourceInfo.match(/- ([^\(]+)/);
  if (match) {
    return match[1].trim();
  }

  // Try pattern like "User list: username"
  const match2 = sourceInfo.match(/:\s*([^\s]+)/);
  if (match2) {
    return match2[1].trim();
  }

  return null;
}

