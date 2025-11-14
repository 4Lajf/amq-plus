<script>
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { SONGS_AND_TYPES_DEFAULT_SETTINGS } from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initializeSongsAndTypesMode } from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';
	import { quickFixSongsAndTypes } from '$lib/components/amqplus/editor/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		validationWarning = $bindable(''),
		getTotalSongs = () => 20,
		onAutoSave = null, // Optional callback for auto-save when scaling occurs
		readOnly = false // Whether the form is in read-only mode
	} = $props();

	// Initialize mode if not present (allow percentage and count modes)
	if (!editedValue.mode) {
		editedValue.mode = 'count';
	}

	// Sync mode changes from parent (when percentageModeLocked is set)
	$effect(() => {
		if (editedValue.percentageModeLocked && editedValue.mode !== 'percentage') {
			editedValue.mode = 'percentage';
		}
	});

	// Handle mode switching with initialization instead of conversion
	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = totalSongsMax();
			editedValue = initializeSongsAndTypesMode(editedValue, editedValue.mode, totalSongs);
			previousMode = editedValue.mode;
		}
	});

	// Initialize random range properties using defaults from defaultNodeSettings
	const initializeRandomRangeProperties = () => {
		const types = ['openings', 'endings', 'inserts'];
		types.forEach((type) => {
			if (editedValue.songTypes[type]) {
				const defaultTypeSettings = SONGS_AND_TYPES_DEFAULT_SETTINGS.songTypes[type];

				// Initialize random range flag
				if (editedValue.songTypes[type].random === undefined) {
					editedValue.songTypes[type].random = defaultTypeSettings?.random ?? false;
				}

				// Initialize min/max values for percentage mode
				if (editedValue.songTypes[type].percentageMin === undefined) {
					editedValue.songTypes[type].percentageMin = defaultTypeSettings?.percentageMin ?? 10;
				}
				if (editedValue.songTypes[type].percentageMax === undefined) {
					editedValue.songTypes[type].percentageMax = defaultTypeSettings?.percentageMax ?? 30;
				}

				// Initialize min/max values for count mode
				if (editedValue.songTypes[type].countMin === undefined) {
					editedValue.songTypes[type].countMin = defaultTypeSettings?.countMin ?? 2;
				}
				if (editedValue.songTypes[type].countMax === undefined) {
					editedValue.songTypes[type].countMax = defaultTypeSettings?.countMax ?? 6;
				}
			}
		});

		// Initialize song selection random ranges
		if (editedValue.songSelection) {
			const defaultRandomSettings = SONGS_AND_TYPES_DEFAULT_SETTINGS.songSelection?.random;
			const defaultWatchedSettings = SONGS_AND_TYPES_DEFAULT_SETTINGS.songSelection?.watched;

			if (editedValue.songSelection.random) {
				if (editedValue.songSelection.random.enabled === undefined) {
					editedValue.songSelection.random.enabled = defaultRandomSettings?.enabled ?? true;
				}
				if (editedValue.songSelection.random.random === undefined) {
					editedValue.songSelection.random.random = defaultRandomSettings?.random ?? false;
				}
				if (editedValue.songSelection.random.percentageMin === undefined) {
					editedValue.songSelection.random.percentageMin =
						defaultRandomSettings?.percentageMin ?? 25;
				}
				if (editedValue.songSelection.random.percentageMax === undefined) {
					editedValue.songSelection.random.percentageMax =
						defaultRandomSettings?.percentageMax ?? 75;
				}
				if (editedValue.songSelection.random.countMin === undefined) {
					editedValue.songSelection.random.countMin = defaultRandomSettings?.countMin ?? 5;
				}
				if (editedValue.songSelection.random.countMax === undefined) {
					editedValue.songSelection.random.countMax = defaultRandomSettings?.countMax ?? 15;
				}
			}

			if (editedValue.songSelection.watched) {
				if (editedValue.songSelection.watched.enabled === undefined) {
					editedValue.songSelection.watched.enabled = defaultWatchedSettings?.enabled ?? true;
				}
				if (editedValue.songSelection.watched.random === undefined) {
					editedValue.songSelection.watched.random = defaultWatchedSettings?.random ?? false;
				}
				if (editedValue.songSelection.watched.percentageMin === undefined) {
					editedValue.songSelection.watched.percentageMin =
						defaultWatchedSettings?.percentageMin ?? 25;
				}
				if (editedValue.songSelection.watched.percentageMax === undefined) {
					editedValue.songSelection.watched.percentageMax =
						defaultWatchedSettings?.percentageMax ?? 75;
				}
				if (editedValue.songSelection.watched.countMin === undefined) {
					editedValue.songSelection.watched.countMin = defaultWatchedSettings?.countMin ?? 5;
				}
				if (editedValue.songSelection.watched.countMax === undefined) {
					editedValue.songSelection.watched.countMax = defaultWatchedSettings?.countMax ?? 15;
				}
			}
		}
	};

	// Initialize properties on component mount
	initializeRandomRangeProperties();

	// Safety mechanism: Track last sync to prevent infinite loops
	let lastSyncTimestamp = 0;
	let lastSyncTotalSongs = null;
	let syncCallCount = 0;
	const MAX_SYNC_CALLS_PER_SECOND = 20;

	function canSyncValues(operationName) {
		const now = Date.now();
		if (now - lastSyncTimestamp > 1000) {
			syncCallCount = 0;
			lastSyncTimestamp = now;
		}
		syncCallCount++;
		if (syncCallCount > MAX_SYNC_CALLS_PER_SECOND) {
			console.error(`🛑 ${operationName} safety limit reached (${syncCallCount} calls in 1s).`);
			return false;
		}
		return true;
	}

	// Sync count and percentage values when total songs changes
	$effect(() => {
		if (!canSyncValues('songTypes sync')) {
			return;
		}

		const totalSongs = editedValue._storedTotalSongs || getTotalSongs() || 20;
		const totalSongsNum = typeof totalSongs === 'object' ? totalSongs.max : totalSongs;

		// Only sync if total songs actually changed
		if (lastSyncTotalSongs === totalSongsNum) {
			return;
		}
		lastSyncTotalSongs = totalSongsNum;

		if (editedValue.songTypes) {
			const enabledTypes = getEnabledTypes();

			for (const type of enabledTypes) {
				const typeData = editedValue.songTypes[type];
				if (typeData && typeData.enabled) {
					if (typeData.random) {
						// Sync random range values
						if (
							editedValue.mode === 'percentage' &&
							typeData.percentageMin !== undefined &&
							typeData.percentageMax !== undefined
						) {
							// In percentage mode: recalculate counts from percentages
							const newCountMin = Math.max(
								0,
								Math.round((typeData.percentageMin / 100) * totalSongsNum)
							);
							const newCountMax = Math.max(
								0,
								Math.round((typeData.percentageMax / 100) * totalSongsNum)
							);
							// Only update if changed
							if (typeData.countMin !== newCountMin) typeData.countMin = newCountMin;
							if (typeData.countMax !== newCountMax) typeData.countMax = newCountMax;
							typeData.min = typeData.percentageMin;
							typeData.max = typeData.percentageMax;
						} else if (
							editedValue.mode === 'count' &&
							typeData.countMin !== undefined &&
							typeData.countMax !== undefined
						) {
							// In count mode: recalculate percentages from counts
							const newPercentageMin = Math.round((typeData.countMin / totalSongsNum) * 100);
							const newPercentageMax = Math.round((typeData.countMax / totalSongsNum) * 100);
							// Only update if changed
							if (typeData.percentageMin !== newPercentageMin)
								typeData.percentageMin = newPercentageMin;
							if (typeData.percentageMax !== newPercentageMax)
								typeData.percentageMax = newPercentageMax;
							typeData.min = typeData.countMin;
							typeData.max = typeData.countMax;
						}
					} else {
						// Sync static values
						if (editedValue.mode === 'percentage' && typeData.percentage !== undefined) {
							// In percentage mode: recalculate count from percentage
							const newCount = Math.max(0, Math.round((typeData.percentage / 100) * totalSongsNum));
							// Only update if changed
							if (typeData.count !== newCount) typeData.count = newCount;
						} else if (editedValue.mode === 'count' && typeData.count !== undefined) {
							// In count mode: recalculate percentage from count
							const newPercentage = Math.round((typeData.count / totalSongsNum) * 100);
							// Only update if changed
							if (typeData.percentage !== newPercentage) typeData.percentage = newPercentage;
						}
					}
				}
			}
		}
	});

	// Ensure song types have the correct values for the current mode (fix missing values)
	$effect(() => {
		if (editedValue.songTypes) {
			const enabledTypes = getEnabledTypes();
			let hasChanges = false;

			for (const type of enabledTypes) {
				const typeData = editedValue.songTypes[type];
				if (typeData && typeData.enabled && !typeData.random) {
					const totalSongs = editedValue._storedTotalSongs || 20;

					if (
						editedValue.mode === 'percentage' &&
						typeData.count !== undefined &&
						typeData.percentage === undefined
					) {
						console.log(
							'🔧 Fixing missing percentage for',
							type,
							'count:',
							typeData.count,
							'total:',
							totalSongs
						);
						typeData.percentage = Math.round((typeData.count / totalSongs) * 100);
						hasChanges = true;
					} else if (
						editedValue.mode === 'count' &&
						typeData.percentage !== undefined &&
						typeData.count === undefined
					) {
						console.log(
							'🔧 Fixing missing count for',
							type,
							'percentage:',
							typeData.percentage,
							'total:',
							totalSongs
						);
						typeData.count = Math.round((typeData.percentage / 100) * totalSongs);
						hasChanges = true;
					}
				}
			}

			if (hasChanges) {
				console.log('🔧 Fixed missing values, validating total');
				validateSongTypesTotal();
			}
		}
	});

	// Sync song selection count and percentage values when total songs changes
	$effect(() => {
		if (!canSyncValues('songSelection sync')) {
			return;
		}

		const totalSongs = editedValue._storedTotalSongs || getTotalSongs() || 20;
		const totalSongsNum = typeof totalSongs === 'object' ? totalSongs.max : totalSongs;

		if (editedValue.songSelection) {
			for (const [type, selection] of Object.entries(editedValue.songSelection)) {
				if (selection && selection.enabled) {
					if (selection.random) {
						// Sync random range values
						if (
							editedValue.mode === 'percentage' &&
							selection.percentageMin !== undefined &&
							selection.percentageMax !== undefined
						) {
							// In percentage mode: recalculate counts from percentages
							const newCountMin = Math.max(
								0,
								Math.round((selection.percentageMin / 100) * totalSongsNum)
							);
							const newCountMax = Math.max(
								0,
								Math.round((selection.percentageMax / 100) * totalSongsNum)
							);
							// Only update if changed
							if (selection.countMin !== newCountMin) selection.countMin = newCountMin;
							if (selection.countMax !== newCountMax) selection.countMax = newCountMax;
							selection.min = selection.percentageMin;
							selection.max = selection.percentageMax;
						} else if (
							editedValue.mode === 'count' &&
							selection.countMin !== undefined &&
							selection.countMax !== undefined
						) {
							// In count mode: recalculate percentages from counts
							const newPercentageMin = Math.round((selection.countMin / totalSongsNum) * 100);
							const newPercentageMax = Math.round((selection.countMax / totalSongsNum) * 100);
							// Only update if changed
							if (selection.percentageMin !== newPercentageMin)
								selection.percentageMin = newPercentageMin;
							if (selection.percentageMax !== newPercentageMax)
								selection.percentageMax = newPercentageMax;
							selection.min = selection.countMin;
							selection.max = selection.countMax;
						}
					} else {
						// Sync static values
						if (editedValue.mode === 'percentage' && selection.percentage !== undefined) {
							// In percentage mode: recalculate count from percentage
							const newCount = Math.max(
								0,
								Math.round((selection.percentage / 100) * totalSongsNum)
							);
							// Only update if changed
							if (selection.count !== newCount) selection.count = newCount;
						} else if (editedValue.mode === 'count' && selection.count !== undefined) {
							// In count mode: recalculate percentage from count
							const newPercentage = Math.round((selection.count / totalSongsNum) * 100);
							// Only update if changed
							if (selection.percentage !== newPercentage) selection.percentage = newPercentage;
						}
					}
				}
			}
		}
	});

	// Ensure song selection has the correct values for the current mode (fix missing values)
	$effect(() => {
		if (editedValue.songSelection) {
			let hasChanges = false;
			const totalSongs = editedValue._storedTotalSongs || 20;

			for (const [type, selection] of Object.entries(editedValue.songSelection)) {
				if (selection && selection.enabled && !selection.random) {
					if (
						editedValue.mode === 'percentage' &&
						selection.count !== undefined &&
						selection.percentage === undefined
					) {
						console.log(
							'🔧 Fixing missing percentage for selection',
							type,
							'count:',
							selection.count,
							'total:',
							totalSongs
						);
						selection.percentage = Math.round((selection.count / totalSongs) * 100);
						hasChanges = true;
					} else if (
						editedValue.mode === 'count' &&
						selection.percentage !== undefined &&
						selection.count === undefined
					) {
						console.log(
							'🔧 Fixing missing count for selection',
							type,
							'percentage:',
							selection.percentage,
							'total:',
							totalSongs
						);
						selection.count = Math.round((selection.percentage / 100) * totalSongs);
						hasChanges = true;
					}
				}
			}

			if (hasChanges) {
				console.log('🔧 Fixed missing selection values, validating total');
				validateSongTypesTotal();
			}
		}
	});

	// Clear forced percentage mode when no longer needed
	$effect(() => {
		const wasForcedToPercentage = editedValue._wasForcedToPercentage || false;

		// Clear the flag if it was previously set but no longer needed
		if (wasForcedToPercentage && !editedValue.percentageModeLocked) {
			delete editedValue._wasForcedToPercentage;
		}
	});

	function totalSongsMax() {
		const t = getTotalSongs();
		if (t && typeof t === 'object') return Number(t.max ?? 200);
		const n = Number(t);
		return Number.isFinite(n) ? n : 200;
	}

	function totalSongsPipStep() {
		return Math.max(1, Math.floor(totalSongsMax() / 4));
	}

	// Get enabled song types
	function getEnabledTypes() {
		if (!editedValue?.songTypes) {
			console.warn('🛑 editedValue.songTypes is undefined');
			return [];
		}
		return Object.keys(editedValue.songTypes).filter(
			(type) => editedValue.songTypes[type]?.enabled
		);
	}

	// Cache for getPredictedInfo results (regular variable, not $state, to avoid mutation errors)
	let predictedInfoCache = {
		hash: null,
		result: null
	};

	// Create a hash of the relevant inputs
	function createCacheHash() {
		if (!editedValue) return null;

		const types = getEnabledTypes();
		const mode = editedValue.mode || 'count';
		const totalFrom = getTotalSongs();
		const targetTotal =
			editedValue._storedTotalSongs ||
			(typeof totalFrom === 'object' ? totalFrom.max : totalFrom) ||
			0;

		// Create a hash based on relevant values
		const hashData = {
			mode,
			targetTotal,
			types: types.sort().join(','),
			songTypes: types.map((t) => {
				const cfg = editedValue.songTypes[t] || {};
				return {
					enabled: cfg.enabled,
					random: cfg.random,
					count: cfg.count,
					countMin: cfg.countMin,
					countMax: cfg.countMax,
					percentage: cfg.percentage,
					percentageMin: cfg.percentageMin,
					percentageMax: cfg.percentageMax
				};
			}),
			songSelection: {
				random: {
					random: editedValue.songSelection?.random?.random,
					count: editedValue.songSelection?.random?.count,
					percentage: editedValue.songSelection?.random?.percentage,
					countMin: editedValue.songSelection?.random?.countMin,
					countMax: editedValue.songSelection?.random?.countMax,
					percentageMin: editedValue.songSelection?.random?.percentageMin,
					percentageMax: editedValue.songSelection?.random?.percentageMax
				},
				watched: {
					random: editedValue.songSelection?.watched?.random,
					count: editedValue.songSelection?.watched?.count,
					percentage: editedValue.songSelection?.watched?.percentage,
					countMin: editedValue.songSelection?.watched?.countMin,
					countMax: editedValue.songSelection?.watched?.countMax,
					percentageMin: editedValue.songSelection?.watched?.percentageMin,
					percentageMax: editedValue.songSelection?.watched?.percentageMax
				}
			},
			isValid,
			validationMessage
		};

		return JSON.stringify(hashData);
	}

	function getPredictedInfo() {
		// Ensure editedValue exists
		if (!editedValue) {
			return null;
		}

		const types = getEnabledTypes();
		if (types.length === 0) return null;

		// Check cache first
		const currentHash = createCacheHash();
		if (predictedInfoCache.hash === currentHash && predictedInfoCache.result !== null) {
			return predictedInfoCache.result;
		}

		// Check if configuration is valid before attempting allocation
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

		// Get target total - prioritize stored total to avoid mismatches
		let targetTotal;
		const storedTotal = editedValue._storedTotalSongs;
		const totalFrom = getTotalSongs();

		if (storedTotal) {
			targetTotal = Number(storedTotal);
		} else if (totalFrom && typeof totalFrom === 'object') {
			targetTotal = Number(totalFrom.max || 0);
		} else {
			targetTotal = Number(totalFrom || 0);
		}

		// Build entries for song types
		/** @type {import('../../editor/utils/mathUtils.js').AllocationEntry[]} */
		const typeEntries = types.map((t) => {
			const cfg = editedValue.songTypes[t] || {};
			if (isPercentageMode) {
				if (cfg.random) {
					return {
						label: t,
						kind: /** @type {'range'} */ ('range'),
						min: Number(cfg.percentageMin || cfg.min || 0),
						max: Number(cfg.percentageMax || cfg.max || 0)
					};
				}
				return {
					label: t,
					kind: /** @type {'static'} */ ('static'),
					value: Number(cfg.percentage || 0)
				};
			}
			if (cfg.random) {
				return {
					label: t,
					kind: /** @type {'range'} */ ('range'),
					min: Number(cfg.countMin || cfg.min || 0),
					max: Number(cfg.countMax || cfg.max || 0)
				};
			}
			return { label: t, kind: /** @type {'static'} */ ('static'), value: Number(cfg.count || 0) };
		});

		// Build entries for selection with defensive checks
		const randomCfg = editedValue?.songSelection?.random || {};
		const watchedCfg = editedValue?.songSelection?.watched || {};

		// Build selection entries with proper constraints
		const randomStatic = !randomCfg.random;
		const watchedStatic = !watchedCfg.random;
		const randomValue = randomStatic
			? isPercentageMode
				? Number(randomCfg.percentage || 0)
				: Number(randomCfg.count || 0)
			: 0;
		const watchedValue = watchedStatic
			? isPercentageMode
				? Number(watchedCfg.percentage || (isPercentageMode ? 100 : targetTotal))
				: Number(watchedCfg.count || targetTotal)
			: 0;
		const remainingForRanges = (isPercentageMode ? 100 : targetTotal) - randomValue - watchedValue;

		const rMin = isPercentageMode
			? Number(randomCfg.percentageMin ?? randomCfg.min ?? 0)
			: Number(randomCfg.countMin ?? randomCfg.min ?? 0);
		const rMax = isPercentageMode
			? Number(randomCfg.percentageMax ?? randomCfg.max ?? (isPercentageMode ? 100 : targetTotal))
			: Number(randomCfg.countMax ?? randomCfg.max ?? targetTotal);
		const wMin = isPercentageMode
			? Number(watchedCfg.percentageMin ?? watchedCfg.min ?? 0)
			: Number(watchedCfg.countMin ?? watchedCfg.min ?? 0);
		const wMax = isPercentageMode
			? Number(watchedCfg.percentageMax ?? watchedCfg.max ?? (isPercentageMode ? 100 : targetTotal))
			: Number(watchedCfg.countMax ?? watchedCfg.max ?? targetTotal);

		/** @type {import('../../editor/utils/mathUtils.js').AllocationEntry[]} */
		const selEntries = [
			randomCfg.random === true
				? {
						label: 'random',
						kind: /** @type {'range'} */ ('range'),
						min: rMin,
						max: Math.min(rMax, remainingForRanges)
					}
				: { label: 'random', kind: /** @type {'static'} */ ('static'), value: randomValue },
			watchedCfg.random === true
				? {
						label: 'watched',
						kind: /** @type {'range'} */ ('range'),
						min: wMin,
						max: Math.min(wMax, remainingForRanges)
					}
				: { label: 'watched', kind: /** @type {'static'} */ ('static'), value: watchedValue }
		];

		// Analyze song types and selection separately
		const typeTarget = isPercentageMode ? 100 : targetTotal;
		const selTarget = isPercentageMode ? 100 : targetTotal;
		const typeAnalysis = analyzeGroup(typeEntries, typeTarget);
		const selAnalysis = analyzeGroup(selEntries, selTarget);

		const result = {
			mode,
			unit,
			totalSongs: targetTotal,
			showRanges: typeAnalysis.hasRandom || selAnalysis.hasRandom,
			types: types.map((t) => {
				const entry = typeEntries.find((e) => e.label === t);
				const info = typeAnalysis.refined.get(t);
				if (entry.kind === 'static' || !info) {
					return {
						label: t,
						value: entry.kind === 'static' ? entry.value : 0,
						isStatic: entry.kind === 'static'
					};
				}
				if (typeAnalysis.hasRandom && info.min < info.max) {
					return { label: t, min: info.min, max: info.max, isStatic: false };
				}
				return { label: t, value: info.min, isStatic: false };
			}),
			selection: {
				random: (() => {
					try {
						const info = selAnalysis?.refined?.get('random');
						const entry = selEntries?.find((e) => e?.label === 'random');

						// Always return a valid object with defaults
						if (!entry) return { value: 0, isStatic: true };
						if (!info || entry.kind === 'static')
							return { value: entry.value ?? 0, isStatic: true };
						if (selAnalysis?.hasRandom && info?.min < info?.max)
							return { min: info.min ?? 0, max: info.max ?? 0, isStatic: false };
						return { value: info?.min ?? 0, isStatic: false };
					} catch (error) {
						console.warn('🛑 Error in random selection calculation:', error);
						return { value: 0, isStatic: true };
					}
				})(),
				watched: (() => {
					try {
						const info = selAnalysis?.refined?.get('watched');
						const entry = selEntries?.find((e) => e?.label === 'watched');

						// Always return a valid object with defaults
						if (!entry) return { value: 0, isStatic: true };
						if (!info || entry.kind === 'static')
							return { value: entry.value ?? 0, isStatic: true };
						if (selAnalysis?.hasRandom && info?.min < info?.max)
							return { min: info.min ?? 0, max: info.max ?? 0, isStatic: false };
						return { value: info?.min ?? 0, isStatic: false };
					} catch (error) {
						console.warn('🛑 Error in watched selection calculation:', error);
						return { value: 0, isStatic: true };
					}
				})()
			}
		};

		// Cache the result
		predictedInfoCache = { hash: currentHash, result };
		return result;
	}

	// Memoize the predicted info result to avoid redundant calculations
	// This will only recalculate when its dependencies change
	const predictedInfo = $derived(getPredictedInfo());

	let lastValidationState = null;

	function validateSongTypesTotal() {
		const enabledTypes = getEnabledTypes();
		const mode = editedValue.mode || 'count';
		const isPercentageMode = mode === 'percentage';

		// Get target total
		let targetMax;
		const storedTotal = editedValue._storedTotalSongs;
		const maxValue = totalSongsMax();

		if (storedTotal) {
			targetMax = isPercentageMode ? 100 : Number(storedTotal);
		} else {
			targetMax = isPercentageMode ? 100 : maxValue;
		}

		// Build validation state signature to detect changes
		const validationStateSignature = JSON.stringify({
			mode,
			targetMax,
			songTypes: enabledTypes.map((type) => ({
				type,
				enabled: editedValue.songTypes[type]?.enabled,
				random: editedValue.songTypes[type]?.random,
				count: editedValue.songTypes[type]?.count,
				countMin: editedValue.songTypes[type]?.countMin,
				countMax: editedValue.songTypes[type]?.countMax,
				percentage: editedValue.songTypes[type]?.percentage,
				percentageMin: editedValue.songTypes[type]?.percentageMin,
				percentageMax: editedValue.songTypes[type]?.percentageMax
			}))
		});

		// Skip validation if nothing changed
		if (lastValidationState === validationStateSignature) {
			return;
		}
		lastValidationState = validationStateSignature;

		const targetUnitShort = isPercentageMode ? '%' : '';

		// Initialize validation result
		let newIsValid = true;
		let newValidationMessage = '';

		// Check if we have mixed random and static ranges
		const hasRandomRanges = enabledTypes.some((type) => editedValue.songTypes[type].random);
		const allRandomRanges =
			hasRandomRanges && enabledTypes.every((type) => editedValue.songTypes[type].random);

		if (allRandomRanges) {
			// All types use random ranges - validate coverage
			let totalMin = 0;
			let totalMax = 0;

			enabledTypes.forEach((type) => {
				const cfg = editedValue.songTypes[type];
				if (isPercentageMode) {
					totalMin += Number(cfg.percentageMin ?? cfg.min ?? 0);
					totalMax += Number(cfg.percentageMax ?? cfg.max ?? 0);
				} else {
					totalMin += Number(cfg.countMin ?? cfg.min ?? 0);
					totalMax += Number(cfg.countMax ?? cfg.max ?? 0);
				}
			});

			if (totalMin > targetMax) {
				newIsValid = false;
				newValidationMessage = `Combined minimum values (${totalMin}${targetUnitShort}) exceed the total limit of ${targetMax}${targetUnitShort}.`;
			} else if (totalMax < targetMax) {
				newIsValid = false;
				newValidationMessage = `Combined maximum values (${totalMax}${targetUnitShort}) are less than the required total of ${targetMax}${targetUnitShort}.`;
			}
		} else if (hasRandomRanges) {
			let staticTotal = 0;
			let randomMinTotal = 0;
			let randomMaxTotal = 0;
			const randomTypes = [];
			const staticTypes = [];

			enabledTypes.forEach((type) => {
				const cfg = editedValue.songTypes[type];
				if (cfg.random) {
					randomTypes.push(type);
					if (isPercentageMode) {
						randomMinTotal += Number(cfg.percentageMin ?? cfg.min ?? 0);
						randomMaxTotal += Number(cfg.percentageMax ?? cfg.max ?? 0);
					} else {
						randomMinTotal += Number(cfg.countMin ?? cfg.min ?? 0);
						randomMaxTotal += Number(cfg.countMax ?? cfg.max ?? 0);
					}
				} else {
					staticTypes.push(type);
					if (isPercentageMode) {
						staticTotal += Number(cfg.percentage || 0);
					} else {
						staticTotal += Number(cfg.count || 0);
					}
				}
			});

			// Check for impossible configurations
			if (staticTotal + randomMinTotal > targetMax) {
				newIsValid = false;
				newValidationMessage = `Static values (${staticTotal}${targetUnitShort}) plus random minimums (${randomMinTotal}${targetUnitShort}) exceed ${targetMax}${targetUnitShort}.`;
			} else if (staticTotal + randomMaxTotal < targetMax) {
				newIsValid = false;
				newValidationMessage = `Static values (${staticTotal}${targetUnitShort}) plus random maximums (${randomMaxTotal}${targetUnitShort}) are less than ${targetMax}${targetUnitShort}.`;
			}
		} else {
			// All static values - validate they sum to max value
			let currentTotal = 0;
			enabledTypes.forEach((type) => {
				if (isPercentageMode) {
					currentTotal += Number(editedValue.songTypes[type].percentage || 0);
				} else {
					currentTotal += Number(editedValue.songTypes[type].count || 0);
				}
			});

			if (isPercentageMode && Math.abs(currentTotal - 100) > 0.01) {
				newIsValid = false;
				newValidationMessage = `Song types must total 100%. Current total: ${currentTotal.toFixed(1)}%`;
			} else if (!isPercentageMode && currentTotal !== maxValue) {
				newIsValid = false;
				newValidationMessage = `Song types must total ${maxValue} songs. Current total: ${currentTotal} songs`;
			}
		}

		// Validate song selection totals
		const selR = editedValue.songSelection.random || {};
		const selW = editedValue.songSelection.watched || {};
		const selHasRandom = !!selR.random || !!selW.random;
		const targetTotal = isPercentageMode ? 100 : maxValue;
		const unit = isPercentageMode ? '%' : ' songs';

		if (selHasRandom) {
			let staticTotal = 0;
			let randomMinTotal = 0;
			let randomMaxTotal = 0;
			if (!selR.random)
				staticTotal += isPercentageMode ? Number(selR.percentage || 0) : Number(selR.count || 0);
			if (!selW.random)
				staticTotal += isPercentageMode ? Number(selW.percentage || 0) : Number(selW.count || 0);
			if (selR.random) {
				const rmin = isPercentageMode
					? Number(selR.percentageMin ?? selR.min ?? 0)
					: Number(selR.countMin ?? selR.min ?? 0);
				const rmax = isPercentageMode
					? Number(selR.percentageMax ?? selR.max ?? 0)
					: Number(selR.countMax ?? selR.max ?? 0);
				randomMinTotal += rmin;
				randomMaxTotal += rmax;
			}
			if (selW.random) {
				const wmin = isPercentageMode
					? Number(selW.percentageMin ?? selW.min ?? 0)
					: Number(selW.countMin ?? selW.min ?? 0);
				const wmax = isPercentageMode
					? Number(selW.percentageMax ?? selW.max ?? 0)
					: Number(selW.countMax ?? selW.max ?? 0);
				randomMinTotal += wmin;
				randomMaxTotal += wmax;
			}

			if (staticTotal + randomMinTotal > targetTotal) {
				newIsValid = false;
				if (newValidationMessage) newValidationMessage += ' ';
				newValidationMessage += `Static values (${staticTotal}) plus random minimums (${randomMinTotal}) exceed ${targetTotal}.`;
			} else if (staticTotal + randomMaxTotal < targetTotal) {
				newIsValid = false;
				if (newValidationMessage) newValidationMessage += ' ';
				newValidationMessage += `Static values (${staticTotal}) plus random maximums (${randomMaxTotal}) are less than ${targetTotal}.`;
			}
		} else {
			const randomValue = isPercentageMode ? Number(selR.percentage || 0) : Number(selR.count || 0);
			const watchedValue = isPercentageMode
				? Number(selW.percentage || 0)
				: Number(selW.count || 0);
			const selectionTotal = randomValue + watchedValue;
			if (selectionTotal !== targetTotal) {
				newIsValid = false;
				if (newValidationMessage) {
					newValidationMessage += ' ';
				}
				newValidationMessage += `Song selection must total ${targetTotal}${unit}. Current total: ${selectionTotal}${unit}`;
			}
		}

		// Only update bindable properties if values changed
		if (isValid !== newIsValid || validationMessage !== newValidationMessage) {
			isValid = newIsValid;
			validationMessage = newValidationMessage;
		}
	}

	// Handle song type slider changes with linking
	function handleSongTypeSliderChange(type, event) {
		const newValue = event.detail.value;
		const mode = editedValue.mode || 'count';

		if (mode === 'percentage') {
			editedValue.songTypes[type].percentage = newValue;
		} else {
			editedValue.songTypes[type].count = newValue;
		}

		updateLinkedSongTypes(type, newValue);
		validateSongTypesTotal();
	}

	// Handle song type input changes - NO linking for precise manual input
	function handleSongTypeInputChange(type, event) {
		const newValue = parseInt(event.target.value) || 0;
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const clampedValue = Math.max(0, Math.min(maxValue, newValue));

		if (mode === 'percentage') {
			editedValue.songTypes[type].percentage = clampedValue;
		} else {
			editedValue.songTypes[type].count = clampedValue;
		}

		// No updateLinkedSongTypes() call - allows precise manual input
		validateSongTypesTotal();
	}

	// Handle random range slider changes
	function handleRandomRangeSliderChange(type, event) {
		const values = event.detail.values;
		const mode = editedValue.mode || 'count';

		if (mode === 'percentage') {
			editedValue.songTypes[type].percentageMin = values[0];
			editedValue.songTypes[type].percentageMax = values[1];
		} else {
			editedValue.songTypes[type].countMin = values[0];
			editedValue.songTypes[type].countMax = values[1];
		}

		validateSongTypesTotal();
	}

	// Handle random range input changes
	function handleRandomRangeInputChange(type, field, event) {
		const newValue = parseInt(event.target.value) || 0;
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const clampedValue = Math.max(0, Math.min(maxValue, newValue));

		if (mode === 'percentage') {
			if (field === 'min') {
				editedValue.songTypes[type].percentageMin = clampedValue;
			} else {
				editedValue.songTypes[type].percentageMax = clampedValue;
			}
		} else {
			if (field === 'min') {
				editedValue.songTypes[type].countMin = clampedValue;
			} else {
				editedValue.songTypes[type].countMax = clampedValue;
			}
		}

		validateSongTypesTotal();
	}

	// Handle song selection slider changes (with linking like the original working version)
	function handleSongSelectionSliderChange(type, event) {
		const newValue = event.detail.value;
		const mode = editedValue.mode || 'count';
		if (mode === 'percentage') {
			editedValue.songSelection[type].percentage = newValue;
		} else {
			editedValue.songSelection[type].count = newValue;
		}
		updateLinkedSongSelection(type, newValue);
		validateSongTypesTotal();
	}

	// Update linked song types (distribute remaining among other enabled types)
	function updateLinkedSongTypes(changedType, newValue) {
		const enabledTypes = getEnabledTypes();
		const otherTypes = enabledTypes.filter((type) => type !== changedType);
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const remaining = maxValue - newValue;

		if (otherTypes.length === 0) return;

		if (otherTypes.length === 1) {
			// Only one other type, give it all the remaining
			const targetProp = mode === 'percentage' ? 'percentage' : 'count';
			editedValue.songTypes[otherTypes[0]][targetProp] = Math.max(0, remaining);
		} else {
			// Multiple other types, distribute proportionally based on current values
			const currentOtherTotal = otherTypes.reduce((sum, type) => {
				const cfg = editedValue.songTypes[type];
				if (mode === 'percentage') {
					return sum + Number(cfg.percentage || 0);
				} else {
					return sum + Number(cfg.count || 0);
				}
			}, 0);

			if (currentOtherTotal > 0 && remaining > 0) {
				// Distribute proportionally
				const scale = remaining / currentOtherTotal;
				let distributedTotal = 0;
				const targetProp = mode === 'percentage' ? 'percentage' : 'count';

				// Scale all but the last value
				for (let i = 0; i < otherTypes.length - 1; i++) {
					const type = otherTypes[i];
					const currentValue =
						mode === 'percentage'
							? Number(editedValue.songTypes[type].percentage || 0)
							: Number(editedValue.songTypes[type].count || 0);
					const newValue = Math.round(currentValue * scale);
					editedValue.songTypes[type][targetProp] = Math.max(0, newValue);
					distributedTotal += newValue;
				}

				// Set the last value to ensure exact total
				const lastType = otherTypes[otherTypes.length - 1];
				editedValue.songTypes[lastType][targetProp] = Math.max(0, remaining - distributedTotal);
			} else {
				// Either no current total or no remaining, distribute equally
				const equalValue = Math.max(0, Math.floor(remaining / otherTypes.length));
				const remainder = Math.max(0, remaining % otherTypes.length);
				const targetProp = mode === 'percentage' ? 'percentage' : 'count';

				otherTypes.forEach((type, index) => {
					const value = equalValue + (index < remainder ? 1 : 0);
					editedValue.songTypes[type][targetProp] = value;
				});
			}
		}
	}

	// Update linked song selection sliders (working version from original)
	function updateLinkedSongSelection(changedType, newValue) {
		const otherType = changedType === 'random' ? 'watched' : 'random';
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const remaining = maxValue - newValue;
		const clampedValue = Math.max(0, Math.min(maxValue, remaining));
		if (mode === 'percentage') {
			editedValue.songSelection[otherType].percentage = clampedValue;
		} else {
			editedValue.songSelection[otherType].count = clampedValue;
		}
	}

	// Handle song selection input changes
	function handleSongSelectionInputChange(type, event) {
		const newValue = parseInt(event.target.value) || 0;
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const clampedValue = Math.max(0, Math.min(maxValue, newValue));
		if (mode === 'percentage') {
			editedValue.songSelection[type].percentage = clampedValue;
		} else {
			editedValue.songSelection[type].count = clampedValue;
		}
		validateSongTypesTotal();
	}

	// Quick fix function to auto-balance song types AND song selection totals
	function quickFixSongTypes() {
		// No rate limiting needed for user-initiated actions
		const mode = editedValue.mode || 'count';
		const totalSongs = totalSongsMax();
		quickFixSongsAndTypes(editedValue, mode, totalSongs);
		validateSongTypesTotal();
	}

	// Track previous total songs for auto-scaling
	let previousTotalSongs = $state(totalSongsMax());

	// Auto-scale when total songs changes OR when editedValue is externally updated
	$effect(() => {
		const currentTotal = totalSongsMax();
		const mode = editedValue.mode || 'count';

		// Check if this is a forced update from parent
		const isForceUpdate =
			editedValue?._forceUpdate && editedValue._forceUpdate !== previousTotalSongs;

		if (
			(previousTotalSongs !== currentTotal || isForceUpdate) &&
			previousTotalSongs > 0 &&
			currentTotal > 0 &&
			editedValue
		) {
			const scale = currentTotal / previousTotalSongs;

			// Scale song types while maintaining ratios
			const enabledTypes = getEnabledTypes();
			const allStatic = enabledTypes.every((type) => !editedValue.songTypes[type].random);

			if (allStatic && enabledTypes.length > 0) {
				// For static types, maintain exact proportions based on their current sum
				const currentSongTypeSum = enabledTypes.reduce(
					(sum, type) => sum + Number(editedValue.songTypes[type].count || 0),
					0
				);
				if (currentSongTypeSum > 0) {
					// Calculate proportions based on the current song type distribution
					let distributedTotal = 0;
					const proportions = {};

					// Calculate each type's proportion of the current song type sum
					enabledTypes.forEach((type) => {
						const oldCount = Number(editedValue.songTypes[type].count || 0);
						proportions[type] = oldCount / currentSongTypeSum;
					});

					// Distribute the new total proportionally (all but the last)
					for (let i = 0; i < enabledTypes.length - 1; i++) {
						const type = enabledTypes[i];
						const newCount = Math.round(currentTotal * proportions[type]);
						editedValue.songTypes[type].count = newCount;
						distributedTotal += newCount;
					}

					// Give the remainder to the last type to ensure exact total
					const lastType = enabledTypes[enabledTypes.length - 1];
					const newCount = currentTotal - distributedTotal;
					editedValue.songTypes[lastType].count = Math.max(0, newCount);
				}
			} else {
				// For random ranges or mixed modes, scale individually
				for (const type of enabledTypes) {
					const cfg = editedValue.songTypes[type];
					if (cfg && cfg.enabled) {
						if (cfg.random) {
							if (cfg.countMin != null)
								cfg.countMin = Math.round(Number(cfg.countMin || 0) * scale);
							if (cfg.countMax != null)
								cfg.countMax = Math.round(Number(cfg.countMax || 0) * scale);
						} else if (cfg.count != null) {
							cfg.count = Math.round(Number(cfg.count || 0) * scale);
						}
					}
				}
			}

			// Scale song selection
			if (editedValue.songSelection) {
				const r = editedValue.songSelection.random;
				const w = editedValue.songSelection.watched;
				if (r && w && !r.random && !w.random) {
					const oldR = mode === 'percentage' ? Number(r.percentage || 0) : Number(r.count || 0);
					const oldW = mode === 'percentage' ? Number(w.percentage || 0) : Number(w.count || 0);
					const before = oldR + oldW || (mode === 'percentage' ? 100 : previousTotalSongs);
					const targetTotal = mode === 'percentage' ? 100 : currentTotal;
					const newR = Math.round(oldR * (targetTotal / before));
					if (mode === 'percentage') {
						r.percentage = newR;
						w.percentage = targetTotal - newR;
					} else {
						r.count = newR;
						w.count = targetTotal - newR;
					}
				}
			}

			// Clean up the force update marker
			if (editedValue._forceUpdate) {
				delete editedValue._forceUpdate;
			}

			// Auto-save the changes when scaling occurs
			if (onAutoSave) {
				console.log('🔧 Calling onAutoSave with scaled values:', editedValue);
				onAutoSave(editedValue);
			}
		}

		previousTotalSongs = currentTotal;
		// Don't call validateSongTypesTotal() here - let it be called by user actions
		// Calling it here causes infinite loops since validation may trigger effects
	});

	// Debounced validation effect - runs independently without triggering updates
	let validationTimeout = null;
	$effect(() => {
		// Watch for changes but don't validate immediately
		const _ = editedValue.songTypes;
		const __ = editedValue.songSelection;
		const ___ = editedValue.mode;
		const ____ = editedValue._storedTotalSongs;

		// Clear existing timeout
		if (validationTimeout) {
			clearTimeout(validationTimeout);
		}

		// Validate after a short delay to batch changes
		validationTimeout = setTimeout(() => {
			validateSongTypesTotal();
		}, 100);
	});

	// Handle song selection random range slider changes
	function handleSelectionRandomRangeSliderChange(type, event) {
		const values = event.detail.values;
		const mode = editedValue.mode || 'count';
		if (!editedValue.songSelection || !editedValue.songSelection[type]) return;

		if (mode === 'percentage') {
			editedValue.songSelection[type].percentageMin = values[0];
			editedValue.songSelection[type].percentageMax = values[1];
		} else {
			editedValue.songSelection[type].countMin = values[0];
			editedValue.songSelection[type].countMax = values[1];
		}

		validateSongTypesTotal();
	}

	// Handle song selection random range input changes
	function handleSelectionRandomRangeInputChange(type, field, event) {
		const newValue = parseInt(event.target.value) || 0;
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : totalSongsMax();
		const clampedValue = Math.max(0, Math.min(maxValue, newValue));
		if (!editedValue.songSelection || !editedValue.songSelection[type]) return;

		if (mode === 'percentage') {
			if (field === 'min') {
				editedValue.songSelection[type].percentageMin = clampedValue;
			} else {
				editedValue.songSelection[type].percentageMax = clampedValue;
			}
		} else {
			if (field === 'min') {
				editedValue.songSelection[type].countMin = clampedValue;
			} else {
				editedValue.songSelection[type].countMax = clampedValue;
			}
		}

		validateSongTypesTotal();
	}
</script>

<div class="space-y-4">
	<!-- Final Number of Songs (inherited, read-only) -->
	<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
		<div class="flex items-center justify-between">
			<Label class="text-base font-semibold text-gray-800">Final Number of Songs</Label>
			<div class="text-sm font-bold" style="color: {getNodeColor()}">
				{#if typeof getTotalSongs() === 'object'}
					{getTotalSongs().min}–{getTotalSongs().max}
				{:else}
					{getTotalSongs()}
				{/if}
			</div>
		</div>
		<p class="mt-2 text-xs text-gray-500">This total comes from the Number of Songs node.</p>
	</div>

	<!-- Mode Toggle Section -->
	<div class="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-4">
				<div class="flex items-center space-x-2">
					<Label class="text-sm font-medium text-gray-700">Mode:</Label>
					<div class="flex items-center space-x-2">
						<Label
							class="text-sm {editedValue.mode === 'percentage'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">%</Label
						>
						<input
							type="radio"
							name="mode"
							value="percentage"
							bind:group={editedValue.mode}
							class="h-4 w-4 text-blue-600"
							disabled={readOnly ||
								editedValue.percentageModeLocked ||
								editedValue._wasForcedToPercentage}
						/>
						<Label
							class="text-sm {editedValue.mode === 'count'
								? 'font-semibold text-blue-600'
								: 'text-gray-500'}">Count</Label
						>
						<input
							type="radio"
							name="count"
							value="count"
							bind:group={editedValue.mode}
							class="h-4 w-4 text-blue-600"
							disabled={readOnly ||
								editedValue.percentageModeLocked ||
								editedValue._wasForcedToPercentage}
						/>
					</div>
				</div>
				{#if editedValue.percentageModeLocked || editedValue._wasForcedToPercentage}
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
				{/if}
			</div>
		</div>
	</div>

	<!-- Actual Allocation Values -->
	{#if predictedInfo}
		{@const pred = predictedInfo}
		<div
			class="rounded-lg border p-4"
			class:border-red-200={pred?.error}
			class:bg-red-50={pred?.error}
			class:border-blue-200={!pred?.error}
			class:bg-blue-50={!pred?.error}
		>
			<div class="flex items-start gap-3">
				<div class="mt-0.5 flex-shrink-0">
					<svg
						class="h-5 w-5"
						fill="currentColor"
						viewBox="0 0 20 20"
						class:text-red-600={pred?.error}
						class:text-blue-600={!pred?.error}
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						></path>
					</svg>
				</div>
				<div class="flex-1">
					{#if pred?.error}
						<h4 class="mb-1 text-sm font-medium text-red-900">Configuration Error</h4>
						<div class="text-sm text-red-800">
							<div class="rounded bg-red-100 p-2 text-xs">
								<strong>⚠️ Invalid Configuration:</strong>
								{pred?.message ?? 'Unknown error'}
							</div>
							<div class="mt-2 flex items-center justify-between">
								<div class="text-xs text-gray-600">
									Fix the validation errors or use Quick Fix to auto-correct.
								</div>
								<Button
									variant="destructive"
									size="sm"
									disabled={readOnly}
									onclick={quickFixSongTypes}
									class=""
								>
									Quick Fix
								</Button>
							</div>
						</div>
					{:else}
						<h4 class="mb-1 text-sm font-medium text-blue-900">Actual Allocation Values</h4>
						<div class="space-y-1 text-sm text-blue-800">
							<div class="mt-2 grid grid-cols-3 gap-2">
								{#each pred?.types ?? [] as t}
									<div
										class="rounded border border-blue-200 bg-white px-2 py-1 text-center text-xs"
									>
										<span class="font-medium capitalize">{t?.label ?? 'Unknown'}</span>:
										{#if pred?.showRanges && !t?.isStatic}
											<span class="text-orange-600"
												>{t?.min ?? 0}-{t?.max ?? 0}{pred?.unit ?? ''}</span
											>
											<span class="ml-1 text-xs text-gray-500">(random)</span>
										{:else}
											<span class={t?.isStatic ? 'font-semibold text-blue-600' : 'text-green-600'}
												>{t?.value ?? 0}{pred?.unit ?? ''}</span
											>
											{#if !t?.isStatic}
												<span class="ml-1 text-xs text-gray-500">(calculated)</span>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
							<div class="mt-2 rounded bg-blue-100 p-2 text-xs">
								<strong>Selection:</strong>
								<span class="ml-1"
									>Random:
									{#if pred?.selection?.random && !pred.selection.random.isStatic && pred.selection.random.min !== undefined && pred.selection.random.max !== undefined && pred.selection.random.min <= pred.selection.random.max}
										<span class="text-orange-600"
											>{pred.selection.random.min}-{pred.selection.random.max}{pred?.unit ??
												''}</span
										>
										<span class="ml-1 text-gray-500">(random)</span>
									{:else if pred?.selection?.random}
										<span
											class={pred.selection.random.isStatic
												? 'font-semibold text-blue-600'
												: 'text-green-600'}
											>{pred.selection.random.value ?? 0}{pred?.unit ?? ''}</span
										>
										{#if pred.selection.random && !pred.selection.random.isStatic}
											<span class="ml-1 text-gray-500">(calculated)</span>
										{/if}
									{:else}
										<span class="text-gray-500">0{pred?.unit ?? ''}</span>
									{/if}
								</span>
								<span class="ml-3"
									>Watched:
									{#if pred?.selection?.watched && !pred.selection.watched.isStatic && pred.selection.watched.min !== undefined && pred.selection.watched.max !== undefined && pred.selection.watched.min <= pred.selection.watched.max}
										<span class="text-orange-600"
											>{pred.selection.watched.min}-{pred.selection.watched.max}{pred?.unit ??
												''}</span
										>
										<span class="ml-1 text-gray-500">(random)</span>
									{:else if pred?.selection?.watched}
										<span
											class={pred.selection.watched.isStatic
												? 'font-semibold text-blue-600'
												: 'text-green-600'}
											>{pred.selection.watched.value ?? 0}{pred?.unit ?? ''}</span
										>
										{#if pred.selection.watched && !pred.selection.watched.isStatic}
											<span class="ml-1 text-gray-500">(calculated)</span>
										{/if}
									{:else}
										<span class="text-gray-500">0{pred?.unit ?? ''}</span>
									{/if}
								</span>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<!-- Song Types Section -->
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
			<Label class="mb-3 block text-base font-semibold text-gray-800">Song Types</Label>
			<div class="space-y-4">
				<!-- Openings -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Checkbox
								bind:checked={editedValue.songTypes.openings.enabled}
								id="openings"
								disabled={readOnly}
								class=""
							/>
							<Label for="openings" class="text-sm">Openings</Label>
						</div>
						{#if editedValue.songTypes.openings.enabled}
							<div class="flex items-center space-x-2">
								<Checkbox
									bind:checked={editedValue.songTypes.openings.random}
									id="openings-random"
									disabled={readOnly}
									class=""
								/>
								<Label for="openings-random" class="text-xs text-gray-600">Random range</Label>
							</div>
						{/if}
					</div>
					{#if editedValue.songTypes.openings.enabled}
						{#if editedValue.songTypes.openings.random}
							<!-- Random Range Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.openings.percentageMin || 0
											: editedValue.songTypes.openings.countMin || 0,
										editedValue.mode === 'percentage'
											? editedValue.songTypes.openings.percentageMax || 100
											: editedValue.songTypes.openings.countMax || totalSongsMax()
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									range
									pips
									pipstep={editedValue.mode === 'percentage'
										? 25
										: Math.max(1, Math.floor(totalSongsMax() / 4))}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleRandomRangeSliderChange('openings', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center space-x-4">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.openings.percentageMin || 0
												: editedValue.songTypes.openings.countMin || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('openings', 'min', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'min'}</span
										>
									</div>
									<span class="text-xs text-gray-400">to</span>
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.openings.percentageMax || 100
												: editedValue.songTypes.openings.countMax || totalSongsMax()}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('openings', 'max', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'max'}</span
										>
									</div>
								</div>
							</div>
						{:else}
							<!-- Single Value Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.openings.percentage || 0
											: editedValue.songTypes.openings.count || 0
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									pips
									pipstep={editedValue.mode === 'percentage' ? 25 : totalSongsPipStep()}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleSongTypeSliderChange('openings', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.openings.percentage || 0
												: editedValue.songTypes.openings.count || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleSongTypeInputChange('openings', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
										>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Endings -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Checkbox
								bind:checked={editedValue.songTypes.endings.enabled}
								id="endings"
								disabled={readOnly}
								class=""
							/>
							<Label for="endings" class="text-sm">Endings</Label>
						</div>
						{#if editedValue.songTypes.endings.enabled}
							<div class="flex items-center space-x-2">
								<Checkbox
									bind:checked={editedValue.songTypes.endings.random}
									id="endings-random"
									disabled={readOnly}
									class=""
								/>
								<Label for="endings-random" class="text-xs text-gray-600">Random range</Label>
							</div>
						{/if}
					</div>
					{#if editedValue.songTypes.endings.enabled}
						{#if editedValue.songTypes.endings.random}
							<!-- Random Range Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.endings.percentageMin || 0
											: editedValue.songTypes.endings.countMin || 0,
										editedValue.mode === 'percentage'
											? editedValue.songTypes.endings.percentageMax || 100
											: editedValue.songTypes.endings.countMax || totalSongsMax()
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									range
									pips
									pipstep={editedValue.mode === 'percentage'
										? 25
										: Math.max(1, Math.floor(totalSongsMax() / 4))}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleRandomRangeSliderChange('endings', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center space-x-4">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.endings.percentageMin || 0
												: editedValue.songTypes.endings.countMin || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('endings', 'min', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'min'}</span
										>
									</div>
									<span class="text-xs text-gray-400">to</span>
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.endings.percentageMax || 100
												: editedValue.songTypes.endings.countMax || totalSongsMax()}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('endings', 'max', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'max'}</span
										>
									</div>
								</div>
							</div>
						{:else}
							<!-- Single Value Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.endings.percentage || 0
											: editedValue.songTypes.endings.count || 0
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									pips
									pipstep={editedValue.mode === 'percentage' ? 25 : totalSongsPipStep()}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleSongTypeSliderChange('endings', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.endings.percentage || 0
												: editedValue.songTypes.endings.count || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleSongTypeInputChange('endings', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
										>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Inserts -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Checkbox
								bind:checked={editedValue.songTypes.inserts.enabled}
								id="inserts"
								disabled={readOnly}
								class=""
							/>
							<Label for="inserts" class="text-sm">Inserts</Label>
						</div>
						{#if editedValue.songTypes.inserts.enabled}
							<div class="flex items-center space-x-2">
								<Checkbox
									bind:checked={editedValue.songTypes.inserts.random}
									id="inserts-random"
									disabled={readOnly}
									class=""
								/>
								<Label for="inserts-random" class="text-xs text-gray-600">Random range</Label>
							</div>
						{/if}
					</div>
					{#if editedValue.songTypes.inserts.enabled}
						{#if editedValue.songTypes.inserts.random}
							<!-- Random Range Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.inserts.percentageMin || 0
											: editedValue.songTypes.inserts.countMin || 0,
										editedValue.mode === 'percentage'
											? editedValue.songTypes.inserts.percentageMax || 100
											: editedValue.songTypes.inserts.countMax || totalSongsMax()
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									range
									pips
									pipstep={editedValue.mode === 'percentage'
										? 25
										: Math.max(1, Math.floor(totalSongsMax() / 4))}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleRandomRangeSliderChange('inserts', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center space-x-4">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.inserts.percentageMin || 0
												: editedValue.songTypes.inserts.countMin || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('inserts', 'min', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'min'}</span
										>
									</div>
									<span class="text-xs text-gray-400">to</span>
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.inserts.percentageMax || 100
												: editedValue.songTypes.inserts.countMax || totalSongsMax()}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleRandomRangeInputChange('inserts', 'max', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'max'}</span
										>
									</div>
								</div>
							</div>
						{:else}
							<!-- Single Value Mode -->
							<div class="px-2">
								{#key totalSongsMax()}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage'
											? editedValue.songTypes.inserts.percentage || 0
											: editedValue.songTypes.inserts.count || 0
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
									step={1}
									pips
									pipstep={editedValue.mode === 'percentage' ? 25 : totalSongsPipStep()}
									all="label"
									disabled={readOnly}
									on:change={(e) => handleSongTypeSliderChange('inserts', e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								{/key}
								<div class="mt-1 flex justify-center">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.songTypes.inserts.percentage || 0
												: editedValue.songTypes.inserts.count || 0}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => handleSongTypeInputChange('inserts', e)}
										/>
										<span class="text-xs text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
										>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>

		<!-- Song Selection Section -->
		<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
			<Label class="mb-3 block text-base font-semibold text-gray-800">Song Selection</Label>
			<div class="space-y-4">
				<!-- Random -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Label class="text-sm">Random</Label>
						</div>
						<div class="flex items-center space-x-2">
							<Checkbox
								bind:checked={editedValue.songSelection.random.random}
								id="random-random"
								disabled={readOnly}
								class=""
							/>
							<Label for="random-random" class="text-xs text-gray-600">Random range</Label>
						</div>
					</div>
					{#if editedValue.songSelection.random.random}
						<!-- Random Range Mode -->
						<div class="px-2">
							{#key totalSongsMax()}
							<RangeSlider
								values={[
									editedValue.mode === 'percentage'
										? editedValue.songSelection.random.percentageMin || 0
										: editedValue.songSelection.random.countMin || 0,
									editedValue.mode === 'percentage'
										? editedValue.songSelection.random.percentageMax || 100
										: editedValue.songSelection.random.countMax || totalSongsMax()
								]}
								min={0}
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								step={1}
								range
								pips
								pipstep={editedValue.mode === 'percentage'
									? 25
									: Math.max(1, Math.floor(totalSongsMax() / 4))}
								all="label"
								disabled={readOnly}
								on:change={(e) => handleSelectionRandomRangeSliderChange('random', e)}
								--slider={getNodeColor()}
								--handle={getNodeColor()}
								--range={getNodeColor()}
								--progress={getNodeColor()}
							/>
							{/key}
							<div class="mt-1 flex justify-center space-x-4">
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.random.percentageMin || 0
											: editedValue.songSelection.random.countMin || 0}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSelectionRandomRangeInputChange('random', 'min', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'min'}</span
									>
								</div>
								<span class="text-xs text-gray-400">to</span>
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.random.percentageMax || 100
											: editedValue.songSelection.random.countMax || totalSongsMax()}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSelectionRandomRangeInputChange('random', 'max', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'max'}</span
									>
								</div>
							</div>
						</div>
					{:else}
						<!-- Single Value Mode -->
						<div class="px-2">
							{#key totalSongsMax()}
							<RangeSlider
								values={[
									editedValue.mode === 'percentage'
										? editedValue.songSelection.random.percentage || 0
										: editedValue.songSelection.random.count || 0
								]}
								min={0}
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								step={1}
								pips
								pipstep={editedValue.mode === 'percentage' ? 25 : totalSongsPipStep()}
								all="label"
								disabled={readOnly}
								on:change={(e) => handleSongSelectionSliderChange('random', e)}
								--slider={getNodeColor()}
								--handle={getNodeColor()}
								--range={getNodeColor()}
								--progress={getNodeColor()}
							/>
							{/key}
							<div class="mt-1 flex justify-center">
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.random.percentage || 0
											: editedValue.songSelection.random.count || 0}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSongSelectionInputChange('random', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
									>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Watched -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Label class="text-sm">Watched</Label>
						</div>
						<div class="flex items-center space-x-2">
							<Checkbox
								bind:checked={editedValue.songSelection.watched.random}
								id="watched-random"
								disabled={readOnly}
								class=""
							/>
							<Label for="watched-random" class="text-xs text-gray-600">Random range</Label>
						</div>
					</div>
					{#if editedValue.songSelection.watched.random}
						<!-- Random Range Mode -->
						<div class="px-2">
							{#key totalSongsMax()}
							<RangeSlider
								values={[
									editedValue.mode === 'percentage'
										? editedValue.songSelection.watched.percentageMin || 0
										: editedValue.songSelection.watched.countMin || 0,
									editedValue.mode === 'percentage'
										? editedValue.songSelection.watched.percentageMax || 100
										: editedValue.songSelection.watched.countMax || totalSongsMax()
								]}
								min={0}
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								step={1}
								range
								pips
								pipstep={editedValue.mode === 'percentage'
									? 25
									: Math.max(1, Math.floor(totalSongsMax() / 4))}
								all="label"
								disabled={readOnly}
								on:change={(e) => handleSelectionRandomRangeSliderChange('watched', e)}
								--slider={getNodeColor()}
								--handle={getNodeColor()}
								--range={getNodeColor()}
								--progress={getNodeColor()}
							/>
							{/key}
							<div class="mt-1 flex justify-center space-x-4">
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.watched.percentageMin || 0
											: editedValue.songSelection.watched.countMin || 0}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSelectionRandomRangeInputChange('watched', 'min', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'min'}</span
									>
								</div>
								<span class="text-xs text-gray-400">to</span>
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.watched.percentageMax || 100
											: editedValue.songSelection.watched.countMax || totalSongsMax()}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSelectionRandomRangeInputChange('watched', 'max', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'max'}</span
									>
								</div>
							</div>
						</div>
					{:else}
						<!-- Single Value Mode -->
						<div class="px-2">
							{#key totalSongsMax()}
							<RangeSlider
								values={[
									editedValue.mode === 'percentage'
										? editedValue.songSelection.watched.percentage || 0
										: editedValue.songSelection.watched.count || 0
								]}
								min={0}
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								step={1}
								pips
								pipstep={editedValue.mode === 'percentage' ? 25 : totalSongsPipStep()}
								all="label"
								disabled={readOnly}
								on:change={(e) => handleSongSelectionSliderChange('watched', e)}
								--slider={getNodeColor()}
								--handle={getNodeColor()}
								--range={getNodeColor()}
								--progress={getNodeColor()}
							/>
							{/key}
							<div class="mt-1 flex justify-center">
								<div class="flex items-center space-x-1">
									<Input
										type="number"
										value={editedValue.mode === 'percentage'
											? editedValue.songSelection.watched.percentage || 0
											: editedValue.songSelection.watched.count || 0}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										disabled={readOnly}
										class="h-6 w-16 px-1 text-center text-xs"
										oninput={(e) => handleSongSelectionInputChange('watched', e)}
									/>
									<span class="text-xs text-gray-600"
										>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
									>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
