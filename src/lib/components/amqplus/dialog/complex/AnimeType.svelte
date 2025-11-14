<script>
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { ANIME_TYPE_DEFAULT_SETTINGS } from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initializeAnimeTypeMode } from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';
	import { quickFixAnimeType } from '$lib/components/amqplus/editor/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		onAutoSave = () => {},
		readOnly = false // Whether the form is in read-only mode
	} = $props();

	const animeTypeKeys = ['tv', 'movie', 'ova', 'ona', 'special'];
	const animeTypeLabels = {
		tv: 'TV',
		movie: 'Movie',
		ova: 'OVA',
		ona: 'ONA',
		special: 'Special'
	};

	// view mode: 'simple' or 'advanced' (persisted on editedValue)
	let viewMode = $state(editedValue?.viewMode ?? ANIME_TYPE_DEFAULT_SETTINGS.viewMode);

	// mode: 'percentage' or 'count' (persisted on editedValue)
	if (!editedValue.mode) {
		editedValue.mode = ANIME_TYPE_DEFAULT_SETTINGS.mode;
	}

	// Synchronous initialization to prevent undefined access during first render
	ensureBaseStructure();
	ensureAllAdvancedGroups();

	// Initialize base structure if missing
	function ensureBaseStructure() {
		if (!editedValue || typeof editedValue !== 'object') {
			editedValue = {};
		}
		for (const type of animeTypeKeys) {
			if (editedValue[type] === undefined) {
				editedValue[type] = ANIME_TYPE_DEFAULT_SETTINGS[type] ?? true; // use default settings
			}
		}
		// Initialize rebroadcast and dubbed filters
		if (editedValue.rebroadcast === undefined) {
			editedValue.rebroadcast = ANIME_TYPE_DEFAULT_SETTINGS.rebroadcast ?? false;
		}
		if (editedValue.dubbed === undefined) {
			editedValue.dubbed = ANIME_TYPE_DEFAULT_SETTINGS.dubbed ?? false;
		}
	}

	// Advanced data structure
	function ensureAllAdvancedGroups() {
		if (!editedValue.advanced) editedValue.advanced = {};
		for (const type of animeTypeKeys) {
			if (!editedValue.advanced[type]) {
				editedValue.advanced[type] = { ...ANIME_TYPE_DEFAULT_SETTINGS.advanced[type] };
			}
			// Ensure percentage/count properties exist
			if (editedValue.advanced[type].percentageValue === undefined) {
				editedValue.advanced[type].percentageValue = editedValue.advanced[type].value || 25;
			}
			if (editedValue.advanced[type].percentageMin === undefined) {
				editedValue.advanced[type].percentageMin = editedValue.advanced[type].min || 10;
			}
			if (editedValue.advanced[type].percentageMax === undefined) {
				editedValue.advanced[type].percentageMax = editedValue.advanced[type].max || 40;
			}
			if (editedValue.advanced[type].countValue === undefined) {
				editedValue.advanced[type].countValue =
					Math.round((editedValue.advanced[type].percentageValue / 100) * getTotalSongsMax()) || 5;
			}
			if (editedValue.advanced[type].countMin === undefined) {
				editedValue.advanced[type].countMin =
					Math.round((editedValue.advanced[type].percentageMin / 100) * getTotalSongsMax()) || 2;
			}
			if (editedValue.advanced[type].countMax === undefined) {
				editedValue.advanced[type].countMax =
					Math.round((editedValue.advanced[type].percentageMax / 100) * getTotalSongsMax()) || 10;
			}
		}
	}

	$effect(() => {
		ensureBaseStructure();
	});

	// ensure all advanced groups exist by default
	$effect(() => {
		ensureAllAdvancedGroups();
	});

	// Force percentage mode when number of songs is a range
	$effect(() => {
		const totalSongs = getTotalSongs();
		const isRange = totalSongs && typeof totalSongs === 'object';
		if (isRange && editedValue.mode !== 'percentage') {
			editedValue.mode = 'percentage';
		}
	});

	// Auto-scaling when total songs change or force update is triggered
	let previousTotalSongs = getTotalSongsMax();
	$effect(() => {
		const currentTotal = getTotalSongsMax();
		const mode = editedValue.mode || 'count';
		const isPercentageMode = mode === 'percentage';

		// Check if this is a forced update from parent rescaling
		const isForceUpdate =
			editedValue?._forceUpdate && editedValue._forceUpdate !== previousTotalSongs;

		if (
			(previousTotalSongs !== currentTotal || isForceUpdate) &&
			previousTotalSongs > 0 &&
			currentTotal > 0 &&
			editedValue &&
			editedValue.viewMode === 'advanced' &&
			editedValue.advanced
		) {
			console.log('🔧 AnimeType auto-scaling triggered', {
				previousTotalSongs,
				currentTotal,
				isForceUpdate
			});

			const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced[type]?.enabled);

			if (enabledTypes.length > 0 && !isPercentageMode) {
				// Only auto-scale in count mode
				const scale = currentTotal / previousTotalSongs;

				for (const type of enabledTypes) {
					const entry = editedValue.advanced[type];
					if (entry.random) {
						// Scale random ranges
						const oldMin = Number(entry.countMin ?? entry.min ?? 0);
						const oldMax = Number(entry.countMax ?? entry.max ?? 0);
						entry.countMin = Math.max(0, Math.round(oldMin * scale));
						entry.countMax = Math.max(0, Math.round(oldMax * scale));
					} else {
						// Scale static values
						const oldValue = Number(entry.countValue ?? 0);
						entry.countValue = Math.max(0, Math.round(oldValue * scale));
					}
				}

				// Clean up the force update marker
				if (editedValue._forceUpdate) {
					delete editedValue._forceUpdate;
				}

				// Auto-save the changes when scaling occurs
				if (onAutoSave) {
					console.log('🔧 AnimeType calling onAutoSave with scaled values:', editedValue);
					onAutoSave(editedValue);
				}
			}
		}

		previousTotalSongs = currentTotal;
	});

	// Handle mode switching with initialization instead of conversion
	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = getTotalSongsMax();
			editedValue = initializeAnimeTypeMode(editedValue, editedValue.mode, totalSongs);
			previousMode = editedValue.mode;
		}
	});

	// Helper function to get the appropriate max value from getTotalSongs()
	function getTotalSongsMax() {
		const total = getTotalSongs();
		if (total && typeof total === 'object') {
			return Number(total.max ?? 200);
		}
		return Number(total) || 20;
	}

	// adjust values to satisfy totals similar to other components
	function quickFixAnimeTypes() {
		ensureBaseStructure();
		ensureAllAdvancedGroups();
		const totalSongsRaw = getTotalSongs();
		const mode = editedValue.mode || 'count';

		// Get the appropriate total value based on mode
		let totalSongs;
		if (mode === 'percentage') {
			totalSongs = 100; // Always 100% for percentage mode
		} else {
			if (totalSongsRaw && typeof totalSongsRaw === 'object') {
				totalSongs = totalSongsRaw.max ?? 200; // Use max for count mode
			} else {
				totalSongs = Number(totalSongsRaw) || 20;
			}
		}

		// If nothing enabled, enable a sensible default
		let anyEnabled = false;
		for (const type of animeTypeKeys) {
			if (editedValue.advanced[type].enabled) {
				anyEnabled = true;
				break;
			}
		}
		if (!anyEnabled) {
			editedValue.advanced.tv.enabled = true;
			editedValue.advanced.tv.random = false;
			if (mode === 'percentage') {
				editedValue.advanced.tv.percentageValue = 100;
			} else {
				editedValue.advanced.tv.countValue = totalSongs;
			}
		}

		// Apply quick fix logic using shared utility
		quickFixAnimeType(editedValue, mode, totalSongs);

		validateAnimeTypes();
	}

	// When switching to advanced, ensure advanced groups are present
	$effect(() => {
		if (viewMode === 'advanced') {
			ensureAllAdvancedGroups();
		}
	});

	// Keep editedValue.viewMode in sync so dialog reopens on last used tab
	$effect(() => {
		if (editedValue) {
			editedValue.viewMode = viewMode;
		}
	});

	// Force percentage mode when number of songs is a range
	$effect(() => {
		const totalSongs = getTotalSongs();
		const isRange = totalSongs && typeof totalSongs === 'object';
		if (isRange && editedValue.mode !== 'percentage') {
			editedValue.mode = 'percentage';
		}
	});

	// Get enabled anime types
	function getEnabledTypes() {
		return animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
	}

	// Prediction of actual allocation values (like Songs & Types)
	// Cache for getPredictedInfo results (regular variable, not $state, to avoid mutation errors)
	let predictedInfoCache = {
		hash: null,
		result: null
	};

	// Create a hash of the relevant inputs
	function createCacheHash() {
		if (!editedValue) return null;

		const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
		const mode = editedValue.mode || 'count';

		let targetTotal;
		if (mode === 'percentage') {
			targetTotal = 100;
		} else {
			const totalSongs = getTotalSongs();
			if (totalSongs && typeof totalSongs === 'object') {
				targetTotal = Number(totalSongs.max ?? 200);
			} else {
				targetTotal = Number(totalSongs) || 20;
			}
		}

		// Create a hash based on relevant values
		const hashData = {
			mode,
			targetTotal,
			types: enabledTypes.sort().join(','),
			animeTypes: enabledTypes.map((t) => {
				const entry = editedValue.advanced[t];
				return {
					enabled: entry.enabled,
					random: entry.random,
					percentageValue: entry.percentageValue,
					countValue: entry.countValue,
					percentageMin: entry.percentageMin,
					percentageMax: entry.percentageMax,
					countMin: entry.countMin,
					countMax: entry.countMax
				};
			}),
			isValid,
			validationMessage
		};

		return JSON.stringify(hashData);
	}

	function getPredictedInfo() {
		const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
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

		let targetTotal;
		if (isPercentageMode) {
			targetTotal = 100;
		} else {
			const totalSongs = getTotalSongs();
			// Handle range case - use max value for calculations
			if (totalSongs && typeof totalSongs === 'object') {
				targetTotal = Number(totalSongs.max ?? 200);
			} else {
				targetTotal = Number(totalSongs) || 20;
			}
		}

		// Build entries for anime types
		/** @type {import('../../editor/utils/mathUtils.js').AllocationEntry[]} */
		const typeEntries = enabledTypes.map((t) => {
			const entry = editedValue.advanced[t];
			if (entry.random) {
				const min = isPercentageMode
					? Number(entry.percentageMin ?? entry.min ?? 0)
					: Number(entry.countMin ?? entry.min ?? 0);
				const max = isPercentageMode
					? Number(entry.percentageMax ?? entry.max ?? 0)
					: Number(entry.countMax ?? entry.max ?? 0);
				return { label: t, kind: /** @type {'range'} */ ('range'), min, max };
			}
			const value = isPercentageMode
				? Number(entry.percentageValue || 0)
				: Number(entry.countValue || 0);
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

	// Validation: ensure inputs are valid and totals align with total songs in both static and random cases
	function validateAnimeTypes() {
		ensureBaseStructure();
		if (viewMode === 'advanced') ensureAllAdvancedGroups();

		let hasEnabled = false;
		let firstError = '';
		let warning = '';

		for (const type of animeTypeKeys) {
			const entry = editedValue.advanced?.[type];
			if (!entry) continue;
			if (entry.enabled) hasEnabled = true;
			if (entry.random) {
				const mode = editedValue.mode || 'count';
				const isPercentageMode = mode === 'percentage';
				const min = isPercentageMode
					? Number(entry.percentageMin ?? entry.min ?? 0)
					: Number(entry.countMin ?? entry.min ?? 0);
				const max = isPercentageMode
					? Number(entry.percentageMax ?? entry.max ?? 0)
					: Number(entry.countMax ?? entry.max ?? 0);
				if (min < 0 || max < 0 || max < min) {
					firstError ||= `${animeTypeLabels[type]}: Invalid range`;
				}
			} else {
				const mode = editedValue.mode || 'count';
				const isPercentageMode = mode === 'percentage';
				const v = isPercentageMode
					? Number(entry.percentageValue ?? 0)
					: Number(entry.countValue ?? 0);
				if (v < 0) firstError ||= `${animeTypeLabels[type]}: Value must be >= 0`;
			}
		}
		if (!hasEnabled) firstError ||= 'Enable at least one anime type.';

		// Advanced totals validation: across all enabled categories, totals should align with total songs
		if (!firstError && viewMode === 'advanced') {
			const totalSongsRaw = getTotalSongs();
			const mode = editedValue.mode || 'count';
			const isPercentageMode = mode === 'percentage';

			// Get the appropriate total value based on mode and whether totalSongs is a range
			let totalSongs, totalSongsDisplay;
			if (isPercentageMode) {
				totalSongs = 100; // Always 100% for percentage mode
				totalSongsDisplay = '100%';
			} else {
				if (totalSongsRaw && typeof totalSongsRaw === 'object') {
					totalSongs = totalSongsRaw.max ?? 200; // Use max for validation in count mode
					totalSongsDisplay = `${totalSongsRaw.min}-${totalSongsRaw.max}`;
				} else {
					totalSongs = Number(totalSongsRaw) || 20;
					totalSongsDisplay = `${totalSongs}`;
				}
			}

			let staticTotal = 0;
			let randomMinTotal = 0;
			let randomMaxTotal = 0;
			let hasRandom = false;
			let hasStatic = false;
			for (const type of animeTypeKeys) {
				const entry = editedValue.advanced?.[type];
				if (!entry?.enabled) continue;
				if (entry.random) {
					hasRandom = true;
					if (isPercentageMode) {
						randomMinTotal += Number(entry.percentageMin ?? entry.min ?? 0);
						randomMaxTotal += Number(entry.percentageMax ?? entry.max ?? 0);
					} else {
						randomMinTotal += Number(entry.countMin ?? entry.min ?? 0);
						randomMaxTotal += Number(entry.countMax ?? entry.max ?? 0);
					}
				} else {
					hasStatic = true;
					const value = isPercentageMode
						? Number(entry.percentageValue ?? 0)
						: Number(entry.countValue ?? 0);
					staticTotal += value;
				}
			}

			const unit = isPercentageMode ? '%' : ' songs';

			if (!hasRandom) {
				if (isPercentageMode) {
					if (Math.abs(staticTotal - 100) > 0.01) {
						firstError ||= `Anime type totals must equal 100%. Current: ${staticTotal.toFixed(1)}%`;
					}
				} else {
					if (staticTotal !== totalSongs) {
						firstError ||= `Anime type totals must equal ${totalSongsDisplay}${unit}. Current: ${staticTotal}${unit}`;
					}
				}
			} else {
				// Allow ranges that sum to more than 100% (like Songs & Types and Song Difficulty)
				if (isPercentageMode) {
					if (staticTotal + randomMaxTotal < 100) {
						firstError ||= `Static (${staticTotal.toFixed(1)}%) + random maximums (${randomMaxTotal.toFixed(1)}%) must be at least 100%.`;
					}
				} else {
					if (staticTotal + randomMaxTotal < totalSongs) {
						firstError ||= `Static (${staticTotal}) + random maximums (${randomMaxTotal}) must be at least total songs (${totalSongsDisplay}).`;
					}
				}

				// Individual random max cannot exceed total
				for (const type of animeTypeKeys) {
					const entry = editedValue.advanced?.[type];
					if (entry?.enabled && entry.random) {
						const max = isPercentageMode
							? Number(entry.percentageMax ?? entry.max ?? 0)
							: Number(entry.countMax ?? entry.max ?? 0);
						if (isPercentageMode) {
							if (max > 100) {
								firstError ||= `${animeTypeLabels[type]}: Max (${max}%) exceeds 100%.`;
							}
						} else {
							if (max > totalSongs) {
								firstError ||= `${animeTypeLabels[type]}: Max (${max}) exceeds total songs (${totalSongsDisplay}).`;
							}
						}
					}
				}
				if (hasStatic && hasRandom && !firstError) {
					warning ||= `Warning: Mixing random ranges with static values limits randomization.`;
				}
			}
		}

		if (firstError) {
			isValid = false;
			validationMessage = firstError;
		} else {
			isValid = true;
			validationMessage = warning || '';
		}
	}

	// Re-run validation on changes
	$effect(() => {
		// shallow watch by stringifying; acceptable for small object
		const _watch = JSON.stringify(editedValue);
		const _mode = viewMode;
		validateAnimeTypes();
	});
</script>

<!-- Mode toggles -->
<div class="mb-3 flex items-center justify-end gap-4">
	<!-- Value Mode Toggle -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-gray-700">Mode:</span>
		<div class="inline-flex overflow-hidden rounded border">
			<Button
				variant="ghost"
				size="sm"
				class="px-3 py-1 text-sm {editedValue.mode === 'percentage'
					? 'bg-blue-100 text-blue-700'
					: ''}"
				disabled={typeof getTotalSongs() === 'object' ||
					readOnly ||
					editedValue.percentageModeLocked}
				onclick={() => (editedValue.mode = 'percentage')}>%</Button
			>
			<Button
				variant="ghost"
				size="sm"
				class="px-3 py-1 text-sm {editedValue.mode === 'count'
					? 'bg-blue-100 text-blue-700'
					: typeof getTotalSongs() === 'object'
						? 'cursor-not-allowed bg-gray-100 text-gray-400'
						: ''}"
				disabled={typeof getTotalSongs() === 'object' ||
					readOnly ||
					editedValue.percentageModeLocked}
				onclick={() => (editedValue.mode = 'count')}>Count</Button
			>
		</div>
		{#if typeof getTotalSongs() === 'object'}
			<span class="text-xs text-orange-600">% mode required for song count ranges</span>
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
					<div class="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800">
						Percentage mode is locked because you have multiple<br />
						"Number of Songs" nodes or random range enabled;<br />
						remove extra nodes or disable random range to unlock.
					</div>
				</Popover.Content>
			</Popover.Root>
		{/if}
	</div>

	<!-- View Mode Toggle -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-gray-700">View:</span>
		<div class="inline-flex overflow-hidden rounded border">
			<Button
				variant="ghost"
				size="sm"
				class="px-3 py-1 text-sm {viewMode === 'simple' ? 'bg-gray-100' : ''}"
				disabled={readOnly}
				onclick={() => (viewMode = 'simple')}>Simple</Button
			>
			<Button
				variant="ghost"
				size="sm"
				class="px-3 py-1 text-sm {viewMode === 'advanced' ? 'bg-gray-100' : ''}"
				disabled={readOnly}
				onclick={() => (viewMode = 'advanced')}>Advanced</Button
			>
		</div>
	</div>
</div>

{#if viewMode === 'simple'}
	<div class="flex w-full flex-col items-center justify-center gap-4">
		<div class="inline-block min-w-[300px] rounded-lg border border-gray-200 bg-white shadow">
			<div
				class="grid grid-cols-2 items-center border-b bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700"
			>
				<div>Anime Type</div>
				<div class="text-center">Enabled</div>
			</div>
			{#each animeTypeKeys as type}
				<div class="grid grid-cols-2 items-center border-b px-4 py-3 text-sm last:border-b-0">
					<div class="font-medium text-gray-800">{animeTypeLabels[type]}</div>
					<div class="flex items-center justify-center">
						<Checkbox
							bind:checked={editedValue[type]}
							id={`anime-type-${type}`}
							disabled={readOnly}
							class=""
						/>
					</div>
				</div>
			{/each}
		</div>

		<!-- Additional Filters -->
		<div class="inline-block min-w-[300px] rounded-lg border border-gray-200 bg-white shadow">
			<div class="border-b bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
				Additional Filters
			</div>
			<div class="space-y-3 px-4 py-3">
				<div class="flex items-center space-x-2">
					<Checkbox
						checked={editedValue.rebroadcast}
						onCheckedChange={(checked) => {
							editedValue = { ...editedValue, rebroadcast: checked };
						}}
						id="anime-type-rebroadcast"
						disabled={readOnly}
						class=""
					/>
					<label
						for="anime-type-rebroadcast"
						class="cursor-pointer text-sm font-medium text-gray-800"
					>
						Include Rebroadcasts
					</label>
				</div>
				<div class="flex items-center space-x-2">
					<Checkbox
						checked={editedValue.dubbed}
						onCheckedChange={(checked) => {
							editedValue = { ...editedValue, dubbed: checked };
						}}
						id="anime-type-dubbed"
						disabled={readOnly}
						class=""
					/>
					<label for="anime-type-dubbed" class="cursor-pointer text-sm font-medium text-gray-800">
						Include Dubs
					</label>
				</div>
			</div>
		</div>
	</div>
{:else}
	<!-- Advanced view -->
	<div class="space-y-4">
		<!-- Actual Allocation Values -->
		{#if predictedInfo}
			{@const pred = predictedInfo}
			<div
				class="rounded-lg border p-4"
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
									onclick={quickFixAnimeTypes}
									disabled={readOnly}
									variant="destructive"
									size="sm"
									class=""
								>
									Quick Fix
								</Button>
							</div>
						{:else}
							<h4 class="mb-1 text-sm font-medium text-blue-900">Actual Allocation Values</h4>
							<div class="space-y-1 text-sm text-blue-800">
								<div class="grid grid-cols-2 gap-4 text-xs">
									<div>
										<span class="font-medium">Total Songs:</span>
										{pred.totalSongs}
									</div>
									<div>
										<span class="font-medium">Mode:</span>
										{pred.mode}
									</div>
								</div>
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

		{#each animeTypeKeys as type}
			<div class="rounded-lg border border-gray-200 bg-white shadow">
				<div class="flex items-center justify-between border-b px-4 py-2">
					<div class="text-sm font-semibold" style="color:{getNodeColor()}">
						{animeTypeLabels[type]}
					</div>
				</div>
				<div class="px-4 py-3">
					<div class="flex flex-wrap items-center gap-3">
						<div class="flex items-center gap-2">
							<Checkbox
								bind:checked={editedValue.advanced[type].enabled}
								id={`anime-type-${type}-enabled`}
								disabled={readOnly}
								class=""
							/>
							<span class="text-xs text-gray-600">Enable</span>
						</div>
						<div class="flex items-center gap-2">
							<Checkbox
								bind:checked={editedValue.advanced[type].random}
								id={`anime-type-${type}-random`}
								disabled={readOnly}
								class=""
							/>
							<span class="text-xs text-gray-600">Random range</span>
						</div>
						{#if editedValue.advanced[type].random}
							<div class="flex flex-col gap-2">
								<div class="px-2">
									<RangeSlider
										values={[
											editedValue.mode === 'percentage'
												? editedValue.advanced[type].percentageMin || 0
												: editedValue.advanced[type].countMin || 0,
											editedValue.mode === 'percentage'
												? editedValue.advanced[type].percentageMax || 100
												: editedValue.advanced[type].countMax || getTotalSongsMax()
										]}
										min={0}
										max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
										step={1}
										range
										pushy
										pips
										pipstep={editedValue.mode === 'percentage'
											? 25
											: Math.max(
													1,
													Math.floor(
														(editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()) / 4
													)
												)}
										all="label"
										disabled={readOnly}
										on:change={(e) => {
											const values = e.detail.values;
											if (editedValue.mode === 'percentage') {
												editedValue.advanced[type].percentageMin = values[0];
												editedValue.advanced[type].percentageMax = values[1];
											} else {
												editedValue.advanced[type].countMin = values[0];
												editedValue.advanced[type].countMax = values[1];
											}
											validateAnimeTypes();
										}}
										--slider={getNodeColor()}
										--handle={getNodeColor()}
										--range={getNodeColor()}
										--progress={getNodeColor()}
									/>
								</div>
								<div class="flex justify-center space-x-4 text-xs">
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.advanced[type].percentageMin
												: editedValue.advanced[type].countMin}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => {
												const val = Math.max(
													0,
													Math.min(
														editedValue.mode === 'percentage' ? 100 : getTotalSongsMax(),
														parseInt(e.target.value) || 0
													)
												);
												if (editedValue.mode === 'percentage') {
													editedValue.advanced[type].percentageMin = val;
												} else {
													editedValue.advanced[type].countMin = val;
												}
												validateAnimeTypes();
											}}
										/>
										<span class="text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
										>
									</div>
									<span class="text-gray-400">to</span>
									<div class="flex items-center space-x-1">
										<Input
											type="number"
											value={editedValue.mode === 'percentage'
												? editedValue.advanced[type].percentageMax
												: editedValue.advanced[type].countMax}
											min={0}
											max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
											disabled={readOnly}
											class="h-6 w-16 px-1 text-center text-xs"
											oninput={(e) => {
												const minVal =
													editedValue.mode === 'percentage'
														? editedValue.advanced[type].percentageMin
														: editedValue.advanced[type].countMin;
												const val = Math.max(
													minVal,
													Math.min(
														editedValue.mode === 'percentage' ? 100 : getTotalSongsMax(),
														parseInt(e.target.value) || 0
													)
												);
												if (editedValue.mode === 'percentage') {
													editedValue.advanced[type].percentageMax = val;
												} else {
													editedValue.advanced[type].countMax = val;
												}
												validateAnimeTypes();
											}}
										/>
										<span class="text-gray-600"
											>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
										>
									</div>
								</div>
							</div>
						{:else}
							<div class="flex items-center gap-1 text-xs">
								<span class="text-gray-600"
									>{editedValue.mode === 'percentage' ? 'Value' : 'Count'}</span
								>
								<input
									type="number"
									class="h-7 w-20 rounded border px-2"
									min="0"
									max={editedValue.mode === 'percentage' ? 100 : undefined}
									value={editedValue.mode === 'percentage'
										? editedValue.advanced[type].percentageValue
										: editedValue.advanced[type].countValue}
									oninput={(e) => {
										const val = Math.max(
											0,
											Math.min(
												editedValue.mode === 'percentage' ? 100 : Infinity,
												parseInt(e.currentTarget.value) || 0
											)
										);
										if (editedValue.mode === 'percentage') {
											editedValue.advanced[type].percentageValue = val;
										} else {
											editedValue.advanced[type].countValue = val;
										}
										validateAnimeTypes();
									}}
								/>
								<span class="text-gray-600"
									>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
								>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
