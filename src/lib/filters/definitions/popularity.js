/**
 * Popularity Filter Definition
 * Filters songs by anime popularity rank.
 *
 * @module filters/definitions/popularity
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { POPULARITY_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { validateValue } from '$lib/utils/commonValidators.js';

/**
 * Validate popularity configuration
 * @param {Object} value - Filter value
 * @returns {ValidationResult}
 */
function validatePopularity(value) {
	const result = new ValidationResult();
	const v = value || {};
	const mode = v.mode === 'count' ? 'count' : 'percentage';

	if (mode === 'percentage') {
		const percentageValue = Number(v.percentageValue ?? 100);
		const percentageResult = validateValue(percentageValue, {
			minBound: 1,
			maxBound: 100,
			fieldName: 'Top percentage'
		});
		if (!percentageResult.isValid()) {
			result.merge(percentageResult);
		}
	} else {
		const countValue = Number(v.countValue ?? 500);
		const countResult = validateValue(countValue, {
			minBound: 1,
			fieldName: 'Top count'
		});
		if (!countResult.isValid()) {
			result.merge(countResult);
		}
	}

	return result;
}

/**
 * Display popularity configuration
 * @param {Object} value - Filter value
 * @returns {string}
 */
function displayPopularity(value) {
	const v = value || {};
	const mode = v.mode === 'count' ? 'count' : 'percentage';
	const reverseSuffix = v.reverse ? ' (reversed)' : '';

	if (mode === 'count') {
		const count = Number(v.countValue ?? 500);
		return `Top ${count} popularity${reverseSuffix}`;
	}

	const percentage = Number(v.percentageValue ?? 100);
	return `Top ${percentage}% popularity${reverseSuffix}`;
}

/**
 * Resolve settings to static values
 * @param {Object} node - Node instance
 * @returns {Object}
 */
function resolvePopularity(node) {
	const value = node.data.currentValue || {};
	const mode = value.mode === 'count' ? 'count' : 'percentage';

	return {
		mode,
		percentageValue: Number(value.percentageValue ?? 100),
		countValue: Number(value.countValue ?? 500),
		reverse: Boolean(value.reverse)
	};
}

/**
 * Popularity Filter Definition
 */
export const popularityFilter = {
	id: 'popularity',
	metadata: {
		title: 'Popularity',
		icon: '🔥',
		color: '#f59e0b',
		description: 'Pick top popular or top obscure anime',
		category: 'content',
		type: NODE_CATEGORIES.FILTER
	},
	defaultSettings: POPULARITY_DEFAULT_SETTINGS,
	formType: 'complex-popularity',
	validate: validatePopularity,
	display: displayPopularity,
	resolve: resolvePopularity
};

// Auto-register the filter
FilterRegistry.register(popularityFilter.id, popularityFilter);
