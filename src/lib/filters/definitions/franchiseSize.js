/**
 * Franchise Size Filter Definition
 * Filters songs by the number of anime entries in their franchise.
 *
 * @module filters/definitions/franchiseSize
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { FRANCHISE_SIZE_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { validateRange } from '$lib/utils/commonValidators.js';

/**
 * Validate franchise size configuration
 * @param {Object} value - Filter value
 * @returns {ValidationResult}
 */
function validateFranchiseSize(value) {
	const result = new ValidationResult();
	const v = value || {};
	const min = Number(v.minEntries ?? 1);
	const max = Number(v.maxEntries ?? 999);

	const rangeResult = validateRange(min, max, {
		minBound: 1,
		fieldName: 'Franchise size'
	});
	if (!rangeResult.isValid()) {
		result.merge(rangeResult);
	}

	return result;
}

/**
 * Display franchise size configuration
 * @param {Object} value - Filter value
 * @returns {string}
 */
function displayFranchiseSize(value) {
	const v = value || {};
	const min = Number(v.minEntries ?? 1);
	const max = Number(v.maxEntries ?? 999);

	if (min === 1 && max >= 999) return 'Any size';
	if (min === max) return `Exactly ${min} entries`;
	if (max >= 999) return `${min}+ entries`;
	if (min <= 1) return `Up to ${max} entries`;
	return `${min}–${max} entries`;
}

/**
 * Resolve settings to static values
 * @param {Object} node - Node instance
 * @returns {Object}
 */
function resolveFranchiseSize(node) {
	const value = node.data.currentValue || {};
	return {
		minEntries: Number(value.minEntries ?? 1),
		maxEntries: Number(value.maxEntries ?? 999)
	};
}

export const franchiseSizeFilter = {
	id: 'franchise-size',
	metadata: {
		title: 'Franchise Size',
		icon: '🔗',
		color: '#8b5cf6',
		description: 'Filter by number of anime entries in a franchise',
		category: 'content',
		type: NODE_CATEGORIES.FILTER
	},
	defaultSettings: FRANCHISE_SIZE_DEFAULT_SETTINGS,
	formType: 'complex-franchise-size',
	validate: validateFranchiseSize,
	display: displayFranchiseSize,
	resolve: resolveFranchiseSize
};

FilterRegistry.register(franchiseSizeFilter.id, franchiseSizeFilter);
