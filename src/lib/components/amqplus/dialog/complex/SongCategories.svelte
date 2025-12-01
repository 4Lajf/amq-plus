<script>
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { SONG_CATEGORIES_DEFAULT_SETTINGS } from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initializeSongCategoriesMode } from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';
	import { quickFixSongCategories } from '$lib/components/amqplus/editor/utils/quickFixUtils.js';

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

	const categoryKeys = ['standard', 'instrumental', 'chanting', 'character'];
	const rowKeys = ['openings', 'endings', 'inserts'];
	const categoryLabels = {
		standard: 'Standard',
		instrumental: 'Instrumental',
		chanting: 'Chanting',
		character: 'Character'
	};
	const rowLabels = { openings: 'Openings', endings: 'Endings', inserts: 'Inserts' };

	// view mode: 'simple' or 'advanced' (persisted on editedValue)
	let viewMode = $state(editedValue?.viewMode ?? SONG_CATEGORIES_DEFAULT_SETTINGS.viewMode);

	// mode: 'percentage' or 'count' (persisted on editedValue)
	if (!editedValue.mode) {
		editedValue.mode = SONG_CATEGORIES_DEFAULT_SETTINGS.mode;
	}

	// Synchronous initialization to prevent undefined access during first render
	ensureBaseMatrix();
	function ensureAllAdvancedGroups() {
		['openings', 'endings', 'inserts'].forEach(ensureAdvancedGroup);
	}
	ensureAllAdvancedGroups();

	// Helper function to get the appropriate max value from getTotalSongs()
	function getTotalSongsMax() {
		const total = getTotalSongs();
		if (total && typeof total === 'object') {
			return Number(total.max ?? 200);
		}
		return Number(total) || 20;
	}

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
			console.log('🔧 SongCategories auto-scaling triggered', {
				previousTotalSongs,
				currentTotal,
				isForceUpdate
			});

			if (!isPercentageMode) {
				// Only auto-scale in count mode
				const scale = currentTotal / previousTotalSongs;

				for (const row of rowKeys) {
					if (!editedValue.advanced[row]) continue;
					for (const col of categoryKeys) {
						const entry = editedValue.advanced[row][col];
						if (!entry?.enabled) continue;

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
				}

				// Clean up the force update marker
				if (editedValue._forceUpdate) {
					delete editedValue._forceUpdate;
				}

				// Auto-save the changes when scaling occurs
				if (onAutoSave) {
					console.log('🔧 SongCategories calling onAutoSave with scaled values:', editedValue);
					onAutoSave(editedValue);
				}
			}
		}

		previousTotalSongs = currentTotal;
	});

	// Initialize base matrix structure if missing
	function ensureBaseMatrix() {
		if (!editedValue || typeof editedValue !== 'object') {
			editedValue = {};
		}
		for (const row of rowKeys) {
			if (!editedValue[row] || typeof editedValue[row] !== 'object') {
				editedValue[row] = {};
			}
			const defaultRowSettings = SONG_CATEGORIES_DEFAULT_SETTINGS[row];
			for (const col of categoryKeys) {
				if (editedValue[row][col] === undefined) {
					editedValue[row][col] = defaultRowSettings?.[col] ?? true; // use default settings
				}
			}
		}
	}

	// Advanced data structure
	function ensureAdvancedGroup(groupKey) {
		if (!editedValue.advanced) editedValue.advanced = {};
		if (!editedValue.advanced[groupKey]) editedValue.advanced[groupKey] = {};
		for (const col of categoryKeys) {
			if (!editedValue.advanced[groupKey][col]) {
				editedValue.advanced[groupKey][col] = {
					...SONG_CATEGORIES_DEFAULT_SETTINGS.advanced[groupKey][col]
				};
			}
			// Ensure percentage/count properties exist
			if (editedValue.advanced[groupKey][col].percentageValue === undefined) {
				editedValue.advanced[groupKey][col].percentageValue =
					editedValue.advanced[groupKey][col].value || 10;
			}
			if (editedValue.advanced[groupKey][col].percentageMin === undefined) {
				editedValue.advanced[groupKey][col].percentageMin =
					editedValue.advanced[groupKey][col].min || 5;
			}
			if (editedValue.advanced[groupKey][col].percentageMax === undefined) {
				editedValue.advanced[groupKey][col].percentageMax =
					editedValue.advanced[groupKey][col].max || 20;
			}
			if (editedValue.advanced[groupKey][col].countValue === undefined) {
				editedValue.advanced[groupKey][col].countValue =
					Math.round(
						(editedValue.advanced[groupKey][col].percentageValue / 100) * getTotalSongsMax()
					) || 2;
			}
			if (editedValue.advanced[groupKey][col].countMin === undefined) {
				editedValue.advanced[groupKey][col].countMin =
					Math.round(
						(editedValue.advanced[groupKey][col].percentageMin / 100) * getTotalSongsMax()
					) || 1;
			}
			if (editedValue.advanced[groupKey][col].countMax === undefined) {
				editedValue.advanced[groupKey][col].countMax =
					Math.round(
						(editedValue.advanced[groupKey][col].percentageMax / 100) * getTotalSongsMax()
					) || 4;
			}
		}
	}

	$effect(() => {
		ensureBaseMatrix();
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

	// Handle mode switching with initialization instead of conversion
	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = getTotalSongsMax();
			editedValue = initializeSongCategoriesMode(editedValue, editedValue.mode, totalSongs);
			previousMode = editedValue.mode;
		}
	});

	// ensure all subgroups exist by default in advanced mode

	function removeAdvancedGroup(groupKey) {
		if (editedValue?.advanced?.[groupKey]) {
			delete editedValue.advanced[groupKey];
		}
	}

	// Quick fix: adjust values to satisfy totals similar to other components
	function quickFixCategories() {
		ensureBaseMatrix();
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
		const groups = ['openings', 'endings', 'inserts'];
		let anyEnabled = false;
		for (const g of groups) {
			for (const c of categoryKeys) {
				if (editedValue.advanced[g][c].enabled) {
					anyEnabled = true;
					break;
				}
			}
		}
		if (!anyEnabled) {
			editedValue.advanced.openings.standard.enabled = true;
			editedValue.advanced.openings.standard.random = false;
			if (mode === 'percentage') {
				editedValue.advanced.openings.standard.percentageValue = 100;
			} else {
				editedValue.advanced.openings.standard.countValue = totalSongs;
			}
		}

		// Apply quick fix logic using shared utility
		quickFixSongCategories(editedValue, mode, totalSongs);

		validateSongCategories();
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

	// Validation: ensure inputs are valid and totals align with total songs in both static and random cases
	function validateSongCategories() {
		ensureBaseMatrix();
		if (viewMode === 'advanced') ensureAllAdvancedGroups();

		let hasEnabled = false;
		let firstError = '';
		let warning = '';
		const groups = ['openings', 'endings', 'inserts'];
		for (const g of groups) {
			const group = editedValue.advanced?.[g];
			if (!group) continue;
			for (const c of categoryKeys) {
				const entry = group[c];
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
						firstError ||= `${g} / ${categoryLabels[c]}: Invalid range`;
					}
				} else {
					const mode = editedValue.mode || 'count';
					const isPercentageMode = mode === 'percentage';
					const v = isPercentageMode
						? Number(entry.percentageValue ?? 0)
						: Number(entry.countValue ?? 0);
					if (v < 0) firstError ||= `${g} / ${categoryLabels[c]}: Value must be >= 0`;
				}
			}
		}
		if (!hasEnabled) firstError ||= 'Enable at least one category.';

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
			for (const g of groups) {
				const group = editedValue.advanced?.[g];
				if (!group) continue;
				for (const c of categoryKeys) {
					const entry = group[c];
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
			}

			const unit = isPercentageMode ? '%' : ' songs';

			if (!hasRandom) {
				if (isPercentageMode) {
					if (Math.abs(staticTotal - 100) > 0.01) {
						firstError ||= `Category totals must equal 100%. Current: ${staticTotal.toFixed(1)}%`;
					}
				} else {
					if (staticTotal !== totalSongs) {
						firstError ||= `Category totals must equal ${totalSongsDisplay}${unit}. Current: ${staticTotal}${unit}`;
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
				for (const g of groups) {
					const group = editedValue.advanced?.[g];
					if (!group) continue;
					for (const c of categoryKeys) {
						const entry = group[c];
						if (entry?.enabled && entry.random) {
							const max = Number(entry.max ?? 0);
							if (isPercentageMode) {
								if (max > 100) {
									firstError ||= `${rowLabels[g]} / ${categoryLabels[c]}: Max (${max}%) exceeds 100%.`;
								}
							} else {
								if (max > totalSongs) {
									firstError ||= `${rowLabels[g]} / ${categoryLabels[c]}: Max (${max}) exceeds total songs (${totalSongsDisplay}).`;
								}
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

	// Prediction of actual allocation values (like Songs & Types)
	// Cache for getPredictedInfo results (regular variable, not $state, to avoid mutation errors)
	let predictedInfoCache = {
		hash: null,
		result: null
	};

	// Create a hash of the relevant inputs
	function createCacheHash() {
		if (!editedValue) return null;

		const groups = ['openings', 'endings', 'inserts'];
		const enabledTypes = [];
		groups.forEach((group) => {
			categoryKeys.forEach((col) => {
				if (editedValue.advanced?.[group]?.[col]?.enabled) {
					enabledTypes.push(`${group}-${col}`);
				}
			});
		});

		const mode = editedValue.mode || 'count';
		const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();

		// Create a hash based on relevant values
		const hashData = {
			mode,
			targetTotal,
			types: enabledTypes.sort().join(','),
			categories: groups.map((group) => {
				return categoryKeys
					.map((col) => {
						const entry = editedValue.advanced?.[group]?.[col];
						if (!entry) return null;
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
					})
					.filter(Boolean);
			}),
			isValid,
			validationMessage
		};

		return JSON.stringify(hashData);
	}

	function getPredictedInfo() {
		const groups = ['openings', 'endings', 'inserts'];
		const enabledTypes = [];
		groups.forEach((group) => {
			categoryKeys.forEach((col) => {
				if (editedValue.advanced?.[group]?.[col]?.enabled) {
					enabledTypes.push(`${group}-${col}`);
				}
			});
		});

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

		// Build entries for categories
		const typeEntries = [];
		groups.forEach((group) => {
			categoryKeys.forEach((col) => {
				const entry = editedValue.advanced[group][col];
				if (!entry.enabled) return;

				const label = `${group}-${col}`;
				if (entry.random) {
					const min = isPercentageMode
						? Number(entry.percentageMin ?? entry.min ?? 0)
						: Number(entry.countMin ?? entry.min ?? 0);
					const max = isPercentageMode
						? Number(entry.percentageMax ?? entry.max ?? 0)
						: Number(entry.countMax ?? entry.max ?? 0);
					typeEntries.push({ label, kind: 'range', min, max });
				} else {
					const value = isPercentageMode
						? Number(entry.percentageValue || 0)
						: Number(entry.countValue || 0);
					typeEntries.push({ label, kind: 'static', value });
				}
			});
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

	// Re-run validation on changes
	$effect(() => {
		// shallow watch by stringifying; acceptable for small object
		const _watch = JSON.stringify(editedValue);
		const _mode = viewMode;
		validateSongCategories();
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
		{#if editedValue.percentageModeLocked}
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
	<div class="flex w-full items-start justify-center">
		<div class="inline-block min-w-[520px] rounded-lg border border-gray-200 bg-white shadow">
			<div
				class="grid grid-cols-5 items-center border-b bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700"
			>
				<div></div>
				{#each categoryKeys as col}
					<div class="text-center">{categoryLabels[col]}</div>
				{/each}
			</div>
			{#each rowKeys as row}
				<div class="grid grid-cols-5 items-center border-b px-4 py-3 text-sm last:border-b-0">
					<div class="font-medium text-gray-800">{rowLabels[row]}</div>
					{#each categoryKeys as col}
						<div class="flex items-center justify-center">
							<Checkbox
								bind:checked={editedValue[row][col]}
								id={`${row}-${col}`}
								disabled={readOnly}
								class=""
							/>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{:else}
	<!-- Advanced view: show all advanced tables only -->
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
					<div class="mt-0.5 flex-shrink-0">
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
									onclick={quickFixCategories}
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
								<div class="mt-2 grid grid-cols-4 gap-2">
									{#each pred.types as t}
										{@const info = pred.types.find((x) => x.label === t.label)}
										<div
											class="rounded border border-blue-200 bg-white px-2 py-1 text-center text-xs"
										>
											<span class="font-medium capitalize">{t.label.split('-')[1]}</span><br />
											<span class="text-xs text-gray-500">{rowLabels[t.label.split('-')[0]]}</span
											><br />
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

		<div class="space-y-4">
			{#each rowKeys as groupKey}
				<div class="rounded-lg border border-gray-200 bg-white shadow">
					<div class="flex items-center justify-between border-b px-4 py-2">
						<div class="text-sm font-semibold" style="color:{getNodeColor()}">
							{rowLabels[groupKey]}
						</div>
					</div>
					{#each categoryKeys as col}
						<div class="grid grid-cols-5 items-center gap-2 px-4 py-2">
							<div class="text-sm text-gray-700">{categoryLabels[col]}</div>
							<div class="col-span-4">
								<div class="flex flex-wrap items-center gap-3">
									<div class="flex items-center gap-2">
										<Checkbox
											bind:checked={editedValue.advanced[groupKey][col].enabled}
											id={`${groupKey}-${col}-enabled`}
											disabled={readOnly}
											class=""
										/>
										<span class="text-xs text-gray-600">Enable</span>
									</div>
									<div class="flex items-center gap-2">
										<Checkbox
											bind:checked={editedValue.advanced[groupKey][col].random}
											id={`${groupKey}-${col}-random`}
											disabled={readOnly}
											class=""
										/>
										<span class="text-xs text-gray-600">Random range</span>
									</div>
									{#if editedValue.advanced[groupKey][col].random}
										<div class="flex flex-col gap-2">
											<div class="px-2">
												<RangeSlider
													values={[
														editedValue.mode === 'percentage'
															? editedValue.advanced[groupKey][col].percentageMin || 0
															: editedValue.advanced[groupKey][col].countMin || 0,
														editedValue.mode === 'percentage'
															? editedValue.advanced[groupKey][col].percentageMax || 100
															: editedValue.advanced[groupKey][col].countMax || getTotalSongsMax()
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
															editedValue.advanced[groupKey][col].percentageMin = values[0];
															editedValue.advanced[groupKey][col].percentageMax = values[1];
														} else {
															editedValue.advanced[groupKey][col].countMin = values[0];
															editedValue.advanced[groupKey][col].countMax = values[1];
														}
														validateSongCategories();
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
															? editedValue.advanced[groupKey][col].percentageMin
															: editedValue.advanced[groupKey][col].countMin}
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
																editedValue.advanced[groupKey][col].percentageMin = val;
																editedValue.advanced[groupKey][col].min = val;
															} else {
																editedValue.advanced[groupKey][col].countMin = val;
																editedValue.advanced[groupKey][col].min = val;
															}
															validateSongCategories();
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
															? editedValue.advanced[groupKey][col].percentageMax
															: editedValue.advanced[groupKey][col].countMax}
														min={0}
														max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
														disabled={readOnly}
														class="h-6 w-16 px-1 text-center text-xs"
														oninput={(e) => {
															const minVal =
																editedValue.mode === 'percentage'
																	? editedValue.advanced[groupKey][col].percentageMin
																	: editedValue.advanced[groupKey][col].countMin;
															const val = Math.max(
																minVal,
																Math.min(
																	editedValue.mode === 'percentage' ? 100 : getTotalSongsMax(),
																	parseInt(e.target.value) || 0
																)
															);
															if (editedValue.mode === 'percentage') {
																editedValue.advanced[groupKey][col].percentageMax = val;
																editedValue.advanced[groupKey][col].max = val;
															} else {
																editedValue.advanced[groupKey][col].countMax = val;
																editedValue.advanced[groupKey][col].max = val;
															}
															validateSongCategories();
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
											<span class="text-xs text-gray-600"
												>{editedValue.mode === 'percentage' ? 'Value' : 'Count'}</span
											>
											<input
												type="number"
												class="h-7 w-20 rounded border px-2"
												min="0"
												max={editedValue.mode === 'percentage' ? 100 : undefined}
												value={editedValue.mode === 'percentage'
													? editedValue.advanced[groupKey][col].percentageValue
													: editedValue.advanced[groupKey][col].countValue}
												oninput={(e) => {
													const val = Math.max(
														0,
														Math.min(
															editedValue.mode === 'percentage' ? 100 : Infinity,
															parseInt(e.currentTarget.value) || 0
														)
													);
													if (editedValue.mode === 'percentage') {
														editedValue.advanced[groupKey][col].percentageValue = val;
													} else {
														editedValue.advanced[groupKey][col].countValue = val;
													}
													validateSongCategories();
												}}
											/>
											<span class="text-xs text-gray-600"
												>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
											>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- End -->
