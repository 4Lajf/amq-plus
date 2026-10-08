/**
 * Percentage and count calculation utilities for basket building
 * Handles conversion between percentage and count modes
 * 
 * @module lib/server/utils/percentageCalculator
 */

/**
 * Calculate count from percentage or count value based on mode
 * @param {number} value - Percentage (0-100) or count value
 * @param {'count'|'percentage'} mode - Allocation mode
 * @param {number} total - Total song count (used for percentage mode)
 * @returns {number} Calculated count
 */
export function calculateCountOrPercentage(value, mode, total) {
  if (mode === 'percentage') {
    return Math.round(total * (value || 0) / 100);
  }
  return value || 0;
}

/**
 * Calculate min/max range from settings object
 * Supports both range objects ({min, max}) and static values
 * @param {Object|number} rangeOrValue - Range object with min/max or static value
 * @param {'count'|'percentage'} mode - Allocation mode
 * @param {number} total - Total song count (used for percentage mode)
 * @returns {{min: number, max: number}} Object with min and max values
 */
export function calculateRangeFromSettings(rangeOrValue, mode, total) {
  // If it's a range object with min/max
  if (rangeOrValue && typeof rangeOrValue === 'object' && 'min' in rangeOrValue && 'max' in rangeOrValue) {
    return {
      min: calculateCountOrPercentage(rangeOrValue.min || 0, mode, total),
      max: calculateCountOrPercentage(rangeOrValue.max || 0, mode, total)
    };
  }
  
  // If it's a static value
  const value = typeof rangeOrValue === 'number' ? rangeOrValue : (rangeOrValue?.value ?? 0);
  const calculatedValue = calculateCountOrPercentage(value, mode, total);
  return {
    min: calculatedValue,
    max: calculatedValue
  };
}

