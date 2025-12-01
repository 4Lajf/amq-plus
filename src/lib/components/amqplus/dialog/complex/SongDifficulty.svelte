<script>
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { SONG_DIFFICULTY_DEFAULT_SETTINGS } from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initializeSongDifficultyMode } from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';
	import { quickFixSongDifficulty } from '$lib/components/amqplus/editor/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		validationWarning = $bindable(''),
		readOnly = false // Whether the form is in read-only mode
	} = $props();

	// Track if we're currently updating sliders to prevent infinite loops
	let isUpdatingSliders = false;
	let isManualEdit = false;

	// Initialize view mode if not present
	if (!editedValue.viewMode) {
		editedValue.viewMode = SONG_DIFFICULTY_DEFAULT_SETTINGS.viewMode;
	}

	// Initialize mode if not present
	if (!editedValue.mode) {
		editedValue.mode = SONG_DIFFICULTY_DEFAULT_SETTINGS.mode;
	}

	// Sync mode changes from parent (when percentageModeLocked is set)
	$effect(() => {
		if (editedValue.percentageModeLocked && editedValue.mode !== 'percentage') {
			editedValue.mode = 'percentage';
		}
	});

	// Store current total songs for ratio calculations
	// Always update to current value when dialog opens
	editedValue._storedTotalSongs = getTotalSongs();

	// Helper function to get the appropriate max value from getTotalSongs()
	function getTotalSongsMax() {
		const total = getTotalSongs();
		if (total && typeof total === 'object') {
			return Number(total.max ?? 200);
		}
		return Number(total) || 20;
	}

	// Helper function to check if number of songs is a random range
	function isSongsRandomRange() {
		const total = getTotalSongs();
		return total && typeof total === 'object';
	}

	// Initialize random range properties using defaults from defaultNodeSettings
	const initializeRandomRangeProperties = () => {
		const difficulties = ['easy', 'medium', 'hard'];
		difficulties.forEach((difficulty) => {
			if (editedValue[difficulty]) {
				const defaultDifficultySettings = SONG_DIFFICULTY_DEFAULT_SETTINGS[difficulty];

				// Initialize randomRange if not present
				if (editedValue[difficulty].randomRange === undefined) {
					editedValue[difficulty].randomRange = defaultDifficultySettings?.randomRange ?? false;
				}
				// Initialize min/max percentage values if not present
				if (editedValue[difficulty].minPercentage === undefined) {
					editedValue[difficulty].minPercentage = defaultDifficultySettings?.minPercentage ?? 25;
				}
				if (editedValue[difficulty].maxPercentage === undefined) {
					editedValue[difficulty].maxPercentage = defaultDifficultySettings?.maxPercentage ?? 40;
				}
				// Initialize min/max count values if not present
				if (editedValue[difficulty].minCount === undefined) {
					editedValue[difficulty].minCount = defaultDifficultySettings?.minCount ?? 5;
				}
				if (editedValue[difficulty].maxCount === undefined) {
					editedValue[difficulty].maxCount = defaultDifficultySettings?.maxCount ?? 10;
				}

				if (
					editedValue[difficulty].percentage !== undefined &&
					editedValue[difficulty].percentageValue === undefined
				) {
					editedValue[difficulty].percentageValue = editedValue[difficulty].percentage;
				}
				if (
					editedValue[difficulty].count !== undefined &&
					editedValue[difficulty].countValue === undefined
				) {
					editedValue[difficulty].countValue = editedValue[difficulty].count;
				}
			}
		});
	};

	// Initialize properties on component mount
	initializeRandomRangeProperties();

	// Initialize ranges if not present
	if (!editedValue.ranges) {
		editedValue.ranges = [];
	}

	// Ensure all ranges have songCount initialized
	editedValue.ranges.forEach((range) => {
		if (range.songCount === undefined) {
			range.songCount = 1; // Will be recalculated properly by recalculateRangeSongCounts
		}
	});

	// Recalculate to ensure proper distribution
	if (editedValue.ranges.length > 0) {
		recalculateRangeSongCounts();
	}

	// Get enabled difficulty types
	function getEnabledTypes() {
		// Ensure consistent order: Easy, Medium, Hard
		const orderedTypes = ['easy', 'medium', 'hard'];
		return orderedTypes.filter((type) => editedValue[type] && editedValue[type].enabled);
	}

	// Advanced view functions
	function addRange() {
		const mode = editedValue.mode || 'count';
		const currentRanges = editedValue.ranges.length;

		// Calculate how many to allocate to the new range
		let newRangeSongCount = 1; // Default

		if (currentRanges > 0) {
			// If there are existing ranges, distribute remaining
			const currentTotal = editedValue.ranges.reduce(
				(sum, range) => sum + (range.songCount || 0),
				0
			);
			const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();
			const remaining = Math.max(0, targetTotal - currentTotal);
			newRangeSongCount = Math.max(1, Math.floor(remaining / (currentRanges + 1)));

			// Redistribute existing ranges to make room for the new one
			if (currentTotal > 0) {
				const targetTotalForExisting = targetTotal - newRangeSongCount;
				let distributedTotal = 0;

				for (let i = 0; i < currentRanges - 1; i++) {
					const oldCount = editedValue.ranges[i].songCount || 0;
					const proportion = oldCount / currentTotal;
					const newCount = Math.max(0, Math.round(targetTotalForExisting * proportion));
					editedValue.ranges[i].songCount = newCount;
					distributedTotal += newCount;
				}

				// Adjust the last existing range
				if (currentRanges > 0) {
					const lastExistingIndex = currentRanges - 1;
					editedValue.ranges[lastExistingIndex].songCount = Math.max(
						0,
						targetTotalForExisting - distributedTotal
					);
				}
			}
		} else {
			// First range gets all
			newRangeSongCount = mode === 'percentage' ? 100 : getTotalSongsMax();
		}

		const newRange = { from: 10, to: 20, songCount: newRangeSongCount };
		editedValue.ranges = [...editedValue.ranges, newRange];
		validateRanges();
	}

	function removeRange(index) {
		editedValue.ranges = editedValue.ranges.filter((_, i) => i !== index);
		recalculateRangeSongCounts();
		validateRanges();
	}

	function updateRange(index, field, value) {
		const numValue = parseInt(value) || 0;
		const clampedValue = Math.max(0, Math.min(100, numValue));

		editedValue.ranges[index][field] = clampedValue;

		// Ensure from <= to
		if (field === 'from' && clampedValue > editedValue.ranges[index].to) {
			editedValue.ranges[index].to = clampedValue;
		} else if (field === 'to' && clampedValue < editedValue.ranges[index].from) {
			editedValue.ranges[index].from = clampedValue;
		}

		validateRanges();
	}

	function recalculateRangeSongCounts() {
		const numRanges = editedValue.ranges.length;
		const mode = editedValue.mode || 'count';

		if (numRanges === 0) return;

		if (mode === 'percentage') {
			// In percentage mode, distribute percentages that sum to 100%
			const targetTotal = 100;

			// Calculate current total of existing song count percentages
			const currentSum = editedValue.ranges.reduce((sum, range) => sum + (range.songCount || 0), 0);

			if (currentSum > 0) {
				// Preserve ratios
				let distributedTotal = 0;
				for (let i = 0; i < numRanges - 1; i++) {
					const oldCount = editedValue.ranges[i].songCount || 0;
					const proportion = oldCount / currentSum;
					const newCount = Math.max(0, Math.round(targetTotal * proportion));
					editedValue.ranges[i].songCount = newCount;
					distributedTotal += newCount;
				}
				// Set the last range to ensure exact total
				const lastIndex = numRanges - 1;
				editedValue.ranges[lastIndex].songCount = Math.max(0, targetTotal - distributedTotal);
			} else {
				// If all counts are 0, distribute equally
				const baseCount = Math.floor(targetTotal / numRanges);
				const remainder = targetTotal % numRanges;
				editedValue.ranges.forEach((range, index) => {
					range.songCount = baseCount + (index < remainder ? 1 : 0);
				});
			}
		} else {
			// In static count mode, distribute counts that sum to total songs
			const totalSongs = getTotalSongsMax();

			// Calculate current total of existing song counts
			const currentSum = editedValue.ranges.reduce((sum, range) => sum + (range.songCount || 0), 0);

			if (currentSum > 0) {
				// Preserve ratios
				let distributedTotal = 0;
				for (let i = 0; i < numRanges - 1; i++) {
					const oldCount = editedValue.ranges[i].songCount || 0;
					const proportion = oldCount / currentSum;
					const newCount = Math.max(0, Math.round(totalSongs * proportion));
					editedValue.ranges[i].songCount = newCount;
					distributedTotal += newCount;
				}
				// Set the last range to ensure exact total
				const lastIndex = numRanges - 1;
				editedValue.ranges[lastIndex].songCount = Math.max(0, totalSongs - distributedTotal);
			} else {
				// If all counts are 0, distribute equally
				const baseCount = Math.floor(totalSongs / numRanges);
				const remainder = totalSongs % numRanges;
				editedValue.ranges.forEach((range, index) => {
					range.songCount = baseCount + (index < remainder ? 1 : 0);
				});
			}
		}
	}

	// Handle manual song count changes
	function updateSongCount(index, value) {
		const numValue = parseInt(value) || 0;
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : getTotalSongsMax();
		const clampedValue = Math.max(0, Math.min(maxValue, numValue));
		editedValue.ranges[index].songCount = clampedValue;
		validateRanges();
	}

	// Handle range slider changes
	function handleRangeSliderChange(index, event) {
		const values = event.detail.values;
		editedValue.ranges[index].from = values[0];
		editedValue.ranges[index].to = values[1];
		validateRanges();
	}

	function validateRanges() {
		if (editedValue.viewMode !== 'advanced') {
			isValid = true;
			validationMessage = '';
			return;
		}

		if (editedValue.ranges.length === 0) {
			isValid = false;
			validationMessage = 'At least one difficulty range is required in advanced mode.';
			return;
		}

		// Overlapping ranges are now allowed

		const mode = editedValue.mode || 'count';

		// Difficulty ranges (from/to) are always 0-100% in both modes
		for (let i = 0; i < editedValue.ranges.length; i++) {
			const range = editedValue.ranges[i];
			if (
				range.from < 0 ||
				range.from > 100 ||
				range.to < 0 ||
				range.to > 100 ||
				range.from > range.to
			) {
				isValid = false;
				validationMessage = `Range ${i + 1}: Difficulty values must be between 0-100% and 'From' must be ≤ 'To'.`;
				return;
			}
		}

		// Validate song counts based on mode
		const totalSongCounts = editedValue.ranges.reduce(
			(sum, range) => sum + (range.songCount || 0),
			0
		);

		if (mode === 'percentage') {
			// In percentage mode, song count percentages must sum to 100%
			if (Math.abs(totalSongCounts - 100) > 0.01) {
				isValid = false;
				validationMessage = `Song count percentages must total 100%. Current total: ${totalSongCounts}%.`;
				return;
			}
		} else {
			// In static count mode, song counts must sum to total songs
			const totalSongs = getTotalSongsMax();
			if (totalSongCounts !== totalSongs) {
				isValid = false;
				validationMessage = `Song counts must total ${totalSongs} songs. Current total: ${totalSongCounts} songs.`;
				return;
			}
		}

		isValid = true;
		validationMessage = '';
	}

	// Check if any difficulty types use random ranges
	function anyDifficultiesUseRandomRanges() {
		const enabledTypes = getEnabledTypes();
		return enabledTypes.some((type) => editedValue[type].randomRange);
	}

	// Check if all difficulty types use random ranges
	function allDifficultiesUseRandomRanges() {
		const enabledTypes = getEnabledTypes();
		return enabledTypes.length > 0 && enabledTypes.every((type) => editedValue[type].randomRange);
	}

	// Validate total when manual editing is complete
	function validateAndFixTotal() {
		if (isUpdatingSliders) return;

		validationMessage = '';
		validationWarning = '';

		// For advanced mode, use range validation
		if (editedValue.viewMode === 'advanced') {
			validateRanges();
			return;
		}

		// For basic mode, handle both static and random range validation
		const enabledTypes = getEnabledTypes();
		if (enabledTypes.length === 0) {
			isValid = true;
			return;
		}

		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongsMax();
		const unit = editedValue.mode === 'percentage' ? '%' : ' songs';
		const prop = editedValue.mode === 'percentage' ? 'percentageValue' : 'countValue';

		// Check if we have mixed random and static ranges
		const hasRandomRanges = anyDifficultiesUseRandomRanges();
		const allRandomRanges = allDifficultiesUseRandomRanges();

		if (allRandomRanges) {
			// All types use random ranges - validate coverage and maximums
			let hasExcessiveRange = false;
			let totalMinimum = 0;
			let totalMaximum = 0;

			enabledTypes.forEach((type) => {
				const difficulty = editedValue[type];
				const minVal = difficulty[editedValue.mode === 'percentage' ? 'minPercentage' : 'minCount'];
				const maxVal = difficulty[editedValue.mode === 'percentage' ? 'maxPercentage' : 'maxCount'];

				totalMinimum += minVal;
				totalMaximum += maxVal;

				if (maxVal > maxValue) {
					hasExcessiveRange = true;
					isValid = false;
					validationMessage = `${type} maximum (${maxVal}${unit}) exceeds the total limit of ${maxValue}${unit}.`;
					return;
				}
			});

			if (!hasExcessiveRange) {
				// Check if the total range coverage is valid
				if (totalMinimum > maxValue) {
					isValid = false;
					validationMessage = `Combined minimum values (${totalMinimum}${unit}) exceed the total limit of ${maxValue}${unit}.`;
				} else if (totalMaximum < maxValue) {
					isValid = false;
					validationMessage = `Combined maximum values (${totalMaximum}${unit}) are less than the required total of ${maxValue}${unit}.`;
				} else {
					isValid = true;
				}
			}
		} else if (hasRandomRanges) {
			// Mixed random and static ranges - validate and show detailed warning
			let staticTotal = 0;
			let randomMinTotal = 0;
			let randomMaxTotal = 0;
			const randomTypes = [];
			const staticTypes = [];

			enabledTypes.forEach((type) => {
				const difficulty = editedValue[type];
				if (difficulty.randomRange) {
					randomMinTotal +=
						difficulty[editedValue.mode === 'percentage' ? 'minPercentage' : 'minCount'];
					randomMaxTotal +=
						difficulty[editedValue.mode === 'percentage' ? 'maxPercentage' : 'maxCount'];
					randomTypes.push(type);
				} else {
					staticTotal += difficulty[prop];
					staticTypes.push({
						type,
						value: difficulty[prop]
					});
				}
			});

			// Calculate available range for random types
			const availableForRandom = maxValue - staticTotal;

			// Check if static + random min > maxValue (impossible)
			if (staticTotal + randomMinTotal > maxValue) {
				isValid = false;
				validationMessage = `Static values (${staticTotal}${unit}) plus random minimums (${randomMinTotal}${unit}) exceed ${maxValue}${unit}. This configuration is impossible.`;
			}
			// Check if static + random max < maxValue (impossible)
			else if (staticTotal + randomMaxTotal < maxValue) {
				isValid = false;
				validationMessage = `Static values (${staticTotal}${unit}) plus random maximums (${randomMaxTotal}${unit}) are less than ${maxValue}${unit}. This configuration is impossible.`;
			} else {
				isValid = true;

				// Build detailed warning message showing actual possible ranges
				let warningParts = [];

				// Show static values
				if (staticTypes.length > 0) {
					const staticDetails = staticTypes
						.map((item) => `${item.type}: ${item.value}${unit}`)
						.join(', ');
					warningParts.push(`Static values: ${staticDetails}`);
				}

				// Show available range for random types
				if (randomTypes.length === 1) {
					warningParts.push(
						`${randomTypes[0]} will be constrained to exactly ${availableForRandom}${unit} (no randomization possible)`
					);
				} else if (randomTypes.length > 1) {
					warningParts.push(
						`Random types (${randomTypes.join(', ')}) will share ${availableForRandom}${unit} total. Actual ranges will be constrained based on other random values.`
					);
				}

				validationWarning = `Warning: Mixing random ranges with static values limits randomization. ${warningParts.join('. ')}. Consider using all static values or all random ranges for better flexibility.`;
			}
		} else {
			// All static values - use original validation
			const currentTotal = enabledTypes.reduce((sum, type) => sum + editedValue[type][prop], 0);

			if (Math.abs(currentTotal - maxValue) <= 0.01) {
				// Allow for tiny rounding errors
				isValid = true;
			} else {
				isValid = false;
				validationMessage = `Song difficulties must total ${maxValue}${unit}. Current total: ${currentTotal}${unit}`;
			}
		}
	}

	// Handle slider changes - ensure values always total correctly
	function handleSliderChange(type, event) {
		const newValue = event.detail.value;

		// Prevent validation during slider updates
		isUpdatingSliders = true;

		const enabledTypes = getEnabledTypes();
		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();
		const otherTypes = enabledTypes.filter((t) => t !== type);

		// Set the new value for the changed slider
		if (editedValue.mode === 'percentage') {
			editedValue[type].percentageValue = newValue;
		} else {
			editedValue[type].countValue = newValue;
		}

		if (otherTypes.length === 0) {
			// Only one slider enabled, no adjustment needed
			isUpdatingSliders = false;
			isValid = true;
			validationMessage = '';
			return;
		}

		// Calculate remaining value to distribute
		const remaining = maxValue - newValue;

		const prop = editedValue.mode === 'percentage' ? 'percentageValue' : 'countValue';

		if (remaining < 0) {
			// If new value exceeds max, set it to max and others to 0
			editedValue[type][prop] = maxValue;
			otherTypes.forEach((t) => {
				editedValue[t][prop] = 0;
			});
		} else if (remaining === 0) {
			// If new value equals max, set others to 0
			otherTypes.forEach((t) => {
				editedValue[t][prop] = 0;
			});
		} else {
			// Distribute remaining value proportionally among other types
			const currentOtherTotal = otherTypes.reduce((sum, t) => sum + editedValue[t][prop], 0);

			if (currentOtherTotal > 0) {
				// Proportional distribution
				let distributedTotal = 0;

				// Distribute to all but the last slider
				for (let i = 0; i < otherTypes.length - 1; i++) {
					const t = otherTypes[i];
					const currentValue = editedValue[t][prop];
					const proportion = currentValue / currentOtherTotal;
					const newVal = Math.round(remaining * proportion);
					editedValue[t][prop] = newVal;
					distributedTotal += newVal;
				}

				// Set the last slider to ensure exact total
				const lastType = otherTypes[otherTypes.length - 1];
				editedValue[lastType][prop] = remaining - distributedTotal;
			} else {
				// If all other values are 0, distribute equally
				const equalShare = Math.floor(remaining / otherTypes.length);
				const remainder = remaining % otherTypes.length;

				otherTypes.forEach((t, index) => {
					const value = equalShare + (index < remainder ? 1 : 0);
					editedValue[t][prop] = value;
				});
			}
		}

		// Re-enable validation and validate
		isUpdatingSliders = false;
		validateAndFixTotal();
	}

	// Handle input changes (manual editing - no auto-linking)
	function handleInputChange(type, event) {
		isManualEdit = true;
		const newValue = parseInt(event.target.value) || 0;
		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();

		// Clamp value to valid range
		const clampedValue = Math.max(0, Math.min(maxValue, newValue));
		if (editedValue.mode === 'percentage') {
			editedValue[type].percentageValue = clampedValue;
		} else {
			editedValue[type].countValue = clampedValue;
		}

		// Only validate, don't auto-adjust other sliders
		validateAndFixTotal();
	}

	// Handle input blur (when user finishes editing)
	function handleInputBlur(type) {
		if (!isManualEdit) return;
		isManualEdit = false;

		// Only validate, don't auto-adjust
		validateAndFixTotal();
	}

	// Quick fix function for song difficulties only
	function quickFixValues() {
		const totalSongs = getTotalSongs();
		quickFixSongDifficulty(editedValue, editedValue.mode, totalSongs);
		validateAndFixTotal();
	}

	// Handle mode switching with initialization instead of conversion
	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = getTotalSongsMax();
			editedValue = initializeSongDifficultyMode(editedValue, editedValue.mode, totalSongs);
			previousMode = editedValue.mode;
		}
	});

	// Watch for checkbox changes to redistribute values
	$effect(() => {
		const enabledTypes = getEnabledTypes();
		if (enabledTypes.length === 0) return;

		// If only one type is enabled, give it the full value
		if (enabledTypes.length === 1) {
			const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();
			if (editedValue.mode === 'percentage') {
				editedValue[enabledTypes[0]].percentageValue = maxValue;
			} else {
				editedValue[enabledTypes[0]].countValue = maxValue;
			}
		}

		validateAndFixTotal();
	});

	// Force percentage mode when number of songs becomes a random range
	$effect(() => {
		const songsAreRandomRange = isSongsRandomRange();
		if (songsAreRandomRange && editedValue.mode === 'count') {
			// Switch to percentage mode when Number of Songs becomes a range
			editedValue.mode = 'percentage';
		}
	});

	// Update stored total songs when it changes
	$effect(() => {
		const currentTotal = getTotalSongs();
		if (editedValue._storedTotalSongs !== currentTotal) {
			editedValue._storedTotalSongs = currentTotal;
		}
	});

	// Ensure random range properties are initialized when randomRange is enabled
	$effect(() => {
		const difficulties = ['easy', 'medium', 'hard'];
		difficulties.forEach((difficulty) => {
			if (editedValue[difficulty] && editedValue[difficulty].randomRange) {
				if (editedValue[difficulty].minPercentage === undefined) {
					editedValue[difficulty].minPercentage =
						SONG_DIFFICULTY_DEFAULT_SETTINGS[difficulty].minPercentage;
				}
				if (editedValue[difficulty].maxPercentage === undefined) {
					editedValue[difficulty].maxPercentage =
						SONG_DIFFICULTY_DEFAULT_SETTINGS[difficulty].maxPercentage;
				}
				if (editedValue[difficulty].minCount === undefined) {
					editedValue[difficulty].minCount = SONG_DIFFICULTY_DEFAULT_SETTINGS[difficulty].minCount;
				}
				if (editedValue[difficulty].maxCount === undefined) {
					editedValue[difficulty].maxCount = SONG_DIFFICULTY_DEFAULT_SETTINGS[difficulty].maxCount;
				}
			}
		});
	});

	// Prediction of actual allocation values (like Songs & Types)
	// Cache for getPredictedInfo results (regular variable, not $state, to avoid mutation errors)
	let predictedInfoCache = {
		hash: null,
		result: null
	};

	// Create a hash of the relevant inputs
	function createCacheHash() {
		if (!editedValue) return null;

		const enabledTypes = getEnabledTypes();
		const mode = editedValue.mode || 'count';
		const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();

		// Create a hash based on relevant values
		const hashData = {
			mode,
			targetTotal,
			types: enabledTypes.sort().join(','),
			difficulties: enabledTypes.map((t) => {
				const d = editedValue[t] || {};
				return {
					randomRange: d.randomRange,
					percentageValue: d.percentageValue,
					countValue: d.countValue,
					minPercentage: d.minPercentage,
					maxPercentage: d.maxPercentage,
					minCount: d.minCount,
					maxCount: d.maxCount
				};
			}),
			isValid,
			validationMessage
		};

		return JSON.stringify(hashData);
	}

	function getPredictedInfo() {
		const enabledTypes = getEnabledTypes();
		if (enabledTypes.length === 0) return null;

		// Check cache first
		const currentHash = createCacheHash();
		if (predictedInfoCache.hash === currentHash && predictedInfoCache.result !== null) {
			return predictedInfoCache.result;
		}

		if (!isValid) {
			const result = {
				error: true,
				message: validationMessage || 'Invalid configuration',
				mode: editedValue.mode || 'count',
				unit: (editedValue.mode || 'count') === 'percentage' ? '%' : ''
			};
			predictedInfoCache = { hash: currentHash, result };
			return result;
		}

		const mode = editedValue.mode || 'count';
		const isPercentageMode = mode === 'percentage';
		const unit = isPercentageMode ? '%' : '';
		const targetTotal = isPercentageMode ? 100 : getTotalSongsMax();

		// Build entries for difficulties
		const typeEntries = enabledTypes.map((t) => {
			const d = editedValue[t] || {};
			if (d.randomRange) {
				const min = isPercentageMode ? Number(d.minPercentage ?? 0) : Number(d.minCount ?? 0);
				const max = isPercentageMode ? Number(d.maxPercentage ?? 0) : Number(d.maxCount ?? 0);
				return { label: t, kind: /** @type {'range'} */ ('range'), min, max };
			}
			const value = isPercentageMode ? Number(d.percentageValue || 0) : Number(d.countValue || 0);
			return { label: t, kind: /** @type {'static'} */ ('static'), value };
		});

		const analysis = analyzeGroup(typeEntries, targetTotal);

		const result = {
			mode,
			unit,
			totalSongs: targetTotal,
			types: enabledTypes.map((t) => {
				const entry = typeEntries.find((e) => e.label === t);
				const info = analysis.refined.get(t);
				if (entry.kind === 'static' || !info) {
					return {
						label: t,
						value: entry.kind === 'static' ? entry.value : 0,
						isStatic: entry.kind === 'static'
					};
				}
				if (analysis.hasRandom && info.min < info.max) {
					return { label: t, min: info.min, max: info.max, isStatic: false };
				}
				return { label: t, value: info.min, isStatic: false };
			})
		};

		// Cache the result
		predictedInfoCache = { hash: currentHash, result };
		return result;
	}

	// Memoize the predicted info result to avoid redundant calculations
	// This will only recalculate when its dependencies change
	const predictedInfo = $derived(getPredictedInfo());
</script>

<div class="space-y-4">
	<!-- Actual Allocation Values -->
	{#if predictedInfo && editedValue.viewMode !== 'advanced'}
		{@const pred = predictedInfo}
		<div
			class="mb-4 rounded-lg border p-4"
			class:border-red-200={pred.error}
			class:bg-red-50={pred.error}
			class:border-blue-200={!pred.error}
			class:bg-blue-50={!pred.error}
		>
			<div class="flex items-start gap-3">
				<div class="mt-0.5 shrink-0">
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						class:text-red-600={pred.error}
						class:text-blue-600={!pred.error}
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						></path>
					</svg>
				</div>
				<div class="flex-1">
					{#if pred.error}
						<h4 class="mb-1 text-sm font-medium text-red-900">Configuration Error</h4>
						<div class="text-sm text-red-800">
							<div class="mb-2 rounded bg-red-100 p-2 text-xs">
								<strong>⚠️ Invalid Configuration:</strong>
								{pred.message}
							</div>
							<Button
								type="button"
								class=""
								onclick={quickFixValues}
								disabled={readOnly}
								variant="destructive"
								size="sm"
							>
								Quick Fix
							</Button>
						</div>
					{:else}
						<h4 class="mb-1 text-sm font-medium text-blue-900">Actual Allocation Values</h4>
						<div class="space-y-1 text-sm text-blue-800">
							<div class="mt-2 grid grid-cols-3 gap-2">
								{#each getEnabledTypes() as t}
									{@const info = pred.types.find((x) => x.label === t)}
									<div
										class="rounded border border-blue-200 bg-white px-2 py-1 text-center text-xs"
									>
										<span class="font-medium capitalize">{t}</span>:
										{#if info && info.min !== undefined && info.max !== undefined && info.min <= info.max}
											<span class="text-orange-600">{info.min}-{info.max}{pred.unit}</span>
											<span class="ml-1 text-xs text-gray-500">(random)</span>
										{:else}
											<span
												class={info && info.isStatic
													? 'font-semibold text-blue-600'
													: 'text-green-600'}>{info ? info.value : 0}{pred.unit}</span
											>
											{#if info && !info.isStatic}
												<span class="ml-1 text-xs text-gray-500">(calculated)</span>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Content with Side Controls -->
	<div class="flex gap-4">
		<!-- Main Content -->
		<div class="flex-1">
			{#if editedValue.viewMode === 'basic'}
				<!-- Basic View -->
				<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
					<div class="space-y-4">
						<!-- Easy -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-2">
									<Checkbox
										bind:checked={editedValue.easy.enabled}
										id="easy"
										disabled={readOnly}
										class=""
									/>
									<Label for="easy" class="text-sm">Easy</Label>
								</div>
								{#if editedValue.easy.enabled}
									<div class="flex items-center space-x-2">
										<Checkbox
											bind:checked={editedValue.easy.randomRange}
											id="easy-range"
											disabled={readOnly}
											class=""
										/>
										<Label for="easy-range" class="text-xs text-gray-600">Random range</Label>
									</div>
								{/if}
							</div>
							{#if editedValue.easy.enabled}
								{#if editedValue.easy.randomRange}
									<!-- Random Range Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.easy.minPercentage || 0,
													editedValue.easy.maxPercentage || 100
												]}
												min={0}
												max={100}
												step={1}
												range
												pushy
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.easy.minPercentage = e.detail.values[0];
													editedValue.easy.maxPercentage = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.minPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.easy.minPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.maxPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.easy.maxPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.easy.minCount || 0,
													editedValue.easy.maxCount || getTotalSongsMax()
												]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												range
												pushy
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.easy.minCount = e.detail.values[0];
													editedValue.easy.maxCount = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.minCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.easy.minCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.maxCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.easy.maxCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{:else}
									<!-- Single Value Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.easy.percentageValue || 0]}
												min={0}
												max={100}
												step={1}
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('easy', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.percentageValue || 0}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('easy', e)}
														onblur={() => handleInputBlur('easy')}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.easy.countValue || 0]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('easy', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.easy.countValue || 0}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('easy', e)}
														onblur={() => handleInputBlur('easy')}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{/if}
							{/if}
						</div>

						<!-- Medium -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-2">
									<Checkbox
										bind:checked={editedValue.medium.enabled}
										id="medium"
										disabled={readOnly}
										class=""
									/>
									<Label for="medium" class="text-sm">Medium</Label>
								</div>
								{#if editedValue.medium.enabled}
									<div class="flex items-center space-x-2">
										<Checkbox
											bind:checked={editedValue.medium.randomRange}
											id="medium-range"
											disabled={readOnly}
											class=""
										/>
										<Label for="medium-range" class="text-xs text-gray-600">Random range</Label>
									</div>
								{/if}
							</div>
							{#if editedValue.medium.enabled}
								{#if editedValue.medium.randomRange}
									<!-- Random Range Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.medium.minPercentage || 0,
													editedValue.medium.maxPercentage || 100
												]}
												min={0}
												max={100}
												step={1}
												range
												pushy
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.medium.minPercentage = e.detail.values[0];
													editedValue.medium.maxPercentage = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.minPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.medium.minPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.maxPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.medium.maxPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.medium.minCount || 0,
													editedValue.medium.maxCount || getTotalSongsMax()
												]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												range
												pushy
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.medium.minCount = e.detail.values[0];
													editedValue.medium.maxCount = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.minCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.medium.minCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.maxCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.medium.maxCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{:else}
									<!-- Single Value Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.medium.percentageValue || 0]}
												min={0}
												max={100}
												step={1}
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('medium', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.percentageValue || 0}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('medium', e)}
														onblur={() => handleInputBlur('medium')}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.medium.countValue || 0]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('medium', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.medium.countValue || 0}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('medium', e)}
														onblur={() => handleInputBlur('medium')}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{/if}
							{/if}
						</div>

						<!-- Hard -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-2">
									<Checkbox
										bind:checked={editedValue.hard.enabled}
										id="hard"
										disabled={readOnly}
										class=""
									/>
									<Label for="hard" class="text-sm">Hard</Label>
								</div>
								{#if editedValue.hard.enabled}
									<div class="flex items-center space-x-2">
										<Checkbox
											bind:checked={editedValue.hard.randomRange}
											id="hard-range"
											disabled={readOnly}
											class=""
										/>
										<Label for="hard-range" class="text-xs text-gray-600">Random range</Label>
									</div>
								{/if}
							</div>
							{#if editedValue.hard.enabled}
								{#if editedValue.hard.randomRange}
									<!-- Random Range Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.hard.minPercentage || 0,
													editedValue.hard.maxPercentage || 100
												]}
												min={0}
												max={100}
												step={1}
												range
												pushy
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.hard.minPercentage = e.detail.values[0];
													editedValue.hard.maxPercentage = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.minPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.hard.minPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.maxPercentage}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.hard.maxPercentage = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[
													editedValue.hard.minCount || 0,
													editedValue.hard.maxCount || getTotalSongsMax()
												]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												range
												pushy
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => {
													editedValue.hard.minCount = e.detail.values[0];
													editedValue.hard.maxCount = e.detail.values[1];
													validateAndFixTotal();
												}}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center space-x-4">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.minCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.hard.minCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
												<span class="text-xs text-gray-400">to</span>
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.maxCount}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															editedValue.hard.maxCount = parseInt(e.target.value) || 0;
															validateAndFixTotal();
														}}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{:else}
									<!-- Single Value Mode -->
									{#if editedValue.mode === 'percentage'}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.hard.percentageValue || 0]}
												min={0}
												max={100}
												step={1}
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('hard', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.percentageValue || 0}
														min={0}
														max={100}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('hard', e)}
														onblur={() => handleInputBlur('hard')}
													/>
													<span class="text-xs text-gray-600">%</span>
												</div>
											</div>
										</div>
									{:else}
										<div class="px-2">
											<RangeSlider
												values={[editedValue.hard.countValue || 0]}
												min={0}
												max={getTotalSongsMax()}
												step={1}
												pips
												pipstep={Math.max(1, Math.floor(getTotalSongsMax() / 4))}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleSliderChange('hard', e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
											<div class="mt-1 flex justify-center">
												<div class="flex items-center space-x-1">
													<Input
														type="number"
														value={editedValue.hard.countValue || 0}
														min={0}
														max={getTotalSongsMax()}
														class="h-6 w-16 px-1 text-center text-xs"
														disabled={readOnly}
														oninput={(e) => handleInputChange('hard', e)}
														onblur={() => handleInputBlur('hard')}
													/>
													<span class="text-xs text-gray-600">songs</span>
												</div>
											</div>
										</div>
									{/if}
								{/if}
							{/if}
						</div>
					</div>
					<!-- Close space-y-4 -->
				</div>
				<!-- Close p-4 bg-white -->
			{:else}
				<!-- Advanced View -->
				<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
					<div class="mb-4 flex items-center justify-between">
						<Label class="text-base font-semibold text-gray-800">
							{#if editedValue.mode === 'percentage'}
								Percentage Ranges
							{:else}
								Song Count Ranges
							{/if}
						</Label>
						<Button type="button" class="" onclick={addRange} disabled={readOnly} size="sm">
							<span>+</span> Add Range
						</Button>
					</div>

					{#if editedValue.ranges.length === 0}
						<div class="py-6 text-center text-gray-500">
							<p class="mb-1 text-base">No ranges defined</p>
							<p class="text-sm">
								Click "Add Range" to create your first
								{#if editedValue.mode === 'percentage'}
									percentage range
								{:else}
									song count range
								{/if}
							</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each editedValue.ranges as range, index}
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
									<div class="mb-3 flex items-center justify-between">
										<Label class="text-sm font-medium text-gray-700">Range {index + 1}</Label>
										<Button
											type="button"
											class=""
											onclick={() => removeRange(index)}
											disabled={readOnly}
											variant="destructive"
											size="sm"
										>
											Remove
										</Button>
									</div>

									<!-- Range Slider -->
									<div class="mb-3">
										<Label class="mb-2 block text-xs text-gray-600">Difficulty Range (%)</Label>
										<div class="px-2">
											<RangeSlider
												values={[range.from, range.to]}
												min={0}
												max={100}
												step={1}
												range={true}
												pips
												pipstep={25}
												all="label"
												disabled={readOnly}
												on:change={(e) => handleRangeSliderChange(index, e)}
												--slider={getNodeColor()}
												--handle={getNodeColor()}
												--range={getNodeColor()}
												--progress={getNodeColor()}
											/>
										</div>
									</div>

									<!-- Manual Input Fields -->
									<div class="mb-3 grid grid-cols-3 gap-3">
										<div>
											<Label for="from-{index}" class="text-xs text-gray-600">From %</Label>
											<Input
												id="from-{index}"
												disabled={readOnly}
												type="number"
												value={range.from}
												min={0}
												max={100}
												class="w-full text-sm"
												oninput={(e) => updateRange(index, 'from', e.target.value)}
											/>
										</div>
										<div>
											<Label for="to-{index}" class="text-xs text-gray-600">To %</Label>
											<Input
												id="to-{index}"
												disabled={readOnly}
												type="number"
												value={range.to}
												min={0}
												max={100}
												class="w-full text-sm"
												oninput={(e) => updateRange(index, 'to', e.target.value)}
											/>
										</div>
										<div>
											<Label for="count-{index}" class="text-xs text-gray-600">
												{#if editedValue.mode === 'percentage'}
													Song Count %
												{:else}
													Song Count
												{/if}
											</Label>
											<Input
												id="count-{index}"
												disabled={readOnly}
												type="number"
												value={range.songCount || 0}
												min={0}
												max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
												class="w-full text-sm"
												oninput={(e) => updateSongCount(index, e.target.value)}
											/>
										</div>
									</div>

									<!-- Range Preview -->
									<div class="rounded border bg-white p-2 text-center">
										<span class="font-medium" style="color: {getNodeColor()}">
											{range.from}% - {range.to}% ({range.to - range.from}% range)
										</span>
										<span class="ml-2 text-sm text-gray-600"
											>•
											{#if editedValue.mode === 'percentage'}
												{range.songCount || 0}% of songs
											{:else}
												{range.songCount || 0} songs
											{/if}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Side Controls -->
		<div class="w-64 shrink-0">
			<div class="sticky top-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
				<!-- Mode Toggle -->
				<div class="mb-4">
					<Label class="mb-2 block text-sm font-medium text-gray-700">Mode</Label>
					<div class="flex items-center space-x-2">
						<Label
							for="mode-switch"
							class="text-sm {editedValue.mode === 'percentage'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">%</Label
						>
						<Switch
							id="mode-switch"
							class=""
							checked={editedValue.mode === 'count'}
							disabled={isSongsRandomRange() || readOnly || editedValue.percentageModeLocked}
							onCheckedChange={(checked) => {
								// Don't allow switching to count mode if songs are in random range
								if (checked && isSongsRandomRange()) {
									return;
								}
								editedValue.mode = checked ? 'count' : 'percentage';
							}}
						/>
						<Label
							for="mode-switch"
							class="text-sm {editedValue.mode === 'count'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">Count</Label
						>
					</div>
					<div class="mt-1 text-xs">
						{#if isSongsRandomRange()}
							<span class="text-orange-600"
								>% mode required when Number of Songs is a random range</span
							>
						{:else if editedValue.percentageModeLocked}
							<Popover.Root>
								<Popover.Trigger class="">
									{#snippet child({ props })}
										<button
											{...props}
											type="button"
											class="cursor-help text-xs font-medium text-orange-600 hover:text-orange-700"
											title="Why is this locked?"
										>
											(Locked)
										</button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-auto p-0" align="start" portalProps={{}}>
									<div
										class="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800"
									>
										Percentage mode is locked because you have multiple<br />
										"Number of Songs" nodes or random range enabled;<br />
										remove extra nodes or disable random range to unlock.
									</div>
								</Popover.Content>
							</Popover.Root>
						{:else if editedValue.mode === 'percentage'}
							<span class="text-gray-600"
								>Percentage mode: song counts represent % of total songs</span
							>
						{:else}
							<span class="text-gray-600"
								>Count mode: song counts represent exact number of songs</span
							>
						{/if}
					</div>
				</div>

				<!-- View Toggle -->
				<div class="mb-4">
					<Label class="mb-2 block text-sm font-medium text-gray-700">View</Label>
					<div class="flex items-center space-x-2">
						<Label
							for="view-switch"
							class="text-sm {editedValue.viewMode === 'basic'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">Basic</Label
						>
						<Switch
							id="view-switch"
							class=""
							checked={editedValue.viewMode === 'advanced'}
							disabled={readOnly}
							onCheckedChange={(checked) => {
								if (!readOnly) {
									editedValue.viewMode = checked ? 'advanced' : 'basic';
									validateAndFixTotal();
								}
							}}
						/>
						<Label
							for="view-switch"
							class="text-sm {editedValue.viewMode === 'advanced'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">Advanced</Label
						>
					</div>

					<!-- Info text explaining the difference between modes -->
					<div class="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
						{#if editedValue.viewMode === 'advanced'}
							<strong>Advanced View:</strong> Percentages apply to the song guess rate (how likely each
							difficulty is to be guessed correctly).
						{:else}
							<strong>Basic View:</strong> Percentages apply to how many songs from each difficulty category
							will play in the game.
						{/if}
					</div>
				</div>

				<!-- Info -->
				<div class="border-t pt-2 text-xs text-gray-500">
					<div>
						Songs: {typeof getTotalSongs() === 'object'
							? `${getTotalSongs().min}-${getTotalSongs().max}`
							: getTotalSongs()}
					</div>
					<div class="mt-1">
						{#if editedValue.viewMode === 'basic'}
							Simple difficulty distribution
						{:else}
							Custom percentage ranges
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
