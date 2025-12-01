/**
 * Display utility functions for the AMQ+ Editor.
 * These functions extract and format data for display in validation and reports.
 * All functions normalize various input formats into standardized display objects.
 *
 * @module displayUtils
 */

import { analyzeGroup, makeRng, randomInt, analyzeAllocationRanges } from './mathUtils.js';

/** @typedef {import('../../../../../types/types.js').DisplayValue} DisplayValue */

/**
 * Extracts and normalizes basic settings for display.
 * Converts various input formats into standardized display objects.
 *
 * @param {import('./nodeDefinitions.js').BasicSettings | Record<string, any>} value - Basic settings value object
 * @returns {Object} Formatted display values with normalized structure
 * @property {string} scoring - Scoring mode
 * @property {string} answering - Answering mode
 * @property {number} players - Number of players
 * @property {number} teamSize - Team size
 * @property {DisplayValue} guessTime - Guess time configuration
 * @property {DisplayValue} extraGuessTime - Extra guess time configuration
 * @property {DisplayValue} samplePoint - Sample point configuration
 * @property {DisplayValue} playbackSpeed - Playback speed configuration
 * @property {string[]} modifiers - Enabled modifiers
 */
export function extractBasicSettingsDisplay(value) {
	const v = value || {};
	const guess = v.guessTime?.value || v.guessTime || {};
	const extraGuess = v.extraGuessTime?.value || v.extraGuessTime || {};
	const sample = v.samplePoint?.value || v.samplePoint || {};
	const speed = v.playbackSpeed?.value || v.playbackSpeed || {};
	return {
		scoring: v.scoring?.value ?? v.scoring ?? 'count',
		answering: v.answering?.value ?? v.answering ?? 'typing',
		players: Number(v.players?.value ?? v.players ?? 8),
		teamSize: Number(v.teamSize?.value ?? v.teamSize ?? 1),
		guessTime: guess.useRange
			? { kind: 'range', min: Number(guess.min ?? 1), max: Number(guess.max ?? 99) }
			: { kind: 'static', value: Number(guess.staticValue ?? guess.value ?? 20) },
		extraGuessTime: extraGuess.useRange
			? { kind: 'range', min: Number(extraGuess.min ?? 1), max: Number(extraGuess.max ?? 15) }
			: { kind: 'static', value: Number(extraGuess.staticValue ?? extraGuess.value ?? 5) },
		samplePoint: sample.useRange
			? { kind: 'range', min: Number(sample.start ?? 1), max: Number(sample.end ?? 100) }
			: { kind: 'static', value: Number(sample.staticValue ?? sample.value ?? 20) },
		playbackSpeed:
			speed.mode === 'static'
				? { kind: 'static', value: Number(speed.staticValue ?? 1) }
				: {
					kind: 'random',
					values: Array.isArray(speed.randomValues) ? speed.randomValues : [1]
				},
		modifiers: Array.isArray(v.modifiers?.value)
			? v.modifiers.value
			: Array.isArray(v.modifiers)
				? v.modifiers
				: []
	};
}

/**
 * Extracts and normalizes number of songs configuration for display.
 *
 * @param {import('./nodeDefinitions.js').NumberOfSongsSettings | Record<string, any>} value - Number of songs value object
 * @returns {DisplayValue} Formatted display value (static or range)
 */
export function extractNumberOfSongsDisplay(value) {
	const v = value || {};
	// @ts-ignore - value can have these properties
	return v.useRange
		? { kind: 'range', min: Number(v.min ?? 1), max: Number(v.max ?? 200) }
		: // @ts-ignore
		{ kind: 'static', value: Number(v.staticValue ?? v.value ?? v?.value ?? 20) };
}

/**
 * Extract song categories display values with allocation analysis
 * @param {Record<string, any>} value - Song categories value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object|null} Formatted display values with allocation analysis
 */
export function extractSongCategoriesDisplay(value, inheritedSongCount) {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	// Handle both basic and advanced modes
	if (v.viewMode !== 'advanced' || !v.advanced) {
		// Basic mode - return null so template uses rawCurrentValue instead
		return null;
	}

	const mode = v.mode || 'percentage';
	const rows = ['openings', 'endings', 'inserts'];
	const cols = ['standard', 'instrumental', 'chanting', 'character'];
	const totalSongs = normalizedTotal;

	// Build ALL category entries across all rows (same as UI)
	const typeEntries = [];
	rows.forEach((row) => {
		if (!v.advanced[row]) return;
		cols.forEach((col) => {
			const entry = v.advanced[row][col];
			if (!entry.enabled) return;

			const label = `${row}-${col}`;
			if (entry.random) {
				const min =
					mode === 'percentage'
						? Number(entry.percentageMin ?? entry.min ?? 0)
						: Number(entry.countMin ?? entry.min ?? 0);
				const max =
					mode === 'percentage'
						? Number(entry.percentageMax ?? entry.max ?? 0)
						: Number(entry.countMax ?? entry.max ?? 0);
				typeEntries.push({ label, kind: 'range', min, max });
			} else {
				const value =
					mode === 'percentage'
						? Number(entry.percentageValue || 0)
						: Number(entry.countValue || 0);
				typeEntries.push({ label, kind: 'static', value });
			}
		});
	});

	// Use same global target as UI (all categories compete for same total)
	let globalTargetTotal;
	if (mode === 'percentage') {
		globalTargetTotal = 100;
	} else {
		// @ts-ignore - totalSongs can have these properties based on kind
		globalTargetTotal = totalSongs.kind === 'range' ? totalSongs?.max : totalSongs?.value;
	}

	// Apply the same analyzeGroup refinement logic as the UI
	const analysis = analyzeGroup(typeEntries, globalTargetTotal);

	const categories = [];

	// Process each row to extract results
	for (const row of rows) {
		if (!v.advanced[row]) continue;

		const rowCategories = cols
			.filter((col) => v.advanced[row][col]?.enabled)
			.map((col) => {
				const label = `${row}-${col}`;
				const info = analysis.refined.get(label);
				if (!info) return null;

				if (info.type === 'range' && info.min < info.max) {
					return { row, col, category: col, kind: 'range', min: info.min, max: info.max };
				} else {
					const value = info.type === 'range' ? info.min : info.value;
					return { row, col, category: col, kind: 'static', value };
				}
			})
			.filter(Boolean);

		if (rowCategories.length > 0) {
			categories.push({ row, categories: rowCategories });
		}
	}

	return categories.length > 0
		? {
			mode,
			total: totalSongs,
			rows: categories
		}
		: null;
}

/**
 * Extract anime types display values with allocation analysis
 * @param {import('./nodeDefinitions.js').AnimeTypeSettings | Record<string, any>} value - Anime types value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object|null} Formatted display values with allocation analysis
 */
export function extractAnimeTypesDisplay(value, inheritedSongCount) {
	const v = value || {};
	if (v.viewMode !== 'advanced' || !v.advanced) {
		return null; // Basic mode doesn't need allocation analysis
	}

	const mode = v.mode || 'percentage';
	const types = ['tv', 'movie', 'ova', 'ona', 'special'];
	const totalSongs =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: { kind: 'static', value: Number(inheritedSongCount ?? 20) };

	// Get target total based on mode
	let targetTotal;
	if (mode === 'percentage') {
		targetTotal = 100;
	} else {
		// @ts-ignore - totalSongs can have these properties based on kind
		targetTotal = totalSongs.kind === 'range' ? totalSongs?.max : totalSongs?.value;
	}

	// Build entries for enabled anime types
	/** @type {import('./mathUtils.js').AllocationEntry[]} */
	const typeEntries = types
		.filter((type) => v.advanced[type]?.enabled)
		.map((type) => {
			const entry = v.advanced[type];
			if (entry.random) {
				const min = mode === 'percentage'
					? Number(entry.percentageMin ?? entry.min ?? 0)
					: Number(entry.countMin ?? entry.min ?? 0);
				const max = mode === 'percentage'
					? Number(entry.percentageMax ?? entry.max ?? 0)
					: Number(entry.countMax ?? entry.max ?? 0);
				return {
					label: type,
					kind: /** @type {'range'} */ ('range'),
					min,
					max
				};
			} else {
				const value = mode === 'percentage'
					? Number(entry.percentageValue ?? 0)
					: Number(entry.countValue ?? 0);
				return {
					label: type,
					kind: /** @type {'static'} */ ('static'),
					value
				};
			}
		});

	if (typeEntries.length === 0) return null;

	// Analyze actual allocation ranges
	const allocationRanges = analyzeAllocationRanges(typeEntries, targetTotal);

	return {
		mode,
		total: totalSongs,
		types: types
			.map((type) => {
				const allocation = allocationRanges.get(type);
				return allocation ? { type, ...allocation } : null;
			})
			.filter(Boolean)
	};
}

/**
 * Extract song difficulty display values (actual allocation values)
 * @param {import('./nodeDefinitions.js').SongDifficultySettings | Record<string, any>} value - Song difficulty value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object} Formatted display values
 */
export function extractSongDifficultyDisplay(value, inheritedSongCount) {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	if (v.viewMode !== 'advanced') {
		// Basic mode - use same logic as node UI's getPredictedInfo function
		const enabledTypes = ['easy', 'medium', 'hard'].filter((level) => v[level]?.enabled);

		if (enabledTypes.length === 0) {
			return {
				mode: v.mode || 'percentage',
				// @ts-ignore - normalizedTotal can have value property
				total: v.mode === 'percentage' ? 100 : Number(normalizedTotal?.value ?? 20),
				difficulties: {}
			};
		}

		// Determine mode same way as node UI
		let mode = v.mode;
		if (!mode) {
			const anyPercent = ['easy', 'medium', 'hard'].some((t) => v[t]?.percentage !== undefined || v[t]?.percentageValue !== undefined);
			const anyCount = ['easy', 'medium', 'hard'].some((t) => v[t]?.count !== undefined || v[t]?.countValue !== undefined);
			mode = anyPercent && !anyCount ? 'percentage' : 'count';
		}

		const isPercentageMode = mode === 'percentage';
		const targetTotal = isPercentageMode
			? 100
			: typeof inheritedSongCount === 'object'
				? normalizedTotal.kind === 'range'
					? // @ts-ignore - normalizedTotal can have max property when kind is 'range'
					Number(normalizedTotal?.max ?? 0)
					: // @ts-ignore - normalizedTotal can have value property when kind is 'static'
					Number(normalizedTotal?.value ?? 0)
				: // @ts-ignore - normalizedTotal can have value property
				Number(normalizedTotal?.value ?? 20);

		// Build entries for difficulties using same logic as node UI
		/** @type {import('./mathUtils.js').AllocationEntry[]} */
		const typeEntries = enabledTypes.map((t) => {
			const d = v[t] || {};
			if (d.randomRange) {
				const min = isPercentageMode ? Number(d.minPercentage ?? 0) : Number(d.minCount ?? 0);
				const max = isPercentageMode ? Number(d.maxPercentage ?? 0) : Number(d.maxCount ?? 0);
				return { label: t, kind: /** @type {'range'} */ ('range'), min, max };
			}
			// Check for percentageValue/countValue first (new format), then fall back to percentage/count (old format)
			const value = isPercentageMode
				? Number(d.percentageValue ?? d.percentage ?? 0)
				: Number(d.countValue ?? d.count ?? 0);
			return { label: t, kind: /** @type {'static'} */ ('static'), value };
		});

		const analysis = analyzeGroup(typeEntries, targetTotal);

		// Convert analysis results to difficulties format expected by validator
		const difficulties = {};
		enabledTypes.forEach((level) => {
			const entry = typeEntries.find((e) => e.label === level);
			const info = analysis.refined.get(level);
			if (entry.kind === 'static' || !info) {
				difficulties[level] = { kind: 'static', value: entry.kind === 'static' ? entry.value : 0 };
			} else if (analysis.hasRandom && info.min < info.max) {
				difficulties[level] = { kind: 'range', min: info.min, max: info.max };
			} else {
				difficulties[level] = { kind: 'static', value: info.min };
			}
		});

		// Ensure all enabled types are represented, even if analysis didn't return results
		enabledTypes.forEach((level) => {
			if (!difficulties[level]) {
				const d = v[level] || {};
				if (d.randomRange) {
					const min = isPercentageMode ? Number(d.minPercentage ?? 0) : Number(d.minCount ?? 0);
					const max = isPercentageMode ? Number(d.maxPercentage ?? 0) : Number(d.maxCount ?? 0);
					difficulties[level] = { kind: 'range', min, max };
				} else {
					const value = isPercentageMode
						? Number(d.percentageValue ?? d.percentage ?? 0)
						: Number(d.countValue ?? d.count ?? 0);
					difficulties[level] = { kind: 'static', value };
				}
			}
		});

		return {
			mode,
			total: targetTotal,
			difficulties
		};
	}

	// Advanced mode with ranges - would need different handling
	return {
		mode: v.mode || 'percentage',
		// @ts-ignore - normalizedTotal can have value property
		total: v.mode === 'percentage' ? 100 : Number(normalizedTotal?.value ?? 0),
		difficulties: {}
	};
}

/**
 * Extract vintage display values
 * @param {import('./nodeDefinitions.js').VintageSettings | Record<string, any>} value - Vintage value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object} Formatted display values
 */
export function extractVintageDisplay(value, inheritedSongCount) {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	if (!v.ranges || v.ranges.length === 0) {
		return {
			mode: 'all',
			total: normalizedTotal,
			ranges: [],
			advancedTotal: 0,
			remaining: 0,
			hasRandomRanges: true,
			fallbackRandom: 0
		};
	}

	const mode = v.mode || 'percentage';
	const isPercentage = mode === 'percentage';

	let maxTotal;
	if (isPercentage) {
		maxTotal = 100;
	} else if (normalizedTotal.kind === 'range') {
		// @ts-ignore - normalizedTotal has max and value when kind is 'range'
		maxTotal = Number(normalizedTotal?.max ?? normalizedTotal?.value ?? 20);
	} else {
		// @ts-ignore - normalizedTotal has value when kind is 'static'
		maxTotal = Number(normalizedTotal?.value ?? 20);
	}

	let advancedTotal = 0;

	const ranges = v.ranges.map((range) => ({
		from: {
			season: range.from?.season || 'Winter',
			year: range.from?.year || 1944
		},
		to: {
			season: range.to?.season || 'Fall',
			year: range.to?.year || 2025
		},
		value:
			mode === 'percentage'
				? range.useAdvanced && range.percentage !== undefined
					? Number(range.percentage)
					: null
				: range.useAdvanced && range.count !== undefined
					? Number(range.count)
					: null,
		source: range.useAdvanced ? 'advanced' : 'random'
	}));

	for (const r of ranges) {
		if (r.source === 'advanced' && Number.isFinite(r.value)) {
			advancedTotal += r.value;
		}
	}

	const remaining = Math.max(0, maxTotal - advancedTotal);
	const hasRandomRanges = ranges.some((r) => r.source === 'random');
	const fallbackRandom = !hasRandomRanges ? remaining : 0;

	return {
		mode,
		total: normalizedTotal,
		ranges,
		advancedTotal,
		remaining,
		hasRandomRanges,
		fallbackRandom,
		maxTotal
	};
}

/**
 * Extract player score display values
 * @param {import('./nodeDefinitions.js').ScoreRangeSettings | Record<string, any>} value - Player score value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object} Formatted display values
 */
export function extractPlayerScoreDisplay(value, inheritedSongCount) {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	return {
		mode: v.mode || 'range',
		total: normalizedTotal,
		min: Number(v.min ?? 0),
		max: Number(v.max ?? 100),
		percentages: v.percentages || {},
		// @ts-ignore - v can have counts property
		counts: v?.counts || {},
		disallowed: Array.isArray(v.disallowed) ? v.disallowed : [],
		percentageEntries: Object.entries(v.percentages || {})
			.filter(([, val]) => Number.isFinite(Number(val)))
			.map(([score, val]) => ({ score, value: Number(val) })),
		// @ts-ignore - v can have counts property
		countEntries: Object.entries(v?.counts || {})
			.filter(([, val]) => Number.isFinite(Number(val)))
			.map(([score, val]) => ({ score, value: Number(val) })),
		disabled: Array.isArray(v.disallowed) ? [...v.disallowed] : []
	};
}

/**
 * Extract anime score display values
 * @param {import('./nodeDefinitions.js').ScoreRangeSettings | Record<string, any>} value - Anime score value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @returns {Object} Formatted display values
 */
export function extractAnimeScoreDisplay(value, inheritedSongCount) {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	return {
		mode: v.mode || 'range',
		total: normalizedTotal,
		min: Number(v.min ?? 2),
		max: Number(v.max ?? 10),
		percentages: v.percentages || {},
		// @ts-ignore - v can have counts property
		counts: v?.counts || {},
		disallowed: Array.isArray(v.disallowed) ? v.disallowed : [],
		percentageEntries: Object.entries(v.percentages || {})
			.filter(([, val]) => Number.isFinite(Number(val)))
			.map(([score, val]) => ({ score, value: Number(val) })),
		// @ts-ignore - v can have counts property
		countEntries: Object.entries(v?.counts || {})
			.filter(([, val]) => Number.isFinite(Number(val)))
			.map(([score, val]) => ({ score, value: Number(val) })),
		disabled: Array.isArray(v.disallowed) ? [...v.disallowed] : []
	};
}

/**
 * Extract genres/tags display values
 * @param {Record<string, any>} value - Genres/tags value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @param {string} kind - Type of data ('genres' or 'tags')
 * @returns {Object} Formatted display values
 */
export function extractGenresTagsDisplay(value, inheritedSongCount, kind = 'genres') {
	const v = value || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};

	// Extract included/excluded/optional from stateByKey
	const stateByKey = v.stateByKey || {};
	const included = [];
	const excluded = [];
	const optional = [];

	for (const [key, state] of Object.entries(stateByKey)) {
		if (state === 'include') included.push(key);
		else if (state === 'exclude') excluded.push(key);
		else if (state === 'optional') optional.push(key);
	}

	// Check if "Show Rates" is enabled - this is the key distinction
	if (v.showRates) {
		const mode = v.mode || 'percentage';
		const advanced = v.advanced || {};

		// Get all configured items from stateByKey and create entries with rates
		const entries = Object.keys(stateByKey).map((k) => {
			const advancedEntry = advanced[k] || {};
			return {
				label: k,
				kind: 'static',
				value: Number(
					mode === 'percentage'
						? (advancedEntry.percentageValue ?? advancedEntry.value ?? 0)
						: (advancedEntry.countValue ?? advancedEntry.value ?? 0)
				),
				status: stateByKey[k] || 'optional'
			};
		});

		let target = 100;
		if (mode === 'count') {
			target =
				typeof inheritedSongCount === 'object'
					? // @ts-ignore - inheritedSongCount can have max/value based on kind
					(inheritedSongCount?.max ?? inheritedSongCount?.value ?? 20)
					: Number(inheritedSongCount) || 20;
		}
		return { mode, total: target, items: entries, showRates: true };
	}

	// No rates enabled - show basic mode with status indicators only
	return {
		mode: 'basic',
		total: normalizedTotal,
		included: included,
		excluded: excluded,
		optional: optional
	};
}

/**
 * Extract songs and types display values with allocation predictions
 * @param {import('./nodeDefinitions.js').SongsAndTypesSettings | Record<string, any>} value - Songs and types value object
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number} | Record<string, any>} inheritedSongCount - Inherited song count configuration
 * @param {string} seedKey - Seed for deterministic randomization
 * @returns {Object} Formatted display values with predictions
 */
export function extractSongsAndTypesDisplay(value, inheritedSongCount, seedKey = '') {
	const v = value || {};
	const mode = v.mode || 'percentage';
	const st = v.songTypes || {};
	const normalizedTotal =
		inheritedSongCount && typeof inheritedSongCount === 'object'
			? inheritedSongCount
			: {
				kind: 'static',
				value: Number.isFinite(Number(inheritedSongCount)) ? Number(inheritedSongCount) : 20
			};
	const rng = makeRng(`songs-types-${seedKey}`);
	// Predict total songs (static)
	let totalSongs;
	if (inheritedSongCount && typeof inheritedSongCount === 'object') {
		if (normalizedTotal.kind === 'static') {
			// @ts-ignore - normalizedTotal has value when kind is 'static'
			totalSongs = Math.round(Number(normalizedTotal.value || 0));
		} else {
			totalSongs = randomInt(
				rng,
				// @ts-ignore - normalizedTotal can have min/max when kind is 'range'
				Math.round(Number(normalizedTotal.min || 0)),
				// @ts-ignore
				Math.round(Number(normalizedTotal.max || 0))
			);
		}
	} else if (v.songCount?.random) {
		totalSongs = randomInt(
			rng,
			Math.round(Number(v.songCount.min || 0)),
			Math.round(Number(v.songCount.max || 0))
		);
	} else {
		totalSongs = Math.round(Number(v.songCount?.value || 0));
	}

	// Build type entries for allocation
	const enabled = ['openings', 'endings', 'inserts'].filter((k) => st[k]?.enabled ?? false);
	/** @type {import('./mathUtils.js').AllocationEntry[]} */
	const typeEntries = enabled.map((t) => {
		const cfg = st[t] || {};
		if (mode === 'percentage') {
			if (cfg.random)
				return {
					label: t,
					kind: /** @type {'range'} */ ('range'),
					min: Number(cfg.percentageMin ?? cfg.min ?? 0),
					max: Number(cfg.percentageMax ?? cfg.max ?? 0)
				};
			return { label: t, kind: /** @type {'static'} */ ('static'), value: Number(cfg.percentage ?? 0) };
		}
		// count mode
		if (cfg.random)
			return {
				label: t,
				kind: /** @type {'range'} */ ('range'),
				min: Number(cfg.countMin ?? cfg.min ?? 0),
				max: Number(cfg.countMax ?? cfg.max ?? 0)
			};
		return { label: t, kind: /** @type {'static'} */ ('static'), value: Number(cfg.count ?? 0) };
	});
	const typeTotal = mode === 'percentage' ? 100 : totalSongs;
	// Analyze actual allocation ranges for song types
	const typeAllocationRanges = analyzeAllocationRanges(typeEntries, typeTotal);
	const typesPredicted = enabled.map((t) => {
		const allocation = typeAllocationRanges.get(t);
		return allocation ? { label: t, ...allocation } : { label: t, kind: 'static', value: 0 };
	});

	// Song selection allocation (random vs watched)
	const sel = v.songSelection || {};
	/** @type {import('./mathUtils.js').AllocationEntry[]} */
	const selEntries = [
		sel.random?.random
			? {
				label: 'random',
				kind: /** @type {'range'} */ ('range'),
				min: Number(
					mode === 'percentage' ? (sel.random.percentageMin ?? 0) : (sel.random.countMin ?? 0)
				),
				max: Number(
					mode === 'percentage'
						? (sel.random.percentageMax ?? 100)
						: (sel.random.countMax ?? totalSongs)
				)
			}
			: {
				label: 'random',
				kind: /** @type {'static'} */ ('static'),
				value: Number(
					mode === 'percentage' ? (sel.random?.percentage ?? 0) : (sel.random?.count ?? 0)
				)
			},
		sel.watched?.random
			? {
				label: 'watched',
				kind: /** @type {'range'} */ ('range'),
				min: Number(
					mode === 'percentage' ? (sel.watched.percentageMin ?? 0) : (sel.watched.countMin ?? 0)
				),
				max: Number(
					mode === 'percentage'
						? (sel.watched.percentageMax ?? 100)
						: (sel.watched.countMax ?? totalSongs)
				)
			}
			: {
				label: 'watched',
				kind: /** @type {'static'} */ ('static'),
				value: Number(
					mode === 'percentage'
						? (sel.watched?.percentage ?? totalSongs)
						: (sel.watched?.count ?? totalSongs)
				)
			}
	];
	const selTotal = mode === 'percentage' ? 100 : totalSongs;
	// Analyze actual allocation ranges for song selection
	const selectionAllocationRanges = analyzeAllocationRanges(selEntries, selTotal);
	const selectionDisplay = {};
	selEntries.forEach((entry) => {
		const allocation = selectionAllocationRanges.get(entry.label);
		selectionDisplay[entry.label] = allocation || entry;
	});

	return {
		mode,
		total:
			normalizedTotal.kind === 'range'
				? // @ts-ignore - normalizedTotal can have min/max when kind is 'range'
				{ kind: 'range', min: normalizedTotal?.min, max: normalizedTotal?.max }
				: { kind: 'static', value: totalSongs },
		songTypes: Object.fromEntries(
			typesPredicted.map(t => [t.label, t])
		),
		types: typesPredicted,
		songSelection: selectionDisplay
	};
}

/**
 * Formats execution chance for display
 * @param {number | { kind: 'range'; min?: number; max?: number; } | undefined} executionChance - Execution chance as percentage (0-100) or range object
 * @returns {string} Formatted execution chance string
 */
export function formatExecutionChance(executionChance) {
	if (executionChance === undefined) {
		return '100%';
	}

	if (typeof executionChance === 'object' && executionChance !== null) {
		if (executionChance.kind === 'range') {
			return `${executionChance.min || 0}%-${executionChance.max || 100}%`;
		}
		return '100%'; // Fallback
	}

	return `${Number(executionChance)}%`;
}
