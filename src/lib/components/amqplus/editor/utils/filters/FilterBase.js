/**
 * Filter Base Utilities
 * Provides helper functions and default implementations for filter definitions
 * 
 * @module FilterBase
 */

import { ValidationContext, ValidationResult } from '../validation/validationFramework.js';
import {
  validateRange,
  validateAllocation,
  validateExecutionChance,
  validateEnabledTypes
} from '../validation/commonValidators.js';
import {
  detectMode,
  normalizeInheritedSongCount,
  getTargetTotal,
  formatEnabledTypes,
  buildAllocationEntries
} from '../display/commonDisplayUtils.js';
import { allocateToTotal } from '../mathUtils.js';

/**
 * Create a validation context from filter context
 * @param {any} value - Filter value
 * @param {Object} context - Context object
 * @returns {ValidationContext}
 */
export function createValidationContext(value, context) {
  // Mode is optional in validation context - validation can detect it
  const mode = value.mode || context.mode;

  return new ValidationContext({
    inheritedSongCount: context.inheritedSongCount,
    mode: mode, // May be undefined, which is OK for validation
    executionChance: context.executionChance,
    additionalData: context
  });
}

/**
 * Get the mode from value or context - requires mode to be set
 * @param {Object} value - Filter value
 * @param {Object} context - Context
 * @param {string[]} [modeFields] - Fields to check for mode detection
 * @returns {'percentage' | 'count'}
 * @throws {Error} If mode cannot be determined
 */
export function getMode(value, context, modeFields = []) {
  if (value.mode) return value.mode;
  if (context.mode) return context.mode;
  if (modeFields.length > 0) {
    const detected = detectMode(value, modeFields);
    if (detected) return detected;
  }
  throw new Error('mode is required but not found in value or context');
}

/**
 * Validate basic filter structure (common to most filters)
 * @param {Object} value - Filter value
 * @param {ValidationContext} context - Validation context
 * @param {Object} options - Validation options
 * @param {string[]} [options.requiredFields] - Required fields
 * @param {string[]} [options.typeFields] - Type fields (for enabled type validation)
 * @returns {ValidationResult}
 */
export function validateBasicStructure(value, context, { requiredFields = [], typeFields = [] } = {}) {
  const result = new ValidationResult();

  // Check required fields
  for (const field of requiredFields) {
    if (value[field] === undefined || value[field] === null) {
      result.addError(`Missing required field: ${field}`);
    }
  }

  // Validate execution chance if present in context
  if (context.executionChance !== undefined) {
    const execResult = validateExecutionChance(context.executionChance);
    result.merge(execResult);
  }

  // Validate enabled types if specified
  if (typeFields.length > 0) {
    const typesResult = validateEnabledTypes(value, typeFields, context);
    result.merge(typesResult);
  }

  return result;
}

/**
 * Create standard allocation-based validator
 * @param {string[]} typeFields - Type field names
 * @param {Object} [options] - Options
 * @param {string} [options.itemName] - Name for error messages
 * @returns {Function} Validation function
 */
export function createAllocationValidator(typeFields, { itemName = 'types' } = {}) {
  return (value, context) => {
    const validationContext = createValidationContext(value, context);
    const result = new ValidationResult();

    // Basic structure validation
    const structureResult = validateBasicStructure(value, validationContext, { typeFields });
    result.merge(structureResult);

    // Build allocation entries
    const mode = getMode(value, context, typeFields);
    const entries = buildAllocationEntries(value, typeFields, mode);

    if (entries.length > 0) {
      const target = validationContext.getTargetTotal();
      const allocResult = validateAllocation(entries, target, { itemName });
      result.merge(allocResult);
    }

    return result;
  };
}

/**
 * Create standard display function for allocation-based filters
 * @param {string[]} typeFields - Type field names
 * @param {Object} [options] - Options
 * @param {Object.<string, string>} [options.labelMap] - Custom label mapping
 * @param {string} [options.noneSelectedText] - Text when nothing selected
 * @returns {Function} Display function
 */
export function createAllocationDisplay(typeFields, { labelMap = {}, noneSelectedText = 'None selected' } = {}) {
  return (value, context) => {
    if (!value) return 'Not configured';

    const mode = getMode(value, context, typeFields);
    const targetTotal = getTargetTotal(mode, context.inheritedSongCount);

    return formatEnabledTypes(value, typeFields, { mode, targetTotal, labelMap });
  };
}

/**
 * Create standard resolution function for allocation-based filters
 * @param {string[]} typeFields - Type field names
 * @param {Object} [options] - Options
 * @returns {Function} Resolution function
 */
export function createAllocationResolver(typeFields, options = {}) {
  return (node, context, rng) => {
    const value = node.data.currentValue;
    const mode = getMode(value, context, typeFields);
    const targetTotal = getTargetTotal(mode, context.inheritedSongCount);

    // Build entries
    const entries = buildAllocationEntries(value, typeFields, mode);

    // Allocate
    const allocation = allocateToTotal(entries, targetTotal, rng);

    // Build result
    const resolved = {
      mode,
      total: context.inheritedSongCount
    };

    // Add resolved values
    for (const field of typeFields) {
      resolved[field] = allocation.get(field) || 0;
    }

    // Also store ranges for flexibility
    const ranges = {};
    for (const entry of entries) {
      if (entry.kind === 'range') {
        ranges[entry.label] = { min: entry.min, max: entry.max };
      } else {
        ranges[entry.label] = { min: entry.value, max: entry.value };
      }
    }
    resolved.ranges = ranges;

    return resolved;
  };
}

/**
 * Detect mode from value properties (helper for legacy code)
 * @param {Object} value - Filter value
 * @param {string[]} fields - Fields to check
 * @returns {'percentage' | 'count'}
 */
export function detectModeFromFields(value, fields) {
  return detectMode(value, fields);
}

/**
 * Require a value to be present, throw if missing
 * @param {any} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is null, undefined, or empty string
 */
function requireValue(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Required field "${fieldName}" is missing or empty`);
  }
  return value;
}

/**
 * Get value from field based on mode - requires fields to be present
 * @param {Object} fieldValue - Field value object
 * @param {'percentage' | 'count'} mode - Mode
 * @param {boolean} [isRange=false] - Whether getting range values
 * @returns {number | {min: number, max: number}}
 * @throws {Error} If required fields are missing
 */
export function getValueByMode(fieldValue, mode, isRange = false) {
  if (!fieldValue) {
    throw new Error('Field value is required');
  }

  const isRandom = fieldValue.random || fieldValue.randomRange;

  if (isRange && isRandom) {
    // Get range values - require min/max to be set
    if (mode === 'percentage') {
      const min = requireValue(
        fieldValue.minPercentage ?? fieldValue.percentageMin ?? fieldValue.min,
        `minPercentage (mode: ${mode}, isRange: ${isRange})`
      );
      const max = requireValue(
        fieldValue.maxPercentage ?? fieldValue.percentageMax ?? fieldValue.max,
        `maxPercentage (mode: ${mode}, isRange: ${isRange})`
      );
      return {
        min: Number(min),
        max: Number(max)
      };
    } else {
      const min = requireValue(
        fieldValue.minCount ?? fieldValue.countMin ?? fieldValue.min,
        `minCount (mode: ${mode}, isRange: ${isRange})`
      );
      const max = requireValue(
        fieldValue.maxCount ?? fieldValue.countMax ?? fieldValue.max,
        `maxCount (mode: ${mode}, isRange: ${isRange})`
      );
      return {
        min: Number(min),
        max: Number(max)
      };
    }
  } else {
    // Get static value - require value to be set
    if (mode === 'percentage') {
      const val = requireValue(
        fieldValue.percentageValue ?? fieldValue.percentage ?? fieldValue.value,
        `percentageValue (mode: ${mode}, isRange: ${isRange})`
      );
      return Number(val);
    } else {
      const val = requireValue(
        fieldValue.countValue ?? fieldValue.count ?? fieldValue.value,
        `countValue (mode: ${mode}, isRange: ${isRange})`
      );
      return Number(val);
    }
  }
}

/**
 * Build entry for allocation from field configuration - requires all fields to be present
 * @param {string} label - Entry label
 * @param {Object} fieldValue - Field value
 * @param {'percentage' | 'count'} mode - Mode
 * @returns {{kind: 'static' | 'range', label: string, value?: number, min?: number, max?: number}}
 * @throws {Error} If required fields are missing
 */
export function buildEntry(label, fieldValue, mode) {
  if (!fieldValue) {
    throw new Error(`Field value is required for entry "${label}"`);
  }

  const isRandom = fieldValue.random || fieldValue.randomRange;

  if (isRandom) {
    const range = getValueByMode(fieldValue, mode, true);
    if (typeof range === 'object' && range !== null && 'min' in range && 'max' in range) {
      return { kind: 'range', label, min: range.min, max: range.max };
    }
    throw new Error(`Invalid range configuration for entry "${label}"`);
  } else {
    const value = getValueByMode(fieldValue, mode, false);
    if (typeof value !== 'number') {
      throw new Error(`Invalid static value for entry "${label}": expected number, got ${typeof value}`);
    }
    return { kind: 'static', label, value };
  }
}

/**
 * Default extract function that just returns normalized data
 * @param {Object} value - Filter value
 * @param {Object} context - Context
 * @returns {Object}
 */
export function defaultExtract(value, context) {
  return {
    ...value,
    mode: getMode(value, context),
    total: context.inheritedSongCount
  };
}

/**
 * Normalize a numeric value (handle various input formats)
 * @param {any} value - Value to normalize
 * @param {number} [defaultValue=0] - Default if invalid
 * @returns {number}
 */
export function normalizeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * Check if a value represents a range
 * @param {any} value - Value to check
 * @returns {boolean}
 */
export function isRangeValue(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.kind === 'range' ||
    (value.min !== undefined && value.max !== undefined)
  );
}

/**
 * Check if a value represents a static value
 * @param {any} value - Value to check
 * @returns {boolean}
 */
export function isStaticValue(value) {
  if (typeof value === 'number') return true;
  if (!value || typeof value !== 'object') return false;
  return value.kind === 'static' || value.value !== undefined;
}

/**
 * Extract numeric value from various formats
 * @param {any} value - Value to extract
 * @param {number} [defaultValue=0] - Default if invalid
 * @returns {number}
 */
export function extractNumericValue(value, defaultValue = 0) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return defaultValue;

  if (value.value !== undefined) return normalizeNumber(value.value, defaultValue);
  if (value.staticValue !== undefined) return normalizeNumber(value.staticValue, defaultValue);

  return defaultValue;
}

