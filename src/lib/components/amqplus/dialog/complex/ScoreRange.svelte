<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import {
		PLAYER_SCORE_DEFAULT_SETTINGS,
		ANIME_SCORE_DEFAULT_SETTINGS
	} from '$lib/utils/defaultNodeSettings.js';
	import { clamp } from '$lib/utils/mathUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		readOnly = false,
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	const isAnimeScore = config?.type?.includes('anime') || config?.label?.includes('Anime');
	const defaultSettings = isAnimeScore
		? ANIME_SCORE_DEFAULT_SETTINGS
		: PLAYER_SCORE_DEFAULT_SETTINGS;

	const minBound = Number(config?.min ?? defaultSettings.min);
	const maxBound = Number(config?.max ?? defaultSettings.max);

	if (!editedValue)
		editedValue = { min: minBound, max: maxBound, mode: 'range', percentages: {}, disallowed: [] };
	if (editedValue.min === undefined) editedValue.min = minBound;
	if (editedValue.max === undefined) editedValue.max = maxBound;
	if (!editedValue.mode) editedValue.mode = 'range';
	if (!editedValue.percentages) editedValue.percentages = {};
	if (!Array.isArray(editedValue.disallowed)) editedValue.disallowed = [];
	if (!editedValue.perScoreMode) editedValue.perScoreMode = 'count';

	if (editedValue.percentageModeLocked && editedValue.perScoreMode === 'count') {
		editedValue.perScoreMode = 'percentage';
	}

	function validateValue() {
		if (!editedValue) return;
		const errors = [];

		const min = Number(editedValue.min ?? 0);
		const max = Number(editedValue.max ?? 100);
		if (
			!Number.isFinite(min) ||
			!Number.isFinite(max) ||
			min < minBound ||
			max > maxBound ||
			min > max
		) {
			errors.push(`Range must be within ${minBound}-${maxBound} and min ≤ max`);
		}

		if (editedValue.counts && Object.keys(editedValue.counts).length > 0) {
			let total = 0;
			for (const k in editedValue.counts) {
				const val = Number(editedValue.counts[k]);
				if (Number.isFinite(val) && val > 0) total += val;
			}
			const totalSongs =
				typeof getTotalSongs() === 'object'
					? (getTotalSongs().max ?? getTotalSongs().value ?? 20)
					: getTotalSongs() || 20;
			if (total > totalSongs) {
				errors.push(`Per-score counts total ${total}, exceeds ${totalSongs} songs`);
			}
		}

		if (editedValue.percentages && Object.keys(editedValue.percentages).length > 0) {
			let total = 0;
			for (const k in editedValue.percentages) {
				const val = Number(editedValue.percentages[k]);
				if (Number.isFinite(val) && val > 0) total += val;
			}
			if (total > 100) {
				errors.push(`Per-score percentages total ${total}%, exceeds 100%`);
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	$effect(() => {
		validateValue();
	});

	const scoreRange = $derived(
		Array.from({ length: maxBound - minBound + 1 }).map((_, i) => i + minBound)
	);

	function isSongsRandomRange() {
		return typeof getTotalSongs() === 'object';
	}
</script>

<div class="df-hybrid-layout" style="--accent: {getNodeColor()}">
	{#if !isValid && validationMessage}
		<div
			class="df-hybrid-full text-ed-red flex items-center gap-2 rounded border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-xs"
		>
			<span>⚠</span>
			<span>{validationMessage}</span>
		</div>
	{/if}

	<!-- Range slider — single-line: label + slider + inputs -->
	<div
		class="df-hybrid-full border-ed-border bg-ed-canvas-default flex items-center gap-3 rounded-md border px-3"
		style="min-height: 36px"
	>
		<span class="font-dm text-ed-fg-subtle shrink-0 text-[11px] font-medium">Range</span>
		<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
			<RangeSlider
				values={[
					clamp(editedValue.min, minBound, maxBound),
					clamp(editedValue.max, minBound, maxBound)
				]}
				min={minBound}
				max={maxBound}
				step={1}
				range
				pips
				all="label"
				disabled={readOnly}
				on:change={(e) => {
					const [lo, hi] = e.detail.values;
					editedValue.min = lo;
					editedValue.max = hi;
				}}
				--slider={getNodeColor()}
				--handle={getNodeColor()}
				--range={getNodeColor()}
				--progress={getNodeColor()}
			/>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<input
				type="number"
				class="df-input h-5 w-11 text-[10px]"
				min={minBound}
				max={maxBound}
				disabled={readOnly}
				value={editedValue.min}
				oninput={(e) =>
					(editedValue.min = clamp(
						Number(e.currentTarget.value),
						minBound,
						Math.min(maxBound, editedValue.max)
					))}
			/>
			<span class="text-ed-fg-subtle font-jb text-[9px]">–</span>
			<input
				type="number"
				class="df-input h-5 w-11 text-[10px]"
				min={minBound}
				max={maxBound}
				disabled={readOnly}
				value={editedValue.max}
				oninput={(e) =>
					(editedValue.max = clamp(
						Number(e.currentTarget.value),
						Math.max(minBound, editedValue.min),
						maxBound
					))}
			/>
		</div>
	</div>

	<!-- Per-score weighting -->
	<div class="df-hybrid-full border-ed-border bg-ed-canvas-default rounded-md border p-3">
		<div class="mb-2 flex items-center justify-between">
			<span class="font-dm text-ed-fg-subtle text-[11px] font-medium">Per-Score Weighting</span>
			<div class="flex items-center gap-2">
				<div class="df-pill-group">
					<button
						class:active={editedValue.perScoreMode === 'percentage'}
						disabled={readOnly || editedValue.percentageModeLocked}
						onclick={() => (editedValue.perScoreMode = 'percentage')}>%</button
					>
					<button
						class:active={editedValue.perScoreMode === 'count'}
						disabled={readOnly || isSongsRandomRange() || editedValue.percentageModeLocked}
						onclick={() => (editedValue.perScoreMode = 'count')}>Count</button
					>
				</div>
				{#if editedValue.percentageModeLocked}
					<span class="font-dm text-[10px] text-[#f59e0b]" title="Locked to % mode">locked</span>
				{/if}
			</div>
		</div>
		<span class="text-ed-fg-subtle mb-2 block text-[10px]">
			Guarantees a minimum {editedValue.perScoreMode === 'percentage' ? 'percentage' : 'count'} of songs
			per score. Leave blank for random distribution.
		</span>
		<div class="grid grid-cols-5 gap-1.5">
			{#each scoreRange as s}
				{@const outOfRange = s < editedValue.min || s > editedValue.max}
				<div class="flex items-center gap-1" class:opacity-30={outOfRange}>
					<span class="text-ed-fg-subtle font-jb w-5 text-right text-[10px]">{s}</span>
					{#if editedValue.perScoreMode === 'count'}
						<input
							type="number"
							class="df-input h-6 w-full"
							min="0"
							disabled={readOnly || outOfRange}
							value={editedValue.counts?.[s] ?? ''}
							oninput={(e) => {
								const v =
									e.currentTarget.value === ''
										? undefined
										: Math.max(0, parseInt(e.currentTarget.value) || 0);
								if (!editedValue.counts) editedValue.counts = {};
								if (v === undefined) delete editedValue.counts[s];
								else editedValue.counts[s] = v;
							}}
						/>
					{:else}
						<input
							type="number"
							class="df-input h-6 w-full"
							min="0"
							max="100"
							disabled={readOnly || outOfRange}
							value={editedValue.percentages?.[s] ?? ''}
							oninput={(e) => {
								const v =
									e.currentTarget.value === ''
										? undefined
										: clamp(Number(e.currentTarget.value), 0, 100);
								if (!editedValue.percentages) editedValue.percentages = {};
								if (v === undefined) delete editedValue.percentages[s];
								else editedValue.percentages[s] = v;
							}}
						/>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Disallow specific scores -->
	<div class="df-hybrid-full border-ed-border bg-ed-canvas-default rounded-md border p-3">
		<span class="font-dm text-ed-fg-subtle mb-2 block text-[11px] font-medium">Disallow Scores</span
		>
		<span class="text-ed-fg-subtle mb-2 block text-[10px]">
			Block specific scores when no per-score weighting is set
		</span>
		<div class="flex flex-wrap gap-1">
			{#each scoreRange as s}
				{@const outOfRange = s < editedValue.min || s > editedValue.max}
				{@const isDisallowed = editedValue.disallowed?.includes(s)}
				<button
					class="font-jb flex h-6 w-8 items-center justify-center rounded text-[10px] transition-all duration-150"
					class:opacity-30={outOfRange}
					class:bg-[#f8514922]={isDisallowed}
					class:text-ed-red={isDisallowed}
					class:border-[#f8514944]={isDisallowed}
					class:bg-[#0d1117]={!isDisallowed}
					class:text-ed-fg-subtle={!isDisallowed}
					class:border-ed-border-muted={!isDisallowed}
					class:border={true}
					class:hover:border-[#484f58]={!isDisallowed && !outOfRange}
					disabled={readOnly || outOfRange}
					onclick={() => {
						if (!Array.isArray(editedValue.disallowed)) editedValue.disallowed = [];
						const idx = editedValue.disallowed.indexOf(s);
						if (idx >= 0) editedValue.disallowed.splice(idx, 1);
						else editedValue.disallowed.push(s);
					}}>{s}</button
				>
			{/each}
		</div>
	</div>
</div>
