<script>
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import {
		PLAYER_SCORE_DEFAULT_SETTINGS,
		ANIME_SCORE_DEFAULT_SETTINGS
	} from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { clamp } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		readOnly = false,
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	// Get appropriate defaults based on score type
	const isAnimeScore = config?.type?.includes('anime') || config?.label?.includes('Anime');
	const defaultSettings = isAnimeScore
		? ANIME_SCORE_DEFAULT_SETTINGS
		: PLAYER_SCORE_DEFAULT_SETTINGS;

	// Use defaults from defaultNodeSettings, with fallbacks
	const minBound = Number(config?.min ?? defaultSettings.min);
	const maxBound = Number(config?.max ?? defaultSettings.max);

	if (!editedValue)
		editedValue = { min: minBound, max: maxBound, mode: 'range', percentages: {}, disallowed: [] };
	if (editedValue.min === undefined) editedValue.min = minBound;
	if (editedValue.max === undefined) editedValue.max = maxBound;
	if (!editedValue.mode) editedValue.mode = 'range';
	if (!editedValue.percentages) editedValue.percentages = {};
	if (!Array.isArray(editedValue.disallowed)) editedValue.disallowed = [];

	// Initialize per-score mode (separate from main mode)
	if (!editedValue.perScoreMode) editedValue.perScoreMode = 'count';

	// Auto-switch to percentage mode when locked
	if (editedValue.percentageModeLocked && editedValue.perScoreMode === 'count') {
		editedValue.perScoreMode = 'percentage';
	}

	// Validation logic
	function validateValue() {
		if (!editedValue) return; // Don't validate if editedValue is not initialized
		const errors = [];

		// Range validation
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

		// Count/percentage validation - validate both regardless of mode if they exist
		const mode = editedValue.mode || 'range';
		const perScoreMode = editedValue.perScoreMode || 'count';

		// Validate counts if they exist
		if (editedValue.counts && Object.keys(editedValue.counts).length > 0) {
			let total = 0;
			for (const k in editedValue.counts) {
				const val = Number(editedValue.counts[k]);
				if (Number.isFinite(val) && val > 0) {
					total += val;
				}
			}
			const totalSongs =
				typeof getTotalSongs() === 'object'
					? (getTotalSongs().max ?? getTotalSongs().value ?? 20)
					: getTotalSongs() || 20;
			if (total > totalSongs) {
				errors.push(`Count exceeds total songs`);
				errors.push(`Sum of per-score counts is ${total}. Must not exceed ${totalSongs} songs.`);
			}
		}

		// Validate percentages if they exist (always validate percentages regardless of mode)
		if (editedValue.percentages && Object.keys(editedValue.percentages).length > 0) {
			let total = 0;
			for (const k in editedValue.percentages) {
				const val = Number(editedValue.percentages[k]);
				if (Number.isFinite(val) && val > 0) {
					total += val;
				}
			}
			if (total > 100) {
				errors.push(`Percentage total exceeds 100%`);
				errors.push(`Sum of per-score percentages is ${total}%. Must not exceed 100%.`);
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	// Watch for changes and validate - run validation immediately when component loads
	$effect(() => {
		// Always validate when editedValue exists, even on initial load
		validateValue();
	});
</script>

<div class="space-y-8">
	<!-- Validation Error Display -->
	{#if !isValid && validationMessage}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 flex-shrink-0">
					<svg class="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						></path>
					</svg>
				</div>
				<div class="flex-1">
					<h4 class="mb-1 text-sm font-medium text-red-900">Configuration Error</h4>
					<div class="text-sm text-red-800">
						{#each validationMessage.split('; ') as error}
							<div class="mb-1 rounded bg-red-100 p-2 text-xs">
								<strong>⚠️</strong>
								{error}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="text-center">
		<Label class="text-2xl font-bold text-gray-800">{config.label}</Label>
		<p class="mt-2 text-gray-600">Configure allowed score range and per-score weighting</p>
	</div>

	<div class="space-y-6">
		<!-- Range selector -->
		<div>
			<div class="mb-2 text-sm font-medium text-gray-700">Allowed range</div>
			<div class="px-2">
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
			<div class="mt-2 flex items-center justify-center gap-2 text-sm">
				<Input
					class="h-7 w-16 text-center"
					type="number"
					min={minBound}
					max={maxBound}
					disabled={readOnly}
					value={editedValue.min}
					oninput={(e) =>
						(editedValue.min = clamp(
							e.target.value,
							minBound,
							Math.min(maxBound, editedValue.max)
						))}
				/>
				<span>to</span>
				<Input
					class="h-7 w-16 text-center"
					type="number"
					min={minBound}
					max={maxBound}
					disabled={readOnly}
					value={editedValue.max}
					oninput={(e) =>
						(editedValue.max = clamp(
							e.target.value,
							Math.max(minBound, editedValue.min),
							maxBound
						))}
				/>
			</div>
		</div>

		<!-- Percentage/count per score (optional) -->
		<div class="pt-2">
			<div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700">
				<div>Per-score percentage / count (optional)</div>
				<div class="flex items-center gap-2">
					<div class="inline-flex overflow-hidden rounded border">
						<Button
							variant="ghost"
							size="sm"
							class="px-2 py-0.5 text-[11px] {editedValue.perScoreMode === 'percentage'
								? 'bg-blue-100 text-blue-700'
								: ''}"
							disabled={readOnly || editedValue.percentageModeLocked}
							onclick={() => (editedValue.perScoreMode = 'percentage')}>%</Button
						>
						<Button
							variant="ghost"
							size="sm"
							class="px-2 py-0.5 text-[11px] {editedValue.perScoreMode === 'count'
								? 'bg-blue-100 text-blue-700'
								: ''} {typeof getTotalSongs() === 'object'
								? 'cursor-not-allowed text-gray-400'
								: ''}"
							disabled={readOnly ||
								typeof getTotalSongs() === 'object' ||
								editedValue.percentageModeLocked}
							onclick={() => (editedValue.perScoreMode = 'count')}>Count</Button
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
			<div class="mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800">
				Per-score percentage guarantees at least this percentage of songs of that score will appear.
				If left blank, remaining songs are assigned randomly among scores in range. If count is
				used, it specifies an exact number of songs of that score.
			</div>
			<div class="grid grid-cols-5 gap-2 text-xs">
				{#each Array.from({ length: maxBound - minBound + 1 }).map((_, i) => i + minBound) as s}
					<div class="flex items-center gap-1">
						<span class="w-6 text-right">{s}</span>
						{#if editedValue.perScoreMode === 'count'}
							<Input
								class="h-7 w-16 px-1 text-center"
								type="number"
								min="0"
								disabled={readOnly || s < editedValue.min || s > editedValue.max}
								value={editedValue.counts?.[s] ?? ''}
								oninput={(e) => {
									const v =
										e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0);
									if (!editedValue.counts) editedValue.counts = {};
									if (v === undefined) delete editedValue.counts[s];
									else editedValue.counts[s] = v;
								}}
							/>
						{:else}
							<Input
								class="h-7 w-16 px-1 text-center"
								type="number"
								min="0"
								max="100"
								disabled={readOnly || s < editedValue.min || s > editedValue.max}
								value={editedValue.percentages?.[s] ?? ''}
								oninput={(e) => {
									const v = e.target.value === '' ? undefined : clamp(e.target.value, 0, 100);
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

		<!-- Disallow specific scores when not using percentages -->
		<div class="pt-4">
			<div class="mb-2 text-sm font-medium text-gray-700">
				Disallow specific scores (applies when no percentages set)
			</div>
			<div class="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
				If no per-score percentages are provided, you can disallow specific scores here; they will
				not appear.
			</div>
			<div class="flex flex-wrap gap-2">
				{#each Array.from({ length: maxBound - minBound + 1 }).map((_, i) => i + minBound) as s}
					<Button
						variant={editedValue.disallowed?.includes(s) ? 'destructive' : 'outline'}
						size="sm"
						class="px-3 py-1 text-xs"
						disabled={readOnly || s < editedValue.min || s > editedValue.max}
						onclick={() => {
							if (!Array.isArray(editedValue.disallowed)) editedValue.disallowed = [];
							const idx = editedValue.disallowed.indexOf(s);
							if (idx >= 0) {
								editedValue.disallowed.splice(idx, 1);
							} else {
								editedValue.disallowed.push(s);
							}
						}}
					>
						{s}
					</Button>
				{/each}
			</div>
		</div>
	</div>
</div>
