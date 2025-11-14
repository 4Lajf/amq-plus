/**
 * Tags Filter Definition
 * Filters songs by anime tags
 * 
 * @module filters/definitions/tags
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { TAGS_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateGenresTagsOverlap } from '../../validation/commonValidators.js';
import { formatGenresTags } from '../../display/commonDisplayUtils.js';

/**
 * Validate tags configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateTags(value, context) {
  const result = new ValidationResult();

  // Validate overlaps
  const overlapResult = validateGenresTagsOverlap(value, 'tags');
  result.merge(overlapResult);

  return result;
}

/**
 * Display tags configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayTags(value, context) {
  return formatGenresTags(value, 'tags');
}

/**
 * Extract tags settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractTags(value, context) {
  const v = value || {};
  const mode = v.viewMode || 'basic';
  const allocationMode = v.mode || 'percentage';

  // Basic mode: return included/excluded/optional lists
  if (mode === 'basic') {
    return {
      mode: 'basic',
      included: v.included || [],
      excluded: v.excluded || [],
      optional: v.optional || []
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
 * Resolve tags to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveTags(node, context, rng) {
  const value = node.data.currentValue;

  if (!value.viewMode) {
    throw new Error('viewMode is required for tags resolution');
  }
  if (!value.mode) {
    throw new Error('mode is required for tags resolution');
  }

  // For basic mode, stateByKey is not required - only included/excluded/optional arrays
  if (value.viewMode === 'basic') {
    return {
      viewMode: value.viewMode,
      mode: value.mode,
      included: value.included ?? [],
      excluded: value.excluded ?? [],
      optional: value.optional ?? []
    };
  }

  // For advanced mode, stateByKey is required
  if (!value.stateByKey) {
    throw new Error('stateByKey is required for tags resolution in advanced mode');
  }

  return {
    viewMode: value.viewMode,
    mode: value.mode,
    stateByKey: value.stateByKey,
    showRates: value.showRates ?? false,
    items: value.items ?? [],
    included: value.included ?? [],
    excluded: value.excluded ?? [],
    optional: value.optional ?? []
  };
}

/**
 * Tags Filter Definition
 */
export const tagsFilter = {
  id: 'tags',
  metadata: {
    title: 'Tags',
    icon: '🏷️',
    color: '#2563eb',
    description: 'Filter by anime tags',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: TAGS_DEFAULT_SETTINGS,
  formType: 'complex-tags',
  validate: validateTags,
  display: displayTags,
  extract: extractTags,
  resolve: resolveTags
};

// Auto-register the filter
FilterRegistry.register(tagsFilter.id, tagsFilter);

