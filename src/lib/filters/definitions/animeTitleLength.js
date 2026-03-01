/**
 * Anime Title Length Filter Definition
 * Filters songs by anime title word count
 * 
 * @module filters/definitions/animeTitleLength
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { ANIME_TITLE_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { validateRange } from '$lib/utils/commonValidators.js';

/**
 * Validate anime title length configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateAnimeTitleLength(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  // If disabled, no validation needed
  if (v.mode === 'disabled') {
    return result;
  }

  // Validate range
  const min = Number(v.minWords ?? 0);
  const max = Number(v.maxWords ?? 99);
  
  // Use helper to check min ≤ max and within bounds (0-99 seems reasonable for words)
  const rangeResult = validateRange(min, max, { minBound: 0, maxBound: 99, fieldName: 'Word count' });
  if (!rangeResult.isValid) {
    result.merge(rangeResult);
  }

  return result;
}

/**
 * Display anime title length configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayAnimeTitleLength(value, context) {
  const v = value || {};
  
  if (v.mode === 'disabled') {
    return 'Any title length';
  }

  const min = v.minWords ?? 0;
  const max = v.maxWords ?? 99;
  const field = v.titleField === 'auto' ? 'EN/Romaji' : (v.titleField === 'english' ? 'English' : 'Romaji');
  
  return `${min}-${max} words (${field})`;
}

/**
 * Resolve settings to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveAnimeTitleLength(node, context, rng) {
  const value = node.data.currentValue;
  
  return {
    mode: value.mode || 'disabled',
    minWords: Number(value.minWords ?? 0),
    maxWords: Number(value.maxWords ?? 99),
    titleField: value.titleField || 'auto'
  };
}

/**
 * Anime Title Length Filter Definition
 */
export const animeTitleLengthFilter = {
  id: 'anime-title-length',
  metadata: {
    title: 'Anime Title Length',
    icon: '📝',
    color: '#8b5cf6', // Violet color
    description: 'Limit anime title word count',
    category: 'optional', // New category for optional nodes
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: ANIME_TITLE_LENGTH_DEFAULT_SETTINGS,
  formType: 'complex-anime-title-length',
  validate: validateAnimeTitleLength,
  display: displayAnimeTitleLength,
  resolve: resolveAnimeTitleLength
};

// Auto-register the filter
FilterRegistry.register(animeTitleLengthFilter.id, animeTitleLengthFilter);

