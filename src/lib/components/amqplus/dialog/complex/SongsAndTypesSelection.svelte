<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import { SONGS_AND_TYPES_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/utils/mathUtils.js';
	import { initializeSongsAndTypesMode } from '$lib/utils/modeInitializationUtils.js';
	import { quickFixSongsAndTypes } from '$lib/utils/quickFixUtils.js';

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
			const defaultUnwatchedSettings = SONGS_AND_TYPES_DEFAULT_SETTINGS.songSelection?.unwatched;

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

			// Initialize unwatched with safe defaults for backwards compatibility
			if (!editedValue.songSelection.unwatched) {
				editedValue.songSelection.unwatched = {
					enabled: false,
					count: 0,
					percentage: 0,
					random: false,
					percentageMin: 0,
					percentageMax: 0,
					countMin: 0,
					countMax: 0
				};
			} else {
				// If unwatched exists but is missing properties, initialize them
				if (editedValue.songSelection.unwatched.enabled === undefined) {
					editedValue.songSelection.unwatched.enabled = defaultUnwatchedSettings?.enabled ?? false;
				}
				if (editedValue.songSelection.unwatched.random === undefined) {
					editedValue.songSelection.unwatched.random = defaultUnwatchedSettings?.random ?? false;
				}
				if (editedValue.songSelection.unwatched.count === undefined) {
					editedValue.songSelection.unwatched.count = defaultUnwatchedSettings?.count ?? 0;
				}
				if (editedValue.songSelection.unwatched.percentage === undefined) {
					editedValue.songSelection.unwatched.percentage =
						defaultUnwatchedSettings?.percentage ?? 0;
				}
				if (editedValue.songSelection.unwatched.percentageMin === undefined) {
					editedValue.songSelection.unwatched.percentageMin =
						defaultUnwatchedSettings?.percentageMin ?? 0;
				}
				if (editedValue.songSelection.unwatched.percentageMax === undefined) {
					editedValue.songSelection.unwatched.percentageMax =
						defaultUnwatchedSettings?.percentageMax ?? 0;
				}
				if (editedValue.songSelection.unwatched.countMin === undefined) {
					editedValue.songSelection.unwatched.countMin = defaultUnwatchedSettings?.countMin ?? 0;
				}
				if (editedValue.songSelection.unwatched.countMax === undefined) {
					editedValue.songSelection.unwatched.countMax = defaultUnwatchedSettings?.countMax ?? 0;
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
						typeData.percentage = Math.round((typeData.count / totalSongs) * 100);
						hasChanges = true;
					} else if (
						editedValue.mode === 'count' &&
						typeData.percentage !== undefined &&
						typeData.count === undefined
					) {
						typeData.count = Math.round((typeData.percentage / 100) * totalSongs);
						hasChanges = true;
					}
				}
			}

			if (hasChanges) {
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
						selection.percentage = Math.round((selection.count / totalSongs) * 100);
						hasChanges = true;
					} else if (
						editedValue.mode === 'count' &&
						selection.percentage !== undefined &&
						selection.count === undefined
					) {
						selection.count = Math.round((selection.percentage / 100) * totalSongs);
						hasChanges = true;
					}
				}
			}

			if (hasChanges) {
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
		/** @type {import('$lib/utils/mathUtils.js').AllocationEntry[]} */
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
		const unwatchedCfg = editedValue?.songSelection?.unwatched || {};

		// Build selection entries with proper constraints
		const randomStatic = !randomCfg.random;
		const watchedStatic = !watchedCfg.random;
		const unwatchedStatic = !unwatchedCfg.random;
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
		const unwatchedValue = unwatchedStatic
			? isPercentageMode
				? Number(unwatchedCfg.percentage || 0)
				: Number(unwatchedCfg.count || 0)
			: 0;
		const remainingForRanges =
			(isPercentageMode ? 100 : targetTotal) - randomValue - watchedValue - unwatchedValue;

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
		const uMin = isPercentageMode
			? Number(unwatchedCfg.percentageMin ?? unwatchedCfg.min ?? 0)
			: Number(unwatchedCfg.countMin ?? unwatchedCfg.min ?? 0);
		const uMax = isPercentageMode
			? Number(
					unwatchedCfg.percentageMax ?? unwatchedCfg.max ?? (isPercentageMode ? 100 : targetTotal)
				)
			: Number(unwatchedCfg.countMax ?? unwatchedCfg.max ?? targetTotal);

		/** @type {import('$lib/utils/mathUtils.js').AllocationEntry[]} */
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
				: { label: 'watched', kind: /** @type {'static'} */ ('static'), value: watchedValue },
			unwatchedCfg.random === true
				? {
						label: 'unwatched',
						kind: /** @type {'range'} */ ('range'),
						min: uMin,
						max: Math.min(uMax, remainingForRanges)
					}
				: { label: 'unwatched', kind: /** @type {'static'} */ ('static'), value: unwatchedValue }
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
				})(),
				unwatched: (() => {
					try {
						const info = selAnalysis?.refined?.get('unwatched');
						const entry = selEntries?.find((e) => e?.label === 'unwatched');

						// Always return a valid object with defaults
						if (!entry) return { value: 0, isStatic: true };
						if (!info || entry.kind === 'static')
							return { value: entry.value ?? 0, isStatic: true };
						if (selAnalysis?.hasRandom && info?.min < info?.max)
							return { min: info.min ?? 0, max: info.max ?? 0, isStatic: false };
						return { value: info?.min ?? 0, isStatic: false };
					} catch (error) {
						console.warn('🛑 Error in unwatched selection calculation:', error);
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

		// Validate song selection totals (random + watched + unwatched)
		const selR = editedValue.songSelection.random || {};
		const selW = editedValue.songSelection.watched || {};
		const selU = editedValue.songSelection.unwatched || {};
		const selHasRandom = !!selR.random || !!selW.random || !!selU.random;
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
			if (!selU.random)
				staticTotal += isPercentageMode ? Number(selU.percentage || 0) : Number(selU.count || 0);
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
			if (selU.random) {
				const umin = isPercentageMode
					? Number(selU.percentageMin ?? selU.min ?? 0)
					: Number(selU.countMin ?? selU.min ?? 0);
				const umax = isPercentageMode
					? Number(selU.percentageMax ?? selU.max ?? 0)
					: Number(selU.countMax ?? selU.max ?? 0);
				randomMinTotal += umin;
				randomMaxTotal += umax;
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
			const unwatchedValue = isPercentageMode
				? Number(selU.percentage || 0)
				: Number(selU.count || 0);
			const selectionTotal = randomValue + watchedValue + unwatchedValue;
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

<div class="df-hybrid-layout" style="--accent: {getNodeColor()}">
	<!-- Combined toolbar + allocation preview -->
	<div
		class="df-hybrid-full border-ed-border bg-ed-canvas-default flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5"
	>
		<span class="font-jb shrink-0 text-xs font-semibold" style="color: {getNodeColor()}">
			{#if typeof getTotalSongs() === 'object'}{getTotalSongs().min}–{getTotalSongs()
					.max}{:else}{getTotalSongs()}{/if} songs
		</span>

		{#if predictedInfo && !predictedInfo.error}
			{@const pred = predictedInfo}
			<div class="bg-ed-border-muted mx-0.5 h-3.5 w-px shrink-0"></div>
			<div class="flex flex-wrap items-center gap-1">
				{#each pred?.types ?? [] as t}
					<div
						class="border-ed-border bg-ed-canvas-subtle flex items-center gap-1 rounded border px-1.5 py-0.5"
					>
						<span class="font-dm text-ed-fg-subtle text-[10px] font-bold uppercase">{t?.label}</span
						>
						{#if pred?.showRanges && !t?.isStatic}
							<span class="font-jb text-[10px] text-[#e2e8f0]">{t?.min}–{t?.max}{pred?.unit}</span>
							<span class="font-dm text-ed-fg-muted text-[9px] italic">rnd</span>
						{:else}
							<span class="font-jb text-[10px] text-[#e2e8f0]">{t?.value ?? 0}{pred?.unit}</span>
						{/if}
					</div>
				{/each}
			</div>
			{#if pred?.selection}
				<div class="bg-ed-border-muted mx-0.5 h-3.5 w-px shrink-0"></div>
				<div class="flex flex-wrap items-center gap-1">
					{#each [['Random', pred.selection.random], ['Watched', pred.selection.watched], ['Unwatched', pred.selection.unwatched]] as [sLabel, sInfo]}
						{#if sInfo}
							<div
								class="border-ed-border bg-ed-canvas-subtle flex items-center gap-1 rounded border px-1.5 py-0.5"
							>
								<span class="font-dm text-ed-fg-subtle text-[10px] font-bold uppercase"
									>{sLabel}</span
								>
								{#if !sInfo.isStatic && sInfo.min !== undefined && sInfo.max !== undefined && sInfo.min <= sInfo.max}
									<span class="font-jb text-[10px] text-[#e2e8f0]"
										>{sInfo.min}–{sInfo.max}{pred?.unit}</span
									>
									<span class="font-dm text-ed-fg-muted text-[9px] italic">rnd</span>
								{:else}
									<span class="font-jb text-[10px] text-[#e2e8f0]"
										>{sInfo.value ?? 0}{pred?.unit}</span
									>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<div class="df-pill-group">
				<button
					class:active={editedValue.mode === 'percentage'}
					disabled={readOnly ||
						editedValue.percentageModeLocked ||
						editedValue._wasForcedToPercentage}
					onclick={() => (editedValue.mode = 'percentage')}>%</button
				>
				<button
					class:active={editedValue.mode === 'count'}
					disabled={readOnly ||
						editedValue.percentageModeLocked ||
						editedValue._wasForcedToPercentage}
					onclick={() => (editedValue.mode = 'count')}>Count</button
				>
			</div>
			{#if editedValue.percentageModeLocked || editedValue._wasForcedToPercentage}
				<span class="font-dm text-[10px] text-[#f59e0b]">locked</span>
			{/if}
		</div>
	</div>

	<!-- Error bar -->
	{#if predictedInfo?.error}
		<div class="df-hybrid-full df-error-bar">
			<div class="flex items-center gap-2">
				<span>⚠</span><span>{predictedInfo.message ?? 'Error'}</span>
			</div>
			{#if !readOnly}
				<button class="quick-fix-btn" onclick={quickFixSongTypes}>Quick Fix</button>
			{/if}
		</div>
	{/if}

	<!-- Song Types + Selection side by side, equal height -->
	<div class="df-hybrid-full flex w-full gap-2">
		<!-- Song Types -->
		<div
			class="border-ed-border bg-ed-canvas-default flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
		>
			<div class="border-ed-border bg-ed-canvas-subtle flex items-center border-b px-3 py-1">
				<span
					class="font-dm text-[10px] font-bold tracking-wider uppercase"
					style="color: {getNodeColor()}">Song Types</span
				>
			</div>
			{#each ['openings', 'endings', 'inserts'] as type, idx}
				{@const typeLabels = { openings: 'OPENING', endings: 'ENDING', inserts: 'INSERT' }}
				{@const cfg = editedValue.songTypes[type]}
				<div
					class="border-ed-border flex items-center gap-2 px-2.5"
					class:border-t={idx > 0}
					style="min-height: {cfg.enabled ? '30px' : '26px'}"
				>
					<label class="flex shrink-0 cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={cfg.enabled}
							disabled={readOnly}
						/>
						<span
							class="font-dm w-[68px] shrink-0 text-[11px] font-bold tracking-wide uppercase"
							style="color: {cfg.enabled ? getNodeColor() : '#8b949e'}">{typeLabels[type]}</span
						>
					</label>
					{#if cfg.enabled}
						<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
							{#key totalSongsMax()}
								{#if cfg.random}
									<RangeSlider
										values={[
											editedValue.mode === 'percentage'
												? cfg.percentageMin || 0
												: cfg.countMin || 0,
											editedValue.mode === 'percentage'
												? cfg.percentageMax || 100
												: cfg.countMax || totalSongsMax()
										]}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										step={1}
										range
										pushy
										disabled={readOnly}
										on:change={(e) => handleRandomRangeSliderChange(type, e)}
										--slider={getNodeColor()}
										--handle={getNodeColor()}
										--range={getNodeColor()}
										--progress={getNodeColor()}
									/>
								{:else}
									<RangeSlider
										values={[
											editedValue.mode === 'percentage' ? cfg.percentage || 0 : cfg.count || 0
										]}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										step={1}
										disabled={readOnly}
										on:change={(e) => handleSongTypeSliderChange(type, e)}
										--slider={getNodeColor()}
										--handle={getNodeColor()}
										--range={getNodeColor()}
										--progress={getNodeColor()}
									/>
								{/if}
							{/key}
						</div>
						<label class="flex shrink-0 cursor-pointer items-center gap-1">
							<input
								type="checkbox"
								class="df-checkbox"
								style="width:11px;height:11px"
								bind:checked={cfg.random}
								disabled={readOnly}
							/>
							<span class="font-dm text-ed-fg-muted text-[10px]">Rng</span>
						</label>
						<div class="flex shrink-0 items-center gap-1">
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								disabled={readOnly}
								value={cfg.random
									? editedValue.mode === 'percentage'
										? cfg.percentageMin || 0
										: cfg.countMin || 0
									: editedValue.mode === 'percentage'
										? cfg.percentage || 0
										: cfg.count || 0}
								oninput={(e) =>
									cfg.random
										? handleRandomRangeInputChange(type, 'min', e)
										: handleSongTypeInputChange(type, e)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">–</span>
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								disabled={readOnly || !cfg.random}
								value={cfg.random
									? editedValue.mode === 'percentage'
										? cfg.percentageMax || 100
										: cfg.countMax || totalSongsMax()
									: editedValue.mode === 'percentage'
										? cfg.percentage || 0
										: cfg.count || 0}
								oninput={(e) => handleRandomRangeInputChange(type, 'max', e)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]"
								>{editedValue.mode === 'percentage' ? '%' : ''}</span
							>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Song Selection -->
		<div
			class="border-ed-border bg-ed-canvas-default flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border"
		>
			<div class="border-ed-border bg-ed-canvas-subtle flex items-center border-b px-3 py-1">
				<span
					class="font-dm text-[10px] font-bold tracking-wider uppercase"
					style="color: {getNodeColor()}">Selection</span
				>
			</div>
			{#each ['random', 'watched', 'unwatched'] as selType, idx}
				{@const selLabels = { random: 'RANDOM', watched: 'WATCHED', unwatched: 'UNWATCHED' }}
				{@const sel = editedValue.songSelection?.[selType]}
				{#if sel}
					<div
						class="border-ed-border flex items-center gap-2 px-2.5"
						class:border-t={idx > 0}
						style="min-height: 30px"
					>
						<span
							class="font-dm text-ed-fg w-[86px] shrink-0 text-[10px] font-bold tracking-wide uppercase"
							>{selLabels[selType]}</span
						>
						<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
							{#key totalSongsMax()}
								{#if sel.random}
									<RangeSlider
										values={[
											editedValue.mode === 'percentage'
												? sel.percentageMin || 0
												: sel.countMin || 0,
											editedValue.mode === 'percentage'
												? sel.percentageMax || 100
												: sel.countMax || totalSongsMax()
										]}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										step={1}
										range
										pushy
										disabled={readOnly}
										on:change={(e) => handleSelectionRandomRangeSliderChange(selType, e)}
										--slider={getNodeColor()}
										--handle={getNodeColor()}
										--range={getNodeColor()}
										--progress={getNodeColor()}
									/>
								{:else}
									<RangeSlider
										values={[
											editedValue.mode === 'percentage' ? sel.percentage || 0 : sel.count || 0
										]}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
										step={1}
										disabled={readOnly}
										on:change={(e) => handleSongSelectionSliderChange(selType, e)}
										--slider={getNodeColor()}
										--handle={getNodeColor()}
										--range={getNodeColor()}
										--progress={getNodeColor()}
									/>
								{/if}
							{/key}
						</div>
						<label class="flex shrink-0 cursor-pointer items-center gap-1">
							<input
								type="checkbox"
								class="df-checkbox"
								style="width:11px;height:11px"
								bind:checked={sel.random}
								disabled={readOnly}
							/>
							<span class="font-dm text-ed-fg-muted text-[10px]">Rng</span>
						</label>
						<div class="flex shrink-0 items-center gap-1">
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								disabled={readOnly}
								value={sel.random
									? editedValue.mode === 'percentage'
										? sel.percentageMin || 0
										: sel.countMin || 0
									: editedValue.mode === 'percentage'
										? sel.percentage || 0
										: sel.count || 0}
								oninput={(e) =>
									sel.random
										? handleSelectionRandomRangeInputChange(selType, 'min', e)
										: handleSongSelectionInputChange(selType, e)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">–</span>
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : totalSongsMax()}
								disabled={readOnly || !sel.random}
								value={sel.random
									? editedValue.mode === 'percentage'
										? sel.percentageMax || 100
										: sel.countMax || totalSongsMax()
									: editedValue.mode === 'percentage'
										? sel.percentage || 0
										: sel.count || 0}
								oninput={(e) => handleSelectionRandomRangeInputChange(selType, 'max', e)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]"
								>{editedValue.mode === 'percentage' ? '%' : ''}</span
							>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>
