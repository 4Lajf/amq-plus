/**
 * Test helper utilities for songFiltering.js tests
 */

import { parseVintage, isInVintageRange } from '../../src/lib/server/songFiltering.js';

/**
 * @typedef {Object} Song
 * @property {string} annSongId - Song ID
 * @property {string} songName - Song name
 * @property {string} songType - Song type
 * @property {string} animeType - Anime type
 * @property {number|null} songDifficulty - Song difficulty
 * @property {Object} sourceAnime - Source anime data
 * @property {number} sourceAnime.score - Player score
 * @property {number} sourceAnime.averageScore - Average score
 * @property {string[]} sourceAnime.genres - Genres
 * @property {Object[]} sourceAnime.tags - Tags
 */

/**
 * @typedef {Object} FilterConfiguration
 * @property {string} definitionId - Filter definition ID
 * @property {Object} settings - Filter settings
 */

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m'
};

/**
 * Colored console logging
 * @param {string} message - Message to log
 * @param {string} color - Color name
 */
export function colorLog(message, color = 'reset') {
  const colorCode = colors[color] || colors.reset;
  console.log(`${colorCode}${message}${colors.reset}`);
}

/**
 * Get song type group (openings/endings/inserts)
 * @param {string} songType - Song type
 * @returns {string} Group name
 */
function getSongTypeGroup(songType) {
  if (!songType) return 'inserts';
  if (songType.startsWith('Opening')) return 'openings';
  if (songType.startsWith('Ending')) return 'endings';
  return 'inserts';
}

/**
 * Validate a song matches all filter constraints
 * @param {Song} song - Song to validate
 * @param {FilterConfiguration[]} filters - Array of filter configurations
 * @param {boolean} supportsPlayerScore - Whether player score is available
 * @returns {{errors: string[]}} Validation result with errors array
 */
export function validateSongMatchesFilters(song, filters, supportsPlayerScore) {
  const errors = [];

  for (const filter of filters) {
    const { definitionId, settings } = filter;

    // Genres filter
    if (definitionId === 'genres') {
      const { included, excluded, optional, items, showRates } = settings;

      let includedGenres = included || [];
      let excludedGenres = excluded || [];
      let optionalGenres = optional || [];

      // Extract from items if showRates is true
      if (showRates && items && Array.isArray(items)) {
        includedGenres = items.filter(i => i.status === 'include').map(i => i.label);
        excludedGenres = items.filter(i => i.status === 'exclude').map(i => i.label);
        optionalGenres = items.filter(i => i.status === 'optional').map(i => i.label);
      }

      const genres = song.sourceAnime?.genres || [];

      // If song has no genres and we're filtering by genres, skip validation
      // (global filter will handle this)
      if (genres.length === 0 && (includedGenres.length > 0 || excludedGenres.length > 0 || optionalGenres.length > 0)) {
        continue;
      }

      // Must have all included genres
      if (includedGenres.length > 0) {
        for (const genre of includedGenres) {
          if (!genres.includes(genre)) {
            errors.push(`Missing required genre: ${genre}`);
          }
        }
      }

      // Must not have any excluded genres
      if (excludedGenres.length > 0) {
        for (const genre of excludedGenres) {
          if (genres.includes(genre)) {
            errors.push(`Has excluded genre: ${genre}`);
          }
        }
      }

      // Must have at least one optional genre (if any specified)
      if (optionalGenres.length > 0) {
        const hasOptional = optionalGenres.some(g => genres.includes(g));
        if (!hasOptional) {
          errors.push(`Missing any optional genre from: ${optionalGenres.join(', ')}`);
        }
      }
    }

    // Tags filter
    if (definitionId === 'tags') {
      const { included, excluded, optional, items, showRates } = settings;

      let includedTags = included || [];
      let excludedTags = excluded || [];
      let optionalTags = optional || [];

      // Extract from items if showRates is true
      if (showRates && items && Array.isArray(items)) {
        includedTags = items.filter(i => i.status === 'include').map(i => i.label);
        excludedTags = items.filter(i => i.status === 'exclude').map(i => i.label);
        optionalTags = items.filter(i => i.status === 'optional').map(i => i.label);
      }

      const tagObjects = song.sourceAnime?.tags || [];
      const validTags = tagObjects.filter(t => (t.rank || 0) > 60);
      const tags = validTags.map(t => t.name);

      // If filtering by tags and anime has no valid tags, that's an error
      if ((includedTags.length > 0 || excludedTags.length > 0 || optionalTags.length > 0) && validTags.length === 0) {
        errors.push('No valid tags (rank > 60) on anime');
      }

      // Must have all included tags
      if (includedTags.length > 0) {
        for (const tag of includedTags) {
          if (!tags.includes(tag)) {
            errors.push(`Missing required tag: ${tag}`);
          }
        }
      }

      // Must not have any excluded tags
      if (excludedTags.length > 0) {
        for (const tag of excludedTags) {
          if (tags.includes(tag)) {
            errors.push(`Has excluded tag: ${tag}`);
          }
        }
      }

      // Must have at least one optional tag (if any specified)
      if (optionalTags.length > 0) {
        const hasOptional = optionalTags.some(t => tags.includes(t));
        if (!hasOptional) {
          errors.push(`Missing any optional tag from: ${optionalTags.join(', ')}`);
        }
      }
    }

    // Anime Score filter
    if (definitionId === 'anime-score') {
      const { min, max, disabled } = settings;

      // Normalize score: divide by 10 (0-100 scale to 1-10 scale), then 0 becomes 1
      let score = song.sourceAnime.averageScore / 10;
      if (score === 0) score = 1;
      score = Math.round(score);

      if (score < min || score > max) {
        errors.push(`Anime score ${score} out of range [${min}, ${max}]`);
      }

      if ((disabled || []).includes(score)) {
        errors.push(`Anime score ${score} is disabled`);
      }
    }

    // Player Score filter
    if (definitionId === 'player-score' && supportsPlayerScore) {
      const { min, max, disabled, percentages } = settings;

      // Only validate if not using percentages (global filter mode)
      if (!percentages || Object.keys(percentages).length === 0) {
        const isFullRange = min === 1 && max === 10;

        if (!song.sourceAnime?.score) {
          if (!isFullRange) {
            errors.push('Missing player score');
          }
          continue;
        }

        // Normalize score: 0 becomes 1 BEFORE rounding
        let score = song.sourceAnime.score;
        if (score === 0) {
          score = 1;
        } else {
          score = Math.round(score);
        }

        if (score < min || score > max) {
          errors.push(`Player score ${score} out of range [${min}, ${max}]`);
        }

        if ((disabled || []).includes(score)) {
          errors.push(`Player score ${score} is disabled`);
        }
      }
    }

    // Anime Type filter (basic mode only - advanced is basket-based)
    if (definitionId === 'anime-type' && settings.mode === 'basic') {
      const { enabled } = settings;

      if (enabled && enabled.length > 0) {
        const type = (song.animeType || '').toLowerCase();
        if (!enabled.includes(type)) {
          errors.push(`Anime type ${type} not in enabled list: ${enabled.join(', ')}`);
        }
      }
    }

    // Song Categories filter (basic mode only - advanced is basket-based)
    if (definitionId === 'song-categories' && settings.mode === 'basic') {
      const { enabled } = settings;

      if (enabled) {
        const group = getSongTypeGroup(song.songType);
        const category = (song.songCategory || '').toLowerCase();
        const isEnabled = enabled?.[group]?.[category] === true;

        if (!isEnabled) {
          errors.push(`Song category ${category} not enabled for ${group}`);
        }
      }
    }

    // Vintage filter
    if (definitionId === 'vintage') {
      const { ranges } = settings;

      if (ranges && ranges.length > 0) {
        const matchesAnyRange = ranges.some(range =>
          isInVintageRange(song.animeVintage, range.from, range.to)
        );

        if (!matchesAnyRange) {
          errors.push(`Vintage ${song.animeVintage} not in any specified range`);
        }
      }
    }

    // Song Difficulty filter
    if (definitionId === 'song-difficulty') {
      const { viewMode, difficulties, ranges } = settings;

      if (viewMode === 'basic' && difficulties) {
        const basicRanges = [
          { label: 'easy', diffMin: 60, diffMax: 100 },
          { label: 'medium', diffMin: 25, diffMax: 60 },
          { label: 'hard', diffMin: 0, diffMax: 25 }
        ];

        const matchesAnyBasicRange = basicRanges.some(range => {
          const diff = song.songDifficulty;
          return diff !== null && diff !== undefined && diff >= range.diffMin && diff <= range.diffMax;
        });

        if (!matchesAnyBasicRange) {
          errors.push(`Song difficulty ${song.songDifficulty} not in any basic range`);
        }
      } else if (ranges && ranges.length > 0) {
        const matchesAnyRange = ranges.some(range => {
          const diff = song.songDifficulty;
          return diff !== null && diff !== undefined && diff >= range.from && diff <= range.to;
        });

        if (!matchesAnyRange) {
          errors.push(`Song difficulty ${song.songDifficulty} not in any specified range`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * @typedef {Object} BasketStatus
 * @property {string} id - Basket ID
 * @property {number} current - Current count
 * @property {number} min - Minimum count
 * @property {number} max - Maximum count
 */

/**
 * Validate basket distribution meets constraints
 * @param {BasketStatus[]} basketStatus - Array of basket status objects
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateBasketDistribution(basketStatus) {
  const errors = [];

  for (const basket of basketStatus) {
    if (basket.current < basket.min) {
      errors.push(`Basket ${basket.id} below minimum: ${basket.current}/${basket.min}`);
    }

    if (basket.current > basket.max) {
      errors.push(`Basket ${basket.id} above maximum: ${basket.current}/${basket.max}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get detailed statistics about generated songs
 * @param {Song[]} songs - Array of songs
 * @param {FilterConfiguration[]} filters - Array of filter configurations
 * @returns {Object} Statistics object
 */
export function getSongStatistics(songs, filters) {
  const stats = {
    total: songs.length,
    songTypes: { openings: 0, endings: 0, inserts: 0 },
    animeTypes: {},
    difficulties: { min: 100, max: 0, avg: 0, count: 0 },
    playerScores: {},
    animeScores: {},
    genres: {},
    tags: {},
    vintages: {},
    categories: {}
  };

  for (const song of songs) {
    // Song types
    const songType = song.songType || '';
    if (songType.startsWith('Opening')) stats.songTypes.openings++;
    else if (songType.startsWith('Ending')) stats.songTypes.endings++;
    else if (songType.includes('Insert')) stats.songTypes.inserts++;

    // Anime types
    const animeType = song.animeType;
    if (animeType) {
      stats.animeTypes[animeType] = (stats.animeTypes[animeType] || 0) + 1;
    }

    // Difficulties
    if (song.songDifficulty !== null && song.songDifficulty !== undefined) {
      stats.difficulties.min = Math.min(stats.difficulties.min, song.songDifficulty);
      stats.difficulties.max = Math.max(stats.difficulties.max, song.songDifficulty);
      stats.difficulties.avg += song.songDifficulty;
      stats.difficulties.count++;
    }

    // Player scores
    if (song.sourceAnime?.score !== null && song.sourceAnime?.score !== undefined) {
      let score = song.sourceAnime.score;
      if (score === 0) score = 1;
      else score = Math.round(score);
      stats.playerScores[score] = (stats.playerScores[score] || 0) + 1;
    }

    // Anime scores
    if (song.sourceAnime?.averageScore !== null && song.sourceAnime?.averageScore !== undefined) {
      let score = song.sourceAnime.averageScore / 10;
      if (score === 0) score = 1;
      else score = Math.round(score);
      stats.animeScores[score] = (stats.animeScores[score] || 0) + 1;
    }

    // Genres
    if (song.sourceAnime?.genres && Array.isArray(song.sourceAnime.genres)) {
      song.sourceAnime.genres.forEach(genre => {
        const genreName = genre.name || genre;
        stats.genres[genreName] = (stats.genres[genreName] || 0) + 1;
      });
    }

    // Tags (only rank > 60)
    if (song.sourceAnime?.tags && Array.isArray(song.sourceAnime.tags)) {
      song.sourceAnime.tags.forEach(tag => {
        if ((tag.rank || 0) > 60) {
          const tagName = tag.name || tag;
          stats.tags[tagName] = (stats.tags[tagName] || 0) + 1;
        }
      });
    }

    // Vintages
    if (song.animeVintage) {
      stats.vintages[song.animeVintage] = (stats.vintages[song.animeVintage] || 0) + 1;
    }

    // Categories
    if (song.songCategory) {
      stats.categories[song.songCategory] = (stats.categories[song.songCategory] || 0) + 1;
    }
  }

  if (stats.difficulties.count > 0) {
    stats.difficulties.avg = stats.difficulties.avg / stats.difficulties.count;
  }

  return stats;
}

/**
 * @typedef {Object} ValidationError
 * @property {Song} song - Song with error
 * @property {string[]} errors - Array of error messages
 */

/**
 * Print detailed test results
 * @param {string} testName - Name of the test
 * @param {Object} result - Result from generateQuizSongs
 * @param {Object} config - Configuration used
 * @param {ValidationError[]} validationErrors - Array of validation errors per song
 * @returns {void}
 */
export function printTestResults(testName, result, config, validationErrors = []) {
  colorLog(`\n${'='.repeat(80)}`, 'cyan');
  colorLog(`TEST: ${testName}`, 'bright');
  colorLog('='.repeat(80), 'cyan');

  const { songs, metadata } = result;

  // Metadata
  colorLog(`\nMetadata:`, 'yellow');
  console.log(`  Target: ${metadata.targetCount} songs`);
  console.log(`  Generated: ${metadata.finalCount} songs`);
  console.log(`  Success: ${metadata.success ? '✓' : '✗'}`);
  console.log(`  Source songs: ${metadata.sourceSongCount}`);
  console.log(`  Eligible songs: ${metadata.eligibleSongCount}`);

  // Basket status
  if (metadata.basketStatus && metadata.basketStatus.length > 0) {
    colorLog(`\nBasket Status:`, 'yellow');
    for (const basket of metadata.basketStatus) {
      const statusSymbol = basket.meetsMin ? '✓' : '✗';
      const statusColor = basket.meetsMin ? 'green' : 'red';
      colorLog(`  ${statusSymbol} ${basket.id}: ${basket.current} [${basket.min}-${basket.max}]`, statusColor);
    }
  }

  // Validation errors
  if (validationErrors.length > 0) {
    colorLog(`\n⚠ Validation Errors (${validationErrors.length} songs):`, 'brightRed');
    for (const error of validationErrors.slice(0, 10)) {
      console.log(`  Song: ${error.song.songName}`);
      console.log(`    Anime: ${error.song.animeENName}`);
      for (const err of error.errors) {
        colorLog(`    - ${err}`, 'red');
      }
    }
    if (validationErrors.length > 10) {
      colorLog(`  ... and ${validationErrors.length - 10} more errors`, 'red');
    }
  } else {
    colorLog(`\n✓ All songs passed validation`, 'brightGreen');
  }

  // Statistics
  const stats = getSongStatistics(songs, config.filters);
  colorLog(`\nStatistics:`, 'yellow');
  console.log(`  Song Types: OP=${stats.songTypes.openings}, ED=${stats.songTypes.endings}, INS=${stats.songTypes.inserts}`);
  console.log(`  Anime Types:`, stats.animeTypes);
  if (stats.difficulties.count > 0) {
    console.log(`  Difficulty: min=${stats.difficulties.min}, max=${stats.difficulties.max}, avg=${stats.difficulties.avg.toFixed(1)}`);
  }
  if (Object.keys(stats.playerScores).length > 0) {
    console.log(`  Player Scores:`, stats.playerScores);
  }
  if (Object.keys(stats.animeScores).length > 0) {
    console.log(`  Anime Scores:`, stats.animeScores);
  }

  colorLog('='.repeat(80), 'cyan');
}

