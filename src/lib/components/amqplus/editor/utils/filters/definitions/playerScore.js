/**
 * Player Score Filter Definition
 * Filters songs by player score
 * 
 * @module filters/definitions/playerScore
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { PLAYER_SCORE_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateRange, validateValue } from '../../validation/commonValidators.js';
import { formatScoreRange } from '../../display/commonDisplayUtils.js';

/**
 * Validate player score configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validatePlayerScore(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  // Validate min/max range
  const min = Number(v.min);
  const max = Number(v.max);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    result.addError('Score range must have valid numeric values');
    return result;
  }

  if (min < 0 || max < 0) {
    result.addError('Score values must be non-negative');
  }

  if (min > max) {
    result.addError(`Minimum score (${min}) cannot exceed maximum score (${max})`);
  }

  // Typical score range is 0-10, but allow flexibility
  if (max > 10) {
    result.addWarning('Maximum score exceeds typical range of 10');
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
 * Display player score configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayPlayerScore(value, context) {
  return formatScoreRange(value);
}

/**
 * Extract player score settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractPlayerScore(value, context) {
  if (!value.mode) {
    throw new Error('mode is required for player-score extraction');
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
 * Resolve player score to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolvePlayerScore(node, context, rng) {
  const value = node.data.currentValue;

  if (!value.mode) {
    throw new Error('mode is required for player-score resolution');
  }
  const mode = value.mode;

  if (value.min === undefined || value.min === null) {
    throw new Error('min is required for player-score resolution');
  }
  if (value.max === undefined || value.max === null) {
    throw new Error('max is required for player-score resolution');
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
 * Player Score Filter Definition
 */
export const playerScoreFilter = {
  id: 'player-score',
  metadata: {
    title: 'Player Score',
    icon: '🎯',
    color: '#ea580c',
    description: 'Filter songs by player score',
    category: 'score',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: PLAYER_SCORE_DEFAULT_SETTINGS,
  formType: 'complex-player-score',
  validate: validatePlayerScore,
  display: displayPlayerScore,
  extract: extractPlayerScore,
  resolve: resolvePlayerScore
};

// Auto-register the filter
FilterRegistry.register(playerScoreFilter.id, playerScoreFilter);

