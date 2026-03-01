<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import { SONG_CATEGORIES_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/utils/mathUtils.js';
	import { initializeSongCategoriesMode } from '$lib/utils/modeInitializationUtils.js';
	import { quickFixSongCategories } from '$lib/utils/quickFixUtils.js';

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

	const categoryKeys = ['standard', 'instrumental', 'chanting', 'character', 'noCategory'];
	const rowKeys = ['openings', 'endings', 'inserts'];
	const categoryLabels = {
		standard: 'Std',
		instrumental: 'Inst',
		chanting: 'Chnt',
		character: 'Char',
		noCategory: 'None'
	};
	const categoryLabelsFull = {
		standard: 'Standard',
		instrumental: 'Instrumental',
		chanting: 'Chanting',
		character: 'Character',
		noCategory: 'No Category'
	};
	const rowLabels = { openings: 'OP', endings: 'ED', inserts: 'INS' };
	const rowLabelsFull = { openings: 'Openings', endings: 'Endings', inserts: 'Inserts' };

	let viewMode = $state(editedValue?.viewMode ?? SONG_CATEGORIES_DEFAULT_SETTINGS.viewMode);
	if (!editedValue.mode) editedValue.mode = SONG_CATEGORIES_DEFAULT_SETTINGS.mode;

	ensureBaseMatrix();
	ensureAllAdvancedGroups();

	function getTotalSongsMax() {
		const total = getTotalSongs();
		return typeof total === 'object' ? Number(total.max ?? 200) : Number(total) || 20;
	}

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
			if (mode !== 'percentage') {
				const scale = currentTotal / previousTotalSongs;
				for (const row of rowKeys) {
					if (!editedValue.advanced[row]) continue;
					for (const col of categoryKeys) {
						const entry = editedValue.advanced[row][col];
						if (!entry?.enabled) continue;
						if (entry.random) {
							entry.countMin = Math.max(0, Math.round(Number(entry.countMin ?? 0) * scale));
							entry.countMax = Math.max(0, Math.round(Number(entry.countMax ?? 0) * scale));
						} else {
							entry.countValue = Math.max(0, Math.round(Number(entry.countValue ?? 0) * scale));
						}
					}
				}
				if (editedValue._forceUpdate) delete editedValue._forceUpdate;
				if (onAutoSave) onAutoSave(editedValue);
			}
		}
		previousTotalSongs = currentTotal;
	});

	function ensureBaseMatrix() {
		if (!editedValue || typeof editedValue !== 'object') editedValue = {};
		for (const row of rowKeys) {
			if (!editedValue[row] || typeof editedValue[row] !== 'object') editedValue[row] = {};
			const defaultRowSettings = SONG_CATEGORIES_DEFAULT_SETTINGS[row];
			for (const col of categoryKeys) {
				if (editedValue[row][col] === undefined)
					editedValue[row][col] = defaultRowSettings?.[col] ?? true;
			}
		}
	}

	function ensureAdvancedGroup(groupKey) {
		if (!editedValue.advanced) editedValue.advanced = {};
		if (!editedValue.advanced[groupKey]) editedValue.advanced[groupKey] = {};
		for (const col of categoryKeys) {
			if (!editedValue.advanced[groupKey][col])
				editedValue.advanced[groupKey][col] = {
					...SONG_CATEGORIES_DEFAULT_SETTINGS.advanced[groupKey][col]
				};
			const a = editedValue.advanced[groupKey][col];
			if (a.percentageValue === undefined) a.percentageValue = a.value || 10;
			if (a.percentageMin === undefined) a.percentageMin = a.min || 5;
			if (a.percentageMax === undefined) a.percentageMax = a.max || 20;
			if (a.countValue === undefined)
				a.countValue = Math.round((a.percentageValue / 100) * getTotalSongsMax()) || 2;
			if (a.countMin === undefined)
				a.countMin = Math.round((a.percentageMin / 100) * getTotalSongsMax()) || 1;
			if (a.countMax === undefined)
				a.countMax = Math.round((a.percentageMax / 100) * getTotalSongsMax()) || 4;
		}
	}

	function ensureAllAdvancedGroups() {
		rowKeys.forEach(ensureAdvancedGroup);
	}

	$effect(() => {
		ensureBaseMatrix();
	});
	$effect(() => {
		ensureAllAdvancedGroups();
	});
	$effect(() => {
		const totalSongs = getTotalSongs();
		if (totalSongs && typeof totalSongs === 'object' && editedValue.mode !== 'percentage')
			editedValue.mode = 'percentage';
	});

	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			editedValue = initializeSongCategoriesMode(editedValue, editedValue.mode, getTotalSongsMax());
			previousMode = editedValue.mode;
		}
	});

	function quickFixCategories() {
		ensureBaseMatrix();
		ensureAllAdvancedGroups();
		const mode = editedValue.mode || 'count';
		const totalSongs = mode === 'percentage' ? 100 : getTotalSongsMax();
		let anyEnabled = false;
		for (const g of rowKeys) {
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
			if (mode === 'percentage') editedValue.advanced.openings.standard.percentageValue = 100;
			else editedValue.advanced.openings.standard.countValue = totalSongs;
		}
		quickFixSongCategories(editedValue, mode, totalSongs);
		validateSongCategories();
	}

	$effect(() => {
		if (viewMode === 'advanced') ensureAllAdvancedGroups();
	});
	$effect(() => {
		if (editedValue) editedValue.viewMode = viewMode;
	});

	let predictedInfoCache = { hash: null, result: null };

	function createCacheHash() {
		if (!editedValue) return null;
		const enabledTypes = [];
		rowKeys.forEach((g) => {
			categoryKeys.forEach((c) => {
				if (editedValue.advanced?.[g]?.[c]?.enabled) enabledTypes.push(`${g}-${c}`);
			});
		});
		const mode = editedValue.mode || 'count';
		return JSON.stringify({
			mode,
			targetTotal: mode === 'percentage' ? 100 : getTotalSongsMax(),
			types: enabledTypes.sort().join(','),
			categories: rowKeys.map((g) =>
				categoryKeys
					.map((c) => {
						const e = editedValue.advanced?.[g]?.[c];
						return e
							? {
									enabled: e.enabled,
									random: e.random,
									percentageValue: e.percentageValue,
									countValue: e.countValue,
									percentageMin: e.percentageMin,
									percentageMax: e.percentageMax,
									countMin: e.countMin,
									countMax: e.countMax
								}
							: null;
					})
					.filter(Boolean)
			),
			isValid,
			validationMessage
		});
	}

	function getPredictedInfo() {
		const enabledTypes = [];
		rowKeys.forEach((g) => {
			categoryKeys.forEach((c) => {
				if (editedValue.advanced?.[g]?.[c]?.enabled) enabledTypes.push(`${g}-${c}`);
			});
		});
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
		const isP = mode === 'percentage';
		const unit = isP ? '%' : '';
		const targetTotal = isP ? 100 : getTotalSongsMax();

		const typeEntries = [];
		rowKeys.forEach((g) => {
			categoryKeys.forEach((c) => {
				const entry = editedValue.advanced[g][c];
				if (!entry.enabled) return;
				const label = `${g}-${c}`;
				if (entry.random) {
					const min = isP ? Number(entry.percentageMin ?? 0) : Number(entry.countMin ?? 0);
					const max = isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
					typeEntries.push({ label, kind: 'range', min, max });
				} else {
					const value = isP ? Number(entry.percentageValue || 0) : Number(entry.countValue || 0);
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

	function validateSongCategories() {
		ensureBaseMatrix();
		if (viewMode === 'advanced') ensureAllAdvancedGroups();
		let hasEnabled = false;
		let firstError = '';

		for (const g of rowKeys) {
			const group = editedValue.advanced?.[g];
			if (!group) continue;
			for (const c of categoryKeys) {
				const entry = group[c];
				if (!entry) continue;
				if (entry.enabled) hasEnabled = true;
				const mode = editedValue.mode || 'count';
				const isP = mode === 'percentage';
				if (entry.random) {
					const min = isP ? Number(entry.percentageMin ?? 0) : Number(entry.countMin ?? 0);
					const max = isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
					if (min < 0 || max < 0 || max < min)
						firstError ||= `${rowLabelsFull[g]}/${categoryLabelsFull[c]}: Invalid range`;
				} else {
					const v = isP ? Number(entry.percentageValue ?? 0) : Number(entry.countValue ?? 0);
					if (v < 0)
						firstError ||= `${rowLabelsFull[g]}/${categoryLabelsFull[c]}: Value must be >= 0`;
				}
			}
		}
		if (!hasEnabled) firstError ||= 'Enable at least one category.';

		if (!firstError && viewMode === 'advanced') {
			const mode = editedValue.mode || 'count';
			const isP = mode === 'percentage';
			const totalSongs = isP ? 100 : getTotalSongsMax();
			const unit = isP ? '%' : ' songs';
			let staticTotal = 0,
				randomMaxTotal = 0,
				hasRandom = false;

			for (const g of rowKeys) {
				const group = editedValue.advanced?.[g];
				if (!group) continue;
				for (const c of categoryKeys) {
					const entry = group[c];
					if (!entry?.enabled) continue;
					if (entry.random) {
						hasRandom = true;
						randomMaxTotal += isP ? Number(entry.percentageMax ?? 0) : Number(entry.countMax ?? 0);
					} else {
						staticTotal += isP ? Number(entry.percentageValue ?? 0) : Number(entry.countValue ?? 0);
					}
				}
			}

			if (!hasRandom) {
				if (isP && Math.abs(staticTotal - 100) > 0.01)
					firstError ||= `Totals must equal 100%. Current: ${staticTotal.toFixed(1)}%`;
				else if (!isP && staticTotal !== totalSongs)
					firstError ||= `Totals must equal ${totalSongs}${unit}. Current: ${staticTotal}${unit}`;
			} else {
				if (staticTotal + randomMaxTotal < totalSongs)
					firstError ||= `Static + random max must reach ${totalSongs}${unit}`;
			}
		}

		isValid = !firstError;
		validationMessage = firstError || '';
	}

	$effect(() => {
		const _watch = JSON.stringify(editedValue);
		const _mode = viewMode;
		validateSongCategories();
	});
</script>

<div class="df-hybrid-layout" style="--accent: {getNodeColor()}">
	<!-- Toolbar -->
	<div
		class="df-hybrid-full border-ed-border bg-ed-canvas-default flex items-center justify-between rounded-md border px-3 py-2"
	>
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
		<!-- Simple matrix -->
		<div
			class="df-hybrid-full border-ed-border bg-ed-canvas-default overflow-hidden rounded-md border"
		>
			<table class="w-full border-collapse">
				<thead>
					<tr class="border-ed-border bg-ed-canvas-subtle border-b">
						<th class="font-dm text-ed-fg-subtle py-2 pl-3 text-left text-[10px] font-medium"></th>
						{#each categoryKeys as col}
							<th class="font-dm text-ed-fg-subtle px-1 py-2 text-center text-[10px] font-medium"
								>{categoryLabels[col]}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rowKeys as row, rowIdx}
						<tr class:border-b={rowIdx < rowKeys.length - 1} class="border-ed-border">
							<td class="font-dm text-ed-fg py-1.5 pl-3 text-xs font-medium"
								>{rowLabelsFull[row]}</td
							>
							{#each categoryKeys as col}
								<td class="px-1 py-1.5 text-center">
									<input
										type="checkbox"
										class="df-checkbox"
										bind:checked={editedValue[row][col]}
										disabled={readOnly}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<!-- Prediction -->
		{#if predictedInfo}
			{@const pred = predictedInfo}
			{#if pred.error}
				<div class="df-hybrid-full df-error-bar">
					<div class="flex items-center gap-2"><span>⚠</span><span>{pred.message}</span></div>
					{#if !readOnly}
						<button class="quick-fix-btn" onclick={quickFixCategories}>Quick Fix</button>
					{/if}
				</div>
			{:else if pred.types.length > 0}
				<div class="df-hybrid-full df-prediction" style="--accent: {getNodeColor()}">
					<div class="df-prediction-title">Allocation Preview</div>
					<div class="df-prediction-grid">
						{#each pred.types as t}
							{@const parts = t.label.split('-')}
							<div class="df-prediction-chip">
								<span class="chip-label"
									><span class="text-ed-fg-subtle">{rowLabels[parts[0]]}</span>
									{categoryLabels[parts[1]]}</span
								>
								{#if t.min !== undefined && t.max !== undefined}
									<span class="chip-value text-[#f59e0b]">{t.min}–{t.max}{pred.unit}</span>
									<span class="chip-note">random</span>
								{:else}
									<span class="chip-value" style="color: {t.isStatic ? getNodeColor() : '#3fb950'}"
										>{t.value}{pred.unit}</span
									>
									{#if !t.isStatic}<span class="chip-note">calculated</span>{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Compact table per group -->
		{#each rowKeys as groupKey}
			<div
				class="df-hybrid-full border-ed-border bg-ed-canvas-default overflow-hidden rounded-md border"
			>
				<div class="border-ed-border bg-ed-canvas-subtle flex items-center border-b px-3 py-1.5">
					<span class="font-dm text-[11px] font-semibold" style="color: {getNodeColor()}"
						>{rowLabelsFull[groupKey]}</span
					>
				</div>
				<table class="w-auto border-collapse">
					<thead>
						<tr class="border-ed-border border-b">
							<th class="w-6 px-1 py-1"></th>
							<th class="font-dm text-ed-fg-subtle py-1 pl-1 text-left text-[9px] font-medium"
								>Cat</th
							>
							<th class="font-dm text-ed-fg-subtle px-1 py-1 text-center text-[9px] font-medium"
								>Rng</th
							>
							<th class="font-dm text-ed-fg-subtle py-1 pr-3 text-right text-[9px] font-medium"
								>Value</th
							>
						</tr>
					</thead>
					<tbody>
						{#each categoryKeys as col, colIdx}
							{@const entry = editedValue.advanced[groupKey][col]}
							<tr
								class:border-b={colIdx < categoryKeys.length - 1}
								class="border-ed-border"
								class:opacity-40={!entry.enabled}
							>
								<td class="px-1 py-1 text-center">
									<input
										type="checkbox"
										class="df-checkbox"
										style="width:13px;height:13px"
										bind:checked={entry.enabled}
										disabled={readOnly}
									/>
								</td>
								<td class="font-dm text-ed-fg py-1 pl-1 text-[11px] font-medium"
									>{categoryLabels[col]}</td
								>
								<td class="px-1 py-1 text-center">
									<input
										type="checkbox"
										class="df-checkbox"
										style="width:13px;height:13px"
										bind:checked={entry.random}
										disabled={readOnly || !entry.enabled}
									/>
								</td>
								<td class="py-1 pr-3 text-right">
									<div class="flex items-center justify-end gap-1">
										<input
											type="number"
											class="df-input h-5 w-12 text-[10px]"
											min="0"
											max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
											disabled={readOnly || !entry.enabled}
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
													Math.min(
														rawMax,
														parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0
													)
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
										<span class="font-jb text-ed-fg-muted text-[9px]">–</span>
										<input
											type="number"
											class="df-input h-5 w-12 text-[10px]"
											min="0"
											max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
											disabled={readOnly || !entry.enabled || !entry.random}
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
													Math.min(
														rawMax,
														parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0
													)
												);
												if (editedValue.mode === 'percentage') entry.percentageMax = v;
												else entry.countMax = v;
											}}
										/>
										<span class="font-jb text-ed-fg-muted w-3 text-[9px]"
											>{editedValue.mode === 'percentage' ? '%' : ''}</span
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/each}
	{/if}
</div>
