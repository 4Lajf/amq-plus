/**
 * Filter statistics utilities for recording filter application results
 * 
 * @module lib/server/utils/filterStatistics
 */

/**
 * Create a filter statistics object
 * @param {string} name - Filter name
 * @param {number} before - Count before filtering
 * @param {number} after - Count after filtering
 * @param {Object} details - Additional filter-specific details
 * @returns {Object} Filter statistics object
 */
export function recordFilterStat(name, before, after, details = {}) {
  return {
    name,
    before,
    after,
    removed: before - after,
    details
  };
}

