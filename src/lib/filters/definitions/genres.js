/**
 * Genres Filter Definition
 * Filters songs by anime genres
 * 
 * @module filters/definitions/genres
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { GENRES_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { validateGenresTagsOverlap } from '$lib/utils/commonValidators.js';
import { formatGenresTags } from '$lib/utils/commonDisplayUtils.js';

/**
 * Validate genres configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateGenres(value, context) {
  const result = new ValidationResult();

  // Validate overlaps
  const overlapResult = validateGenresTagsOverlap(value, 'genres');
  result.merge(overlapResult);

  return result;
}

/**
 * Display genres configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayGenres(value, context) {
  return formatGenresTags(value, 'genres');
}

/**
 * Extract genres settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractGenres(value, context) {
  const v = value || {};
  const mode = v.viewMode || 'basic';
  const allocationMode = v.mode || 'percentage';

  // Basic mode: return included/excluded/optional lists
  if (mode === 'basic') {
    return {
      mode: 'basic',
      included: Array.isArray(v.included) ? [...v.included] : [],
      excluded: Array.isArray(v.excluded) ? [...v.excluded] : [],
      optional: Array.isArray(v.optional) ? [...v.optional] : []
    };
  }

  // Advanced mode with showRates: format items from stateByKey
  const stateByKey = v.stateByKey || {};
  const advanced = v.advanced || {};

  const items = Object.entries(stateByKey).map(([key, state]) => {
    const itemData = advanced[key] || {};
    return {
      name: key,
      status: state, // 'include', 'exclude', 'optional'
      value: allocationMode === 'percentage' ? (itemData.percentageValue || 0) : (itemData.countValue || 0)
    };
  });

  return {
    mode: allocationMode, // Allocation mode (percentage or count)
    showRates: true,
    items
  };
}

/**
 * Resolve genres to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveGenres(node, context, rng) {
  const value = node.data.currentValue;

  if (!value.viewMode) {
    throw new Error('viewMode is required for genres resolution');
  }
  if (!value.mode) {
    throw new Error('mode is required for genres resolution');
  }

  // For basic mode, stateByKey is not required - only included/excluded/optional arrays
  if (value.viewMode === 'basic') {
    const result = {
      viewMode: value.viewMode,
      mode: value.mode,
      included: Array.isArray(value.included) ? [...value.included] : [],
      excluded: Array.isArray(value.excluded) ? [...value.excluded] : [],
      optional: Array.isArray(value.optional) ? [...value.optional] : []
    };
    return result;
  }

  // For advanced mode, stateByKey is required
  if (!value.stateByKey) {
    throw new Error('stateByKey is required for genres resolution in advanced mode');
  }

  const result = {
    viewMode: value.viewMode,
    mode: value.mode,
    stateByKey: value.stateByKey ? { ...value.stateByKey } : {},
    showRates: value.showRates ?? false,
    items: value.items ?? [],
    included: Array.isArray(value.included) ? [...value.included] : [],
    excluded: Array.isArray(value.excluded) ? [...value.excluded] : [],
    optional: Array.isArray(value.optional) ? [...value.optional] : []
  };
  return result;
}

/**
 * Genres Filter Definition
 */
export const genresFilter = {
  id: 'genres',
  metadata: {
    title: 'Genres',
    icon: '🎭',
    color: '#16a34a',
    description: 'Filter by anime genres',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: GENRES_DEFAULT_SETTINGS,
  formType: 'complex-genres',
  validate: validateGenres,
  display: displayGenres,
  extract: extractGenres,
  resolve: resolveGenres
};

// Auto-register the filter
FilterRegistry.register(genresFilter.id, genresFilter);

