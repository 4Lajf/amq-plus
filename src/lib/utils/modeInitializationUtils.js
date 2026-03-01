/**
 * Mode initialization utilities for quiz creation
 * Provides default values when switching between percentage and count modes
 * without complex re-calculation logic
 * Uses the same quick fix logic as the actual node dialogs
 */

import { SONGS_AND_TYPES_DEFAULT_SETTINGS, SONG_DIFFICULTY_DEFAULT_SETTINGS, ANIME_TYPE_DEFAULT_SETTINGS, SONG_CATEGORIES_DEFAULT_SETTINGS, GENRES_DEFAULT_SETTINGS, TAGS_DEFAULT_SETTINGS, PLAYER_SCORE_DEFAULT_SETTINGS, ANIME_SCORE_DEFAULT_SETTINGS } from './defaultNodeSettings.js';
import { quickFixSongsAndTypes, quickFixSongDifficulty, quickFixAnimeType, quickFixSongCategories, quickFixGenresTags, quickFixScore } from './quickFixUtils.js';

/**
 * Initialize default values for songs-and-types node when switching modes
 * Uses the same quick fix logic as SongsAndTypesSelection.svelte
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeSongsAndTypesMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from SONGS_AND_TYPES_DEFAULT_SETTINGS
  const defaults = SONGS_AND_TYPES_DEFAULT_SETTINGS;

  // Initialize song types with defaults (deep clone to preserve nested structure)
  if (!newValue.songTypes) {
    newValue.songTypes = JSON.parse(JSON.stringify(defaults.songTypes));
  } else {
    // Deep clone and merge defaults to ensure all properties exist, preserving existing values
    newValue.songTypes = JSON.parse(JSON.stringify(newValue.songTypes));
    Object.keys(defaults.songTypes).forEach(type => {
      if (!newValue.songTypes[type]) {
        newValue.songTypes[type] = JSON.parse(JSON.stringify(defaults.songTypes[type]));
      } else {
        newValue.songTypes[type] = { ...defaults.songTypes[type], ...newValue.songTypes[type] };
      }
    });
  }

  // Initialize song selection with defaults (deep clone to preserve nested structure)
  if (!newValue.songSelection) {
    newValue.songSelection = JSON.parse(JSON.stringify(defaults.songSelection));
  } else {
    // Deep clone and merge defaults to ensure all properties exist, preserving existing values
    newValue.songSelection = JSON.parse(JSON.stringify(newValue.songSelection));
    Object.keys(defaults.songSelection).forEach(selection => {
      if (!newValue.songSelection[selection]) {
        newValue.songSelection[selection] = JSON.parse(JSON.stringify(defaults.songSelection[selection]));
      } else {
        newValue.songSelection[selection] = { ...defaults.songSelection[selection], ...newValue.songSelection[selection] };
      }
    });
  }

  // Only apply quick fix if values are missing or incomplete
  // If structure is already complete (from template defaults), skip quickFix to preserve exact defaults
  const hasCompleteStructure = newValue.songTypes?.openings && newValue.songTypes?.endings && 
                                newValue.songSelection?.random && newValue.songSelection?.watched;
  
  if (!hasCompleteStructure) {
    quickFixSongsAndTypes(newValue, newMode, totalSongs);
  }

  return newValue;
}

/**
 * Initialize default values for song-difficulty node when switching modes
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeSongDifficultyMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from SONG_DIFFICULTY_DEFAULT_SETTINGS
  const defaults = SONG_DIFFICULTY_DEFAULT_SETTINGS;

  // Initialize basic mode defaults if not in advanced mode
  if (newValue.viewMode !== 'advanced') {
    // Initialize with defaults (deep clone to preserve nested structure)
    // Only initialize if the difficulty object doesn't exist
    if (!newValue.easy) {
      newValue.easy = JSON.parse(JSON.stringify(defaults.easy));
    } else {
      // Merge defaults but preserve existing values
      newValue.easy = { ...defaults.easy, ...JSON.parse(JSON.stringify(newValue.easy)) };
    }
    if (!newValue.medium) {
      newValue.medium = JSON.parse(JSON.stringify(defaults.medium));
    } else {
      newValue.medium = { ...defaults.medium, ...JSON.parse(JSON.stringify(newValue.medium)) };
    }
    if (!newValue.hard) {
      newValue.hard = JSON.parse(JSON.stringify(defaults.hard));
    } else {
      newValue.hard = { ...defaults.hard, ...JSON.parse(JSON.stringify(newValue.hard)) };
    }
    
    // Only apply quick fix if structure is incomplete (missing required properties)
    // Do NOT auto-fix invalid values - let validation show the error
    // This matches the behavior of initializeSongsAndTypesMode
    const hasCompleteStructure = newValue.easy && newValue.medium && newValue.hard &&
                                  newValue.easy.enabled !== undefined &&
                                  newValue.medium.enabled !== undefined &&
                                  newValue.hard.enabled !== undefined;
    
    if (!hasCompleteStructure) {
      quickFixSongDifficulty(newValue, newMode, totalSongs);
    }
  } else {
    // Advanced mode - initialize ranges if not present
    if (!newValue.ranges) {
      newValue.ranges = [
        { from: 0, to: 30, songCount: 0, useAdvanced: false },
        { from: 31, to: 70, songCount: 0, useAdvanced: false },
        { from: 71, to: 100, songCount: 0, useAdvanced: false }
      ];
      // Only apply quick fix when creating new ranges
      quickFixSongDifficulty(newValue, newMode, totalSongs);
    }
    // Do NOT auto-fix existing ranges - let validation show the error
  }

  return newValue;
}

/**
 * Initialize default values for anime-type node when switching modes
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeAnimeTypeMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from ANIME_TYPE_DEFAULT_SETTINGS
  const defaults = ANIME_TYPE_DEFAULT_SETTINGS;

  // Initialize advanced mode if not present
  const wasAdvancedMissing = !newValue.advanced;
  if (wasAdvancedMissing) {
    newValue.advanced = { ...defaults.advanced };
  }

  // Only apply quick fix if structure was missing
  // Do NOT auto-fix invalid values - let validation show the error
  if (wasAdvancedMissing) {
    quickFixAnimeType(newValue, newMode, totalSongs);
  }

  return newValue;
}

/**
 * Initialize default values for song-categories node when switching modes
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeSongCategoriesMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from SONG_CATEGORIES_DEFAULT_SETTINGS
  const defaults = SONG_CATEGORIES_DEFAULT_SETTINGS;

  // Initialize advanced mode if not present
  const wasAdvancedMissing = !newValue.advanced;
  if (wasAdvancedMissing) {
    newValue.advanced = { ...defaults.advanced };
  }

  // Only apply quick fix if structure was missing
  // Do NOT auto-fix invalid values - let validation show the error
  if (wasAdvancedMissing) {
    quickFixSongCategories(newValue, newMode, totalSongs);
  }

  return newValue;
}

/**
 * Initialize default values for genres/tags node when switching modes
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeGenresTagsMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from GENRES_DEFAULT_SETTINGS or TAGS_DEFAULT_SETTINGS
  const defaults = GENRES_DEFAULT_SETTINGS; // Both genres and tags use similar structure

  // Initialize advanced mode if not present
  const wasAdvancedMissing = !newValue.advanced;
  if (wasAdvancedMissing) {
    newValue.advanced = { ...defaults.advanced };
  }

  // Only apply quick fix if structure was missing
  // Do NOT auto-fix invalid values - let validation show the error
  if (wasAdvancedMissing) {
    quickFixGenresTags(newValue, newMode, totalSongs);
  }

  return newValue;
}

/**
 * Initialize default values for player-score/anime-score node when switching modes
 * @param {Object} currentValue - Current node value
 * @param {string} newMode - New mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode validation
 * @returns {Object} Updated value with initialized defaults
 */
export function initializeScoreMode(currentValue, newMode, totalSongs = 20) {
  const newValue = { ...currentValue };
  newValue.mode = newMode;

  // Use defaults from PLAYER_SCORE_DEFAULT_SETTINGS or ANIME_SCORE_DEFAULT_SETTINGS
  const defaults = PLAYER_SCORE_DEFAULT_SETTINGS; // Both use similar structure

  // Initialize counts/percentages if not present
  const wasCountsMissing = !newValue.counts;
  const wasPercentagesMissing = !newValue.percentages;
  if (wasCountsMissing) newValue.counts = { ...defaults.percentages }; // Initialize as empty object
  if (wasPercentagesMissing) newValue.percentages = { ...defaults.percentages }; // Initialize as empty object

  // Use min/max from defaults or current value
  const minScore = newValue.min || defaults.min;
  const maxScore = newValue.max || defaults.max;

  // Only apply quick fix if structure was missing
  // Do NOT auto-fix invalid values - let validation show the error
  if (wasCountsMissing || wasPercentagesMissing) {
    quickFixScore(newValue, newMode, totalSongs, minScore, maxScore);
  }

  return newValue;
}


/**
 * Get the appropriate initialization function for a node type
 * @param {string} nodeId - Node identifier
 * @returns {Function|null} Initialization function or null
 */
export function getModeInitializationFunction(nodeId) {
  switch (nodeId) {
    case 'songs-and-types':
      return initializeSongsAndTypesMode;
    case 'song-difficulty':
      return initializeSongDifficultyMode;
    case 'anime-type':
      return initializeAnimeTypeMode;
    case 'song-categories':
      return initializeSongCategoriesMode;
    case 'genres':
    case 'tags':
      return initializeGenresTagsMode;
    case 'player-score':
    case 'anime-score':
      return initializeScoreMode;
    default:
      return null;
  }
}
