/**
 * Anime Type Filter Definition
 * Filters songs by anime type (TV, Movie, OVA, ONA, Special)
 * 
 * @module filters/definitions/animeType
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { ANIME_TYPE_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { formatAnimeTypesSimple } from '../../display/commonDisplayUtils.js';

/**
 * Validate anime type configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateAnimeType(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  const validTypes = ['tv', 'movie', 'ova', 'ona', 'special'];
  const enabledTypes = validTypes.filter((t) => v[t] === true);

  if (enabledTypes.length === 0) {
    result.addError('No anime types selected');
  }

  return result;
}

/**
 * Display anime type configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayAnimeType(value, context) {
  return formatAnimeTypesSimple(value);
}

/**
 * Extract anime type settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractAnimeType(value, context) {
  const v = value || {};
  const viewMode = v.viewMode || 'basic';
  const mode = v.mode || 'percentage';

  // For basic mode, return enabled types list for ExportSimulationModal
  if (viewMode === 'basic') {
    const typeNames = ['tv', 'movie', 'ova', 'ona', 'special'];
    const enabled = typeNames.filter((type) => v[type] === true);
    return {
      mode: 'basic',
      enabled,
      rebroadcast: v.rebroadcast !== false,
      dubbed: v.dubbed !== false
    };
  }

  // For advanced mode, format the type data for both modals
  const typeNames = ['tv', 'movie', 'ova', 'ona', 'special'];
  const types = typeNames
    .filter((type) => v.advanced?.[type]?.enabled)
    .map((type) => {
      const cfg = v.advanced[type];
      if (cfg.random) {
        return {
          type: type, // Use 'type' instead of 'label' for ValidationModal
          kind: 'range',
          min: mode === 'percentage' ? (cfg.percentageMin || 0) : (cfg.countMin || 0),
          max: mode === 'percentage' ? (cfg.percentageMax || 0) : (cfg.countMax || 0)
        };
      }
      return {
        type: type, // Use 'type' instead of 'label' for ValidationModal
        kind: 'static',
        value: mode === 'percentage' ? (cfg.percentageValue || 0) : (cfg.countValue || 0)
      };
    });

  // Also create Object.entries format for ExportSimulationModal
  const typesObject = {};
  types.forEach((t) => {
    if (t.kind === 'range') {
      typesObject[t.type] = `${t.min}-${t.max}`;
    } else {
      typesObject[t.type] = t.value;
    }
  });

  return {
    mode,
    viewMode,
    types: typesObject // For ExportSimulationModal Object.entries iteration
  };
}

/**
 * Resolve anime type to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveAnimeType(node, context, rng) {
  const value = node.data.currentValue;

  // Server expects different formats based on mode
  // For basic mode: { mode: 'basic', enabled: ['tv', 'movie', ...] }
  // For advanced mode: { mode: 'advanced', types: {...}, typesRanges: {...}, total: ... }

  // Determine if this is basic or advanced mode
  const hasAdvancedFields = value.types || value.typesRanges || value.total;

  if (hasAdvancedFields) {
    // Advanced mode - return as-is with mode
    return {
      mode: value.mode || 'advanced',
      types: value.types || {},
      typesRanges: value.typesRanges || {},
      total: value.total || 0
    };
  }

  // Basic mode - convert boolean flags to enabled array
  const enabled = [];
  if (value.tv === true) enabled.push('tv');
  if (value.movie === true) enabled.push('movie');
  if (value.ova === true) enabled.push('ova');
  if (value.ona === true) enabled.push('ona');
  if (value.special === true) enabled.push('special');

  return {
    mode: 'basic',
    enabled: enabled,
    rebroadcast: value.rebroadcast !== false,
    dubbed: value.dubbed !== false
  };
}

/**
 * Anime Type Filter Definition
 */
export const animeTypeFilter = {
  id: 'anime-type',
  metadata: {
    title: 'Anime Type',
    icon: '📺',
    color: '#eab308',
    description: 'Filter by anime type (TV, Movie, OVA, etc.)',
    category: 'format',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: ANIME_TYPE_DEFAULT_SETTINGS,
  formType: 'complex-anime-type',
  validate: validateAnimeType,
  display: displayAnimeType,
  extract: extractAnimeType,
  resolve: resolveAnimeType
};

// Auto-register the filter
FilterRegistry.register(animeTypeFilter.id, animeTypeFilter);

