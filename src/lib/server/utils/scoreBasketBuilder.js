/**
 * Score basket builder utilities for creating player score and anime score baskets
 * 
 * @module lib/server/utils/scoreBasketBuilder
 */

import { createBasket } from './basketFactory.js';
import { normalizePlayerScore, normalizeAnimeScore } from './scoreNormalization.js';

/**
 * Create score baskets (player score or anime score)
 * @param {'player'|'anime'} scoreType - Type of score ('player' or 'anime')
 * @param {Object} settings - Filter settings with counts, min, max, disabled
 * @param {number} numberOfSongs - Total number of songs to generate
 * @param {string|null|string[]} targetSourceId - Optional source ID(s) to restrict baskets to. Can be string, null, or array of strings.
 * @returns {Array} Array of basket objects
 */
export function createScoreBaskets(scoreType, settings, numberOfSongs, targetSourceId = null) {
  const baskets = [];
  const { counts, min, max, disabled } = settings;
  
  if (!counts || Object.keys(counts).length === 0) {
    return baskets;
  }

  // Normalize targetSourceId to targetSourceIds array
  const targetSourceIds = targetSourceId ? (Array.isArray(targetSourceId) ? targetSourceId : [targetSourceId]) : null;
  // Create suffix for basket IDs (use + to join multiple IDs)
  const sourceSuffix = targetSourceIds ? targetSourceIds.join('+') : 'all';

  const totalExplicitCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const scoreMin = min || (scoreType === 'player' ? 1 : 2);
  const scoreMax = max || 10;
  const disabledScores = disabled || [];

  // Create matcher function based on score type
  const createMatcher = (scoreValue, isRemaining = false) => {
    const baseMatcher = (song) => {
      let normalizedScore;
      
      if (scoreType === 'player') {
        const rawScore = song.sourceAnime?.score;
        if (rawScore === null || rawScore === undefined) return false;
        normalizedScore = normalizePlayerScore(rawScore);
      } else {
        const rawScore = song.sourceAnime?.averageScore;
        if (rawScore === null || rawScore === undefined) return false;
        normalizedScore = normalizeAnimeScore(rawScore);
      }

      if (normalizedScore === null) return false;

      if (isRemaining) {
        const explicitScores = Object.keys(counts).map(s => parseInt(s));
        return normalizedScore >= scoreMin &&
          normalizedScore <= scoreMax &&
          !explicitScores.includes(normalizedScore) &&
          !disabledScores.includes(normalizedScore);
      } else {
        return normalizedScore === scoreValue && !disabledScores.includes(scoreValue);
      }
    };

    // Wrap with source check if targetSourceIds exists
    return targetSourceIds
      ? (song) => targetSourceIds.includes(song._sourceId) && baseMatcher(song)
      : baseMatcher;
  };

  // Create baskets for each explicit score count
  Object.entries(counts).forEach(([score, count]) => {
    const scoreValue = parseInt(score);
    const songCount = count;

    if (songCount > 0) {
      baskets.push(
        createBasket(
          `${scoreType}Score-${score}-${sourceSuffix}`,
          songCount,
          songCount,
          createMatcher(scoreValue, false)
        )
      );
    }
  });

  // Add remaining basket if counts don't add up to total
  if (totalExplicitCount < numberOfSongs) {
    const remainingCount = numberOfSongs - totalExplicitCount;
    baskets.push(
      createBasket(
        `${scoreType}Score-remaining-${sourceSuffix}`,
        remainingCount,
        remainingCount,
        createMatcher(null, true)
      )
    );
  }

  return baskets;
}

