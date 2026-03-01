<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Select from '$lib/components/ui/select/index.js';
	import { getCurrentSeason, getCurrentYear } from '$lib/utils/dateUtils.js';
	import { VINTAGE_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	/** @type {{ editedValue: any, config: any, getNodeColor: () => string, readOnly: boolean, getTotalSongs: () => number|{min: number, max: number}, isValid: boolean, validationMessage: string }} */
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
		if (!Array.isArray(editedValue.ranges) || editedValue.ranges.length === 0) {
			editedValue.ranges = [...VINTAGE_DEFAULT_SETTINGS.ranges];
		}
		for (const r of editedValue.ranges) {
			const defaultRange = VINTAGE_DEFAULT_SETTINGS.ranges[0];
			if (!r.from) r.from = { ...defaultRange.from };
			if (!r.to) r.to = { ...defaultRange.to };
			if (!seasons.includes(r.from.season)) r.from.season = defaultRange.from.season;
			if (!seasons.includes(r.to.season)) r.to.season = defaultRange.to.season;
			if (!Number.isFinite(Number(r.from.year))) r.from.year = defaultRange.from.year;
			if (!Number.isFinite(Number(r.to.year))) r.to.year = defaultRange.to.year;
			if (r.percentage === undefined && r.count === undefined) {
				r.percentage = defaultRange.percentage ?? 0;
			}
			if (r.useAdvanced === undefined) r.useAdvanced = false;
			if (r.to.present === undefined) r.to.present = false;
		}
		if (!editedValue.mode) editedValue.mode = VINTAGE_DEFAULT_SETTINGS.mode ?? 'count';
	}

	ensureRanges();

	$effect(() => {
		if (editedValue) ensureRanges();
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
		if (typeof getTotalSongs() === 'object' && m === 'count') return;
		if (editedValue.percentageModeLocked && m === 'count') return;
		editedValue.mode = m;
	}

	function quickFixVintage() {
		ensureRanges();
		const mode = getMode();
		const isPercentageMode = mode === 'percentage';
		const maxTotal = isPercentageMode ? 100 : totalSongsMax();

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

		let currentTotal = 0;
		let hasAdvancedRanges = false;
		for (const r of editedValue.ranges) {
			if (r.useAdvanced) {
				hasAdvancedRanges = true;
				currentTotal += isPercentageMode ? Number(r.percentage ?? 0) : Number(r.count ?? 0);
			}
		}

		if (currentTotal > maxTotal && hasAdvancedRanges) {
			const excessAmount = currentTotal - maxTotal;
			const rangeData = editedValue.ranges
				.filter((r) => r.useAdvanced)
				.map((r) => ({
					currentValue: isPercentageMode ? (r.percentage ?? 0) : (r.count ?? 0),
					range: r
				}));

			let bestRange = rangeData[0];
			for (const rd of rangeData) {
				if (rd.currentValue > bestRange.currentValue) bestRange = rd;
			}

			const newValue = Math.max(0, bestRange.currentValue - excessAmount);
			if (isPercentageMode) bestRange.range.percentage = newValue;
			else bestRange.range.count = newValue;
		}

		editedValue.ranges.forEach((r) => {
			if (r.to.present) return;
			const fromYear = Number(r.from.year);
			const toYear = Number(r.to.year);
			if (
				fromYear > toYear ||
				(fromYear === toYear && seasons.indexOf(r.from.season) > seasons.indexOf(r.to.season))
			) {
				r.to.season = getCurrentSeason();
				r.to.year = getCurrentYear();
			}
		});

		validateVintage();
	}

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
		const unit = isPercentageMode ? '%' : '';

		let total = 0;
		for (const r of editedValue.ranges || []) {
			if (r.useAdvanced) {
				total += isPercentageMode ? Number(r.percentage ?? 0) : Number(r.count ?? 0);
			}
		}

		const remaining = maxTotal - total;
		const hasRemaining = remaining > 0;
		const hasRandomRanges = (editedValue.ranges || []).some((r) => !r.useAdvanced);

		return {
			mode,
			unit,
			maxTotal,
			currentTotal: total,
			remaining: hasRemaining ? remaining : 0,
			hasRemaining,
			useFallbackRandom: hasRemaining && !hasRandomRanges,
			hasRandomRanges,
			ranges: (editedValue.ranges || []).map((r, idx) => ({
				id: idx,
				from: `${r.from?.season} ${r.from?.year}`,
				to: r.to?.present ? 'Present' : `${r.to?.season} ${r.to?.year}`,
				value: r.useAdvanced ? (isPercentageMode ? (r.percentage ?? 0) : (r.count ?? 0)) : 'Random',
				isAdvanced: r.useAdvanced
			}))
		};
	}

	const predictedInfo = $derived(getPredictionInfo());

	function validateVintage() {
		ensureRanges();
		let firstError = '';
		const mode = getMode();
		const isPercentageMode = mode === 'percentage';
		const maxTotal = isPercentageMode ? 100 : totalSongsMax();

		let total = 0;
		let hasAdvancedRanges = false;
		for (const r of editedValue.ranges) {
			if (r.useAdvanced) {
				hasAdvancedRanges = true;
				total += isPercentageMode ? Number(r.percentage ?? 0) : Number(r.count ?? 0);
			}
		}

		if (editedValue.ranges.length === 0) {
			firstError = 'At least one vintage range must be defined.';
		}

		for (const r of editedValue.ranges) {
			if (!r.to.present) {
				const fromYear = Number(r.from.year);
				const toYear = Number(r.to.year);
				if (
					fromYear > toYear ||
					(fromYear === toYear && seasons.indexOf(r.from.season) > seasons.indexOf(r.to.season))
				) {
					firstError = 'Start date must be before or equal to end date.';
					break;
				}
			}
			if (r.useAdvanced === undefined) r.useAdvanced = false;
		}

		if (!firstError && hasAdvancedRanges && total > maxTotal) {
			firstError = isPercentageMode
				? `Advanced ranges exceed 100%. Current: ${total}%`
				: `Advanced ranges exceed max songs. Current: ${total}, max: ${maxTotal}`;
		}

		isValid = !firstError;
		validationMessage = firstError || '';
	}

	$effect(() => {
		const _watch = JSON.stringify(editedValue);
		validateVintage();
	});
</script>

<div class="df-hybrid-layout" style="--accent: {getNodeColor()}">
	<!-- Error / Status panel -->
	{#if predictedInfo}
		{@const pred = predictedInfo}
		{#if pred.error}
			<div
				class="df-hybrid-full text-ed-red flex items-center justify-between gap-2 rounded border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-xs"
			>
				<div class="flex items-center gap-2">
					<span>⚠</span>
					<span>{pred.message}</span>
				</div>
				{#if !readOnly}
					<button
						class="font-dm rounded border border-[#f8514933] bg-[#f8514915] px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-[#f8857f] transition-colors hover:bg-[#f8514928]"
						onclick={quickFixVintage}>Quick Fix</button
					>
				{/if}
			</div>
		{:else}
			<!-- Compact prediction summary -->
			<div
				class="df-hybrid-full flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-[10px]"
				style="border-color: color-mix(in srgb, {getNodeColor()} 20%, #21262d); background: color-mix(in srgb, {getNodeColor()} 6%, #0d1117)"
			>
				<span class="text-ed-fg-subtle font-jb">
					{pred.ranges.length} range{pred.ranges.length !== 1 ? 's' : ''}
				</span>
				<span class="text-ed-border-muted">|</span>
				{#each pred.ranges as range}
					<span
						class="border-ed-border bg-ed-canvas-default inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
					>
						<span class="text-ed-fg">{range.from} → {range.to}</span>
						{#if range.isAdvanced}
							<span class="font-semibold" style="color: {getNodeColor()}"
								>{range.value}{pred.unit}</span
							>
						{:else}
							<span class="text-ed-green">rand</span>
						{/if}
					</span>
				{/each}
				{#if pred.hasRemaining}
					<span class="text-ed-border-muted">|</span>
					<span class="text-ed-fg-subtle">
						{pred.remaining}{pred.unit}
						{pred.useFallbackRandom ? 'random from full range' : 'to random ranges'}
					</span>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Range cards -->
	{#each editedValue.ranges as r, idx}
		<div class="df-hybrid-full border-ed-border bg-ed-canvas-default rounded-md border p-3">
			<!-- From / To row -->
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<span class="font-dm text-ed-fg-subtle text-[10px] font-medium">From</span>
					<div class="flex items-center gap-1.5">
						<Select.Root bind:value={r.from.season} type="single" disabled={readOnly}>
							<Select.Trigger
								size="sm"
								class="text-ed-fg border-ed-border-muted bg-ed-canvas-subtle h-7 min-w-0 flex-1 text-xs"
							>
								{r.from.season}
							</Select.Trigger>
							<Select.Content class="border-ed-border-muted bg-ed-canvas-inset" portalProps={{}}>
								{#each seasons as s}
									<Select.Item
										value={s}
										label={s}
										class="text-ed-fg data-highlighted:bg-ed-border text-xs">{s}</Select.Item
									>
								{/each}
							</Select.Content>
						</Select.Root>
						<input
							type="number"
							class="df-input h-7 w-16"
							min="1944"
							max={getCurrentYear()}
							bind:value={r.from.year}
							disabled={readOnly}
						/>
					</div>
				</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-center justify-between">
						<span class="font-dm text-ed-fg-subtle text-[10px] font-medium">To</span>
						<label class="flex cursor-pointer items-center gap-1">
							<input
								type="checkbox"
								class="df-checkbox h-3 w-3"
								bind:checked={r.to.present}
								disabled={readOnly}
							/>
							<span class="text-[9px] font-medium" style="color: {getNodeColor()}">Present</span>
						</label>
					</div>
					<div class="flex items-center gap-1.5" class:opacity-40={r.to.present}>
						<Select.Root bind:value={r.to.season} type="single" disabled={readOnly || r.to.present}>
							<Select.Trigger
								size="sm"
								class="text-ed-fg border-ed-border-muted bg-ed-canvas-subtle h-7 min-w-0 flex-1 text-xs"
							>
								{r.to.season}
							</Select.Trigger>
							<Select.Content class="border-ed-border-muted bg-ed-canvas-inset" portalProps={{}}>
								{#each seasons as s}
									<Select.Item
										value={s}
										label={s}
										class="text-ed-fg data-highlighted:bg-ed-border text-xs">{s}</Select.Item
									>
								{/each}
							</Select.Content>
						</Select.Root>
						<input
							type="number"
							class="df-input h-7 w-16"
							min="1944"
							max={getCurrentYear()}
							bind:value={r.to.year}
							disabled={readOnly || r.to.present}
						/>
					</div>
				</div>
			</div>

			<!-- Advanced toggle + allocation + inline slider -->
			<div class="border-ed-border mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
				<label class="flex cursor-pointer items-center gap-1.5">
					<input
						type="checkbox"
						class="df-checkbox"
						bind:checked={r.useAdvanced}
						disabled={readOnly}
					/>
					<span class="font-dm text-ed-fg-subtle text-[10px]">Allocation</span>
				</label>

				{#if r.useAdvanced}
					<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
						{#if getMode() === 'percentage'}
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
						{:else}
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
						{/if}
					</div>
					<div class="flex items-center gap-1.5">
						<div class="df-pill-group">
							<button
								class:active={getMode() === 'percentage'}
								disabled={readOnly || editedValue.percentageModeLocked}
								onclick={() => setMode('percentage')}>%</button
							>
							<button
								class:active={getMode() === 'count'}
								disabled={readOnly ||
									typeof getTotalSongs() === 'object' ||
									editedValue.percentageModeLocked}
								onclick={() => setMode('count')}>Count</button
							>
						</div>
						{#if getMode() === 'percentage'}
							<input
								type="number"
								class="df-input h-5 w-12 text-[10px]"
								min="0"
								max="100"
								disabled={readOnly}
								value={Number(r.percentage ?? 0)}
								oninput={(e) =>
									(r.percentage = Math.max(0, Math.min(100, parseInt(e.currentTarget.value) || 0)))}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">%</span>
						{:else}
							<input
								type="number"
								class="df-input h-5 w-12 text-[10px]"
								min="0"
								max={totalSongsMax()}
								disabled={readOnly}
								value={Number(r.count ?? totalSongsMax())}
								oninput={(e) =>
									(r.count = Math.max(
										0,
										Math.min(totalSongsMax(), parseInt(e.currentTarget.value) || 0)
									))}
							/>
						{/if}
					</div>
				{:else}
					<span class="font-dm text-ed-fg-subtle text-[10px] italic">random</span>
				{/if}

				{#if !readOnly}
					<button
						class="text-ed-red ml-auto flex h-5 w-5 items-center justify-center rounded bg-[#f8514910] transition-colors hover:bg-[#f8514925]"
						onclick={() => editedValue.ranges.splice(idx, 1)}
						title="Remove range"
					>
						<svg
							width="11"
							height="11"
							viewBox="0 0 16 16"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path d="M6 2h4a1 1 0 0 1 1 1v1H5V3a1 1 0 0 1 1-1Z" fill="currentColor" />
							<path
								fill-rule="evenodd"
								clip-rule="evenodd"
								d="M2 5h12v1H3.5l.9 8.1A1 1 0 0 0 5.4 15h5.2a1 1 0 0 0 .995-.9L12.5 6H14V5H2Zm3.09 1 .82 7.4h4.18l.82-7.4H5.09Z"
								fill="currentColor"
							/>
						</svg>
					</button>
				{/if}
			</div>
		</div>
	{/each}

	{#if !readOnly}
		<button
			class="df-hybrid-full font-dm hover:text-ed-fg text-ed-fg-subtle border-ed-border-muted hover:border-ed-border-subtle flex h-8 w-full items-center justify-center gap-1 rounded-md border border-dashed bg-transparent text-[11px] transition-colors"
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
		>
			<span>+</span> Add Range
		</button>
	{/if}
</div>
