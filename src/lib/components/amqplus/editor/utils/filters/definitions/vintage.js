/**
 * Vintage Filter Definition
 * Filters songs by anime air date (season/year ranges)
 * 
 * @module filters/definitions/vintage
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { VINTAGE_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateVintageRanges, validateAllocation } from '../../validation/commonValidators.js';
import { formatVintageRange } from '../../display/commonDisplayUtils.js';
import { allocateToTotal } from '../../mathUtils.js';

/**
 * Validate vintage configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateVintage(value, context) {
  const result = new ValidationResult();
  const v = value || {};

  if (!v.ranges || v.ranges.length === 0) {
    result.addWarning('No vintage ranges defined');
    return result;
  }

  // Validate each range
  const vintageResult = validateVintageRanges(v.ranges);
  result.merge(vintageResult);

  // Validate allocation if mode is set
  const mode = v.mode || 'percentage';
  let totalSongs = 20;
  if (context.inheritedSongCount) {
    if (typeof context.inheritedSongCount === 'object') {
      totalSongs = Number(context.inheritedSongCount.max ?? context.inheritedSongCount.value ?? 20);
    } else {
      totalSongs = Number(context.inheritedSongCount) || 20;
    }
  }

  const maxValue = mode === 'percentage' ? 100 : totalSongs;

  // Check if useAdvanced ranges sum correctly
  let advancedTotal = 0;
  for (const range of v.ranges) {
    if (range.useAdvanced) {
      let val;
      if (mode === 'percentage') {
        val = Number(range.percentage || 0);
      } else {
        val = Number(range.count || 0);
      }
      if (!Number.isFinite(val) || val < 0) {
        result.addError('Advanced range value must be a non-negative number');
      }
      advancedTotal += val;
    }
  }

  if (advancedTotal > maxValue) {
    result.addError(`Advanced ranges total (${advancedTotal}) exceeds maximum (${maxValue})`);
  }

  return result;
}

/**
 * Display vintage configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displayVintage(value, context) {
  if (!value) {
    return '[ERROR: Filter value is missing]';
  }
  if (!value.ranges || value.ranges.length === 0) {
    return '[ERROR: No vintage ranges configured]';
  }

  if (value.ranges.length === 1) {
    return formatVintageRange(value.ranges[0]);
  }

  return `${value.ranges.length} vintage ranges`;
}

/**
 * Extract vintage settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractVintage(value, context) {
  const v = value || {};
  const mode = v.mode || 'percentage';
  const ranges = v.ranges || [];
  
  // Calculate advanced total and remaining allocation
  let advancedTotal = 0;
  const formattedRanges = ranges.map((r) => {
    const rangeValue = r.useAdvanced ? (mode === 'percentage' ? (r.percentage || 0) : (r.count || 0)) : 0;
    if (r.useAdvanced) {
      advancedTotal += rangeValue;
    }
    return {
      from: { year: r.from?.year || 1944, season: r.from?.season || 'Winter' },
      to: { year: r.to?.year || 2025, season: r.to?.season || 'Fall' },
      source: r.useAdvanced ? 'advanced' : 'default',
      value: rangeValue
    };
  });
  
  const targetTotal = mode === 'percentage' ? 100 : (typeof context.inheritedSongCount === 'object' ? (context.inheritedSongCount.max || 20) : (context.inheritedSongCount || 20));
  const remaining = Math.max(0, targetTotal - advancedTotal);
  const hasRandomRanges = ranges.some((r) => !r.useAdvanced);
  
  return {
    mode,
    advancedTotal,
    remaining,
    hasRandomRanges,
    ranges: formattedRanges
  };
}

/**
 * Resolve vintage to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {() => number} rng - Random number generator
 * @returns {Object}
 */
function resolveVintage(node, context, rng) {
  const value = node.data.currentValue;

  if (!context.inheritedSongCount) {
    throw new Error('inheritedSongCount is required in context for vintage resolution');
  }
  const inheritedSongCount = context.inheritedSongCount;

  if (!value.ranges || value.ranges.length === 0) {
    return {
      mode: 'all',
      ranges: []
    };
  }

  if (!value.mode) {
    throw new Error('mode is required for vintage resolution');
  }
  const mode = value.mode;
  const maxTotal = mode === 'percentage' ? 100 : inheritedSongCount;

  // Build entries for ranges (with extra properties for later use)
  /** @type {Array<import('../../mathUtils.js').AllocationEntry & {from?: any, to?: any}>} */
  const rangeEntries = [];
  let advancedTotal = 0;

  for (const range of value.ranges) {
    if (!range.from) {
      throw new Error('range.from is required for all vintage ranges');
    }
    if (!range.to) {
      throw new Error('range.to is required for all vintage ranges');
    }
    if (!range.from.season || !range.from.year) {
      throw new Error('range.from.season and range.from.year are required');
    }
    if (!range.to.season || !range.to.year) {
      throw new Error('range.to.season and range.to.year are required');
    }

    if (range.useAdvanced) {
      let val;
      if (mode === 'percentage') {
        val = range.percentage ?? range.value;
      } else {
        val = range.count ?? range.value;
      }
      if (val === undefined || val === null) {
        throw new Error(`Value is required for advanced vintage range (mode: ${mode})`);
      }
      const numVal = Number(val);
      advancedTotal += numVal;
      rangeEntries.push({
        label: `${range.from.season} ${range.from.year} - ${range.to.season} ${range.to.year}`,
        kind: /** @type {'static'} */ ('static'),
        value: numVal,
        from: range.from,
        to: range.to
      });
    } else {
      rangeEntries.push({
        label: `${range.from.season} ${range.from.year} - ${range.to.season} ${range.to.year}`,
        kind: /** @type {'range'} */ ('range'),
        min: 0,
        max: maxTotal - advancedTotal,
        from: range.from,
        to: range.to
      });
    }
  }

  // Allocate remaining to random ranges
  // Create allocation entries without extra properties for allocateToTotal
  /** @type {import('../../mathUtils.js').AllocationEntry[]} */
  const allocationEntries = rangeEntries.map(entry => {
    if (entry.kind === 'range') {
      return { label: entry.label, kind: 'range', min: entry.min, max: entry.max };
    } else {
      return { label: entry.label, kind: 'static', value: entry.value };
    }
  });
  const allocation = allocateToTotal(allocationEntries, maxTotal, rng);
  const resolvedRanges = rangeEntries.map((entry) => {
    const allocated = allocation.get(entry.label);
    if (allocated === undefined) {
      throw new Error(`Allocation failed for vintage range "${entry.label}"`);
    }
    const value = allocated;
    // Extract original range for flexibility
    let valueRange;
    if (entry.kind === 'range') {
      valueRange = { min: entry.min, max: entry.max };
    } else {
      // Static values have no flexibility
      valueRange = { min: entry.value, max: entry.value };
    }

    return {
      from: entry.from,
      to: entry.to,
      value,
      valueRange // Original range for flexibility
    };
  });

  // Add default random range if advanced ranges don't reach maximum
  const finalTotal = resolvedRanges.reduce((sum, range) => sum + range.value, 0);
  const remaining = maxTotal - finalTotal;

  if (remaining > 0) {
    console.log(
      `[SIMULATION] Adding default random range for remaining ${remaining}${mode === 'percentage' ? '%' : ' songs'}`
    );

    // Get current year and season for the default range
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentSeason =
      currentMonth >= 0 && currentMonth <= 2
        ? 'Winter'
        : currentMonth >= 3 && currentMonth <= 5
          ? 'Spring'
          : currentMonth >= 6 && currentMonth <= 8
            ? 'Summer'
            : 'Fall';

    // Add default range covering Winter 1944 to current season/year
    const defaultRange = {
      from: { season: 'Winter', year: 1944 },
      to: { season: currentSeason, year: currentYear },
      value: remaining,
      valueRange: { min: remaining, max: remaining } // Default ranges are fixed
    };

    resolvedRanges.push(defaultRange);
    console.log(
      `[SIMULATION] Added default range: Winter 1944 - ${currentSeason} ${currentYear} (${remaining}${mode === 'percentage' ? '%' : ' songs'} random)`
    );
  }

  // When mode is 'percentage', convert percentage values to actual counts
  if (mode === 'percentage') {
    const convertedRanges = resolvedRanges.map(range => {
      // Convert percentage to actual count based on inheritedSongCount
      const countValue = Math.round(inheritedSongCount * range.value / 100);

      // Convert valueRange from percentages to counts
      let countValueRange;
      if (range.valueRange) {
        countValueRange = {
          min: Math.round(inheritedSongCount * range.valueRange.min / 100),
          max: Math.round(inheritedSongCount * range.valueRange.max / 100)
        };
      } else {
        countValueRange = { min: countValue, max: countValue };
      }

      return {
        from: range.from,
        to: range.to,
        value: countValue,
        valueRange: countValueRange
      };
    });

    return {
      mode: 'advanced', // Change to advanced mode since we've converted percentages
      total: inheritedSongCount,
      ranges: convertedRanges
    };
  }

  return {
    mode: 'advanced',
    total: maxTotal,
    ranges: resolvedRanges
  };
}

/**
 * Vintage Filter Definition
 */
export const vintageFilter = {
  id: 'vintage',
  metadata: {
    title: 'Vintage',
    icon: '📅',
    color: '#9333ea',
    description: 'Filter songs by anime air date',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: VINTAGE_DEFAULT_SETTINGS,
  formType: 'complex-vintage',
  validate: validateVintage,
  display: displayVintage,
  extract: extractVintage,
  resolve: resolveVintage
};

// Auto-register the filter
FilterRegistry.register(vintageFilter.id, vintageFilter);

