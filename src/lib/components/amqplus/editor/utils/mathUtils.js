/**
 * Mathematical utility functions for the AMQ+ Editor
 */

/**
 * @typedef {Object} AllocationEntry
 * @property {string} label - Entry label
 * @property {'static'|'range'} kind - Entry kind
 * @property {number} [value] - Static value (for kind='static')
 * @property {number} [min] - Minimum value (for kind='range')
 * @property {number} [max] - Maximum value (for kind='range')
 */

/**
 * @typedef {Object} AllocationResult
 * @property {'static'|'range'} type - Result type
 * @property {number} [value] - Static value (for type='static')
 * @property {number} [min] - Minimum value (for type='range')
 * @property {number} [max] - Maximum value (for type='range')
 */

/**
 * @typedef {Object} GroupAnalysisResult
 * @property {boolean} hasRandom - Whether there's randomness in the allocation
 * @property {Map<string, AllocationResult>} refined - Refined allocation map
 * @property {number} comboCount - Number of possible combinations
 * @property {boolean} unique - Whether allocation is unique (deterministic)
 */

/**
 * Helper function for range analysis - analyzes allocation possibilities for groups
 * @param {AllocationEntry[]} entries - Array of allocation entries with label, kind, and value/min/max
 * @param {number} target - Target total to allocate
 * @returns {GroupAnalysisResult} Analysis result with hasRandom, refined map, comboCount, and unique flag
 */
export function analyzeGroup(entries, target) {
	const randomRanges = entries
		.filter((e) => e.kind === 'range')
		.map((r) => ({ label: r.label, min: Math.round(r.min || 0), max: Math.round(r.max || 0) }));
	const staticEntries = entries
		.filter((e) => e.kind === 'static')
		.map((s) => ({ label: s.label, value: Math.round(s.value || 0) }));
	const staticSum = staticEntries.reduce((sum, s) => sum + s.value, 0);
	const remaining = Math.round(target - staticSum);
	const refined = new Map();
	let comboCount = 0;

	if (randomRanges.length === 0) {
		staticEntries.forEach((s) => refined.set(s.label, { type: 'static', value: s.value }));
		return { hasRandom: false, refined, comboCount, unique: true };
	}

	const sumMin = randomRanges.reduce((s, r) => s + r.min, 0);
	const sumMax = randomRanges.reduce((s, r) => s + r.max, 0);
	if (remaining < sumMin || remaining > sumMax) {
		randomRanges.forEach((r) => refined.set(r.label, { type: 'range', min: r.min, max: r.min }));
		staticEntries.forEach((s) => refined.set(s.label, { type: 'static', value: s.value }));
		return { hasRandom: false, refined, comboCount: 0, unique: true };
	}

	for (let i = 0; i < randomRanges.length; i++) {
		const r = randomRanges[i];
		let otherMin = 0,
			otherMax = 0;
		for (let j = 0; j < randomRanges.length; j++) {
			if (j === i) continue;
			otherMin += randomRanges[j].min;
			otherMax += randomRanges[j].max;
		}
		const thisMin = Math.max(r.min, remaining - otherMax);
		const thisMax = Math.min(r.max, remaining - otherMin);
		refined.set(r.label, { type: 'range', min: thisMin, max: thisMax });
	}

	const widths = randomRanges.map((r) => r.max - r.min);
	const need = remaining - sumMin;
	if (need < 0) {
		comboCount = 0;
	} else if (need === 0) {
		comboCount = 1;
	} else {
		// Limit array size to prevent RangeError: Invalid array length
		const maxArraySize = 10000;
		const limitedNeed = Math.min(need, maxArraySize);
		let dp = new Array(limitedNeed + 1).fill(0);
		dp[0] = 1;
		for (const w of widths) {
			const ndp = new Array(limitedNeed + 1).fill(0);
			for (let s = 0; s <= limitedNeed; s++) {
				if (dp[s] === 0) continue;
				const maxAdd = Math.min(w, limitedNeed - s);
				for (let k = 0; k <= maxAdd; k++) {
					ndp[s + k] += dp[s];
					if (ndp[s + k] > 2) ndp[s + k] = 3;
				}
			}
			dp = ndp;
		}
		comboCount = need > maxArraySize ? 3 : dp[limitedNeed] || 0;
	}

	staticEntries.forEach((s) => refined.set(s.label, { type: 'static', value: s.value }));
	const unique =
		comboCount <= 1 ||
		Array.from(refined.values()).every((v) => v.type === 'static' || v.min === v.max);
	const hasRandom =
		comboCount >= 2 &&
		Array.from(refined.values()).some((v) => v.type === 'range' && v.min < v.max);
	return { hasRandom, refined, comboCount, unique };
}

/**
 * @typedef {() => number} RngFunction
 */

/**
 * Seeded RNG helpers for deterministic predictions
 * @param {string|number} seed - Seed value
 * @returns {number} Hash value as unsigned 32-bit integer
 */
export function hashStringToInt(seed) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < String(seed).length; i++) {
		h ^= String(seed).charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}

/**
 * Create a Mulberry32 RNG instance
 * @param {number} a - Seed value
 * @returns {RngFunction} RNG function
 */
export function mulberry32(a) {
	return function () {
		let t = (a += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generate a random seed string of 16 letters
 * @returns {string} 16-character random letter string
 */
export function generateRandomSeed() {
	const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	let result = '';
	for (let i = 0; i < 16; i++) {
		result += letters[Math.floor(Math.random() * letters.length)];
	}
	return result;
}

/**
 * Create a seeded RNG function
 * @param {string|number} seed - Seed value
 * @returns {RngFunction} RNG function
 */
export function makeRng(seed) {
	return mulberry32(hashStringToInt(seed));
}

/**
 * Clamp a number between two bounds
 * @param {number} n - Number to clamp
 * @param {number} lo - Lower bound
 * @param {number} hi - Upper bound
 * @returns {number} Clamped value
 */
export function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

/**
 * Generate a random integer between two bounds using RNG
 * @param {RngFunction} rng - Random number generator function
 * @param {number} lo - Lower bound
 * @param {number} hi - Upper bound
 * @returns {number} Random integer in range [lo, hi]
 */
export function randomInt(rng, lo, hi) {
	const a = Math.ceil(lo);
	const b = Math.floor(hi);
	if (b <= a) return a;
	return a + Math.floor(rng() * (b - a + 1));
}

/**
 * Core allocator: assign concrete integers to meet a target total
 * @param {AllocationEntry[]} entries - Array of entries with label, kind ('static'|'range'), and value/min/max
 * @param {number} targetTotal - Target total to allocate
 * @param {RngFunction} rng - Random number generator function
 * @returns {Map<string, number>} Map of label -> allocated value
 */
export function allocateToTotal(entries, targetTotal, rng) {
	const assigned = new Map();
	const statics = [];
	const ranges = [];
	for (const e of entries) {
		if (e.kind === 'static') statics.push(e);
		else ranges.push(e);
	}
	const staticTotal = statics.reduce((s, e) => s + Number(e.value || 0), 0);
	let remaining = Math.max(0, Math.round(Number(targetTotal || 0)) - Math.round(staticTotal));
	for (const s of statics) assigned.set(s.label, Math.round(Number(s.value || 0)));
	if (ranges.length === 0) return assigned;

	const mins = ranges.map((e) => Math.round(Number(e.min || 0)));
	const maxs = ranges.map((e) => Math.round(Number(e.max || 0)));
	const sumMins = mins.reduce((a, b) => a + b, 0);
	const sumMaxs = maxs.reduce((a, b) => a + b, 0);
	// Clamp remaining into feasible bounds if misconfigured
	remaining = clamp(remaining, sumMins, sumMaxs);

	if (ranges.length === 1) {
		const only = ranges[0];
		const val = clamp(
			remaining,
			Math.round(Number(only.min || 0)),
			Math.round(Number(only.max || 0))
		);
		assigned.set(only.label, val);
		return assigned;
	}

	// Choose one range first, then fill the rest
	const firstIdx = randomInt(rng, 0, ranges.length - 1);
	const othersIdx = [];
	for (let i = 0; i < ranges.length; i++) if (i !== firstIdx) othersIdx.push(i);
	// Assign chosen first within feasible bounds so others can at least take their mins
	const sumMinsOthers = othersIdx.reduce((s, i) => s + mins[i], 0);
	const chosen = ranges[firstIdx];
	const chosenMin = Math.max(mins[firstIdx], remaining - (sumMaxs - maxs[firstIdx]));
	const chosenMax = Math.min(maxs[firstIdx], remaining - sumMinsOthers);
	const chosenVal = clamp(randomInt(rng, chosenMin, chosenMax), chosenMin, chosenMax);
	assigned.set(chosen.label, chosenVal);
	let left = remaining - chosenVal;

	// Sequentially assign others; last one fills remainder within its bounds
	for (let idx = 0; idx < othersIdx.length; idx++) {
		const i = othersIdx[idx];
		const e = ranges[i];
		const minsRemainingOthers = othersIdx.slice(idx + 1).reduce((s, j) => s + mins[j], 0);
		const feasibleMin = Math.max(
			mins[i],
			left - othersIdx.slice(idx + 1).reduce((s, j) => s + maxs[j], 0)
		);
		const feasibleMax = Math.min(maxs[i], left - minsRemainingOthers);
		const val =
			idx === othersIdx.length - 1
				? clamp(left, feasibleMin, feasibleMax)
				: clamp(randomInt(rng, feasibleMin, feasibleMax), feasibleMin, feasibleMax);
		assigned.set(e.label, val);
		left -= val;
	}
	return assigned;
}

/**
 * @typedef {Object} AllocationRangeAnalysis
 * @property {number} min - Minimum allocated value across simulations
 * @property {number} max - Maximum allocated value across simulations
 * @property {number[]} values - All allocated values from simulations
 */

/**
 * Analyze actual allocation ranges by running multiple simulations
 * @param {AllocationEntry[]} entries - Array of allocation entries
 * @param {number} targetTotal - Target total to allocate
 * @param {number} simulations - Number of simulations to run (default: 50)
 * @returns {Map<string, AllocationResult>} Map of label -> allocation range analysis
 */
export function analyzeAllocationRanges(entries, targetTotal, simulations = 50) {
	const results = new Map();

	// Initialize tracking for each entry
	entries.forEach((entry) => {
		results.set(entry.label, { min: Infinity, max: -Infinity, values: [] });
	});

	// Run multiple allocation simulations
	for (let i = 0; i < simulations; i++) {
		const rng = makeRng(`allocation-sim-${i}`);
		const allocation = allocateToTotal(entries, targetTotal, rng);

		allocation.forEach((value, label) => {
			const result = results.get(label);
			if (result) {
				result.min = Math.min(result.min, value);
				result.max = Math.max(result.max, value);
				result.values.push(value);
			}
		});
	}

	// Convert to display format
	const displayRanges = new Map();
	results.forEach((result, label) => {
		const entry = entries.find((e) => e.label === label);
		if (entry) {
			if (entry.kind === 'static') {
				displayRanges.set(label, { kind: 'static', value: entry.value });
			} else {
				// For ranges, show the actual feasible range from simulations
				displayRanges.set(label, {
					kind: 'range',
					min: result.min,
					max: result.max,
					configured: { min: entry.min, max: entry.max }
				});
			}
		}
	});

	return displayRanges;
}


/**
 * Helper function to shuffle array using Fisher-Yates algorithm
 * @template T
 * @param {T[]} array - Array to shuffle
 * @returns {T[]} New shuffled array (does not modify original)
 */
export function shuffleArray(array) {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
