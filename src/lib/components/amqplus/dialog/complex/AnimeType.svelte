<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import { ANIME_TYPE_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/utils/mathUtils.js';
	import { initializeAnimeTypeMode } from '$lib/utils/modeInitializationUtils.js';
	import { quickFixAnimeType } from '$lib/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		onAutoSave = () => {},
		readOnly = false
	} = $props();

	const animeTypeKeys = ['tv', 'movie', 'ova', 'ona', 'special'];
	const animeTypeLabels = { tv: 'TV', movie: 'Movie', ova: 'OVA', ona: 'ONA', special: 'Special' };

	let viewMode = $state(editedValue?.viewMode ?? ANIME_TYPE_DEFAULT_SETTINGS.viewMode);
	if (!editedValue.mode) editedValue.mode = ANIME_TYPE_DEFAULT_SETTINGS.mode;

	ensureBaseStructure();
	ensureAllAdvancedGroups();

	function ensureBaseStructure() {
		if (!editedValue || typeof editedValue !== 'object') editedValue = {};
		for (const type of animeTypeKeys) {
			if (editedValue[type] === undefined)
				editedValue[type] = ANIME_TYPE_DEFAULT_SETTINGS[type] ?? true;
		}
		if (editedValue.rebroadcast === undefined)
			editedValue.rebroadcast = ANIME_TYPE_DEFAULT_SETTINGS.rebroadcast ?? false;
		if (editedValue.dubbed === undefined)
			editedValue.dubbed = ANIME_TYPE_DEFAULT_SETTINGS.dubbed ?? false;
	}

	function ensureAllAdvancedGroups() {
		if (!editedValue.advanced) editedValue.advanced = {};
		for (const type of animeTypeKeys) {
			if (!editedValue.advanced[type])
				editedValue.advanced[type] = { ...ANIME_TYPE_DEFAULT_SETTINGS.advanced[type] };
			const a = editedValue.advanced[type];
			if (a.percentageValue === undefined) a.percentageValue = a.value || 25;
			if (a.percentageMin === undefined) a.percentageMin = a.min || 10;
			if (a.percentageMax === undefined) a.percentageMax = a.max || 40;
			if (a.countValue === undefined)
				a.countValue = Math.round((a.percentageValue / 100) * getTotalSongsMax()) || 5;
			if (a.countMin === undefined)
				a.countMin = Math.round((a.percentageMin / 100) * getTotalSongsMax()) || 2;
			if (a.countMax === undefined)
				a.countMax = Math.round((a.percentageMax / 100) * getTotalSongsMax()) || 10;
		}
	}

	$effect(() => {
		ensureBaseStructure();
	});
	$effect(() => {
		ensureAllAdvancedGroups();
	});

	$effect(() => {
		const totalSongs = getTotalSongs();
		if (totalSongs && typeof totalSongs === 'object' && editedValue.mode !== 'percentage')
			editedValue.mode = 'percentage';
	});

	let previousTotalSongs = getTotalSongsMax();
	$effect(() => {
		const currentTotal = getTotalSongsMax();
		const mode = editedValue.mode || 'count';
		const isForceUpdate =
			editedValue?._forceUpdate && editedValue._forceUpdate !== previousTotalSongs;

		if (
			(previousTotalSongs !== currentTotal || isForceUpdate) &&
			previousTotalSongs > 0 &&
			currentTotal > 0 &&
			editedValue?.viewMode === 'advanced' &&
			editedValue.advanced
		) {
			const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced[type]?.enabled);
			if (enabledTypes.length > 0 && mode !== 'percentage') {
				const scale = currentTotal / previousTotalSongs;
				for (const type of enabledTypes) {
					const entry = editedValue.advanced[type];
					if (entry.random) {
						entry.countMin = Math.max(0, Math.round(Number(entry.countMin ?? 0) * scale));
						entry.countMax = Math.max(0, Math.round(Number(entry.countMax ?? 0) * scale));
					} else {
						entry.countValue = Math.max(0, Math.round(Number(entry.countValue ?? 0) * scale));
					}
				}
				if (editedValue._forceUpdate) delete editedValue._forceUpdate;
				if (onAutoSave) onAutoSave(editedValue);
			}
		}
		previousTotalSongs = currentTotal;
	});

	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			editedValue = initializeAnimeTypeMode(editedValue, editedValue.mode, getTotalSongsMax());
			previousMode = editedValue.mode;
		}
	});

	function getTotalSongsMax() {
		const total = getTotalSongs();
		return typeof total === 'object' ? Number(total.max ?? 200) : Number(total) || 20;
	}

	function quickFixAnimeTypes() {
		ensureBaseStructure();
		ensureAllAdvancedGroups();
		const mode = editedValue.mode || 'count';
		const totalSongs = mode === 'percentage' ? 100 : getTotalSongsMax();
		let anyEnabled = animeTypeKeys.some((t) => editedValue.advanced[t].enabled);
		if (!anyEnabled) {
			editedValue.advanced.tv.enabled = true;
			editedValue.advanced.tv.random = false;
			if (mode === 'percentage') editedValue.advanced.tv.percentageValue = 100;
			else editedValue.advanced.tv.countValue = totalSongs;
		}
		quickFixAnimeType(editedValue, mode, totalSongs);
		validateAnimeTypes();
	}

	$effect(() => {
		if (viewMode === 'advanced') ensureAllAdvancedGroups();
	});
	$effect(() => {
		if (editedValue) editedValue.viewMode = viewMode;
	});

	function getEnabledTypes() {
		return animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
	}

	let predictedInfoCache = { hash: null, result: null };

	function createCacheHash() {
		if (!editedValue) return null;
		const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
		const mode = editedValue.mode || 'count';
		const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();
		return JSON.stringify({
			mode,
			targetTotal,
			types: enabledTypes.sort().join(','),
			animeTypes: enabledTypes.map((t) => {
				const e = editedValue.advanced[t];
				return {
					enabled: e.enabled,
					random: e.random,
					percentageValue: e.percentageValue,
					countValue: e.countValue,
					percentageMin: e.percentageMin,
					percentageMax: e.percentageMax,
					countMin: e.countMin,
					countMax: e.countMax
				};
			}),
			isValid,
			validationMessage
		});
	}

	function getPredictedInfo() {
		const enabledTypes = animeTypeKeys.filter((type) => editedValue.advanced?.[type]?.enabled);
		if (enabledTypes.length === 0) return null;
		const currentHash = createCacheHash();
		if (predictedInfoCache.hash === currentHash && predictedInfoCache.result !== null)
			return predictedInfoCache.result;

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

		const typeEntries = enabledTypes.map((t) => {
			const entry = editedValue.advanced[t];
			if (entry.random) {
				const min = isPercentageMode
					? Number(entry.percentageMin ?? 0)
					: Number(entry.countMin ?? 0);
				const max = isPercentageMode
					? Number(entry.percentageMax ?? 0)
					: Number(entry.countMax ?? 0);
				return { label: t, kind: /** @type {const} */ ('range'), min, max };
			}
			const value = isPercentageMode
				? Number(entry.percentageValue || 0)
				: Number(entry.countValue || 0);
			return { label: t, kind: /** @type {const} */ ('static'), value };
		});

		const analysis = analyzeGroup(typeEntries, targetTotal);
		const result = {
			mode,
			unit,
			totalSongs: targetTotal,
			types: enabledTypes.map((t) => {
				const entry = typeEntries.find((e) => e.label === t);
				const info = analysis.refined.get(t);
				if (entry.kind === 'static' || !info)
					return {
						label: t,
						value: entry.kind === 'static' ? entry.value : 0,
						isStatic: entry.kind === 'static'
					};
				if (analysis.hasRandom && info.min < info.max)
					return { label: t, min: info.min, max: info.max, isStatic: false };
				return { label: t, value: info.min, isStatic: false };
			})
		};
		predictedInfoCache = { hash: currentHash, result };
		return result;
	}

	const predictedInfo = $derived(getPredictedInfo());

	function validateAnimeTypes() {
		ensureBaseStructure();
		if (viewMode === 'advanced') ensureAllAdvancedGroups();
		let hasEnabled = false;
		let firstError = '';

		for (const type of animeTypeKeys) {
			const entry = editedValue.advanced?.[type];
			if (!entry) continue;
			if (entry.enabled) hasEnabled = true;
			const mode = editedValue.mode || 'count';
			const isP = mode === 'percentage';
			if (entry.random) {
				const min = isP ? Number(entry.percentageMin ?? 0) : Number(entry.countMin ?? 0);
				const max = isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
				if (min < 0 || max < 0 || max < min)
					firstError ||= `${animeTypeLabels[type]}: Invalid range`;
			} else {
				const v = isP ? Number(entry.percentageValue ?? 0) : Number(entry.countValue ?? 0);
				if (v < 0) firstError ||= `${animeTypeLabels[type]}: Value must be >= 0`;
			}
		}
		if (!hasEnabled) firstError ||= 'Enable at least one anime type.';

		if (!firstError && viewMode === 'advanced') {
			const mode = editedValue.mode || 'count';
			const isP = mode === 'percentage';
			const totalSongs = isP ? 100 : getTotalSongsMax();
			const unit = isP ? '%' : ' songs';
			let staticTotal = 0,
				randomMinTotal = 0,
				randomMaxTotal = 0,
				hasRandom = false;

			for (const type of animeTypeKeys) {
				const entry = editedValue.advanced?.[type];
				if (!entry?.enabled) continue;
				if (entry.random) {
					hasRandom = true;
					randomMinTotal += isP ? Number(entry.percentageMin ?? 0) : Number(entry.countMin ?? 0);
					randomMaxTotal += isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
				} else {
					staticTotal += isP ? Number(entry.percentageValue ?? 0) : Number(entry.countValue ?? 0);
				}
			}

			if (!hasRandom) {
				if (isP && Math.abs(staticTotal - 100) > 0.01)
					firstError ||= `Totals must equal 100%. Current: ${staticTotal.toFixed(1)}%`;
				else if (!isP && staticTotal !== totalSongs)
					firstError ||= `Totals must equal ${totalSongs}${unit}. Current: ${staticTotal}${unit}`;
			} else {
				if (staticTotal + randomMaxTotal < totalSongs)
					firstError ||= `Static + random maximums must reach ${totalSongs}${unit}`;
				for (const type of animeTypeKeys) {
					const entry = editedValue.advanced?.[type];
					if (entry?.enabled && entry.random) {
						const max = isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
						if (max > totalSongs)
							firstError ||= `${animeTypeLabels[type]}: Max exceeds ${totalSongs}${unit}`;
					}
				}
			}
		}

		isValid = !firstError;
		validationMessage = firstError || '';
	}

	$effect(() => {
		const _watch = JSON.stringify(editedValue);
		const _mode = viewMode;
		validateAnimeTypes();
	});
</script>

<div class="flex flex-col gap-2" style="--accent: {getNodeColor()}">
	<!-- Toolbar -->
	<div
		class="border-ed-border bg-ed-canvas-default flex items-center justify-between rounded-md border px-3 py-2"
	>
		<div class="flex items-center gap-3">
			<div class="df-pill-group">
				<button
					class:active={viewMode === 'simple'}
					disabled={readOnly}
					onclick={() => (viewMode = 'simple')}>Simple</button
				>
				<button
					class:active={viewMode === 'advanced'}
					disabled={readOnly}
					onclick={() => (viewMode = 'advanced')}>Advanced</button
				>
			</div>
		</div>
		{#if viewMode === 'advanced'}
			<div class="flex items-center gap-2">
				<div class="df-pill-group">
					<button
						class:active={editedValue.mode === 'percentage'}
						disabled={typeof getTotalSongs() === 'object' ||
							readOnly ||
							editedValue.percentageModeLocked}
						onclick={() => (editedValue.mode = 'percentage')}>%</button
					>
					<button
						class:active={editedValue.mode === 'count'}
						disabled={typeof getTotalSongs() === 'object' ||
							readOnly ||
							editedValue.percentageModeLocked}
						onclick={() => (editedValue.mode = 'count')}>Count</button
					>
				</div>
				{#if editedValue.percentageModeLocked}
					<span class="font-dm text-[10px] text-[#f59e0b]">locked</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if viewMode === 'simple'}
		<!-- Simple view: consolidated card -->
		<div class="border-ed-border bg-ed-canvas-default overflow-hidden rounded-md border">
			{#each animeTypeKeys as type, i}
				<div class="border-ed-border flex items-center justify-between border-b px-3 py-1.5">
					<span class="font-dm text-ed-fg text-xs font-medium">{animeTypeLabels[type]}</span>
					<input
						type="checkbox"
						class="df-checkbox"
						bind:checked={editedValue[type]}
						disabled={readOnly}
					/>
				</div>
			{/each}
			<div class="border-ed-border bg-ed-canvas-subtle border-t px-3 py-2">
				<span
					class="font-dm text-ed-fg-subtle mb-1 block text-[10px] font-medium tracking-wider uppercase"
					>Additional</span
				>
				<div class="flex flex-wrap items-center gap-4">
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={editedValue.rebroadcast}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">Include Rebroadcasts</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={editedValue.dubbed}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">Include Dubs</span>
					</label>
				</div>
			</div>
		</div>
	{:else}
		<!-- Advanced: prediction panel -->
		{#if predictedInfo}
			{@const pred = predictedInfo}
			{#if pred.error}
				<div class="df-error-bar">
					<div class="flex items-center gap-2"><span>⚠</span><span>{pred.message}</span></div>
					{#if !readOnly}
						<button class="quick-fix-btn" onclick={quickFixAnimeTypes}>Quick Fix</button>
					{/if}
				</div>
			{:else}
				<div class="df-prediction" style="--accent: {getNodeColor()}">
					<div class="df-prediction-title">Allocation Preview</div>
					<div class="df-prediction-grid">
						{#each getEnabledTypes() as t}
							{@const info = pred.types.find((x) => x.label === t)}
							<div class="df-prediction-chip">
								<span class="chip-label uppercase">{animeTypeLabels[t]}</span>
								{#if info?.min !== undefined && info?.max !== undefined}
									<span class="chip-value text-[#f59e0b]">{info.min}–{info.max}{pred.unit}</span>
									<span class="chip-note">random</span>
								{:else}
									<span
										class="chip-value"
										style="color: {info?.isStatic ? getNodeColor() : '#3fb950'}"
										>{info?.value ?? 0}{pred.unit}</span
									>
									{#if info && !info.isStatic}<span class="chip-note">calculated</span>{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Per-type cards -->
		{#each animeTypeKeys as type}
			{@const entry = editedValue.advanced[type]}
			<div
				class="border-ed-border bg-ed-canvas-default rounded-md border p-3"
				class:opacity-40={!entry.enabled}
			>
				<div class="flex items-center gap-3">
					<span class="font-dm w-14 text-xs font-semibold" style="color: {getNodeColor()}"
						>{animeTypeLabels[type]}</span
					>

					<label class="flex cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={entry.enabled}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">On</span>
					</label>

					<label class="flex cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={entry.random}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">Range</span>
					</label>

					<div class="ml-auto flex items-center gap-2">
						<input
							type="number"
							class="df-input h-6 w-16"
							min="0"
							max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
							disabled={readOnly}
							value={entry.random
								? editedValue.mode === 'percentage'
									? entry.percentageMin
									: entry.countMin
								: editedValue.mode === 'percentage'
									? entry.percentageValue
									: entry.countValue}
							oninput={(e) => {
								const rawMax = editedValue.mode === 'percentage' ? 100 : getTotalSongsMax();
								const v = Math.max(
									0,
									Math.min(rawMax, parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0)
								);
								if (entry.random) {
									if (editedValue.mode === 'percentage') entry.percentageMin = v;
									else entry.countMin = v;
								} else {
									if (editedValue.mode === 'percentage') entry.percentageValue = v;
									else entry.countValue = v;
								}
							}}
						/>
						<span class="font-jb text-ed-fg-muted text-[11px]">to</span>
						<input
							type="number"
							class="df-input h-6 w-16"
							min="0"
							max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
							disabled={readOnly || !entry.random}
							value={entry.random
								? editedValue.mode === 'percentage'
									? entry.percentageMax
									: entry.countMax
								: editedValue.mode === 'percentage'
									? entry.percentageValue
									: entry.countValue}
							oninput={(e) => {
								const rawMax = editedValue.mode === 'percentage' ? 100 : getTotalSongsMax();
								const v = Math.max(
									0,
									Math.min(rawMax, parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0)
								);
								if (editedValue.mode === 'percentage') entry.percentageMax = v;
								else entry.countMax = v;
							}}
						/>
						<span class="font-jb text-ed-fg-muted text-[11px]"
							>{editedValue.mode === 'percentage' ? '%' : 'songs'}</span
						>
					</div>
				</div>

				{#if entry.enabled && entry.random}
					<div class="df-slider mt-2 px-1">
						<RangeSlider
							values={[
								editedValue.mode === 'percentage' ? entry.percentageMin || 0 : entry.countMin || 0,
								editedValue.mode === 'percentage'
									? entry.percentageMax || 100
									: entry.countMax || getTotalSongsMax()
							]}
							min={0}
							max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
							step={1}
							range
							pushy
							pips
							pipstep={editedValue.mode === 'percentage'
								? 25
								: Math.max(1, Math.floor(getTotalSongsMax() / 4))}
							all="label"
							disabled={readOnly}
							on:change={(e) => {
								if (editedValue.mode === 'percentage') {
									entry.percentageMin = e.detail.values[0];
									entry.percentageMax = e.detail.values[1];
								} else {
									entry.countMin = e.detail.values[0];
									entry.countMax = e.detail.values[1];
								}
							}}
							--slider={getNodeColor()}
							--handle={getNodeColor()}
							--range={getNodeColor()}
							--progress={getNodeColor()}
						/>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Additional filters in advanced too -->
		<div class="border-ed-border bg-ed-canvas-subtle overflow-hidden rounded-md border">
			<div class="px-3 py-2">
				<span
					class="font-dm text-ed-fg-subtle mb-1 block text-[10px] font-medium tracking-wider uppercase"
					>Additional</span
				>
				<div class="flex flex-wrap items-center gap-4">
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={editedValue.rebroadcast}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">Include Rebroadcasts</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={editedValue.dubbed}
							disabled={readOnly}
						/>
						<span class="font-dm text-ed-fg-subtle text-[11px]">Include Dubs</span>
					</label>
				</div>
			</div>
		</div>
	{/if}
</div>
