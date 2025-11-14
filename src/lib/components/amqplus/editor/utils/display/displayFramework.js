/**
 * Display framework for AMQ+ filter nodes
 * Provides consistent formatting for display strings
 * 
 * @module displayFramework
 */

/**
 * Standard abbreviations for common terms
 */
export const ABBREVIATIONS = {
	// Song types
	openings: 'OP',
	endings: 'ED',
	inserts: 'IN',
	
	// Categories
	standard: 'STD',
	instrumental: 'INS',
	character: 'CHR',
	chanting: 'CHNT',
	
	// Anime types
	tv: 'TV',
	movie: 'Movie',
	ova: 'OVA',
	ona: 'ONA',
	special: 'Special',
	
	// Difficulty
	easy: 'Easy',
	medium: 'Medium',
	hard: 'Hard',
	
	// Modes
	percentage: '%',
	count: 'songs',
	
	// Selection
	random: 'R',
	watched: 'W'
};

/**
 * Display formatter class for consistent formatting
 */
export class DisplayFormatter {
	/** @type {number} */
	maxLength;
	
	/** @type {Object.<string, string>} */
	customAbbreviations;

	/**
	 * @param {Object} [options]
	 * @param {number} [options.maxLength] - Maximum display length (0 = no limit)
	 * @param {Object.<string, string>} [options.customAbbreviations] - Custom abbreviation overrides
	 */
	constructor({ maxLength = 0, customAbbreviations = {} } = {}) {
		this.maxLength = maxLength;
		this.customAbbreviations = { ...ABBREVIATIONS, ...customAbbreviations };
	}

	/**
	 * Format a display string with optional truncation
	 * @param {string} str - String to format
	 * @returns {string}
	 */
	format(str) {
		if (!str) return '';
		if (this.maxLength > 0 && str.length > this.maxLength) {
			return str.slice(0, this.maxLength - 1) + '…';
		}
		return str;
	}

	/**
	 * Get abbreviation for a term
	 * @param {string} term - Term to abbreviate
	 * @param {boolean} [fallbackToOriginal=true] - Return original if no abbreviation found
	 * @returns {string}
	 */
	abbreviate(term, fallbackToOriginal = true) {
		const abbrev = this.customAbbreviations[term?.toLowerCase()];
		return abbrev || (fallbackToOriginal ? term : '');
	}

	/**
	 * Format a range (min-max) or static value
	 * @param {number | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} value
	 * @param {Object} [options]
	 * @param {string} [options.unit] - Unit to append (e.g., '%', 'songs')
	 * @param {string} [options.separator] - Range separator (default: '-')
	 * @returns {string}
	 */
	formatValue(value, { unit = '', separator = '-' } = {}) {
		if (typeof value === 'number') {
			return `${value}${unit}`;
		}

		if (!value) return '0' + unit;

		// Handle range object
		if (value.kind === 'range' || (value.min !== undefined && value.max !== undefined)) {
			const min = value.min ?? 0;
			const max = value.max ?? 0;
			// Only show range if min !== max
			if (min === max) {
				return `${min}${unit}`;
			}
			return `${min}${separator}${max}${unit}`;
		}

		// Handle static object
		if (value.kind === 'static' || value.value !== undefined) {
			return `${value.value ?? 0}${unit}`;
		}

		return '0' + unit;
	}

	/**
	 * Format multiple items into a display string
	 * @param {Array<{label: string, value: any}>} items - Items to format
	 * @param {Object} [options]
	 * @param {string} [options.separator] - Item separator (default: ', ')
	 * @param {boolean} [options.abbreviateLabels] - Abbreviate labels (default: true)
	 * @param {string} [options.unit] - Unit for values
	 * @returns {string}
	 */
	formatItems(items, { separator = ', ', abbreviateLabels = true, unit = '' } = {}) {
		if (!items || items.length === 0) return '';

		const formatted = items.map((item) => {
			const label = abbreviateLabels ? this.abbreviate(item.label) : item.label;
			const value = this.formatValue(item.value, { unit });
			return `${label} ${value}`;
		});

		return this.format(formatted.join(separator));
	}

	/**
	 * Format a mode indicator
	 * @param {'percentage' | 'count'} mode
	 * @returns {string}
	 */
	formatMode(mode) {
		return this.abbreviate(mode, false) || mode;
	}

	/**
	 * Format song count display (handles range or static)
	 * @param {number | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} songCount
	 * @returns {string}
	 */
	formatSongCount(songCount) {
		if (typeof songCount === 'number') {
			return `${songCount} songs`;
		}

		if (!songCount) return '0 songs';

		if (songCount.kind === 'range' || (songCount.min !== undefined && songCount.max !== undefined)) {
			const min = songCount.min ?? 0;
			const max = songCount.max ?? 0;
			if (min === max) {
				return `${min} songs`;
			}
			return `${min}-${max} songs`;
		}

		if (songCount.kind === 'static' || songCount.value !== undefined) {
			return `${songCount.value ?? 0} songs`;
		}

		return '0 songs';
	}

	/**
	 * Format an allocation summary (e.g., "OP 40-60%, ED 30-40%, IN 10%")
	 * @param {Object.<string, any>} allocation - Allocation object (type -> value)
	 * @param {Object} [options]
	 * @param {string} [options.mode] - Display mode ('percentage' or 'count')
	 * @param {boolean} [options.showMode] - Include mode in display (default: false)
	 * @returns {string}
	 */
	formatAllocation(allocation, { mode = 'percentage', showMode = false } = {}) {
		if (!allocation || Object.keys(allocation).length === 0) {
			return 'None configured';
		}

		const unit = mode === 'percentage' ? '%' : '';
		const items = Object.entries(allocation).map(([key, value]) => ({
			label: key,
			value
		}));

		let result = this.formatItems(items, { unit });
		
		if (showMode && mode) {
			result += ` (${mode})`;
		}

		return result;
	}

	/**
	 * Format a count with label
	 * @param {number} count
	 * @param {string} itemName - Item name (will be pluralized if needed)
	 * @returns {string}
	 */
	formatCount(count, itemName) {
		const plural = count !== 1 ? 's' : '';
		return `${count} ${itemName}${plural}`;
	}
}

/**
 * Global default formatter instance
 */
export const defaultFormatter = new DisplayFormatter({ maxLength: 100 });

/**
 * Quick format functions using default formatter
 */

/**
 * Format a value (range or static)
 * @param {any} value
 * @param {Object} [options]
 * @returns {string}
 */
export function formatValue(value, options) {
	return defaultFormatter.formatValue(value, options);
}

/**
 * Format an allocation
 * @param {Object.<string, any>} allocation
 * @param {Object} [options]
 * @returns {string}
 */
export function formatAllocation(allocation, options) {
	return defaultFormatter.formatAllocation(allocation, options);
}

/**
 * Format multiple items
 * @param {Array<{label: string, value: any}>} items
 * @param {Object} [options]
 * @returns {string}
 */
export function formatItems(items, options) {
	return defaultFormatter.formatItems(items, options);
}

/**
 * Format song count
 * @param {any} songCount
 * @returns {string}
 */
export function formatSongCount(songCount) {
	return defaultFormatter.formatSongCount(songCount);
}

/**
 * Abbreviate a term
 * @param {string} term
 * @param {boolean} [fallbackToOriginal]
 * @returns {string}
 */
export function abbreviate(term, fallbackToOriginal) {
	return defaultFormatter.abbreviate(term, fallbackToOriginal);
}

/**
 * Format a count with label
 * @param {number} count
 * @param {string} itemName
 * @returns {string}
 */
export function formatCount(count, itemName) {
	return defaultFormatter.formatCount(count, itemName);
}

