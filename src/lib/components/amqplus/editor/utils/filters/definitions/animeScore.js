/**
 * Anime Score Filter Definition
 * Filters songs by anime score/rating
 * 
 * @module filters/definitions/animeScore
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { ANIME_SCORE_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateRange, validateValue } from '../../validation/commonValidators.js';
import { formatScoreRange } from '../../display/commonDisplayUtils.js';

/**
 * Validate anime score configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateAnimeScore(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  // Validate min/max range
  const min = Number(v.min);
  const max = Number(v.max);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    result.addError('Score range must have valid numeric values');
    return result;
  }

  // Anime scores are typically 2-10
  if (min < 2 || max > 10) {
    result.addWarning('Anime score range is typically 2-10');
  }

  if (min > max) {
    result.addError(`Minimum score (${min}) cannot exceed maximum score (${max})`);
  }

  // Validate percentages if present
  if (v.percentages && typeof v.percentages === 'object') {
    const perScoreMode = v.perScoreMode || 'count';
    for (const [score, percentage] of Object.entries(v.percentages)) {
      const scoreNum = Number(score);
      const pct = Number(percentage);

      if (Number.isFinite(scoreNum) && Number.isFinite(pct)) {
        if (perScoreMode === 'percentage' && (pct < 0 || pct > 100)) {
          result.addError(`Score ${score} percentage must be between 0-100`);
        }
        if (perScoreMode === 'count' && pct < 0) {
          result.addError(`Score ${score} count must be non-negative`);
        }
      }
    }

    // Validate total if percentage mode
    if (perScoreMode === 'percentage') {
      const total = Object.values(v.percentages)
        .filter((p) => p !== undefined && p !== '')
        .reduce((sum, p) => sum + Number(p || 0), 0);

      if (total > 100) {
        result.addError(`Total score percentages (${total}%) exceed 100%`);
      }
    }
  }

  // Validate disallowed scores
  if (v.disallowed && Array.isArray(v.disallowed)) {
    for (const score of v.disallowed) {
      const scoreNum = Number(score);
      if (!Number.isFinite(scoreNum)) {
        result.addError(`Invalid disallowed score: ${score}`);
      } else if (scoreNum < min || scoreNum > max) {
        result.addWarning(`Disallowed score ${score} is outside range ${min}-${max}`);
      }
    }
  }

  return result;
}

/**
 * Display anime score configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayAnimeScore(value, context) {
  return formatScoreRange(value);
}

/**
 * Extract anime score settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractAnimeScore(value, context) {
  if (!value.mode) {
    throw new Error('mode is required for anime-score extraction');
  }
  const result = { ...value, mode: value.mode };

  if (value.percentages && Object.keys(value.percentages).length > 0) {
    if (!value.perScoreMode) {
      throw new Error('perScoreMode is required when percentages are set');
    }
    result.perScoreMode = value.perScoreMode;
  }

  return result;
}

/**
 * Resolve anime score to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveAnimeScore(node, context, rng) {
  const value = node.data.currentValue;

  if (!value.mode) {
    throw new Error('mode is required for anime-score resolution');
  }
  const mode = value.mode;

  if (value.min === undefined || value.min === null) {
    throw new Error('min is required for anime-score resolution');
  }
  if (value.max === undefined || value.max === null) {
    throw new Error('max is required for anime-score resolution');
  }

  const result = {
    mode,
    min: Number(value.min),
    max: Number(value.max),
    disabled: Array.isArray(value.disallowed) ? [...value.disallowed] : [] // Server expects 'disabled', not 'disallowed'
  };

  // If using percentages or counts, include them
  if (value.percentages && Object.keys(value.percentages).length > 0) {
    if (!value.perScoreMode) {
      throw new Error('perScoreMode is required when percentages are set');
    }
    result.perScoreMode = value.perScoreMode;
    result.percentages = { ...value.percentages };
  }

  return result;
}

/**
 * Anime Score Filter Definition
 */
export const animeScoreFilter = {
  id: 'anime-score',
  metadata: {
    title: 'Anime Score',
    icon: '⭐',
    color: '#2563eb',
    description: 'Filter songs by anime score/rating',
    category: 'score',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: ANIME_SCORE_DEFAULT_SETTINGS,
  formType: 'complex-anime-score',
  validate: validateAnimeScore,
  display: displayAnimeScore,
  extract: extractAnimeScore,
  resolve: resolveAnimeScore
};

// Auto-register the filter
FilterRegistry.register(animeScoreFilter.id, animeScoreFilter);

