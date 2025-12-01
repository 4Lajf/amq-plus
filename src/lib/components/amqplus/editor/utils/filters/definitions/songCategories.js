/**
 * Song Categories Filter Definition
 * Filters by song category combinations (OP/ED/IN × Standard/Instrumental/Chanting/Character)
 * 
 * @module filters/definitions/songCategories
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { SONG_CATEGORIES_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { formatSongCategoriesSimple } from '../../display/commonDisplayUtils.js';

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
  const cols = ['standard', 'instrumental', 'chanting', 'character'];

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
  if (viewMode === 'basic') {
    const rows = ['openings', 'endings', 'inserts'];
    const cols = ['standard', 'instrumental', 'chanting', 'character'];
    const enabled = {};
    
    rows.forEach((row) => {
      enabled[row] = {};
      cols.forEach((col) => {
        // In basic mode, enabled means !== false (default is true)
        enabled[row][col] = v[row]?.[col] !== false;
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
  const cols = ['standard', 'instrumental', 'chanting', 'character'];
  
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
  
  if (value.viewMode === 'basic') {
    // Basic mode - return enabled structure
    return {
      mode: 'basic',
      enabled: {
        openings: value.openings ?? {},
        endings: value.endings ?? {},
        inserts: value.inserts ?? {}
      }
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

