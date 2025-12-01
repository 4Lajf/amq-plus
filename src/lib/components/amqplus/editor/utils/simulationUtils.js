/**
 * Simulation utility functions for the AMQ+ Editor Export dialog.
 * Resolves all configuration ranges to static values for a simulated quiz instance.
 *
 * @module simulationUtils
 */

import { makeRng, randomInt, allocateToTotal, generateRandomSeed } from './mathUtils.js';
import { NODE_CATEGORIES } from './nodeDefinitions.js';
import { getDefaultSettingsForNodeType } from './defaultNodeSettings.js';

// Filter registry instance (initialized when filters/index.js is imported)
let _filterRegistryForSimulation = null;
export function setFilterRegistryForSimulation(registry) {
	_filterRegistryForSimulation = registry;
}
import {
	extractBasicSettingsDisplay,
	extractNumberOfSongsDisplay
} from './displayUtils.js';

/** @typedef {import('../../../../../types/types.js').DisplayValue} DisplayValue */
/** @typedef {import('../../../../../types/types.js').SongPercentageConfig} SongPercentageConfig */
/** @typedef {import('../../../../../types/types.js').ConflictResolutionConfig} ConflictResolutionConfig */
/** @typedef {import('../../../../../types/types.js').Route} Route */
/** @typedef {import('../../../../../types/types.js').NodeInstanceWrapper} NodeInstanceWrapper */

/**
 * Check if we're running in a browser environment
 * @returns {boolean} True if in browser, false if on server
 */
function isBrowser() {
	return typeof window !== 'undefined';
}

/**
 * Check if debug logging is enabled
 * @returns {boolean} True if debug logs should be shown
 */
function isDebugEnabled() {
	if (!isBrowser()) return false;
	try {
		// return localStorage.getItem('amqplus_simulation_debug') === 'true';
		return false
	} catch (e) {
		return false;
	}
}

/**
 * Log only in browser console when debug is enabled, not on server
 * @param {...any} args - Arguments to log
 */
function browserLog(...args) {
	if (isBrowser() && isDebugEnabled()) {
		console.log(...args);
	}
}

/**
 * Resolves a display value to a static number using RNG
 * @param {DisplayValue} displayValue
 * @param {() => number} rng
 * @returns {number}
 */
function resolveDisplayValueToStatic(displayValue, rng) {
	if (!displayValue) return 0;

	if (displayValue.kind === 'static') {
		return displayValue.value;
	}

	if (displayValue.kind === 'range') {
		return randomInt(rng, displayValue.min, displayValue.max);
	}

	if (displayValue.kind === 'random' && Array.isArray(displayValue.values)) {
		const index = randomInt(rng, 0, displayValue.values.length - 1);
		return displayValue.values[index];
	}

	return 0;
}

/**
 * Resolves song percentage configuration to static value
 * @param {SongPercentageConfig|null} songPercentage
 * @param {() => number} rng
 * @returns {number|null}
 */
function resolveSongPercentage(songPercentage, rng) {
	if (songPercentage === null || songPercentage === undefined) {
		return null;
	}

	// Must be an object with the new format
	if (typeof songPercentage === 'object' && songPercentage !== null) {
		if (songPercentage.random) {
			// Use random range
			return randomInt(rng, songPercentage.min ?? 0, songPercentage.max ?? 100);
		} else {
			// Use static value
			return songPercentage.value ?? null;
		}
	}

	return null;
}

/**
 * Selects one route from router based on weighted random selection
 * @param {NodeInstanceWrapper} routerNode
 * @param {() => number} rng
 * @returns {Route|null}
 */
function selectRoute(routerNode, rng) {
	if (!routerNode || !routerNode.data.currentValue?.routes) {
		return null;
	}

	const routes = routerNode.data.currentValue.routes.filter((r) => r.enabled && r.percentage > 0);
	if (routes.length === 0) return null;

	const totalPercentage = routes.reduce((sum, route) => sum + route.percentage, 0);
	if (totalPercentage <= 0) return null;

	const random = rng() * totalPercentage;
	let currentSum = 0;

	for (const route of routes) {
		currentSum += route.percentage;
		if (random <= currentSum) {
			return route;
		}
	}

	return routes[routes.length - 1];
}

/**
 * Resolves basic settings ranges to static values
 * Note: Sample point, guess time, and extra guess time are NOT resolved when ranges - they remain as range/static to be used by the server
 * @param {NodeInstanceWrapper & {data: import('./nodeDefinitions.js').BasicSettingsNodeData}} node
 * @param {() => number} rng
 * @returns {Object}
 */
function resolveBasicSettings(node, rng) {
	const displayValues = extractBasicSettingsDisplay(node.data.currentValue);

	return {
		guessTime: displayValues.guessTime.kind === 'range'
			? displayValues.guessTime
			: resolveDisplayValueToStatic(displayValues.guessTime, rng),
		extraGuessTime: displayValues.extraGuessTime.kind === 'range'
			? displayValues.extraGuessTime
			: resolveDisplayValueToStatic(displayValues.extraGuessTime, rng),
		samplePoint: displayValues.samplePoint, // Keep as-is (not resolved)
		playbackSpeed:
			displayValues.playbackSpeed.kind === 'random'
				? displayValues.playbackSpeed.values[
				randomInt(rng, 0, displayValues.playbackSpeed.values.length - 1)
				]
				: displayValues.playbackSpeed.value,
		duplicateShows: node.data.currentValue?.duplicateShows?.value ?? true // Default to true for backward compatibility
	};
}

/**
 * Checks if a node passes its execution chance roll
 * @param {NodeInstanceWrapper} node - Node to check execution chance for
 * @param {() => number} rng - Random number generator
 * @returns {boolean} Whether the node passes execution chance
 */
function checkExecutionChance(node, rng) {
	const executionChance = node.data?.executionChance;

	if (executionChance == null) {
		browserLog(
			`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}): No execution chance set, defaulting to 100%`
		);
		return true;
	}

	let chance;
	if (typeof executionChance === 'object' && executionChance.kind === 'range') {
		// Range-based execution chance
		const min = Number(executionChance.min) || 0;
		const max = Number(executionChance.max) || 100;
		chance = randomInt(rng, min, max);
		browserLog(
			`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}): Range execution chance ${min}-${max}%, rolled ${chance}%`
		);
	} else {
		// Static execution chance
		chance = Number(executionChance) || 100;
		browserLog(
			`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}): Static execution chance ${chance}%`
		);
	}

	const roll = rng() * 100;
	const passed = roll <= chance;
	browserLog(
		`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}): Rolled ${roll.toFixed(2)}% vs ${chance}% -> ${passed ? 'PASSED' : 'FAILED'}`
	);

	return passed;
}

/**
 * Conflict resolution strategies for nodes of the same type
 */
const CONFLICT_RESOLUTION_STRATEGIES = {
	MERGE_ADDITIVE: 'merge_additive', // Add values together
	MERGE_EXCLUSIVE: 'merge_exclusive', // Only one can be active
	MERGE_MAXIMUM: 'merge_maximum', // Take the maximum value
	MERGE_MINIMUM: 'merge_minimum', // Take the minimum value
	MERGE_AVERAGE: 'merge_average', // Take the average value
	MERGE_FIRST: 'merge_first', // Use the first node's settings
	MERGE_LAST: 'merge_last', // Use the last node's settings
	MERGE_RANDOM: 'merge_random', // Randomly choose one node's settings
	MERGE_GENRES_TAGS: 'merge_genres_tags', // Custom strategy for genres/tags with conflict resolution
	MERGE_SONG_CATEGORIES: 'merge_song_categories', // Custom strategy for song categories based on types
	MERGE_SCORE_RANGE: 'merge_score_range', // Custom strategy for score ranges with gap exclusion
	MERGE_SONG_DIFFICULTY: 'merge_song_difficulty', // Custom strategy for song difficulty with range merging
	MERGE_VINTAGE: 'merge_vintage', // Custom strategy for vintage with range merging and normalization
	MERGE_ANIME_TYPE: 'merge_anime_type', // Custom strategy for anime type with type-based merging
	MERGE_SONGS_AND_TYPES: 'merge_songs_and_types' // Custom strategy for songs-and-types with normalization
};

/**
 * Configuration for how different filter types should handle conflicts
 */
const CONFLICT_RESOLUTION_CONFIG = {
	'songs-and-types': {
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST, // Use first node's mode
		total: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST, // Use first node's total
		'types.openings': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES, // Custom strategy with normalization
		'types.endings': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'types.inserts': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'songSelection.random': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES, // Custom strategy with normalization
		'songSelection.watched': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES
	},
	vintage: {
		ranges: CONFLICT_RESOLUTION_STRATEGIES.MERGE_VINTAGE, // Custom vintage range merging and normalization
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	},
	'song-difficulty': {
		easy: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		medium: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		hard: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		ranges: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		viewMode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		total: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.easy': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.medium': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.hard': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY
	},
	'player-score': {
		min: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		max: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		disallowed: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		percentages: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE
	},
	'anime-score': {
		min: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		max: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		disallowed: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		percentages: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE
	},
	'anime-type': {
		tv: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		movie: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		ova: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		ona: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		special: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		viewMode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		advanced: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE
	},
	'song-categories': {
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		enabled: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_CATEGORIES
	},
	genres: {
		included: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		excluded: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		optional: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	},
	tags: {
		included: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		excluded: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		optional: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	}
};

/**
 * Detects conflicts between nodes of the same type
 * @param {Array} nodes - Array of nodes of the same type
 * @returns {Object} Conflict analysis result
 */
function detectConflicts(nodes) {
	if (nodes.length <= 1) {
		return { hasConflicts: false, conflicts: [] };
	}

	const conflicts = [];
	const firstNode = nodes[0];
	const definitionId = firstNode.data.id;

	browserLog(`[CONFLICT] Analyzing ${nodes.length} nodes of type '${definitionId}' for conflicts`);

	// Check for mode conflicts
	const modes = nodes.map((n) => n.settings?.mode).filter(Boolean);
	if (modes.length > 0 && new Set(modes).size > 1) {
		conflicts.push({
			type: 'mode_conflict',
			field: 'mode',
			values: modes,
			message: `Conflicting modes: ${modes.join(', ')}`
		});
	}

	// Check for total conflicts (for songs-and-types)
	if (definitionId === 'songs-and-types') {
		const totals = nodes.map((n) => n.settings?.total).filter(Boolean);
		if (totals.length > 0 && new Set(totals).size > 1) {
			conflicts.push({
				type: 'total_conflict',
				field: 'total',
				values: totals,
				message: `Conflicting totals: ${totals.join(', ')}`
			});
		}

		// Check for exclusive type conflicts
		const typeConflicts = [];
		const allTypes = ['openings', 'endings', 'inserts'];

		for (const type of allTypes) {
			const typeValues = nodes.map((n) => n.settings?.types?.[type]).filter((v) => v > 0);
			if (typeValues.length > 1) {
				typeConflicts.push({
					type: `${type}_conflict`,
					field: `types.${type}`,
					values: typeValues,
					message: `Multiple nodes set ${type} percentage: ${typeValues.join(', ')}`
				});
			}
		}

		conflicts.push(...typeConflicts);
	}

	return {
		hasConflicts: conflicts.length > 0,
		conflicts,
		nodeCount: nodes.length
	};
}

/**
 * Resolves conflicts between nodes of the same type
 * @param {Array} nodes - Array of nodes of the same type
 * @param {() => number} rng - Random number generator
 * @param {number} inheritedSongCount - Total songs from number of songs node
 * @returns {Object} Resolved settings object
 */
function resolveConflicts(nodes, rng, inheritedSongCount = 20) {
	if (nodes.length === 0) {
		return {};
	}

	if (nodes.length === 1) {
		return nodes[0].settings || {};
	}

	const definitionId = nodes[0].data.id;
	const config = CONFLICT_RESOLUTION_CONFIG[definitionId] || {};
	const conflictAnalysis = detectConflicts(nodes);

	browserLog(`[CONFLICT] Resolving conflicts for ${nodes.length} nodes of type '${definitionId}'`);

	if (conflictAnalysis.hasConflicts) {
		browserLog(
			`[CONFLICT] Found ${conflictAnalysis.conflicts.length} conflicts:`,
			conflictAnalysis.conflicts
		);
	}

	const resolved = {};

	// Get all unique field paths from all nodes
	const allFields = new Set();
	nodes.forEach((node) => {
		if (node.settings) {
			const flattenObject = (obj, prefix = '') => {
				Object.keys(obj).forEach((key) => {
					const fullKey = prefix ? `${prefix}.${key}` : key;
					if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
						flattenObject(obj[key], fullKey);
					} else {
						allFields.add(fullKey);
					}
				});
			};
			flattenObject(node.settings);
		}
	});

	// Resolve each field
	for (const fieldPath of allFields) {
		const strategy = getFieldStrategy(fieldPath, config);
		const values = nodes
			.map((node) => getNestedValue(node.settings, fieldPath))
			.filter((v) => v !== undefined);

		if (values.length === 0) continue;

		const resolvedValue = applyResolutionStrategy(strategy, values, fieldPath, rng);
		setNestedValue(resolved, fieldPath, resolvedValue);

		browserLog(
			`[CONFLICT] Field '${fieldPath}': ${values.length} values -> ${JSON.stringify(resolvedValue)} (strategy: ${strategy})`
		);
	}

	// Post-resolution normalization for specific filter types
	if (definitionId === 'genres' || definitionId === 'tags') {
		normalizeGenresTags(resolved, rng);
	} else if (definitionId === 'song-categories') {
		normalizeSongCategories(resolved, nodes, rng);
	} else if (definitionId === 'anime-score' || definitionId === 'player-score') {
		normalizeScoreRange(resolved, nodes, rng);
	} else if (definitionId === 'song-difficulty') {
		normalizeSongDifficulty(resolved, nodes, rng, inheritedSongCount);
	} else if (definitionId === 'vintage') {
		normalizeVintage(resolved, nodes, rng, inheritedSongCount);
	} else if (definitionId === 'anime-type') {
		normalizeAnimeType(resolved, nodes, rng);
	} else if (definitionId === 'songs-and-types') {
		normalizeSongsAndTypesCount(resolved, nodes, rng, inheritedSongCount);
	}

	return resolved;
}

/**
 * Gets the resolution strategy for a specific field path
 * @param {string} fieldPath - Dot-separated field path
 * @param {ConflictResolutionConfig} config - Conflict resolution configuration
 * @returns {string} Resolution strategy
 */
function getFieldStrategy(fieldPath, config) {
	// Direct field match
	if (config[fieldPath]) {
		return config[fieldPath];
	}

	// Check for nested field matches
	const parts = fieldPath.split('.');
	for (let i = 1; i <= parts.length; i++) {
		const partialPath = parts.slice(0, i).join('.');
		if (config[partialPath]) {
			return config[partialPath];
		}
	}

	// Default strategy based on field type
	if (fieldPath.includes('min')) return CONFLICT_RESOLUTION_STRATEGIES.MERGE_MAXIMUM;
	if (fieldPath.includes('max')) return CONFLICT_RESOLUTION_STRATEGIES.MERGE_MINIMUM;
	if (
		fieldPath.includes('disallowed') ||
		fieldPath.includes('included') ||
		fieldPath.includes('excluded') ||
		fieldPath.includes('optional')
	) {
		return CONFLICT_RESOLUTION_STRATEGIES.MERGE_ADDITIVE;
	}

	return CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST;
}

/**
 * Custom merge strategy for genres and tags that handles conflicts by moving conflicting items to optional
 * @param {Array} values - Array of arrays to merge
 * @param {string} fieldPath - Field path for context (e.g., 'included', 'excluded', 'optional')
 * @returns {Array} Merged array with conflicts resolved
 */
function mergeGenresTagsStrategy(values, fieldPath) {
	if (!Array.isArray(values[0])) {
		return values[0];
	}

	// For individual field merging (included, excluded, optional), just merge arrays normally
	if (fieldPath === 'included' || fieldPath === 'excluded' || fieldPath === 'optional') {
		return [...new Set(values.flat())];
	}

	// This function is called for each field individually, so we don't need to handle cross-field conflicts here
	// The cross-field conflict resolution will be handled in the post-resolution normalization
	return [...new Set(values.flat())];
}

/**
 * Custom merge strategy for song categories that handles conflicts based on types
 * @param {Array} values - Array of values to merge
 * @param {string} fieldPath - Field path for context (e.g., 'openings', 'endings', 'inserts')
 * @returns {*} Merged value based on types
 */
function mergeSongCategoriesStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	// Handle boolean fields with OR logic (false + true = true)
	if (typeof values[0] === 'boolean') {
		return values.some((v) => v === true);
	}

	// Handle arrays
	if (Array.isArray(values[0])) {
		return [...new Set(values.flat())];
	}

	// Handle numbers with additive logic
	if (typeof values[0] === 'number') {
		return values.reduce((sum, val) => sum + val, 0);
	}

	// For other types, use first value
	return values[0];
}

/**
 * Custom merge strategy for score ranges that handles conflicts with gap exclusion
 * @param {Array} values - Array of values to merge
 * @param {string} fieldPath - Field path for context (e.g., 'min', 'max', 'percentages')
 * @returns {*} Merged value based on score range logic
 */
function mergeScoreRangeStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	// Handle arrays (disallowed scores)
	if (Array.isArray(values[0])) {
		return [...new Set(values.flat())];
	}

	// Handle numbers (min/max) - use first value, normalization will handle the logic
	if (typeof values[0] === 'number') {
		return values[0];
	}

	// Handle objects (percentages) - merge additively, normalization will handle the logic
	if (typeof values[0] === 'object' && values[0] !== null) {
		const merged = {};
		values.forEach((obj) => {
			Object.keys(obj).forEach((key) => {
				if (typeof obj[key] === 'number') {
					merged[key] = (merged[key] || 0) + obj[key];
				} else if (Array.isArray(obj[key])) {
					merged[key] = [...new Set([...(merged[key] || []), ...obj[key]])];
				} else {
					merged[key] = obj[key];
				}
			});
		});
		return merged;
	}

	// For other types, use first value
	return values[0];
}

/**
 * Custom merge strategy for song difficulty that handles all settings additively
 * @param {Array} values - Array of values to merge
 * @param {string} fieldPath - Field path for context
 * @returns {*} Merged value
 */
function mergeSongDifficultyStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	// Handle arrays (ranges)
	if (Array.isArray(values[0])) {
		return [...new Set(values.flat())];
	}

	// Handle numbers (counts, percentages) - sum them
	if (typeof values[0] === 'number') {
		return values.reduce((sum, val) => sum + val, 0);
	}

	// Handle booleans - use OR logic (false + true = true)
	if (typeof values[0] === 'boolean') {
		return values.some((v) => v === true);
	}

	// Handle strings (mode, viewMode) - use first value
	if (typeof values[0] === 'string') {
		return values[0];
	}

	// Handle objects (difficulty settings) - merge additively
	if (typeof values[0] === 'object' && values[0] !== null) {
		const merged = {};
		values.forEach((obj) => {
			Object.keys(obj).forEach((key) => {
				if (typeof obj[key] === 'number') {
					merged[key] = (merged[key] || 0) + obj[key];
				} else if (typeof obj[key] === 'boolean') {
					merged[key] = merged[key] || obj[key]; // OR logic for booleans
				} else {
					merged[key] = obj[key];
				}
			});
		});
		return merged;
	}

	// Default to first value
	return values[0];
}

/**
 * Custom merge strategy for vintage that handles range merging and normalization
 * @param {Array} values - Array of range arrays to merge
 * @param {string} fieldPath - Field path for context
 * @returns {Array} Merged ranges
 */
function mergeVintageStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	if (fieldPath === 'ranges') {
		// Flatten all ranges from all nodes
		const allRanges = values.flat();
		return allRanges;
	}

	// Default: return first value
	return values[0];
}

/**
 * Custom merge strategy for anime type that handles boolean fields with OR logic
 * @param {Array} values - Array of values to merge
 * @param {string} fieldPath - Field path for context
 * @returns {*} Merged value
 */
function mergeAnimeTypeStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	// Handle boolean fields (tv, movie, ova, ona, special, rebroadcast, dubbed) with OR logic
	if (
		fieldPath === 'tv' ||
		fieldPath === 'movie' ||
		fieldPath === 'ova' ||
		fieldPath === 'ona' ||
		fieldPath === 'special' ||
		fieldPath === 'rebroadcast' ||
		fieldPath === 'dubbed'
	) {
		return values.some((v) => v === true);
	}

	// Handle advanced object merging
	if (fieldPath === 'advanced') {
		const merged = {};
		values.forEach((obj) => {
			if (obj && typeof obj === 'object') {
				Object.keys(obj).forEach((key) => {
					if (typeof obj[key] === 'object' && obj[key] !== null) {
						// Merge nested objects (e.g., advanced.tv, advanced.movie)
						if (!merged[key]) merged[key] = {};
						Object.keys(obj[key]).forEach((nestedKey) => {
							if (typeof obj[key][nestedKey] === 'boolean') {
								// Boolean fields use OR logic
								merged[key][nestedKey] = merged[key][nestedKey] || obj[key][nestedKey];
							} else if (typeof obj[key][nestedKey] === 'number') {
								// Numbers are summed
								merged[key][nestedKey] = (merged[key][nestedKey] || 0) + obj[key][nestedKey];
							} else {
								// Other types use first value
								merged[key][nestedKey] = obj[key][nestedKey];
							}
						});
					} else {
						// Direct properties
						if (typeof obj[key] === 'boolean') {
							merged[key] = merged[key] || obj[key];
						} else if (typeof obj[key] === 'number') {
							merged[key] = (merged[key] || 0) + obj[key];
						} else {
							merged[key] = obj[key];
						}
					}
				});
			}
		});
		return merged;
	}

	// Handle arrays by flattening and deduplicating
	if (Array.isArray(values[0])) {
		return [...new Set(values.flat())];
	}

	// Handle numbers by summing
	if (typeof values[0] === 'number') {
		return values.reduce((sum, val) => sum + val, 0);
	}

	// Handle booleans with OR logic
	if (typeof values[0] === 'boolean') {
		return values.some((v) => v === true);
	}

	// Default: return first value
	return values[0];
}

/**
 * Custom merge strategy for songs-and-types that handles normalization
 * @param {Array} values - Array of values to merge
 * @param {string} fieldPath - Field path for context
 * @returns {*} Merged value
 */
function mergeSongsAndTypesStrategy(values, fieldPath) {
	if (values.length === 0) return undefined;
	if (values.length === 1) return values[0];

	// Handle numbers by summing (normalization will be applied later)
	if (typeof values[0] === 'number') {
		return values.reduce((sum, val) => sum + val, 0);
	}

	// Handle arrays by flattening and deduplicating
	if (Array.isArray(values[0])) {
		return [...new Set(values.flat())];
	}

	// Handle booleans with OR logic
	if (typeof values[0] === 'boolean') {
		return values.some((v) => v === true);
	}

	// Default: return first value
	return values[0];
}

/**
 * Applies a resolution strategy to a set of values
 * @param {string} strategy - Resolution strategy
 * @param {Array} values - Array of values to resolve
 * @param {string} fieldPath - Field path for context
 * @param {() => number} rng - Random number generator
 * @returns {*} Resolved value
 */
function applyResolutionStrategy(strategy, values, fieldPath, rng) {
	switch (strategy) {
		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_ADDITIVE:
			if (Array.isArray(values[0])) {
				// Merge arrays
				return [...new Set(values.flat())];
			}
			if (typeof values[0] === 'number') {
				// Sum numbers with normalization for percentages
				const sum = values.reduce((sum, val) => sum + val, 0);
				return normalizePercentage(sum, fieldPath);
			}
			if (typeof values[0] === 'object' && values[0] !== null) {
				// Merge objects additively with normalization
				const merged = {};
				values.forEach((obj) => {
					Object.keys(obj).forEach((key) => {
						if (typeof obj[key] === 'number') {
							const currentSum = (merged[key] || 0) + obj[key];
							merged[key] = normalizePercentage(currentSum, `${fieldPath}.${key}`);
						} else if (Array.isArray(obj[key])) {
							merged[key] = [...new Set([...(merged[key] || []), ...obj[key]])];
						} else {
							merged[key] = obj[key];
						}
					});
				});
				return merged;
			}
			return values[0];

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_EXCLUSIVE:
			// For exclusive fields, randomly choose one
			return values[randomInt(rng, 0, values.length - 1)];

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_MAXIMUM:
			return Math.max(...values);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_MINIMUM:
			return Math.min(...values);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_AVERAGE:
			return values.reduce((sum, val) => sum + val, 0) / values.length;

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST:
			return values[0];

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_LAST:
			return values[values.length - 1];

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_RANDOM:
			return values[randomInt(rng, 0, values.length - 1)];

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS:
			return mergeGenresTagsStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_CATEGORIES:
			return mergeSongCategoriesStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE:
			return mergeScoreRangeStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY:
			return mergeSongDifficultyStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_VINTAGE:
			return mergeVintageStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE:
			return mergeAnimeTypeStrategy(values, fieldPath);

		case CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES:
			return mergeSongsAndTypesStrategy(values, fieldPath);

		default:
			return values[0];
	}
}

/**
 * Gets a nested value from an object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot-separated path
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
	return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Sets a nested value in an object using dot notation
 * @param {Object} obj - Object to set value in
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 */
function setNestedValue(obj, path, value) {
	const keys = path.split('.');
	const lastKey = keys.pop();
	const target = keys.reduce((current, key) => {
		if (!current[key]) current[key] = {};
		return current[key];
	}, obj);
	target[lastKey] = value;
}

/**
 * Normalizes percentage values to stay within valid ranges
 * @param {number} value - Value to normalize
 * @param {string} fieldPath - Field path for context
 * @returns {number} Normalized value
 */
function normalizePercentage(value, fieldPath) {
	// Check if this is a percentage field
	const isPercentageField =
		fieldPath.includes('percentage') ||
		fieldPath.includes('songSelection') ||
		fieldPath.includes('types') ||
		fieldPath.includes('easy') ||
		fieldPath.includes('medium') ||
		fieldPath.includes('hard');

	if (isPercentageField) {
		// For percentage fields, cap at 100%
		if (value > 100) {
			browserLog(
				`[CONFLICT] Normalizing percentage value ${value}% to 100% for field '${fieldPath}'`
			);
			return 100;
		}
		// For negative values, set to 0
		if (value < 0) {
			browserLog(
				`[CONFLICT] Normalizing negative percentage value ${value}% to 0% for field '${fieldPath}'`
			);
			return 0;
		}
	}

	return value;
}

/**
 * Normalizes songs-and-types settings to ensure valid percentages
 * @param {Object} resolved - Resolved settings object
 * @param {() => number} rng - Random number generator
 */
function normalizeSongsAndTypes(resolved, rng) {
	if (!resolved.types) return;

	// Check if song types sum to more than 100%
	const typeValues = Object.values(resolved.types).filter((v) => typeof v === 'number');
	const totalTypes = typeValues.reduce((sum, val) => sum + val, 0);

	if (totalTypes > 100) {
		browserLog(`[CONFLICT] Song types sum to ${totalTypes}%, normalizing to 100%`);

		// Normalize each type proportionally
		Object.keys(resolved.types).forEach((key) => {
			if (typeof resolved.types[key] === 'number') {
				resolved.types[key] = Math.round((resolved.types[key] / totalTypes) * 100);
			}
		});

		browserLog(`[CONFLICT] Normalized song types:`, resolved.types);
	}

	// Ensure songSelection percentages don't exceed 100%
	if (resolved.songSelection) {
		Object.keys(resolved.songSelection).forEach((key) => {
			if (typeof resolved.songSelection[key] === 'number' && resolved.songSelection[key] > 100) {
				browserLog(
					`[CONFLICT] Normalizing songSelection.${key} from ${resolved.songSelection[key]}% to 100%`
				);
				resolved.songSelection[key] = 100;
			}
		});
	}
}

/**
 * Normalizes genres/tags settings to resolve conflicts between included/excluded/optional
 * @param {Object} resolved - Resolved settings object
 * @param {() => number} rng - Random number generator
 */
function normalizeGenresTags(resolved, rng) {
	if (!resolved.included || !resolved.excluded || !resolved.optional) {
		return;
	}

	// Find items that appear in both included and excluded (conflicts)
	const conflicts = resolved.included.filter((item) => resolved.excluded.includes(item));

	if (conflicts.length > 0) {
		browserLog(`[CONFLICT] Found ${conflicts.length} conflicts in genres/tags:`, conflicts);

		// Move conflicting items to optional
		conflicts.forEach((conflict) => {
			resolved.included = resolved.included.filter((item) => item !== conflict);
			resolved.excluded = resolved.excluded.filter((item) => item !== conflict);

			// Add to optional if not already there
			if (!resolved.optional.includes(conflict)) {
				resolved.optional.push(conflict);
			}
		});

		browserLog(`[CONFLICT] Moved conflicts to optional. New state:`, {
			included: resolved.included,
			excluded: resolved.excluded,
			optional: resolved.optional
		});
	}
}

/**
 * Normalizes song categories settings based on types (simple vs advanced)
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of all nodes for type checking
 * @param {() => number} rng - Random number generator
 */
function normalizeSongCategories(resolved, nodes, rng) {
	// Find all song categories nodes that were involved in the conflict
	const songCategoriesNodes = nodes.filter((n) => n.data.id === 'song-categories');

	if (songCategoriesNodes.length <= 1) {
		return; // No conflicts to resolve
	}

	// Check if all nodes have the same type (simple vs advanced)
	const types = songCategoriesNodes.map((node) => {
		const value = node.data.currentValue;
		return value.viewMode !== 'advanced' || !value.advanced ? 'simple' : 'advanced';
	});

	const allSameType = types.every((type) => type === types[0]);

	browserLog(
		`[CONFLICT] Song categories nodes types: ${types.join(', ')} (all same: ${allSameType})`
	);

	if (allSameType) {
		// All nodes are the same type - use merge strategy (already handled by MERGE_ADDITIVE)
		browserLog(`[CONFLICT] All song categories nodes are ${types[0]} type - using merge strategy`);
		// The merge strategy is already applied, no additional normalization needed
	} else {
		// Different types - use merge first strategy
		browserLog(
			`[CONFLICT] Song categories nodes have different types - using merge first strategy`
		);

		// Override resolved settings with the first node's settings
		const firstNode = songCategoriesNodes[0];
		const firstNodeSettings = firstNode.settings || {};

		// Replace resolved settings with first node's settings
		Object.keys(resolved).forEach((key) => {
			if (firstNodeSettings[key] !== undefined) {
				resolved[key] = firstNodeSettings[key];
			}
		});

		browserLog(
			`[CONFLICT] Applied merge first strategy - using settings from node: ${firstNode.data.instanceId}`
		);
	}
}

/**
 * Normalizes score range settings with gap exclusion logic
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of all nodes for range analysis
 * @param {() => number} rng - Random number generator
 */
function normalizeScoreRange(resolved, nodes, rng) {
	// Find all score range nodes that were involved in the conflict
	const scoreRangeNodes = nodes.filter(
		(n) => n.data.id === 'anime-score' || n.data.id === 'player-score'
	);

	if (scoreRangeNodes.length <= 1) {
		return; // No conflicts to resolve
	}

	browserLog(`[CONFLICT] Normalizing ${scoreRangeNodes.length} score range nodes`);

	// Collect all min/max ranges from all nodes
	const ranges = scoreRangeNodes.map((node) => {
		const settings = node.settings || {};
		return {
			min: Number(settings.min || 0),
			max: Number(settings.max || 10)
		};
	});

	browserLog(`[CONFLICT] Score ranges:`, ranges);

	// Find the overall min and max
	const overallMin = Math.min(...ranges.map((r) => r.min));
	const overallMax = Math.max(...ranges.map((r) => r.max));

	// Find gaps between ranges
	const gaps = [];
	const sortedRanges = ranges.sort((a, b) => a.min - b.min);

	for (let i = 0; i < sortedRanges.length - 1; i++) {
		const current = sortedRanges[i];
		const next = sortedRanges[i + 1];

		// If there's a gap between current.max and next.min
		if (current.max < next.min - 1) {
			gaps.push({
				start: current.max + 1,
				end: next.min - 1
			});
		}
	}

	browserLog(`[CONFLICT] Found ${gaps.length} gaps:`, gaps);

	// Build disallowed list from gaps
	const disallowed = [];
	gaps.forEach((gap) => {
		for (let score = gap.start; score <= gap.end; score++) {
			disallowed.push(score);
		}
	});

	// Update resolved settings
	resolved.min = overallMin;
	resolved.max = overallMax;

	// Merge disallowed lists and add gaps
	const existingDisallowed = Array.isArray(resolved.disallowed) ? resolved.disallowed : [];
	resolved.disallowed = [...new Set([...existingDisallowed, ...disallowed])].sort((a, b) => a - b);

	// Sum percentages/counts from all nodes and normalize like songs-and-types
	const allPercentages = {};
	const allCounts = {};

	// Collect percentages and counts from all score range nodes
	scoreRangeNodes.forEach((node) => {
		const settings = node.settings || {};

		// Sum percentages
		if (settings.percentages && typeof settings.percentages === 'object') {
			Object.keys(settings.percentages).forEach((score) => {
				const value = Number(settings.percentages[score]) || 0;
				allPercentages[score] = (allPercentages[score] || 0) + value;
			});
		}

		// Sum counts
		if (settings.counts && typeof settings.counts === 'object') {
			Object.keys(settings.counts).forEach((score) => {
				const value = Number(settings.counts[score]) || 0;
				allCounts[score] = (allCounts[score] || 0) + value;
			});
		}
	});

	// Normalize percentages if they exist
	if (Object.keys(allPercentages).length > 0) {
		const totalPercentage = Object.values(allPercentages).reduce((sum, val) => sum + val, 0);

		if (totalPercentage > 100) {
			browserLog(`[CONFLICT] Score percentages sum to ${totalPercentage}%, normalizing to 100%`);

			// Normalize each score proportionally
			Object.keys(allPercentages).forEach((score) => {
				allPercentages[score] = Math.round((allPercentages[score] / totalPercentage) * 100);
			});

			browserLog(`[CONFLICT] Normalized score percentages:`, allPercentages);
		}

		// Update resolved settings with normalized percentages
		resolved.percentages = allPercentages;
	}

	// Normalize counts if they exist
	if (Object.keys(allCounts).length > 0) {
		const totalCount = Object.values(allCounts).reduce((sum, val) => sum + val, 0);

		if (totalCount > 0) {
			browserLog(`[CONFLICT] Score counts sum to ${totalCount}, keeping as-is`);
			browserLog(`[CONFLICT] Score counts:`, allCounts);

			// Update resolved settings with summed counts
			resolved.counts = allCounts;
		}
	}

	browserLog(
		`[CONFLICT] Normalized score range: min=${resolved.min}, max=${resolved.max}, disallowed=${resolved.disallowed.length} scores`
	);
}

/**
 * Normalizes song difficulty settings after merging multiple nodes
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of song difficulty nodes
 * @param {() => number} rng - Random number generator
 * @param {number} inheritedSongCount - Total songs from number of songs node
 */
function normalizeSongDifficulty(resolved, nodes, rng, inheritedSongCount = 20) {
	// Find all song difficulty nodes that were involved in the conflict
	const songDifficultyNodes = nodes.filter((n) => n.data.id === 'song-difficulty');

	if (songDifficultyNodes.length <= 1) {
		return; // No conflicts to resolve
	}

	browserLog(`[CONFLICT] Normalizing ${songDifficultyNodes.length} song difficulty nodes`);
	browserLog(`[CONFLICT] Total song count: ${inheritedSongCount}`);

	// Determine view mode - use advanced if any node is in advanced mode
	const hasAdvancedMode = songDifficultyNodes.some((node) => {
		const value = node.data.currentValue || {};
		const isAdvanced = value.viewMode === 'advanced';
		browserLog(
			`[CONFLICT] Node ${node.data.instanceId || 'unknown'} viewMode: ${value.viewMode}, isAdvanced: ${isAdvanced}`
		);
		return isAdvanced;
	});

	const hasBasicMode = songDifficultyNodes.some((node) => {
		const value = node.data.currentValue || {};
		const isBasic = value.viewMode === 'basic';
		browserLog(
			`[CONFLICT] Node ${node.data.instanceId || 'unknown'} viewMode: ${value.viewMode}, isBasic: ${isBasic}`
		);
		return isBasic;
	});

	browserLog(
		`[CONFLICT] Detection results: hasAdvancedMode=${hasAdvancedMode}, hasBasicMode=${hasBasicMode}`
	);

	// Always use advanced mode logic - map basic difficulties to ranges
	if (hasAdvancedMode || hasBasicMode) {
		if (hasAdvancedMode) {
			browserLog(`[CONFLICT] Advanced mode detected, merging ranges`);
		} else {
			browserLog(`[CONFLICT] Basic mode only, mapping to advanced ranges`);
		}

		// Collect all ranges from advanced mode nodes
		const allRanges = [];
		songDifficultyNodes.forEach((node) => {
			const value = node.data.currentValue || {};
			if (value.viewMode === 'advanced' && Array.isArray(value.ranges)) {
				// Normalize range format to use min/max consistently
				const normalizedRanges = value.ranges.map((range) => ({
					min: range.from || range.min || 0,
					max: range.to || range.max || 0,
					songCount: range.songCount || 0
				}));
				allRanges.push(...normalizedRanges);
			}
		});

		// Define basic difficulty to advanced range mapping
		const basicToAdvancedMapping = {
			easy: { min: 60, max: 100 },
			medium: { min: 25, max: 60 },
			hard: { min: 0, max: 25 }
		};

		// Always map basic difficulties to advanced ranges
		if (hasBasicMode) {
			browserLog(`[CONFLICT] Mapping basic difficulties to advanced ranges`);

			// Collect basic mode values and map them to advanced ranges
			songDifficultyNodes.forEach((node) => {
				const value = node.data.currentValue || {};
				if (value.viewMode === 'basic') {
					const mode = value.mode || 'advanced';

					['easy', 'medium', 'hard'].forEach((diff) => {
						const diffSettings = value[diff];
						if (diffSettings && diffSettings.enabled) {
							let songCount = 0;

							if (mode === 'advanced') {
								songCount = diffSettings.count || 0;
							} else {
								// Convert percentage to count based on total song count
								const percentage = diffSettings.percentage || 0;
								songCount = Math.round((percentage / 100) * inheritedSongCount);
							}

							if (songCount > 0) {
								const range = basicToAdvancedMapping[diff];
								allRanges.push({
									min: range.min,
									max: range.max,
									songCount: songCount
								});

								browserLog(
									`[CONFLICT] Mapped ${diff} (${songCount} songs) to range ${range.min}-${range.max}`
								);
							}
						}
					});
				}
			});
		}

		// Keep ranges separate and normalize song counts to total
		const mergedRanges = mergeOverlappingRanges(allRanges, inheritedSongCount);

		// Normalize song counts to ensure they respect total song count
		const totalSongCount = mergedRanges.reduce((sum, range) => sum + (range.songCount || 0), 0);

		browserLog(`[CONFLICT] Total song count from ranges: ${totalSongCount}`);

		if (totalSongCount > inheritedSongCount) {
			browserLog(
				`[CONFLICT] Total song count ${totalSongCount} exceeds ${inheritedSongCount}, normalizing`
			);

			// Normalize each range proportionally to total song count
			mergedRanges.forEach((range) => {
				if (range.songCount > 0) {
					range.songCount = Math.round((range.songCount / totalSongCount) * inheritedSongCount);
				}
			});

			browserLog(`[CONFLICT] Normalized song difficulty ranges to ${inheritedSongCount} songs`);
		} else if (totalSongCount > 0) {
			browserLog(`[CONFLICT] Total song count ${totalSongCount} is within limit, keeping as-is`);
		}

		// Update resolved settings
		resolved.viewMode = 'advanced';
		// Convert back to from/to format for consistency with existing structure
		resolved.ranges = mergedRanges.map((range) => ({
			from: range.min,
			to: range.max,
			songCount: range.songCount
		}));
		resolved.total = inheritedSongCount; // Update total to match normalized count

		// Remove basic mode properties when using advanced mode
		delete resolved.difficulties;
		delete resolved.easy;
		delete resolved.medium;
		delete resolved.hard;

		browserLog(`[CONFLICT] Merged ${allRanges.length} ranges into ${mergedRanges.length} ranges`);
	}

	browserLog(`[CONFLICT] Normalized song difficulty settings`);
}

/**
 * Normalizes vintage settings after merging multiple nodes
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of vintage nodes
 * @param {() => number} rng - Random number generator
 * @param {number} inheritedSongCount - Total songs from number of songs node
 */
function normalizeVintage(resolved, nodes, rng, inheritedSongCount = 20) {
	// Find all vintage nodes that were involved in the conflict
	const vintageNodes = nodes.filter((n) => n.data.id === 'vintage');

	if (vintageNodes.length === 0) {
		return; // No vintage nodes
	}

	browserLog(`[CONFLICT] Normalizing ${vintageNodes.length} vintage nodes`);
	browserLog(`[CONFLICT] Total song count: ${inheritedSongCount}`);

	// Collect all ranges from all vintage nodes
	const allRanges = [];
	vintageNodes.forEach((node) => {
		const value = node.data.currentValue || {};
		if (Array.isArray(value.ranges)) {
			allRanges.push(...value.ranges);
		}
	});

	browserLog(`[CONFLICT] Collected ${allRanges.length} ranges from ${vintageNodes.length} nodes`);

	if (allRanges.length === 0) {
		resolved.ranges = [];
		return;
	}

	// Normalize song counts for advanced ranges
	const mode = resolved.mode || 'percentage';
	const maxTotal = mode === 'percentage' ? 100 : inheritedSongCount;

	// Calculate total current allocation
	let totalCurrentAllocation = 0;
	allRanges.forEach((range) => {
		if (range.useAdvanced) {
			const value = mode === 'percentage' ? range.percentage || 0 : range.count || 0;
			totalCurrentAllocation += value;
		}
	});

	browserLog(
		`[CONFLICT] Total current allocation: ${totalCurrentAllocation}, Target: ${maxTotal}`
	);

	// Normalize advanced ranges if needed
	if (totalCurrentAllocation > maxTotal) {
		browserLog(`[CONFLICT] Scaling down vintage ranges to fit ${maxTotal}`);

		const scaleFactor = maxTotal / totalCurrentAllocation;
		allRanges.forEach((range) => {
			if (range.useAdvanced) {
				if (mode === 'percentage') {
					range.percentage = Math.round((range.percentage || 0) * scaleFactor);
				} else {
					range.count = Math.round((range.count || 0) * scaleFactor);
				}
			}
		});

		// Adjust the largest range to ensure exact total
		const currentTotal = allRanges.reduce((sum, range) => {
			if (range.useAdvanced) {
				return sum + (mode === 'percentage' ? range.percentage || 0 : range.count || 0);
			}
			return sum;
		}, 0);

		const difference = maxTotal - currentTotal;
		if (difference !== 0) {
			// Find the range with the highest allocation and adjust it
			let largestRange = null;
			let largestValue = 0;

			allRanges.forEach((range) => {
				if (range.useAdvanced) {
					const value = mode === 'percentage' ? range.percentage || 0 : range.count || 0;
					if (value > largestValue) {
						largestValue = value;
						largestRange = range;
					}
				}
			});

			if (largestRange) {
				if (mode === 'percentage') {
					// @ts-ignore - largestRange is guaranteed to have percentage when mode is percentage
					largestRange.percentage = (largestRange.percentage || 0) + difference;
				} else {
					// @ts-ignore - largestRange is guaranteed to have count when mode is count
					largestRange.count = (largestRange.count || 0) + difference;
				}
			}
		}
	}

	// Log final ranges
	allRanges.forEach((range) => {
		if (range.useAdvanced) {
			const value = mode === 'percentage' ? range.percentage || 0 : range.count || 0;
			const rangeLabel = `${range.from?.season || 'Winter'} ${range.from?.year || 1944} - ${range.to?.season || 'Fall'} ${range.to?.year || 2025}`;
			browserLog(
				`[CONFLICT] Range ${rangeLabel}: ${value}${mode === 'percentage' ? '%' : ' songs'}`
			);
		}
	});

	const finalTotal = allRanges.reduce((sum, range) => {
		if (range.useAdvanced) {
			return sum + (mode === 'percentage' ? range.percentage || 0 : range.count || 0);
		}
		return sum;
	}, 0);
	browserLog(`[CONFLICT] Final total: ${finalTotal}${mode === 'percentage' ? '%' : ' songs'}`);

	// Add default random range if advanced ranges don't reach maximum
	const remaining = maxTotal - finalTotal;
	if (remaining > 0) {
		browserLog(
			`[CONFLICT] Adding default random range for remaining ${remaining}${mode === 'percentage' ? '%' : ' songs'}`
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
			useAdvanced: false, // This is a random range
			percentage: mode === 'percentage' ? remaining : undefined,
			count: mode === 'advanced' ? remaining : undefined
		};

		allRanges.push(defaultRange);
		browserLog(
			`[CONFLICT] Added default range: Winter 1944 - ${currentSeason} ${currentYear} (${remaining}${mode === 'percentage' ? '%' : ' songs'} random)`
		);
	}

	// When mode is 'percentage', convert percentage values to actual counts
	if (mode === 'percentage') {
		const convertedRanges = allRanges.map(range => {
			const percentage = range.useAdvanced ? (range.percentage || 0) : (range.percentage || 0);
			const count = Math.round(inheritedSongCount * percentage / 100);

			// Convert valueRange from percentages to counts if it exists
			let valueRange;
			if (range.valueRange) {
				valueRange = {
					min: Math.round(inheritedSongCount * range.valueRange.min / 100),
					max: Math.round(inheritedSongCount * range.valueRange.max / 100)
				};
			} else {
				valueRange = { min: count, max: count };
			}

			return {
				from: range.from,
				to: range.to,
				value: count,
				valueRange: valueRange
			};
		});

		// Update resolved settings with converted ranges
		resolved.ranges = convertedRanges;
		resolved.mode = 'advanced'; // Change to advanced mode since we've converted percentages
		resolved.total = inheritedSongCount;
	} else {
		// Update resolved settings for advanced mode
		resolved.ranges = allRanges;
		resolved.mode = 'advanced';
		resolved.total = maxTotal;
	}

	browserLog(`[CONFLICT] Normalized vintage settings`);
}

/**
 * Normalizes anime type settings after merging multiple nodes
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of anime type nodes
 * @param {() => number} rng - Random number generator
 */
function normalizeAnimeType(resolved, nodes, rng) {
	// Find all anime type nodes that were involved in the conflict
	const animeTypeNodes = nodes.filter((n) => n.data.id === 'anime-type');

	if (animeTypeNodes.length <= 1) {
		return; // No conflicts to resolve
	}

	browserLog(`[CONFLICT] Normalizing ${animeTypeNodes.length} anime type nodes`);

	// Check if all nodes have the same type (simple vs advanced)
	const types = animeTypeNodes.map((node) => {
		const value = node.data.currentValue;
		return value.viewMode !== 'advanced' ? 'simple' : 'advanced';
	});

	const allSameType = types.every((type) => type === types[0]);
	browserLog(`[CONFLICT] Anime type nodes types: ${types.join(', ')}, all same: ${allSameType}`);

	if (allSameType) {
		browserLog(`[CONFLICT] All anime type nodes are ${types[0]}, using additive merge`);
		// All nodes are the same type, the additive merge from mergeAnimeTypeStrategy is sufficient
		return;
	} else {
		browserLog(`[CONFLICT] Mixed anime type node types, using merge first strategy`);
		// Mixed types, override with first node's settings
		const firstNode = animeTypeNodes[0];
		const firstValue = firstNode.data.currentValue;

		// Override resolved settings with first node's settings
		Object.keys(firstValue).forEach((key) => {
			if (key !== 'viewMode' && key !== 'mode') {
				resolved[key] = firstValue[key];
			}
		});

		browserLog(`[CONFLICT] Applied merge first strategy for mixed anime type nodes`);
	}

	browserLog(`[CONFLICT] Normalized anime type settings`);
}

/**
 * Normalizes songs-and-types settings after merging multiple nodes
 * @param {Object} resolved - Resolved settings object
 * @param {Array} nodes - Array of songs-and-types nodes
 * @param {() => number} rng - Random number generator
 * @param {number} inheritedSongCount - Total songs from number of songs node
 */
function normalizeSongsAndTypesCount(resolved, nodes, rng, inheritedSongCount = 20) {
	// Find all songs-and-types nodes that were involved in the conflict
	const songsAndTypesNodes = nodes.filter((n) => n.data.id === 'songs-and-types');

	browserLog(`[CONFLICT] Normalizing ${songsAndTypesNodes.length} songs-and-types nodes`);
	browserLog(`[CONFLICT] Total song count: ${inheritedSongCount}`);

	// Calculate total from types only (songSelection is metadata, not counted separately)
	const totalTypes =
		(resolved.types?.openings || 0) +
		(resolved.types?.endings || 0) +
		(resolved.types?.inserts || 0);
	const totalSongSelection =
		(resolved.songSelection?.random || 0) + (resolved.songSelection?.watched || 0);

	browserLog(`[CONFLICT] Total types: ${totalTypes}, total songSelection: ${totalSongSelection}`);

	// Normalize types to fit the song count
	if (totalTypes <= inheritedSongCount) {
		browserLog(
			`[CONFLICT] Types total ${totalTypes} is within limit ${inheritedSongCount}, no normalization needed`
		);
	} else {
		browserLog(`[CONFLICT] Normalizing types to fit ${inheritedSongCount} songs`);

		// Calculate normalization factor for types only
		const scaleFactor = inheritedSongCount / totalTypes;

		// Normalize types
		if (resolved.types) {
			if (resolved.types.openings) {
				resolved.types.openings = Math.round(resolved.types.openings * scaleFactor);
			}
			if (resolved.types.endings) {
				resolved.types.endings = Math.round(resolved.types.endings * scaleFactor);
			}
			if (resolved.types.inserts) {
				resolved.types.inserts = Math.round(resolved.types.inserts * scaleFactor);
			}
		}

		// Normalize songSelection separately (metadata, not counted in total)
		if (resolved.songSelection && totalSongSelection > inheritedSongCount) {
			const songSelectionScaleFactor = inheritedSongCount / totalSongSelection;
			if (resolved.songSelection.random) {
				resolved.songSelection.random = Math.round(
					resolved.songSelection.random * songSelectionScaleFactor
				);
			}
			if (resolved.songSelection.watched) {
				resolved.songSelection.watched = Math.round(
					resolved.songSelection.watched * songSelectionScaleFactor
				);
			}
		}

		// Adjust the largest type value to ensure exact total
		const currentTypesTotal =
			(resolved.types?.openings || 0) +
			(resolved.types?.endings || 0) +
			(resolved.types?.inserts || 0);
		const difference = inheritedSongCount - currentTypesTotal;

		if (difference !== 0) {
			// Find the largest type value and adjust it
			let largestKey = null;
			let largestValue = 0;

			if (resolved.types) {
				['openings', 'endings', 'inserts'].forEach((key) => {
					if (resolved.types[key] > largestValue) {
						largestValue = resolved.types[key];
						largestKey = key;
					}
				});
			}

			if (largestKey) {
				const before = resolved.types[largestKey];
				resolved.types[largestKey] += difference;
				browserLog(
					`[CONFLICT] Adjusted ${largestKey}: ${before} -> ${resolved.types[largestKey]}`
				);
			}
		}

		browserLog(`[CONFLICT] Normalized songs-and-types to ${inheritedSongCount} songs`);
	}

	// Log final values
	if (resolved.types) {
		browserLog(
			`[CONFLICT] Final types: openings=${resolved.types.openings || 0}, endings=${resolved.types.endings || 0}, inserts=${resolved.types.inserts || 0}`
		);
	}
	if (resolved.songSelection) {
		browserLog(
			`[CONFLICT] Final songSelection: random=${resolved.songSelection.random || 0}, watched=${resolved.songSelection.watched || 0}`
		);
	}

	const finalTypesTotal =
		(resolved.types?.openings || 0) +
		(resolved.types?.endings || 0) +
		(resolved.types?.inserts || 0);
	const finalSongSelectionTotal =
		(resolved.songSelection?.random || 0) + (resolved.songSelection?.watched || 0);
	browserLog(`[CONFLICT] Final types total: ${finalTypesTotal} songs`);
	browserLog(`[CONFLICT] Final songSelection total: ${finalSongSelectionTotal} songs`);

	browserLog(`[CONFLICT] Normalized songs-and-types settings`);
}

/**
 * Keeps all ranges separate and normalizes song counts to not exceed total
 * @param {Array} ranges - Array of range objects with min, max, songCount
 * @param {number} totalSongCount - Total songs to normalize to
 * @returns {Array} Separate ranges with normalized song counts
 */
function mergeOverlappingRanges(ranges, totalSongCount = 20) {
	if (ranges.length === 0) return [];

	// Keep all ranges completely separate - no merging at all
	const separateRanges = ranges.map((range) => ({ ...range }));

	// Calculate total song count across all ranges
	const totalCurrentSongs = separateRanges.reduce((sum, range) => sum + (range.songCount || 0), 0);

	browserLog(`[CONFLICT] Total current songs: ${totalCurrentSongs}, Target: ${totalSongCount}`);

	if (totalCurrentSongs === 0) {
		return separateRanges;
	}

	// Normalize song counts proportionally to not exceed totalSongCount
	if (totalCurrentSongs > totalSongCount) {
		// Scale down proportionally
		const scaleFactor = totalSongCount / totalCurrentSongs;
		separateRanges.forEach((range) => {
			range.songCount = Math.round((range.songCount || 0) * scaleFactor);
		});

		// Adjust the largest range to ensure exact total
		const currentTotal = separateRanges.reduce((sum, range) => sum + range.songCount, 0);
		const difference = totalSongCount - currentTotal;

		if (difference !== 0) {
			// Find the range with the highest song count and adjust it
			const largestRange = separateRanges.reduce(
				(max, range) => (range.songCount > max.songCount ? range : max),
				separateRanges[0]
			);
			largestRange.songCount += difference;
		}

		browserLog(`[CONFLICT] Scaled down ranges to fit ${totalSongCount} songs`);
	} else if (totalCurrentSongs < totalSongCount) {
		// Scale up proportionally
		const scaleFactor = totalSongCount / totalCurrentSongs;
		separateRanges.forEach((range) => {
			range.songCount = Math.round((range.songCount || 0) * scaleFactor);
		});

		// Adjust the largest range to ensure exact total
		const currentTotal = separateRanges.reduce((sum, range) => sum + range.songCount, 0);
		const difference = totalSongCount - currentTotal;

		if (difference !== 0) {
			// Find the range with the highest song count and adjust it
			const largestRange = separateRanges.reduce(
				(max, range) => (range.songCount > max.songCount ? range : max),
				separateRanges[0]
			);
			largestRange.songCount += difference;
		}

		browserLog(`[CONFLICT] Scaled up ranges to fit ${totalSongCount} songs`);
	}

	// Log final ranges
	separateRanges.forEach((range) => {
		browserLog(`[CONFLICT] Range ${range.min}-${range.max}: ${range.songCount} songs`);
	});

	const finalTotal = separateRanges.reduce((sum, range) => sum + range.songCount, 0);
	browserLog(`[CONFLICT] Final total: ${finalTotal} songs`);

	return separateRanges;
}

/**
 * Resolves filter settings for a single node
 * @param {Object} node - Filter node
 * @param {string} definitionId - Filter type ID
 * @param {number} inheritedSongCount - Total songs from number of songs node
 * @param {() => number} rng - Random number generator
 * @returns {Object} Resolved filter settings
 */
function resolveFilterSettings(node, definitionId, inheritedSongCount, rng) {
	// Try to use filter registry first
	if (_filterRegistryForSimulation) {
		const filter = _filterRegistryForSimulation.get(definitionId);
		if (filter && filter.resolve) {
			const context = { inheritedSongCount };
			return filter.resolve(node, context, rng);
		}
	}

	// All filters migrated to registry - fallback for unknown filters
	return node.data.currentValue;
}

/**
 * Finds nodes that are marked as modified in the UI
 * @param {Array} nodes - All nodes in the simulation
 * @returns {Set} Set of node IDs that are marked as modified
 */
function findModifiedNodes(nodes) {
	const modifiedNodeIds = new Set();

	// Find all nodes that are marked as modified in the UI
	const modifiedNodes = nodes.filter((n) => n.data.selectionModified === true);

	browserLog(`[SIMULATION] Found ${modifiedNodes.length} nodes marked as modified in UI`);

	for (const node of modifiedNodes) {
		modifiedNodeIds.add(node.id);
		browserLog(
			`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}) is marked as modified in UI - ID: ${node.id}`
		);
	}

	browserLog(`[SIMULATION] Total nodes marked as modified: ${modifiedNodeIds.size}`);
	return modifiedNodeIds;
}

/**
 * Applies selection modifier logic to any node type
 * @param {Array} nodes - Array of nodes to process
 * @param {Array} allNodes - All nodes in the simulation (for finding selection modifiers)
 * @param {() => number} rng - Random number generator
 * @returns {Array} Filtered nodes based on selection modifiers
 */
function applySelectionModifiers(nodes, allNodes, rng) {
	browserLog(`[SIMULATION] Applying selection modifiers to ${nodes.length} nodes`);

	// Find which nodes are marked as modified in the UI
	const modifiedNodes = findModifiedNodes(allNodes);

	// Group nodes by their definition ID (type)
	const nodesByType = new Map();
	for (const node of nodes) {
		const typeId = node.data.id;
		if (!nodesByType.has(typeId)) {
			nodesByType.set(typeId, []);
		}
		nodesByType.get(typeId).push(node);
	}

	browserLog(`[SIMULATION] Found ${nodesByType.size} node types:`, Array.from(nodesByType.keys()));

	const selectedNodes = [];

	for (const [typeId, nodesOfType] of nodesByType) {
		browserLog(`[SIMULATION] Processing ${nodesOfType.length} nodes of type '${typeId}'`);

		// Check if any nodes of this type are marked as modified in the UI
		const modifiedNodesOfType = nodesOfType.filter((node) => modifiedNodes.has(node.id));

		browserLog(`[SIMULATION] Checking ${nodesOfType.length} nodes of type '${typeId}' against ${modifiedNodes.size} modified nodes`);
		for (const node of nodesOfType) {
			browserLog(`[SIMULATION] Node ${node.data.instanceId} has ID: ${node.id}, modified: ${modifiedNodes.has(node.id)}`);
		}

		if (modifiedNodesOfType.length === 0) {
			browserLog(
				`[SIMULATION] No nodes of type '${typeId}' are marked as modified in UI, selecting all nodes`
			);
			// Apply execution chances but no selection modifier logic
			for (const node of nodesOfType) {
				if (checkExecutionChance(node, rng)) {
					selectedNodes.push(node);
					browserLog(
						`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}) passed execution chance and is selected`
					);
				} else {
					browserLog(
						`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}) failed execution chance and is not selected`
					);
				}
			}
			continue;
		}

		// Find the selection modifier that affects these nodes
		const selectionModifiers = allNodes.filter(
			(n) =>
				n.data.type === NODE_CATEGORIES.SELECTION_MODIFIER &&
				n.data.currentValue?.maxSelection != null
		);

		if (selectionModifiers.length === 0) {
			browserLog(`[SIMULATION] No selection modifiers found, selecting all nodes`);
			selectedNodes.push(...nodesOfType);
			continue;
		}

		// Use the first selection modifier found (assuming only one affects each type)
		const modifier = selectionModifiers[0];
		const maxSelection = modifier.data.currentValue.maxSelection;
		const minSelection = modifier.data.currentValue.minSelection || 1;

		browserLog(
			`[SIMULATION] Selection modifier found: min=${minSelection}, max=${maxSelection} for type '${typeId}'`
		);

		// Check execution chances for each node of this type
		const eligibleNodes = [];
		for (const node of nodesOfType) {
			if (checkExecutionChance(node, rng)) {
				eligibleNodes.push(node);
				browserLog(
					`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}) is eligible after execution chance`
				);
			} else {
				browserLog(
					`[SIMULATION] Node ${node.data.instanceId} (${node.data.title}) failed execution chance`
				);
			}
		}

		browserLog(`[SIMULATION] ${eligibleNodes.length} nodes eligible for type '${typeId}'`);

		// Apply selection logic
		if (eligibleNodes.length === 0) {
			browserLog(
				`[SIMULATION] No nodes passed execution chance for type '${typeId}', but min selection requires ${minSelection}, randomly selecting one`
			);
			// If no nodes passed execution chance but we need at least minSelection, randomly pick one
			const shuffled = [...nodesOfType].sort(() => rng() - 0.5);
			selectedNodes.push(shuffled[0]);
			browserLog(
				`[SIMULATION] Randomly selected node: ${shuffled[0].data.instanceId} (${shuffled[0].data.title})`
			);
		} else if (eligibleNodes.length <= maxSelection) {
			browserLog(
				`[SIMULATION] All ${eligibleNodes.length} eligible nodes fit within max selection (${maxSelection}), selecting all`
			);
			selectedNodes.push(...eligibleNodes);
		} else {
			// Need to select exactly maxSelection nodes
			const numToSelect = Math.min(maxSelection, eligibleNodes.length);
			browserLog(
				`[SIMULATION] Selecting ${numToSelect} out of ${eligibleNodes.length} eligible nodes`
			);

			// Randomly select nodes
			const shuffled = [...eligibleNodes].sort(() => rng() - 0.5);
			selectedNodes.push(...shuffled.slice(0, numToSelect));

			browserLog(
				`[SIMULATION] Selected nodes:`,
				selectedNodes.slice(-numToSelect).map((n) => n.data.instanceId)
			);
		}
	}

	browserLog(
		`[SIMULATION] Selection modifiers applied. Selected ${selectedNodes.length} nodes total`
	);
	return selectedNodes;
}

/**
 * Main function to simulate a quiz configuration from nodes and edges
 * Resolves all ranges to static values using RNG
 * @param {Array} nodes - Array of node instances
 * @param {Array} edges - Array of edges
 * @param {Object} configs - Configuration objects (ROUTER_CONFIG, etc.)
 * @param {string} [providedSeed] - Optional seed for reproducible results
 * @returns {Object} Fully resolved simulation result with static values
 */
export function simulateQuizConfiguration(nodes, edges, configs, providedSeed = null) {
	const seed = providedSeed || generateRandomSeed();
	const rng = makeRng(seed);

	browserLog(`[SIMULATION] Starting simulation with seed: ${seed}`);

	const result = {
		timestamp: new Date().toISOString(),
		seed,
		router: null,
		basicSettings: null,
		numberOfSongs: null,
		filters: []
	};

	// 1. Router selection
	const routerNode = nodes.find((n) => n.data.type === NODE_CATEGORIES.ROUTER);
	let reachableNodeIds = new Set();

	if (routerNode) {
		browserLog(`[SIMULATION] Found router node: ${routerNode.data.instanceId}`);
		const selectedRoute = selectRoute(routerNode, rng);
		result.router = {
			selectedRoute: selectedRoute?.name || 'Unknown',
			selectedRouteId: selectedRoute?.id || null
		};

		browserLog(`[SIMULATION] Selected route: ${selectedRoute?.name} (${selectedRoute?.id})`);

		// Build adjacency graph and find reachable nodes from the selected route
		if (selectedRoute) {
			const graphAdj = new Map();
			for (const e of edges) {
				if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
				graphAdj.get(e.source).add(e.target);
			}

			// Start from edges that come from the selected route handle
			const startEdges = edges.filter(
				(e) => e.source === routerNode.id && e.sourceHandle === selectedRoute.id
			);

			browserLog(`[SIMULATION] Found ${startEdges.length} edges from selected route`);

			const queue = startEdges.map((e) => e.target);
			const seen = new Set([routerNode.id]); // Include router itself

			while (queue.length) {
				const nodeId = queue.shift();
				if (!nodeId || seen.has(nodeId)) continue;
				seen.add(nodeId);

				const neighbors = graphAdj.get(nodeId);
				if (neighbors) {
					for (const neighborId of neighbors) {
						if (!seen.has(neighborId)) {
							queue.push(neighborId);
						}
					}
				}
			}

			reachableNodeIds = seen;
			browserLog(
				`[SIMULATION] Found ${reachableNodeIds.size} reachable nodes from selected route`
			);
		}
	} else {
		browserLog(`[SIMULATION] No router node found, all nodes will be processed`);
	}

	// Helper to filter nodes by reachability
	const filterByRoute = (nodeList) => {
		if (reachableNodeIds.size === 0) {
			browserLog(`[SIMULATION] No route filtering (no route selected or no reachable nodes)`);
			return nodeList; // No filtering if no route selected
		}

		const filtered = nodeList.filter((n) => reachableNodeIds.has(n.id));
		const excluded = nodeList.filter((n) => !reachableNodeIds.has(n.id));

		if (excluded.length > 0) {
			browserLog(`[SIMULATION] Filtered ${nodeList.length} nodes by route to ${filtered.length} nodes`);
			browserLog(`[SIMULATION] Excluded ${excluded.length} nodes from route:`);
			excluded.forEach(n => {
				browserLog(`[SIMULATION]   - ${n.data.instanceId} (${n.data.title}) type: ${n.data.id}`);
			});
		}

		return filtered;
	};

	// Helper to filter nodes by connectivity (exclude nodes that can't reach Number of Songs)
	const filterByConnectivity = (nodeList) => {
		// Find all Number of Songs nodes
		const numberOfSongsNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS);
		if (numberOfSongsNodes.length === 0) {
			// If no Number of Songs nodes exist, include all nodes
			browserLog(
				`[SIMULATION] No Number of Songs nodes found, including all ${nodeList.length} nodes`
			);
			return nodeList;
		}

		// Build adjacency graph (directed graph)
		const graphAdj = new Map();
		for (const e of edges) {
			if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
			graphAdj.get(e.source).add(e.target);
		}

		// Build reverse adjacency graph (for incoming edges)
		const reverseGraphAdj = new Map();
		for (const e of edges) {
			if (!reverseGraphAdj.has(e.target)) reverseGraphAdj.set(e.target, new Set());
			reverseGraphAdj.get(e.target).add(e.source);
		}

		// First, find all nodes that CAN reach Number of Songs (by going forward)
		const nodesThatCanReachNumberOfSongs = new Set();
		for (const node of nodeList) {
			if (node.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS) {
				nodesThatCanReachNumberOfSongs.add(node.id);
				continue;
			}

			const visited = new Set();
			const queue = [node.id];

			while (queue.length > 0) {
				const current = queue.shift();
				if (visited.has(current)) continue;
				visited.add(current);

				if (numberOfSongsNodes.some((n) => n.id === current)) {
					nodesThatCanReachNumberOfSongs.add(node.id);
					break;
				}

				const neighbors = graphAdj.get(current);
				if (neighbors) {
					for (const neighbor of neighbors) {
						if (!visited.has(neighbor)) {
							queue.push(neighbor);
						}
					}
				}
			}
		}

		// Now check each node: include if it can reach Number of Songs OR if it's in the same connected component as a node that can
		const connectedNodes = nodeList.filter((n) => {
			// If this node can reach Number of Songs, include it
			if (nodesThatCanReachNumberOfSongs.has(n.id)) {
				return true;
			}

			// Check if this node is in the same connected component as any node that CAN reach Number of Songs
			// Use BFS from this node to find all reachable nodes (both directions)
			const visited = new Set();
			const queue = [n.id];

			while (queue.length > 0) {
				const current = queue.shift();
				if (visited.has(current)) continue;
				visited.add(current);

				// If we reach a node that can reach Number of Songs, include this node
				if (nodesThatCanReachNumberOfSongs.has(current)) {
					return true;
				}

				// Add outgoing neighbors
				const neighbors = graphAdj.get(current);
				if (neighbors) {
					for (const neighbor of neighbors) {
						if (!visited.has(neighbor)) {
							queue.push(neighbor);
						}
					}
				}

				// Add incoming neighbors
				const incomingNeighbors = reverseGraphAdj.get(current);
				if (incomingNeighbors) {
					for (const neighbor of incomingNeighbors) {
						if (!visited.has(neighbor)) {
							queue.push(neighbor);
						}
					}
				}
			}

			// If we reach here, the node is isolated
			browserLog(
				`[SIMULATION] Excluding disconnected node: ${n.data.instanceId} (${n.data.title}) - cannot reach Number of Songs`
			);
			return false;
		});

		browserLog(
			`[SIMULATION] Filtered ${nodeList.length} nodes to ${connectedNodes.length} connected nodes`
		);

		// Log which nodes were included/excluded
		const excludedNodes = nodeList.filter(n => !connectedNodes.includes(n));
		if (excludedNodes.length > 0) {
			browserLog(`[SIMULATION] Excluded ${excludedNodes.length} nodes due to connectivity:`);
			excludedNodes.forEach(n => {
				browserLog(`[SIMULATION]   - ${n.data.instanceId} (${n.data.title}) type: ${n.data.id}`);
			});
		}

		return connectedNodes;
	};

	// 2. Basic Settings selection and resolution (only from selected route and connected nodes)
	const basicSettingsNodes = filterByConnectivity(
		filterByRoute(nodes.filter((n) => n.data.type === NODE_CATEGORIES.BASIC_SETTINGS))
	);
	browserLog(
		`[SIMULATION] Found ${basicSettingsNodes.length} basic settings nodes in selected route`
	);

	const selectedBasicSettingsNodes = applySelectionModifiers(basicSettingsNodes, nodes, rng);
	const selectedBasicSettings =
		selectedBasicSettingsNodes.length > 0
			? selectedBasicSettingsNodes[Math.floor(rng() * selectedBasicSettingsNodes.length)]
			: null;

	if (selectedBasicSettings) {
		browserLog(`[SIMULATION] Selected basic settings: ${selectedBasicSettings.data.instanceId}`);
		result.basicSettings = resolveBasicSettings(selectedBasicSettings, rng);
	}

	// 3. Number of Songs selection and resolution (only from selected route and connected nodes)
	const numberOfSongsNodes = filterByConnectivity(
		filterByRoute(nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS))
	);
	browserLog(
		`[SIMULATION] Found ${numberOfSongsNodes.length} number of songs nodes in selected route`
	);

	const selectedNumberOfSongsNodes = applySelectionModifiers(numberOfSongsNodes, nodes, rng);
	const selectedNumberOfSongs =
		selectedNumberOfSongsNodes.length > 0
			? selectedNumberOfSongsNodes[Math.floor(rng() * selectedNumberOfSongsNodes.length)]
			: null;

	if (selectedNumberOfSongs) {
		browserLog(`[SIMULATION] Selected number of songs: ${selectedNumberOfSongs.data.instanceId}`);
		const displayValue = extractNumberOfSongsDisplay(selectedNumberOfSongs.data.currentValue);
		result.numberOfSongs = resolveDisplayValueToStatic(displayValue, rng);
	}

	// Get inherited song count for filters
	const inheritedSongCount = result.numberOfSongs || 20;

	// 4. Process filter nodes (only from selected route and connected nodes)
	const allFilterNodes = filterByConnectivity(
		filterByRoute(nodes.filter((n) => n.data.type === NODE_CATEGORIES.FILTER))
	);

	browserLog(`[SIMULATION] Found ${allFilterNodes.length} filter nodes in selected route`);
	allFilterNodes.forEach(node => {
		browserLog(`[SIMULATION] Filter node: ${node.data.instanceId} (${node.data.title}) type: ${node.data.id}`);
	});

	// Apply selection modifiers and execution chances
	const selectedFilterNodes = applySelectionModifiers(allFilterNodes, nodes, rng);

	browserLog(`[SIMULATION] Processing ${selectedFilterNodes.length} selected filter nodes`);

	// Group filters by type AND source selector for conflict resolution
	// Filters with different source selectors should NOT be merged
	const filtersByTypeAndSource = new Map();
	for (const node of selectedFilterNodes) {
		const definitionId = node.data.id;

		// Check if there's a source selector connected to this filter
		const sourceSelectorEdges = edges.filter(
			(edge) => edge.target === node.id && edge.targetHandle === 'source-selector'
		);

		// Collect all target source IDs from connected source selector nodes
		const targetSourceIds = new Set();
		
		if (sourceSelectorEdges.length > 0) {
			sourceSelectorEdges.forEach(edge => {
				const sourceSelectorNode = nodes.find((n) => n.id === edge.source);
				if (sourceSelectorNode && sourceSelectorNode.data.currentValue?.targetSourceId) {
					targetSourceIds.add(sourceSelectorNode.data.currentValue.targetSourceId);
				}
			});
		}

		// Sort IDs for consistent key generation
		const sortedSourceIds = Array.from(targetSourceIds).sort();
		
		// Create a key that includes both type and source combination (empty for no source selector)
		// If multiple sources, join them with '+'
		const sourceKey = sortedSourceIds.length > 0 ? sortedSourceIds.join('+') : 'all-sources';
		const groupKey = `${definitionId}|||${sourceKey}`;

		if (!filtersByTypeAndSource.has(groupKey)) {
			filtersByTypeAndSource.set(groupKey, { 
				definitionId, 
				targetSourceIds: sortedSourceIds,
				nodes: [] 
			});
		}
		filtersByTypeAndSource.get(groupKey).nodes.push(node);
		browserLog(`[SIMULATION] Added node ${node.data.instanceId} (${node.data.title}) to group '${groupKey}'`);
	}

	// Process each filter group and resolve conflicts
	for (const [groupKey, group] of filtersByTypeAndSource) {
		const { definitionId, targetSourceIds, nodes: nodesOfType } = group;
		browserLog(`[SIMULATION] Processing ${nodesOfType.length} nodes in group '${groupKey}'`);

		if (nodesOfType.length === 1) {
			// Single node - no conflicts to resolve
			const node = nodesOfType[0];
			let resolvedFilter = {
				definitionId,
				instanceId: node.data.instanceId
			};

			// Add targetSourceId/targetSourceIds if present
			if (targetSourceIds.length > 0) {
				if (targetSourceIds.length === 1) {
					resolvedFilter.targetSourceId = targetSourceIds[0];
					browserLog(`[SIMULATION] Filter ${node.data.title} scoped to source: ${targetSourceIds[0]}`);
				} else {
					resolvedFilter.targetSourceIds = targetSourceIds;
					browserLog(`[SIMULATION] Filter ${node.data.title} scoped to sources: ${targetSourceIds.join(', ')}`);
				}
			}

			browserLog(`[SIMULATION] Resolving single filter: ${node.data.title} (${definitionId})`);

			try {
				resolvedFilter.settings = resolveFilterSettings(
					node,
					definitionId,
					inheritedSongCount,
					rng
				);
				browserLog(`[SIMULATION] Successfully resolved filter: ${node.data.title}`);
				result.filters.push(resolvedFilter);
			} catch (error) {
				browserLog(`[SIMULATION] Error resolving filter ${definitionId}:`, error);
				resolvedFilter.error = error.message;
				result.filters.push(resolvedFilter);
			}
		} else {
			// Multiple nodes - resolve conflicts
			browserLog(
				`[SIMULATION] Multiple nodes of type '${definitionId}' detected - resolving conflicts`
			);

			// First resolve each node individually
			const resolvedNodes = [];
			for (const node of nodesOfType) {
				try {
					const settings = resolveFilterSettings(node, definitionId, inheritedSongCount, rng);

					resolvedNodes.push({
						data: node.data,
						settings
					});
				} catch (error) {
					console.error(
						`[SIMULATION] Error resolving individual filter ${node.data.instanceId}:`,
						error
					);
				}
			}

			if (resolvedNodes.length > 0) {
				// Apply conflict resolution
				const resolvedSettings = resolveConflicts(resolvedNodes, rng, inheritedSongCount);

				const resolvedFilter = {
					definitionId,
					instanceId: `merged-${definitionId}-${Date.now()}`,
					settings: resolvedSettings,
					isMerged: true,
					sourceNodes: resolvedNodes.map((n) => n.data.instanceId)
				};

				// Add targetSourceId/targetSourceIds if present (all nodes in this group have the same targetSourceIds)
				if (targetSourceIds.length > 0) {
					if (targetSourceIds.length === 1) {
						resolvedFilter.targetSourceId = targetSourceIds[0];
						browserLog(`[SIMULATION] Merged filter scoped to source: ${targetSourceIds[0]}`);
					} else {
						resolvedFilter.targetSourceIds = targetSourceIds;
						browserLog(`[SIMULATION] Merged filter scoped to sources: ${targetSourceIds.join(', ')}`);
					}
				}

				browserLog(
					`[SIMULATION] Successfully merged ${resolvedNodes.length} filters of type '${definitionId}'`
				);
				result.filters.push(resolvedFilter);
			}
		}
	}

	// 5. Add missing filter types with default settings
	const selectedFilterTypes = new Set(result.filters.map((f) => f.definitionId));
	const allFilterTypes = new Set();

	// Get all filter types from the configuration
	// configs is an object with FILTER_NODE_DEFINITIONS containing the filter configs
	if (configs.FILTER_NODE_DEFINITIONS && Array.isArray(configs.FILTER_NODE_DEFINITIONS)) {
		for (const config of configs.FILTER_NODE_DEFINITIONS) {
			if (config.type === 'filter') {
				allFilterTypes.add(config.id);
			}
		}
	}

	// Also check what filter types were present in the original nodes
	const originalFilterTypes = new Set();
	for (const node of nodes) {
		if (node.data.type === NODE_CATEGORIES.FILTER) {
			originalFilterTypes.add(node.data.id);
		}
	}

	// Missing filter types are those that were in the original nodes but not in the final result
	const missingFilterTypes = [...originalFilterTypes].filter(
		(type) => !selectedFilterTypes.has(type)
	);

	if (missingFilterTypes.length > 0) {
		browserLog(
			`[SIMULATION] Adding ${missingFilterTypes.length} missing filter types with default settings:`,
			missingFilterTypes
		);

		for (const filterType of missingFilterTypes) {
			// Get default settings from defaultNodeSettings.js
			const defaultSettings = getDefaultSettingsForNodeType(filterType);

			const defaultFilter = {
				definitionId: filterType,
				instanceId: `default-${filterType}-${Date.now()}`,
				isDefault: true
			};

			// If we found default settings, add them to the filter
			if (defaultSettings) {
				defaultFilter.settings = defaultSettings;
				browserLog(`[SIMULATION] Added default filter: ${filterType} with default settings`);
			} else {
				browserLog(`[SIMULATION] Added default filter: ${filterType} (no default settings found)`);
			}

			result.filters.push(defaultFilter);
		}
	}

	// Extract song list settings from nodes
	// Only include source nodes that are connected to Number of Songs nodes
	const songListNodes = filterByConnectivity(
		nodes.filter(n =>
			n.data.type === NODE_CATEGORIES.SONG_LIST ||
			n.data.type === NODE_CATEGORIES.BATCH_USER_LIST ||
			n.data.type === NODE_CATEGORIES.LIVE_NODE
		)
	);

	const songLists = songListNodes.map(node => {
		const value = node.data?.currentValue || {};

		// Check if this is a batch-user-list node
		if (node.data.id === 'batch-user-list') {
			// Resolve node-level percentage first
			const nodeLevelPercentage = resolveSongPercentage(value.songPercentage, rng);

			// Collect user entries with their percentage configurations
			const rawUserEntries = value.userEntries || [];
			const hasPerUserPercentages = rawUserEntries.some(entry => entry.songPercentage !== null && entry.songPercentage !== undefined);

			let userEntries;

			if (hasPerUserPercentages) {
				// If per-user percentages are set, use allocateToTotal to ensure they sum to 100%
				const allocationEntries = rawUserEntries
					.map((entry, idx) => {
						if (!entry.songPercentage) return null;

						if (entry.songPercentage.random) {
							return {
								label: `user-${idx}`,
								kind: 'range',
								min: entry.songPercentage.min ?? 0,
								max: entry.songPercentage.max ?? 100
							};
						} else {
							return {
								label: `user-${idx}`,
								kind: 'static',
								value: entry.songPercentage.value ?? 0
							};
						}
					})
					.filter(e => e !== null);

				// Allocate percentages to sum to 100%
				const allocatedPercentages = allocateToTotal(allocationEntries, 100, rng);

				// Apply allocated values back to user entries
				userEntries = rawUserEntries.map((entry, idx) => {
					const allocatedValue = allocatedPercentages.get(`user-${idx}`);
					if (allocatedValue !== undefined && entry.songPercentage) {
						return {
							...entry,
							songPercentage: allocatedValue
						};
					}
					// If no percentage was set, keep as-is
					return entry;
				});
			} else {
				// No per-user percentages, just copy entries as-is
				userEntries = rawUserEntries;
			}

			return {
				nodeId: node.data.instanceId,
				nodeType: 'batch-user-list',
				mode: 'user-lists', // Batch user list uses user-lists mode
				useEntirePool: value.useEntirePool || false,
				songPercentage: nodeLevelPercentage, // Node-level percentage
				songSelectionMode: value.songSelectionMode || 'default', // Song selection mode
				userEntries: userEntries,
				userListImport: {
					platform: 'anilist', // Default platform for batch user lists
					username: '', // Will be filled from userEntries
					selectedLists: {
						completed: true,
						watching: true,
						planning: false,
						on_hold: false,
						dropped: false
					}
				}
			};
		}

		// Check if this is a live-node node
		if (node.data.id === 'live-node') {
			// Resolve node-level percentage first
			const nodeLevelPercentage = resolveSongPercentage(value.songPercentage, rng);

			// Collect user entries with their percentage configurations
			const rawUserEntries = value.userEntries || [];
			const hasPerUserPercentages = rawUserEntries.some(entry => entry.songPercentage !== null && entry.songPercentage !== undefined);

			let userEntries;

			if (hasPerUserPercentages) {
				// If per-user percentages are set, use allocateToTotal to ensure they sum to 100%
				const allocationEntries = rawUserEntries
					.map((entry, idx) => {
						if (!entry.songPercentage) return null;

						if (entry.songPercentage.random) {
							return {
								label: `user-${idx}`,
								kind: 'range',
								min: entry.songPercentage.min ?? 0,
								max: entry.songPercentage.max ?? 100
							};
						} else {
							return {
								label: `user-${idx}`,
								kind: 'static',
								value: entry.songPercentage.value ?? 0
							};
						}
					})
					.filter(e => e !== null);

				// Allocate percentages to sum to 100%
				const allocatedPercentages = allocateToTotal(allocationEntries, 100, rng);

				// Apply allocated values back to user entries
				userEntries = rawUserEntries.map((entry, idx) => {
					const allocatedValue = allocatedPercentages.get(`user-${idx}`);
					if (allocatedValue !== undefined && entry.songPercentage) {
						return {
							...entry,
							songPercentage: allocatedValue
						};
					}
					// If no percentage was set, keep as-is
					return entry;
				});
			} else {
				// No per-user percentages, just copy entries as-is
				userEntries = rawUserEntries;
			}

			return {
				nodeId: node.data.instanceId,
				nodeType: 'live-node',
				mode: 'user-lists', // Live node uses user-lists mode
				useEntirePool: value.useEntirePool || false,
				songPercentage: nodeLevelPercentage, // Node-level percentage
				songSelectionMode: value.songSelectionMode || 'default', // Song selection mode
				userEntries: userEntries,
				userListImport: {
					platform: 'anilist', // Default platform for live nodes
					username: '', // Will be filled from userEntries
					selectedLists: {
						completed: true,
						watching: true,
						planning: false,
						on_hold: false,
						dropped: false
					}
				}
			};
		}

		// Regular song-list node
		return {
			nodeId: node.data.instanceId,
			nodeType: 'song-list',
			mode: value.mode || 'masterlist',
			useEntirePool: value.useEntirePool || false,
			songPercentage: resolveSongPercentage(value.songPercentage, rng),
			userListImport: value.mode === 'user-lists' ? {
				platform: value.userListImport?.platform || 'anilist',
				username: value.userListImport?.username || '',
				selectedLists: value.userListImport?.selectedLists || {
					completed: true,
					watching: true,
					planning: false,
					on_hold: false,
					dropped: false
				}
			} : undefined,
			selectedListId: value.mode === 'saved-lists' ? value.selectedListId || null : undefined,
			selectedListName: value.mode === 'saved-lists' ? value.selectedListName || null : undefined
		};
	});

	// Add song lists to result
	result.songLists = songLists;

	browserLog(`[SIMULATION] Simulation completed. Final result:`, {
		router: result.router,
		basicSettings: result.basicSettings ? 'Present' : 'None',
		numberOfSongs: result.numberOfSongs,
		filtersCount: result.filters.length,
		filterTypes: result.filters.map((f) => f.definitionId),
		defaultFiltersAdded: missingFilterTypes.length,
		songListsCount: songLists.length
	});

	return result;
}
