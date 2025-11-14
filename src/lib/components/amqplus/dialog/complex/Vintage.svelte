<script>
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { getCurrentSeason, getCurrentYear } from '../../editor/utils/dateUtils';
	import { VINTAGE_DEFAULT_SETTINGS } from '../../editor/utils/defaultNodeSettings.js';

	/**
	 * @typedef {Object} VintageRange
	 * @property {Object} from - Start date
	 * @property {string} from.season - Season name
	 * @property {number} from.year - Year
	 * @property {Object} to - End date
	 * @property {string} to.season - Season name
	 * @property {number} to.year - Year
	 * @property {number} [percentage] - Percentage allocation
	 * @property {number} [count] - Count allocation
	 * @property {boolean} [useAdvanced] - Whether to use advanced settings
	 */

	/**
	 * @typedef {Object} VintageValue
	 * @property {VintageRange[]} ranges - Array of vintage ranges
	 * @property {'count'|'percentage'} mode - Distribution mode
	 * @property {boolean} [percentageModeLocked] - Whether percentage mode is locked
	 */

	/**
	 * @typedef {Object} Config
	 * @property {string} definitionId - Filter definition ID
	 * @property {string} instanceId - Filter instance ID
	 * @property {string} label - Display label
	 */

	/**
	 * Component props
	 * @type {{
	 *   editedValue: VintageValue,
	 *   config: Config,
	 *   getNodeColor: () => string,
	 *   readOnly: boolean,
	 *   getTotalSongs: () => number|{min: number, max: number},
	 *   isValid: boolean,
	 *   validationMessage: string
	 * }}
	 */
	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		readOnly = false,
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];

	function ensureRanges() {
		if (!editedValue || typeof editedValue !== 'object') {
			editedValue = { ranges: [], mode: 'count' };
		}

		// Initialize ranges using defaults if not present
		if (!Array.isArray(editedValue.ranges) || editedValue.ranges.length === 0) {
			editedValue.ranges = [...VINTAGE_DEFAULT_SETTINGS.ranges]; // use default settings
		}

		// Ensure each range has proper structure
		for (const r of editedValue.ranges) {
			const defaultRange = VINTAGE_DEFAULT_SETTINGS.ranges[0]; // use first default range as template

			if (!r.from) r.from = { ...defaultRange.from };
			if (!r.to) r.to = { ...defaultRange.to };

			if (!seasons.includes(r.from.season)) r.from.season = defaultRange.from.season;
			if (!seasons.includes(r.to.season)) r.to.season = defaultRange.to.season;
			if (!Number.isFinite(Number(r.from.year))) r.from.year = defaultRange.from.year;
			if (!Number.isFinite(Number(r.to.year))) r.to.year = defaultRange.to.year;

			if (r.percentage === undefined && r.count === undefined) {
				r.percentage = defaultRange.percentage ?? 0;
			}

			// Ensure useAdvanced property exists
			if (r.useAdvanced === undefined) {
				r.useAdvanced = false;
			}
		}

		if (!editedValue.mode) editedValue.mode = VINTAGE_DEFAULT_SETTINGS.mode ?? 'count';
	}

	// Initialize ranges on mount
	ensureRanges();

	// Ensure ranges are properly structured when editedValue changes
	$effect(() => {
		if (editedValue) {
			ensureRanges();
		}
	});

	function totalSongsMax() {
		const t = getTotalSongs();
		return typeof t === 'object' ? Number(t.max ?? 200) : Number(t || 20);
	}

	function getMode() {
		const t = getTotalSongs();
		if (t && typeof t === 'object') return 'percentage';
		return editedValue.mode === 'percentage' ? 'percentage' : 'count';
	}

	function setMode(m) {
		if (typeof getTotalSongs() === 'object' && m === 'count') return; // disallow count for range
		if (editedValue.percentageModeLocked && m === 'count') return; // disallow count when locked
		editedValue.mode = m;
	}

	// Quick fix function to auto-correct validation issues
	function quickFixVintage() {
		ensureRanges();
		const mode = getMode();
		const isPercentageMode = mode === 'percentage';
		const maxTotal = isPercentageMode ? 100 : totalSongsMax();

		// If no ranges, create a default one
		if (editedValue.ranges.length === 0) {
			editedValue.ranges.push({
				from: { season: 'Winter', year: 1944 },
				to: { season: getCurrentSeason(), year: getCurrentYear() },
				percentage: isPercentageMode ? 100 : undefined,
				count: !isPercentageMode ? maxTotal : undefined,
				useAdvanced: false
			});
			return;
		}

		// Calculate current total from advanced ranges only
		let currentTotal = 0;
		let hasAdvancedRanges = false;
		for (const r of editedValue.ranges) {
			if (r.useAdvanced) {
				hasAdvancedRanges = true;
				if (isPercentageMode) {
					currentTotal += Number(r.percentage ?? 0);
				} else {
					currentTotal += Number(r.count ?? 0);
				}
			}
		}

		// Smart adjustment: only fix if we exceed the maximum (not if we're under)
		if (currentTotal > maxTotal && hasAdvancedRanges) {
			const excessAmount = currentTotal - maxTotal;

			// Find advanced ranges and their current values
			const rangeData = editedValue.ranges
				.filter((r) => r.useAdvanced)
				.map((r, idx) => ({
					index: idx,
					currentValue: isPercentageMode ? (r.percentage ?? 0) : (r.count ?? 0),
					range: r
				}));

			// Find the range with the highest value to reduce
			let bestRange = rangeData[0];
			let maxValue = bestRange.currentValue;

			for (const rd of rangeData) {
				if (rd.currentValue > maxValue) {
					maxValue = rd.currentValue;
					bestRange = rd;
				}
			}

			// Reduce by the excess amount, but not below 0
			const newValue = Math.max(0, bestRange.currentValue - excessAmount);
			if (isPercentageMode) {
				bestRange.range.percentage = newValue;
			} else {
				bestRange.range.count = newValue;
			}
		}

		// Fix any invalid date ranges
		editedValue.ranges.forEach((r) => {
			const fromYear = Number(r.from.year);
			const toYear = Number(r.to.year);
			const fromSeasonIndex = seasons.indexOf(r.from.season);
			const toSeasonIndex = seasons.indexOf(r.to.season);

			if (fromYear > toYear || (fromYear === toYear && fromSeasonIndex > toSeasonIndex)) {
				// Fix by setting 'to' to current season/year
				r.to.season = getCurrentSeason();
				r.to.year = getCurrentYear();
			}

			// Ensure useAdvanced property exists
			if (r.useAdvanced === undefined) {
				r.useAdvanced = false;
			}
		});

		validateVintage();
	}

	// Get prediction info for display (read-only, no mutations)
	function getPredictionInfo() {
		if (!isValid) {
			return {
				error: true,
				message: validationMessage || 'Invalid configuration',
				mode: getMode()
			};
		}

		const mode = getMode();
		const isPercentageMode = mode === 'percentage';
		const maxTotal = isPercentageMode ? 100 : totalSongsMax();
		const unit = isPercentageMode ? '%' : ' songs';

		let total = 0;
		for (const r of editedValue.ranges || []) {
			if (r.useAdvanced) {
				if (isPercentageMode) {
					total += Number(r.percentage ?? 0);
				} else {
					total += Number(r.count ?? 0);
				}
			}
		}

		// Calculate remaining for random selection
		const remaining = maxTotal - total;
		const hasRemaining = remaining > 0;

		// Check if there are any non-advanced (random) ranges defined
		const hasRandomRanges = (editedValue.ranges || []).some((r) => !r.useAdvanced);

		// Only show fallback random selection if there's remaining space AND no random ranges
		const useFallbackRandom = hasRemaining && !hasRandomRanges;

		return {
			mode,
			unit,
			maxTotal,
			currentTotal: total,
			remaining: hasRemaining ? remaining : 0,
			hasRemaining,
			useFallbackRandom,
			hasRandomRanges,
			ranges: (editedValue.ranges || []).map((r, idx) => ({
				id: idx,
				from: `${r.from?.season} ${r.from?.year}`,
				to: `${r.to?.season} ${r.to?.year}`,
				value: r.useAdvanced ? (isPercentageMode ? (r.percentage ?? 0) : (r.count ?? 0)) : 'Random',
				isAdvanced: r.useAdvanced
			}))
		};
	}

	// Memoize the predicted info result to avoid redundant calculations
	// This will only recalculate when its dependencies change
	const predictedInfo = $derived(getPredictionInfo());

	// Validation function
	function validateVintage() {
		ensureRanges();

		let firstError = '';
		const mode = getMode();
		const isPercentageMode = mode === 'percentage';

		// Get the appropriate total value based on mode
		let maxTotal, unit;
		if (isPercentageMode) {
			maxTotal = 100;
			unit = '%';
		} else {
			maxTotal = totalSongsMax();
			unit = ' songs';
		}

		// Calculate total from ranges with advanced mode enabled only
		let total = 0;
		let hasAdvancedRanges = false;
		for (const r of editedValue.ranges) {
			if (r.useAdvanced) {
				hasAdvancedRanges = true;
				if (isPercentageMode) {
					total += Number(r.percentage ?? 0);
				} else {
					total += Number(r.count ?? 0);
				}
			}
		}

		// Check for empty ranges
		if (editedValue.ranges.length === 0) {
			firstError = 'At least one vintage range must be defined.';
		}

		// Check for valid date ranges (from should be before or equal to to)
		for (const r of editedValue.ranges) {
			const fromYear = Number(r.from.year);
			const toYear = Number(r.to.year);
			const fromSeasonIndex = seasons.indexOf(r.from.season);
			const toSeasonIndex = seasons.indexOf(r.to.season);

			if (fromYear > toYear || (fromYear === toYear && fromSeasonIndex > toSeasonIndex)) {
				firstError = 'Start date must be before or equal to end date.';
				break;
			}

			// Ensure useAdvanced property exists
			if (r.useAdvanced === undefined) {
				r.useAdvanced = false;
			}
		}

		// Validation - advanced ranges can be less than max but not more
		if (!firstError && hasAdvancedRanges) {
			if (total > maxTotal) {
				if (isPercentageMode) {
					firstError = `Advanced vintage ranges exceed 100%. Current total: ${total}%. Maximum allowed: 100%.`;
				} else {
					firstError = `Advanced vintage ranges exceed maximum songs. Current total: ${total} songs. Maximum allowed: ${maxTotal} songs.`;
				}
			}
		}

		if (firstError) {
			isValid = false;
			validationMessage = firstError;
		} else {
			isValid = true;
			validationMessage = '';
		}
	}

	// Re-run validation on changes
	$effect(() => {
		// Watch for changes to ranges and mode
		const _watch = JSON.stringify(editedValue);
		validateVintage();
	});
</script>

<div class="space-y-8">
	<div class="text-center">
		<Label class="text-2xl font-bold text-gray-800">{config.label}</Label>
		<p class="mt-2 text-gray-600">Configure season/year ranges (e.g., Summer 2000 - Fall 2001)</p>
	</div>

	<!-- Configuration Status Panel -->
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
							<div class="mb-2 text-xs text-red-700">
								Fix the validation errors or use Quick Fix to auto-correct.
							</div>
							<Button
								type="button"
								onclick={quickFixVintage}
								disabled={readOnly}
								size="sm"
								variant="destructive"
								class=""
							>
								Quick Fix
							</Button>
						</div>
					{:else}
						<h4 class="mb-1 text-sm font-medium text-blue-900">Vintage Configuration</h4>
						<div class="space-y-1 text-sm text-blue-800">
							<div class="grid grid-cols-4 gap-3 text-xs">
								<div>
									<span class="font-medium">Mode:</span>
									<span class="flex items-center gap-1">
										{pred.mode}
										{#if editedValue.percentageModeLocked}
											<Popover.Root>
												<Popover.Trigger class="">
													{#snippet child({ props })}
														<button
															{...props}
															type="button"
															class="cursor-help text-xs text-orange-600 hover:text-orange-700"
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
									</span>
								</div>
								<div>
									<span class="font-medium">Advanced:</span>
									{pred.currentTotal}{pred.unit}
								</div>
								<div>
									<span class="font-medium">Random:</span>
									{#if pred.hasRandomRanges}
										<span class="font-semibold text-green-600">From ranges</span>
									{:else if pred.useFallbackRandom}
										<span class="font-semibold text-green-600">{pred.remaining}{pred.unit}</span>
									{:else}
										<span class="text-gray-500">0{pred.unit}</span>
									{/if}
								</div>
								<div>
									<span class="font-medium">Ranges:</span>
									{pred.ranges.length}
								</div>
							</div>
							{#if pred.useFallbackRandom}
								<div class="mt-1 rounded border border-green-200 bg-green-50 p-2 text-xs">
									<span class="text-green-700">
										<strong>{pred.remaining}{pred.unit}</strong> will be randomly selected from the full
										range (Winter 1944 → Current)
									</span>
								</div>
							{:else if pred.hasRandomRanges && pred.hasRemaining}
								<div class="mt-1 rounded border border-blue-200 bg-blue-50 p-2 text-xs">
									<span class="text-blue-700">
										Remaining <strong>{pred.remaining}{pred.unit}</strong> will be distributed among
										random ranges
									</span>
								</div>
							{/if}
							{#if pred.ranges.length > 0}
								<div class="mt-2 grid grid-cols-1 gap-1">
									{#each pred.ranges as range}
										<div
											class="rounded border border-blue-200 bg-white px-2 py-1 text-center text-xs"
										>
											<span class="font-medium">{range.from} → {range.to}</span>:
											{#if range.isAdvanced}
												<span class="font-semibold text-blue-600">{range.value}{pred.unit}</span>
											{:else}
												<span class="font-semibold text-green-600">Random</span>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		{#each editedValue.ranges as r, idx}
			<div class="rounded border p-3">
				<div class="grid grid-cols-2 gap-3 text-sm">
					<div>
						<div class="mb-1 text-gray-700">From</div>
						<div class="flex items-center gap-2">
							<select
								class="rounded border px-2 py-1"
								bind:value={r.from.season}
								disabled={readOnly}
							>
								{#each seasons as s}<option value={s}>{s}</option>{/each}
							</select>
							<Input
								class="h-8 w-24"
								type="number"
								min="1944"
								max={getCurrentYear()}
								bind:value={r.from.year}
								disabled={readOnly}
							/>
						</div>
					</div>
					<div>
						<div class="mb-1 text-gray-700">To</div>
						<div class="flex items-center gap-2">
							<select class="rounded border px-2 py-1" bind:value={r.to.season} disabled={readOnly}>
								{#each seasons as s}<option value={s}>{s}</option>{/each}
							</select>
							<Input
								class="h-8 w-24"
								type="number"
								min="1944"
								max={getCurrentYear()}
								bind:value={r.to.year}
								disabled={readOnly}
							/>
						</div>
					</div>
				</div>

				<!-- Advanced Settings Checkbox -->
				<div class="mt-3 flex items-center gap-2">
					<input
						type="checkbox"
						id={`advanced-${idx}`}
						bind:checked={r.useAdvanced}
						disabled={readOnly}
						class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<label for={`advanced-${idx}`} class="cursor-pointer text-xs text-gray-700">
						Advanced: Specify exact songs from this range
					</label>
				</div>

				<!-- Per-range songs (only when advanced is enabled) -->
				{#if r.useAdvanced}
					<div class="mt-2">
						<div class="mb-1 flex items-center justify-between">
							<div class="text-xs text-gray-700">Songs from this range</div>
							<div class="inline-flex overflow-hidden rounded border">
								<Button
									variant="ghost"
									size="sm"
									class="px-2 py-0.5 text-[11px] {getMode() === 'percentage'
										? 'bg-blue-100 text-blue-700'
										: ''}"
									disabled={readOnly || editedValue.percentageModeLocked}
									onclick={() => setMode('percentage')}>%</Button
								>
								<Button
									variant="ghost"
									size="sm"
									class="px-2 py-0.5 text-[11px] {getMode() === 'count'
										? 'bg-blue-100 text-blue-700'
										: ''} {typeof getTotalSongs() === 'object' || editedValue.percentageModeLocked
										? 'cursor-not-allowed text-gray-400'
										: ''}"
									disabled={readOnly ||
										typeof getTotalSongs() === 'object' ||
										editedValue.percentageModeLocked}
									onclick={() => setMode('count')}>Count</Button
								>
							</div>
						</div>
						{#if getMode() === 'percentage'}
							<div class="px-2">
								<RangeSlider
									values={[Number(r.percentage ?? 0)]}
									min={0}
									max={100}
									step={1}
									pips
									disabled={readOnly}
									on:change={(e) =>
										(r.percentage = Math.max(0, Math.min(100, Number(e.detail.values[0] || 0))))}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								<div class="mt-1 flex items-center justify-center text-xs">
									<Input
										class="h-6 w-16 text-center"
										type="number"
										min="0"
										max="100"
										disabled={readOnly}
										value={Number(r.percentage ?? 0)}
										oninput={(e) =>
											(r.percentage = Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
									/>
									<span class="ml-1 text-gray-600">%</span>
								</div>
							</div>
						{:else}
							<div class="px-2">
								<RangeSlider
									values={[Number(r.count ?? totalSongsMax())]}
									min={0}
									max={totalSongsMax()}
									step={1}
									pips
									pipstep={Math.max(1, Math.floor(totalSongsMax() / 10))}
									disabled={readOnly}
									on:change={(e) =>
										(r.count = Math.max(
											0,
											Math.min(totalSongsMax(), Number(e.detail.values[0] || 0))
										))}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
								<div class="mt-1 flex items-center justify-center text-xs">
									<Input
										class="h-6 w-20 text-center"
										type="number"
										min="0"
										max={totalSongsMax()}
										disabled={readOnly}
										value={Number(r.count ?? totalSongsMax())}
										oninput={(e) =>
											(r.count = Math.max(
												0,
												Math.min(totalSongsMax(), parseInt(e.target.value) || 0)
											))}
									/>
									<span class="ml-1 text-gray-600">songs</span>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<div class="mt-2 text-xs text-gray-500 italic">
						Algorithm will randomly select songs from this date range
					</div>
				{/if}

				{#if !readOnly}
					<div class="mt-2 flex justify-between text-xs">
						<Button
							variant="outline"
							size="sm"
							onclick={() => editedValue.ranges.splice(idx, 1)}
							class=""
							disabled={false}>Remove</Button
						>
					</div>
				{/if}
			</div>
		{/each}
		{#if !readOnly}
			<div>
				<Button
					size="sm"
					onclick={() => {
						ensureRanges();
						editedValue.ranges.push({
							from: { season: 'Winter', year: 1944 },
							to: { season: getCurrentSeason(), year: getCurrentYear() },
							percentage: 0,
							count: 0,
							useAdvanced: false
						});
					}}
					class=""
					disabled={false}>Add Range</Button
				>
			</div>
		{/if}
	</div>
</div>
