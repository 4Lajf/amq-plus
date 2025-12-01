/**
 * Filter Registry for AMQ+ Editor
 * Central registry that stores all filter metadata and functions
 * 
 * @module FilterRegistry
 */

import { NODE_CATEGORIES } from '../nodeDefinitions.js';
import { ValidationResult } from '../validation/validationFramework.js';

/**
 * Filter definition structure
 * @typedef {Object} FilterDefinition
 * @property {string} id - Filter ID (e.g., 'song-difficulty')
 * @property {Object} metadata - Filter metadata
 * @property {string} metadata.title - Display title
 * @property {string} metadata.icon - Emoji icon
 * @property {string} metadata.color - Hex color code
 * @property {string} metadata.description - Description text
 * @property {string} metadata.category - Category for grouping (e.g., 'content', 'score', 'format')
 * @property {string} metadata.type - Node type (should be NODE_CATEGORIES.FILTER)
 * @property {Object} defaultSettings - Default settings structure
 * @property {string} formType - Form component type (e.g., 'complex-song-difficulty')
 * @property {Function} [validate] - Validation function: (value, context) => ValidationResult
 * @property {Function} [display] - Display function: (value, context) => string
 * @property {Function} [extract] - Extract function: (value, context) => extractedSettings
 * @property {Function} [resolve] - Resolution function: (node, context, rng) => resolvedSettings
 * @property {boolean} [deletable] - Whether node can be deleted (default: true)
 * @property {boolean} [unique] - Whether only one instance is allowed (default: false)
 */

/**
 * Filter Registry class for managing filter definitions
 */
class FilterRegistryClass {
  /**
   * Internal storage for filter definitions
   * @type {Map<string, FilterDefinition>}
   */
  #filters = new Map();

  /**
   * Cache for category lookups
   * @type {Map<string, FilterDefinition[]>}
   */
  #categoryCache = new Map();

  /**
   * Register a filter definition
   * @param {string} filterId - Filter ID
   * @param {FilterDefinition} filterDefinition - Filter definition
   * @throws {Error} If filter ID is already registered
   */
  register(filterId, filterDefinition) {
    if (this.#filters.has(filterId)) {
      console.warn(`Filter "${filterId}" is already registered. Overwriting...`);
    }

    // Validate filter definition
    if (!filterDefinition.id) {
      throw new Error(`Filter definition must have an 'id' property`);
    }

    if (filterDefinition.id !== filterId) {
      console.warn(
        `Filter ID mismatch: registered as "${filterId}" but definition has id "${filterDefinition.id}"`
      );
    }

    if (!filterDefinition.metadata) {
      throw new Error(`Filter "${filterId}" must have metadata`);
    }

    if (!filterDefinition.defaultSettings) {
      throw new Error(`Filter "${filterId}" must have defaultSettings`);
    }

    // Store the filter
    this.#filters.set(filterId, filterDefinition);

    // Clear category cache since we added a new filter
    this.#categoryCache.clear();
  }

  /**
   * Get a filter definition by ID
   * @param {string} filterId - Filter ID
   * @returns {FilterDefinition | undefined}
   */
  get(filterId) {
    return this.#filters.get(filterId);
  }

  /**
   * Check if a filter is registered
   * @param {string} filterId - Filter ID
   * @returns {boolean}
   */
  has(filterId) {
    return this.#filters.has(filterId);
  }

  /**
   * Get all registered filters
   * @returns {FilterDefinition[]}
   */
  getAll() {
    return Array.from(this.#filters.values());
  }

  /**
   * Get all filter IDs
   * @returns {string[]}
   */
  getAllIds() {
    return Array.from(this.#filters.keys());
  }

  /**
   * Get filters by category
   * @param {string} category - Category name
   * @returns {FilterDefinition[]}
   */
  getAllByCategory(category) {
    // Check cache first
    if (this.#categoryCache.has(category)) {
      return this.#categoryCache.get(category);
    }

    // Build result
    const result = this.getAll().filter((f) => f.metadata.category === category);

    // Cache result
    this.#categoryCache.set(category, result);

    return result;
  }

  /**
   * Get all unique categories
   * @returns {string[]}
   */
  getCategories() {
    const categories = new Set();
    for (const filter of this.#filters.values()) {
      if (filter.metadata.category) {
        categories.add(filter.metadata.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Unregister a filter
   * @param {string} filterId - Filter ID
   * @returns {boolean} True if filter was removed
   */
  unregister(filterId) {
    const result = this.#filters.delete(filterId);
    if (result) {
      this.#categoryCache.clear();
    }
    return result;
  }

  /**
   * Clear all registered filters
   */
  clear() {
    this.#filters.clear();
    this.#categoryCache.clear();
  }

  /**
   * Get count of registered filters
   * @returns {number}
   */
  get size() {
    return this.#filters.size;
  }

  /**
   * Validate a filter value using registered validator
   * @param {string} filterId - Filter ID
   * @param {any} value - Value to validate
   * @param {Object} context - Validation context
   * @returns {import('../validation/validationFramework.js').ValidationResult}
   */
  validate(filterId, value, context) {
    const filter = this.get(filterId);
    if (!filter) {
      throw new Error(`Filter "${filterId}" is not registered`);
    }

    if (!filter.validate) {
      // No validation function - return success
      return new ValidationResult();
    }

    return filter.validate(value, context);
  }

  /**
   * Get display string using registered display function
   * @param {string} filterId - Filter ID
   * @param {any} value - Value to display
   * @param {Object} context - Display context
   * @returns {string}
   */
  getDisplayString(filterId, value, context) {
    const filter = this.get(filterId);
    if (!filter) {
      return 'Unknown filter';
    }

    if (!filter.display) {
      return 'Configured';
    }

    return filter.display(value, context);
  }

  /**
   * Extract settings using registered extract function
   * @param {string} filterId - Filter ID
   * @param {any} value - Value to extract from
   * @param {Object} context - Extract context
   * @returns {any}
   */
  extract(filterId, value, context) {
    const filter = this.get(filterId);
    if (!filter) {
      return value;
    }

    if (!filter.extract) {
      return value;
    }

    return filter.extract(value, context);
  }

  /**
   * Resolve settings to static values using registered resolve function
   * @param {string} filterId - Filter ID
   * @param {any} node - Node instance
   * @param {Object} context - Resolution context
   * @param {Function} rng - Random number generator
   * @returns {any}
   */
  resolve(filterId, node, context, rng) {
    const filter = this.get(filterId);
    if (!filter) {
      return node.data.currentValue;
    }

    if (!filter.resolve) {
      return node.data.currentValue;
    }

    return filter.resolve(node, context, rng);
  }

  /**
   * Convert filter definitions to node definitions format
   * @returns {Object.<string, import('../nodeDefinitions.js').NodeDefinition>}
   */
  toNodeDefinitions() {
    /** @type {Object.<string, import('../nodeDefinitions.js').NodeDefinition>} */
    const definitions = {};

    for (const filter of this.#filters.values()) {
      definitions[filter.id] = {
        id: filter.id,
        type: NODE_CATEGORIES.FILTER,
        title: filter.metadata.title,
        icon: filter.metadata.icon,
        color: filter.metadata.color,
        description: filter.metadata.description,
        formType: filter.formType,
        defaultValue: filter.defaultSettings,
        deletable: filter.deletable ?? true,
        unique: filter.unique ?? false
      };
    }

    return definitions;
  }
}

/**
 * Singleton instance of FilterRegistry
 */
export const FilterRegistry = new FilterRegistryClass();

/**
 * Export class for testing
 */
export { FilterRegistryClass };

