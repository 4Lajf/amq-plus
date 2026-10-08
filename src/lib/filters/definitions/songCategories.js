/**
 * Song Categories Filter Definition
 * Filters by song category combinations (OP/ED/IN × Standard/Instrumental/Chanting/Character)
 * 
 * @module filters/definitions/songCategories
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { SONG_CATEGORIES_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { formatSongCategoriesSimple } from '$lib/utils/commonDisplayUtils.js';
import { resolveAdvancedQuotaSettings } from '../advancedQuotaSettings.js';

/**
 * Validate song categories configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateSongCategories(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  // Check if at least one category is enabled
  const rows = ['openings', 'endings', 'inserts'];
  const cols = ['standard', 'instrumental', 'chanting', 'character', 'noCategory'];

  let hasEnabled = false;
  for (const r of rows) {
    for (const c of cols) {
      if (v?.[r]?.[c] !== false) {
        hasEnabled = true;
        break;
      }
    }
    if (hasEnabled) break;
  }

  if (!hasEnabled) {
    result.addError('No song categories enabled');
  }

  return result;
}

/**
 * Display song categories configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displaySongCategories(value, context) {
  return formatSongCategoriesSimple(value);
}

/**
 * Extract song categories settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractSongCategories(value, context) {
  const v = value || {};
  const viewMode = v.viewMode || 'basic';
  const mode = v.mode || 'percentage';

  // For basic mode, return enabled structure for ExportSimulationModal
  if (viewMode === 'basic' || viewMode === 'simple') {
    const rows = ['openings', 'endings', 'inserts'];
    const cols = ['standard', 'instrumental', 'chanting', 'character', 'noCategory'];
    const enabled = {};

    rows.forEach((row) => {
      enabled[row] = {};
      cols.forEach((col) => {
        // Must match resolveSongCategories exactly, or the export/validation
        // modal shows a different set than generation will actually use:
        // categories default ON when absent, `noCategory` defaults OFF.
        enabled[row][col] =
          col === 'noCategory' ? v[row]?.[col] === true : v[row]?.[col] !== false;
      });
    });

    return {
      mode: 'basic',
      enabled,
      viewMode
    };
  }

  // For advanced mode, format into rows structure for validation modal
  const rows = ['openings', 'endings', 'inserts'];
  const cols = ['standard', 'instrumental', 'chanting', 'character', 'noCategory'];

  const formattedRows = rows.map((row) => {
    const categories = cols
      .filter((col) => v.advanced?.[row]?.[col]?.enabled)
      .map((col) => {
        const cfg = v.advanced[row][col];
        if (cfg.random) {
          return {
            col,
            kind: 'range',
            min: mode === 'percentage' ? (cfg.percentageMin || 0) : (cfg.countMin || 0),
            max: mode === 'percentage' ? (cfg.percentageMax || 0) : (cfg.countMax || 0)
          };
        }
        return {
          col,
          kind: 'static',
          value: mode === 'percentage' ? (cfg.percentageValue || 0) : (cfg.countValue || 0)
        };
      });

    return {
      row,
      categories
    };
  }).filter((r) => r.categories.length > 0);

  return {
    mode,
    viewMode,
    rows: formattedRows
  };
}

/**
 * Resolve song categories to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {Function} rng - Random number generator
 * @returns {Object}
 */
function resolveSongCategories(node, context, rng) {
  const value = node.data.currentValue;

  if (!value.viewMode) {
    throw new Error('viewMode is required for song-categories resolution');
  }
  if (!value.mode) {
    throw new Error('mode is required for song-categories resolution');
  }

  // Server expects different formats based on viewMode
  // For basic mode: { mode: 'basic', enabled: { openings: {...}, endings: {...}, inserts: {...} } }
  // For advanced mode: { mode: 'advanced', categories: {...}, categoriesRanges: {...}, total: ... }

  if (value.viewMode === 'basic' || value.viewMode === 'simple') {
    // Basic mode - return enabled structure
    const rows = ['openings', 'endings', 'inserts'];
    const cols = ['standard', 'instrumental', 'chanting', 'character', 'noCategory'];
    const enabled = {};

    rows.forEach((row) => {
      enabled[row] = {};
      cols.forEach((col) => {
        // The four real categories default to ON when the key is absent - that
        // is the long-standing behaviour and 180 production nodes predate the
        // fifth column entirely.
        //
        // `noCategory` ("Unspecified") is the exception and defaults to OFF.
        // B1 made metadata-less songs land there instead of nowhere; inheriting
        // `true` would have widened those 180 nodes plus every other node
        // without the key - a pool change nobody asked for. Absent means off, so
        // only a user who ticks the box gets those songs.
        enabled[row][col] =
          col === 'noCategory' ? value[row]?.[col] === true : value[row]?.[col] !== false;
      });
    });

    return {
      mode: 'basic',
      enabled
    };
  }

  if (value.advanced) {
    return {
      mode: value.mode,
      categories: Object.fromEntries(['openings', 'endings', 'inserts'].map(group =>
        [group, resolveAdvancedQuotaSettings(value.advanced[group], value.mode)])),
      total: context.inheritedSongCount ?? value.total ?? 20
    };
  }

  // Advanced mode - return categories/categoriesRanges structure
  // Convert flat structure to nested structure expected by server
  return {
    mode: value.mode || 'percentage',
    categories: value.categories || {
      openings: value.openings ?? {},
      endings: value.endings ?? {},
      inserts: value.inserts ?? {}
    },
    categoriesRanges: value.categoriesRanges || {},
    total: value.total || 0
  };
}

/**
 * Song Categories Filter Definition
 */
export const songCategoriesFilter = {
  id: 'song-categories',
  metadata: {
    title: 'Song Categories',
    icon: '🎼',
    color: '#db2777',
    description: 'Filter by song category (Standard, Instrumental, etc.)',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: SONG_CATEGORIES_DEFAULT_SETTINGS,
  formType: 'complex-song-categories',
  validate: validateSongCategories,
  display: displaySongCategories,
  extract: extractSongCategories,
  resolve: resolveSongCategories
};

// Auto-register the filter
FilterRegistry.register(songCategoriesFilter.id, songCategoriesFilter);

