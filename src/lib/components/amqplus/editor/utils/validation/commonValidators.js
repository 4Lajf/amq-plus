/**
 * Common validation patterns for AMQ+ filter nodes
 * Provides reusable validators for range, sum, allocation, and mode consistency
 * 
 * @module commonValidators
 */

import {
  ValidationResult,
  ValidationContext,
  ValidationRule,
  createValidationRule,
  validationError,
  validationSuccess
} from './validationFramework.js';

/**
 * Validate a numeric range (min <= max, within bounds)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {Object} [options] - Validation options
 * @param {number} [options.minBound] - Minimum allowed value
 * @param {number} [options.maxBound] - Maximum allowed value
 * @param {string} [options.fieldName] - Field name for error messages
 * @returns {ValidationResult}
 */
export function validateRange(min, max, { minBound, maxBound, fieldName = 'Range' } = {}) {
  const result = new ValidationResult();

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    result.addError(`${fieldName} values must be valid numbers`);
    return result;
  }

  if (min > max) {
    result.addError(`${fieldName} minimum (${min}) cannot exceed maximum (${max})`);
  }

  if (minBound !== undefined && min < minBound) {
    result.addError(`${fieldName} minimum (${min}) is below allowed minimum (${minBound})`);
  }

  if (maxBound !== undefined && max > maxBound) {
    result.addError(`${fieldName} maximum (${max}) exceeds allowed maximum (${maxBound})`);
  }

  return result;
}

/**
 * Validate a single value is within bounds
 * @param {number} value - Value to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.minBound] - Minimum allowed value
 * @param {number} [options.maxBound] - Maximum allowed value
 * @param {string} [options.fieldName] - Field name for error messages
 * @returns {ValidationResult}
 */
export function validateValue(value, { minBound, maxBound, fieldName = 'Value' } = {}) {
  const result = new ValidationResult();

  if (!Number.isFinite(value)) {
    result.addError(`${fieldName} must be a valid number`);
    return result;
  }

  if (minBound !== undefined && value < minBound) {
    result.addError(`${fieldName} (${value}) is below allowed minimum (${minBound})`);
  }

  if (maxBound !== undefined && value > maxBound) {
    result.addError(`${fieldName} (${value}) exceeds allowed maximum (${maxBound})`);
  }

  return result;
}

/**
 * Validate that a sum equals a target value
 * @param {number} sum - Actual sum
 * @param {number} target - Target value
 * @param {Object} [options] - Validation options
 * @param {string} [options.itemName] - Name of items being summed
 * @param {number} [options.tolerance] - Allowed difference (default: 0.01)
 * @returns {ValidationResult}
 */
export function validateSum(sum, target, { itemName = 'values', tolerance = 0.01 } = {}) {
  const result = new ValidationResult();

  if (!Number.isFinite(sum) || !Number.isFinite(target)) {
    result.addError(`Invalid sum or target value`);
    return result;
  }

  const diff = Math.abs(sum - target);
  if (diff > tolerance) {
    result.addError(`${itemName} sum to ${sum} but must equal ${target}`);
  }

  return result;
}

/**
 * Validate allocation entries (static + ranges can reach target)
 * @param {Array<{kind: 'static' | 'range', value?: number, min?: number, max?: number}>} entries - Allocation entries
 * @param {number} target - Target total
 * @param {Object} [options] - Validation options
 * @param {string} [options.itemName] - Name of items being allocated
 * @returns {ValidationResult}
 */
export function validateAllocation(entries, target, { itemName = 'items' } = {}) {
  const result = new ValidationResult();

  if (!entries || entries.length === 0) {
    result.addError(`No ${itemName} configured`);
    return result;
  }

  let staticSum = 0;
  let rangeMinSum = 0;
  let rangeMaxSum = 0;
  let hasRandom = false;
  let hasStatic = false;

  for (const entry of entries) {
    const label = 'label' in entry ? entry.label : 'item';
    if (entry.kind === 'static') {
      hasStatic = true;
      const val = Number(entry.value ?? 0);
      if (!Number.isFinite(val) || val < 0) {
        result.addError(`Invalid static value for ${label}`);
        continue;
      }
      staticSum += val;
    } else if (entry.kind === 'range') {
      hasRandom = true;
      const min = Number(entry.min ?? 0);
      const max = Number(entry.max ?? 0);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
        result.addError(`Invalid range for ${label}`);
        continue;
      }
      rangeMinSum += min;
      rangeMaxSum += max;
    }
  }

  // Validate based on allocation pattern
  if (!hasRandom && hasStatic) {
    // All static - must sum to target exactly
    if (Math.abs(staticSum - target) > 0.01) {
      result.addError(`${itemName} total ${staticSum} must equal ${target}`);
    }
  } else if (hasRandom && hasStatic) {
    // Mixed - static + min must not exceed target
    if (staticSum + rangeMinSum > target) {
      result.addError(`${itemName} minimum values exceed target (${staticSum + rangeMinSum} > ${target})`);
    }
  } else if (hasRandom && !hasStatic) {
    // All random - must be able to cover target
    if (rangeMinSum > target) {
      result.addError(`${itemName} minimum values exceed target (${rangeMinSum} > ${target})`);
    }
    if (rangeMaxSum < target) {
      result.addError(`${itemName} maximum values cannot reach target (${rangeMaxSum} < ${target})`);
    }
  }

  return result;
}

/**
 * Validate mode consistency (all entries use same mode)
 * @param {Object} value - Filter value
 * @param {ValidationContext} context - Validation context
 * @param {string[]} fields - Field names to check for mode indicators
 * @returns {ValidationResult}
 */
export function validateModeConsistency(value, context, fields) {
  const result = new ValidationResult();

  // Detect mode from value or context
  let detectedMode = value.mode || context.mode;

  // If no explicit mode, try to infer from fields
  if (!detectedMode) {
    let hasPercentage = false;
    let hasCount = false;

    for (const field of fields) {
      const fieldValue = value[field];
      if (fieldValue && typeof fieldValue === 'object') {
        if (fieldValue.percentage !== undefined || fieldValue.percentageValue !== undefined) {
          hasPercentage = true;
        }
        if (fieldValue.count !== undefined || fieldValue.countValue !== undefined) {
          hasCount = true;
        }
      }
    }

    if (hasPercentage && hasCount) {
      result.addWarning('Mixed percentage and count values detected - using count mode');
    }
  }

  return result;
}

/**
 * Validate execution chance
 * @param {number | {kind: 'range', min?: number, max?: number}} executionChance - Execution chance
 * @returns {ValidationResult}
 */
export function validateExecutionChance(executionChance) {
  const result = new ValidationResult();

  if (executionChance == null) {
    return result; // No execution chance is valid
  }

  if (typeof executionChance === 'object') {
    const min = Number(executionChance.min ?? 0);
    const max = Number(executionChance.max ?? 100);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
      result.addError('Execution chance range must be between 0 and 100 and min ≤ max');
    }
  } else {
    const chance = Number(executionChance);
    if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
      result.addError('Execution chance must be between 0 and 100');
    }
  }

  return result;
}

/**
 * Create a range validation rule
 * @param {string} minField - Name of minimum field
 * @param {string} maxField - Name of maximum field
 * @param {Object} options - Validation options (passed to validateRange)
 * @returns {ValidationRule}
 */
export function createRangeValidator(minField, maxField, options = {}) {
  return createValidationRule(`validate-range-${minField}-${maxField}`, (value, context) => {
    const min = Number(value[minField]);
    const max = Number(value[maxField]);
    return validateRange(min, max, options);
  });
}

/**
 * Create a sum validation rule
 * @param {string[]} fields - Field names to sum
 * @param {Object} options - Validation options (passed to validateSum)
 * @returns {ValidationRule}
 */
export function createSumValidator(fields, options = {}) {
  return createValidationRule(`validate-sum-${fields.join('-')}`, (value, context) => {
    let sum = 0;
    for (const field of fields) {
      const val = Number(value[field] ?? 0);
      if (Number.isFinite(val)) {
        sum += val;
      }
    }
    const target = context.getTargetTotal();
    return validateSum(sum, target, options);
  });
}

/**
 * Validate enabled types have valid configurations
 * @param {Object} value - Filter value
 * @param {string[]} typeFields - Type field names (e.g., ['easy', 'medium', 'hard'])
 * @param {ValidationContext} context - Validation context
 * @returns {ValidationResult}
 */
export function validateEnabledTypes(value, typeFields, context) {
  const result = new ValidationResult();

  const enabledTypes = typeFields.filter((field) => value[field]?.enabled);

  if (enabledTypes.length === 0) {
    result.addError('No types enabled');
    return result;
  }

  // Validate each enabled type
  const mode = value.mode || context.mode;
  const target = context.getTargetTotal();

  for (const field of enabledTypes) {
    const typeValue = value[field];
    if (!typeValue) continue;

    if (typeValue.randomRange || typeValue.random) {
      // Validate range
      const minField = mode === 'percentage' ? 'minPercentage' : 'minCount';
      const maxField = mode === 'percentage' ? 'maxPercentage' : 'maxCount';
      const min = Number(typeValue[minField] ?? typeValue.min ?? 0);
      const max = Number(typeValue[maxField] ?? typeValue.max ?? target);

      const rangeResult = validateRange(min, max, {
        minBound: 0,
        maxBound: target,
        fieldName: field
      });
      result.merge(rangeResult);
    } else {
      // Validate static value
      const valueField = mode === 'percentage' ? 'percentageValue' : 'countValue';
      const val = Number(typeValue[valueField] ?? typeValue.value ?? 0);

      const valueResult = validateValue(val, {
        minBound: 0,
        maxBound: target,
        fieldName: field
      });
      result.merge(valueResult);
    }
  }

  return result;
}

/**
 * Validate vintage ranges
 * @param {Array<{from: {season: string, year: number}, to: {season: string, year: number}}>} ranges - Vintage ranges
 * @returns {ValidationResult}
 */
export function validateVintageRanges(ranges) {
  const result = new ValidationResult();
  const seasons = new Set(['Winter', 'Spring', 'Summer', 'Fall']);
  const seasonOrder = ['Winter', 'Spring', 'Summer', 'Fall'];

  if (!Array.isArray(ranges) || ranges.length === 0) {
    result.addWarning('No vintage ranges defined');
    return result;
  }

  for (const range of ranges) {
    const fromYear = Number(range?.from?.year);
    const toYear = Number(range?.to?.year);
    const fromSeason = range?.from?.season;
    const toSeason = range?.to?.season;

    if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) {
      result.addError('Invalid year in vintage range');
      continue;
    }

    if (fromYear < 1900 || toYear > 2100) {
      result.addError('Vintage years must be between 1900 and 2100');
    }

    if (!seasons.has(fromSeason) || !seasons.has(toSeason)) {
      result.addError('Invalid season (must be Winter, Spring, Summer, Fall)');
      continue;
    }

    // Check that from <= to
    if (fromYear > toYear) {
      result.addError('Vintage range "from" year cannot be after "to" year');
    } else if (fromYear === toYear) {
      const fromIdx = seasonOrder.indexOf(fromSeason);
      const toIdx = seasonOrder.indexOf(toSeason);
      if (fromIdx > toIdx) {
        result.addError('Vintage range "from" season cannot be after "to" season in same year');
      }
    }
  }

  return result;
}

/**
 * Validate genres/tags overlap (included vs excluded)
 * @param {Object} value - Filter value with stateByKey
 * @param {string} filterType - Filter type name ('genres' or 'tags')
 * @returns {ValidationResult}
 */
export function validateGenresTagsOverlap(value, filterType = 'items') {
  const result = new ValidationResult();
  const stateByKey = value.stateByKey || {};

  const included = new Set();
  const excluded = new Set();
  const optional = new Set();

  for (const [key, state] of Object.entries(stateByKey)) {
    if (state === 'include') included.add(key);
    else if (state === 'exclude') excluded.add(key);
    else if (state === 'optional') optional.add(key);
  }

  // Check for conflicts
  for (const item of included) {
    if (excluded.has(item)) {
      result.addError(`"${item}" is both included and excluded`);
    }
  }

  for (const item of optional) {
    if (excluded.has(item)) {
      result.addWarning(`"${item}" is optional and excluded; excluded will take precedence`);
    }
  }

  return result;
}

