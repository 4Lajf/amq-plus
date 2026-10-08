/**
 * Validation framework for AMQ+ filter nodes
 * Provides composable validation rules and consistent error/warning format
 * 
 * @module validationFramework
 */

/**
 * Validation result class for consistent error/warning format
 */
export class ValidationResult {
  /** @type {string[]} */
  errors = [];

  /** @type {string[]} */
  warnings = [];

  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Add an error message
   * @param {string} message - Error message
   */
  addError(message) {
    this.errors.push(message);
  }

  /**
   * Add a warning message
   * @param {string} message - Warning message
   */
  addWarning(message) {
    this.warnings.push(message);
  }

  /**
   * Check if validation passed (no errors)
   * @returns {boolean}
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Check if there are any issues (errors or warnings)
   * @returns {boolean}
   */
  hasIssues() {
    return this.errors.length > 0 || this.warnings.length > 0;
  }

  /**
   * Merge another validation result into this one
   * @param {ValidationResult} other - Another validation result
   */
  merge(other) {
    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
  }

  /**
   * Get all messages (errors and warnings)
   * @returns {string[]}
   */
  getAllMessages() {
    return [...this.errors, ...this.warnings];
  }

  /**
   * Convert to array format for FilterNode compatibility
   * @returns {string[]}
   */
  toArray() {
    return this.errors;
  }
}

/**
 * Validation context for passing filter-specific data
 */
export class ValidationContext {
  /** @type {number | {min: number, max: number} | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} */
  inheritedSongCount;

  /** @type {'percentage' | 'count'} */
  mode;

  /** @type {number} */
  executionChance;

  /** @type {Object.<string, any>} */
  additionalData;

  /**
   * @param {Object} options
   * @param {number | {min: number, max: number} | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} [options.inheritedSongCount] - Inherited song count
   * @param {'percentage' | 'count'} [options.mode] - Allocation mode
   * @param {number} [options.executionChance] - Execution chance percentage
   * @param {Object.<string, any>} [options.additionalData] - Additional context data
   */
  constructor({ inheritedSongCount, mode, executionChance, additionalData = {} } = {}) {
    this.inheritedSongCount = inheritedSongCount;
    this.mode = mode;
    this.executionChance = executionChance;
    this.additionalData = additionalData;
  }

  /**
   * Get total songs as a number (max if range)
   * @returns {number}
   */
  getTotalSongs() {
    if (!this.inheritedSongCount) return 20; // default

    if (typeof this.inheritedSongCount === 'object') {
      // Handle both {min, max} and {kind: 'range', min, max} formats
      if ('kind' in this.inheritedSongCount && this.inheritedSongCount.kind === 'range') {
        return Number(this.inheritedSongCount.max ?? 20);
      }
      if ('kind' in this.inheritedSongCount && this.inheritedSongCount.kind === 'static') {
        return Number(this.inheritedSongCount.value ?? 20);
      }
      // Legacy format {min, max}
      if ('max' in this.inheritedSongCount) {
        return Number(this.inheritedSongCount.max ?? 20);
      }
      if ('value' in this.inheritedSongCount) {
        return Number(this.inheritedSongCount.value ?? 20);
      }
      return 20;
    }

    return Number(this.inheritedSongCount) || 20;
  }

  /**
   * Get the target total based on mode
   * @returns {number}
   */
  getTargetTotal() {
    if (this.mode === 'percentage') {
      return 100;
    }
    return this.getTotalSongs();
  }

  /**
   * Check if song count is a range
   * @returns {boolean}
   */
  isSongCountRange() {
    if (typeof this.inheritedSongCount !== 'object' || !this.inheritedSongCount) return false;
    return ('kind' in this.inheritedSongCount && this.inheritedSongCount.kind === 'range') ||
      ('min' in this.inheritedSongCount && 'max' in this.inheritedSongCount);
  }
}

/**
 * Base class for validation rules
 */
export class ValidationRule {
  /** @type {string} */
  name;

  /**
   * @param {string} name - Rule name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Validate value and return result
   * @param {any} value - Value to validate
   * @param {ValidationContext} context - Validation context
   * @returns {ValidationResult}
   */
  validate(value, context) {
    throw new Error('validate() must be implemented by subclass');
  }
}

/**
 * Composite validation rule that runs multiple rules
 */
export class CompositeValidationRule extends ValidationRule {
  /** @type {ValidationRule[]} */
  rules;

  /**
   * @param {string} name - Rule name
   * @param {ValidationRule[]} rules - Child rules
   */
  constructor(name, rules = []) {
    super(name);
    this.rules = rules;
  }

  /**
   * Add a rule to the composite
   * @param {ValidationRule} rule - Rule to add
   */
  addRule(rule) {
    this.rules.push(rule);
  }

  /**
   * Validate using all rules
   * @param {any} value - Value to validate
   * @param {ValidationContext} context - Validation context
   * @returns {ValidationResult}
   */
  validate(value, context) {
    const result = new ValidationResult();
    for (const rule of this.rules) {
      const ruleResult = rule.validate(value, context);
      result.merge(ruleResult);
    }
    return result;
  }
}

/**
 * Create a simple validation rule from a function
 * @param {string} name - Rule name
 * @param {(value: any, context: ValidationContext) => ValidationResult} fn - Validation function
 * @returns {ValidationRule}
 */
export function createValidationRule(name, fn) {
  return new (class extends ValidationRule {
    constructor() {
      super(name);
    }
    validate(value, context) {
      return fn(value, context);
    }
  })();
}

/**
 * Helper to create a ValidationResult with a single error
 * @param {string} error - Error message
 * @returns {ValidationResult}
 */
export function validationError(error) {
  const result = new ValidationResult();
  result.addError(error);
  return result;
}

/**
 * Helper to create a ValidationResult with a single warning
 * @param {string} warning - Warning message
 * @returns {ValidationResult}
 */
export function validationWarning(warning) {
  const result = new ValidationResult();
  result.addWarning(warning);
  return result;
}

/**
 * Helper to create a valid (empty) ValidationResult
 * @returns {ValidationResult}
 */
export function validationSuccess() {
  return new ValidationResult();
}

