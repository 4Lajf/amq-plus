<script>
	import RangeSlider from 'svelte-range-slider-pips';
	import { SONG_DIFFICULTY_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';
	import { analyzeGroup } from '$lib/utils/mathUtils.js';
	import { initializeSongDifficultyMode } from '$lib/utils/modeInitializationUtils.js';
	import { quickFixSongDifficulty } from '$lib/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		validationWarning = $bindable(''),
		readOnly = false
	} = $props();

	let isUpdatingSliders = false;
	let isManualEdit = false;
	const difficultyKeys = ['easy', 'medium', 'hard'];
	const difficultyLabels = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

	if (!editedValue.viewMode) editedValue.viewMode = SONG_DIFFICULTY_DEFAULT_SETTINGS.viewMode;
	if (!editedValue.mode) editedValue.mode = SONG_DIFFICULTY_DEFAULT_SETTINGS.mode;

	$effect(() => {
		if (editedValue.percentageModeLocked && editedValue.mode !== 'percentage')
			editedValue.mode = 'percentage';
	});

	editedValue._storedTotalSongs = getTotalSongs();

	function getTotalSongsMax() {
		const total = getTotalSongs();
		return typeof total === 'object' ? Number(total.max ?? 200) : Number(total) || 20;
	}

	function isSongsRandomRange() {
		const total = getTotalSongs();
		return total && typeof total === 'object';
	}

	const initializeRandomRangeProperties = () => {
		difficultyKeys.forEach((d) => {
			if (editedValue[d]) {
				const def = SONG_DIFFICULTY_DEFAULT_SETTINGS[d];
				if (editedValue[d].randomRange === undefined)
					editedValue[d].randomRange = def?.randomRange ?? false;
				if (editedValue[d].minPercentage === undefined)
					editedValue[d].minPercentage = def?.minPercentage ?? 25;
				if (editedValue[d].maxPercentage === undefined)
					editedValue[d].maxPercentage = def?.maxPercentage ?? 40;
				if (editedValue[d].minCount === undefined) editedValue[d].minCount = def?.minCount ?? 5;
				if (editedValue[d].maxCount === undefined) editedValue[d].maxCount = def?.maxCount ?? 10;
				if (editedValue[d].percentage !== undefined && editedValue[d].percentageValue === undefined)
					editedValue[d].percentageValue = editedValue[d].percentage;
				if (editedValue[d].count !== undefined && editedValue[d].countValue === undefined)
					editedValue[d].countValue = editedValue[d].count;
			}
		});
	};

	initializeRandomRangeProperties();
	if (!editedValue.ranges) editedValue.ranges = [];
	editedValue.ranges.forEach((range) => {
		if (range.songCount === undefined) range.songCount = 1;
	});
	if (editedValue.ranges.length > 0) recalculateRangeSongCounts();

	function getEnabledTypes() {
		return difficultyKeys.filter((type) => editedValue[type]?.enabled);
	}

	function addRange() {
		const mode = editedValue.mode || 'count';
		const currentRanges = editedValue.ranges.length;
		let newRangeSongCount = 1;
		if (currentRanges > 0) {
			const currentTotal = editedValue.ranges.reduce((sum, r) => sum + (r.songCount || 0), 0);
			const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();
			const remaining = Math.max(0, targetTotal - currentTotal);
			newRangeSongCount = Math.max(1, Math.floor(remaining / (currentRanges + 1)));
			if (currentTotal > 0) {
				const targetForExisting = targetTotal - newRangeSongCount;
				let distributed = 0;
				for (let i = 0; i < currentRanges - 1; i++) {
					const newCount = Math.max(
						0,
						Math.round(targetForExisting * ((editedValue.ranges[i].songCount || 0) / currentTotal))
					);
					editedValue.ranges[i].songCount = newCount;
					distributed += newCount;
				}
				if (currentRanges > 0)
					editedValue.ranges[currentRanges - 1].songCount = Math.max(
						0,
						targetForExisting - distributed
					);
			}
		} else {
			newRangeSongCount = mode === 'percentage' ? 100 : getTotalSongsMax();
		}
		editedValue.ranges = [
			...editedValue.ranges,
			{ from: 10, to: 20, songCount: newRangeSongCount }
		];
		validateRanges();
	}

	function removeRange(index) {
		editedValue.ranges = editedValue.ranges.filter((_, i) => i !== index);
		recalculateRangeSongCounts();
		validateRanges();
	}

	function updateRange(index, field, value) {
		const v = Math.max(0, Math.min(100, parseInt(value) || 0));
		editedValue.ranges[index][field] = v;
		if (field === 'from' && v > editedValue.ranges[index].to) editedValue.ranges[index].to = v;
		else if (field === 'to' && v < editedValue.ranges[index].from)
			editedValue.ranges[index].from = v;
		validateRanges();
	}

	function recalculateRangeSongCounts() {
		const numRanges = editedValue.ranges.length;
		if (numRanges === 0) return;
		const mode = editedValue.mode || 'count';
		const targetTotal = mode === 'percentage' ? 100 : getTotalSongsMax();
		const currentSum = editedValue.ranges.reduce((sum, r) => sum + (r.songCount || 0), 0);
		if (currentSum > 0) {
			let distributed = 0;
			for (let i = 0; i < numRanges - 1; i++) {
				const newCount = Math.max(
					0,
					Math.round(targetTotal * ((editedValue.ranges[i].songCount || 0) / currentSum))
				);
				editedValue.ranges[i].songCount = newCount;
				distributed += newCount;
			}
			editedValue.ranges[numRanges - 1].songCount = Math.max(0, targetTotal - distributed);
		} else {
			const base = Math.floor(targetTotal / numRanges);
			const rem = targetTotal % numRanges;
			editedValue.ranges.forEach((r, i) => {
				r.songCount = base + (i < rem ? 1 : 0);
			});
		}
	}

	function updateSongCount(index, value) {
		const mode = editedValue.mode || 'count';
		const maxValue = mode === 'percentage' ? 100 : getTotalSongsMax();
		editedValue.ranges[index].songCount = Math.max(0, Math.min(maxValue, parseInt(value) || 0));
		validateRanges();
	}

	function handleRangeSliderChange(index, event) {
		editedValue.ranges[index].from = event.detail.values[0];
		editedValue.ranges[index].to = event.detail.values[1];
		validateRanges();
	}

	function validateRanges() {
		if (editedValue.viewMode !== 'advanced') {
			isValid = true;
			validationMessage = '';
			return;
		}
		if (editedValue.ranges.length === 0) {
			isValid = false;
			validationMessage = 'At least one difficulty range is required.';
			return;
		}
		const mode = editedValue.mode || 'count';
		for (let i = 0; i < editedValue.ranges.length; i++) {
			const r = editedValue.ranges[i];
			if (r.from < 0 || r.from > 100 || r.to < 0 || r.to > 100 || r.from > r.to) {
				isValid = false;
				validationMessage = `Range ${i + 1}: From must be <= To (0-100%).`;
				return;
			}
		}
		const totalSongCounts = editedValue.ranges.reduce((s, r) => s + (r.songCount || 0), 0);
		if (mode === 'percentage') {
			if (Math.abs(totalSongCounts - 100) > 0.01) {
				isValid = false;
				validationMessage = `Song count % must total 100%. Current: ${totalSongCounts}%.`;
				return;
			}
		} else {
			const totalSongs = getTotalSongsMax();
			if (totalSongCounts !== totalSongs) {
				isValid = false;
				validationMessage = `Song counts must total ${totalSongs}. Current: ${totalSongCounts}.`;
				return;
			}
		}
		isValid = true;
		validationMessage = '';
	}

	function anyDifficultiesUseRandomRanges() {
		return getEnabledTypes().some((t) => editedValue[t].randomRange);
	}
	function allDifficultiesUseRandomRanges() {
		const e = getEnabledTypes();
		return e.length > 0 && e.every((t) => editedValue[t].randomRange);
	}

	function validateAndFixTotal() {
		if (isUpdatingSliders) return;
		validationMessage = '';
		validationWarning = '';
		if (editedValue.viewMode === 'advanced') {
			validateRanges();
			return;
		}
		const enabledTypes = getEnabledTypes();
		if (enabledTypes.length === 0) {
			isValid = true;
			return;
		}
		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongsMax();
		const unit = editedValue.mode === 'percentage' ? '%' : ' songs';
		const prop = editedValue.mode === 'percentage' ? 'percentageValue' : 'countValue';
		const hasRandom = anyDifficultiesUseRandomRanges();
		const allRandom = allDifficultiesUseRandomRanges();

		if (allRandom) {
			let totalMin = 0,
				totalMax = 0;
			enabledTypes.forEach((t) => {
				const d = editedValue[t];
				totalMin += d[editedValue.mode === 'percentage' ? 'minPercentage' : 'minCount'];
				totalMax += d[editedValue.mode === 'percentage' ? 'maxPercentage' : 'maxCount'];
				if (d[editedValue.mode === 'percentage' ? 'maxPercentage' : 'maxCount'] > maxValue) {
					isValid = false;
					validationMessage = `${difficultyLabels[t]} max exceeds ${maxValue}${unit}.`;
					return;
				}
			});
			if (totalMin > maxValue) {
				isValid = false;
				validationMessage = `Combined minimums (${totalMin}${unit}) exceed ${maxValue}${unit}.`;
			} else if (totalMax < maxValue) {
				isValid = false;
				validationMessage = `Combined maximums (${totalMax}${unit}) less than ${maxValue}${unit}.`;
			} else isValid = true;
		} else if (hasRandom) {
			let staticTotal = 0,
				randomMinTotal = 0,
				randomMaxTotal = 0;
			enabledTypes.forEach((t) => {
				const d = editedValue[t];
				if (d.randomRange) {
					randomMinTotal += d[editedValue.mode === 'percentage' ? 'minPercentage' : 'minCount'];
					randomMaxTotal += d[editedValue.mode === 'percentage' ? 'maxPercentage' : 'maxCount'];
				} else {
					staticTotal += d[prop];
				}
			});
			if (staticTotal + randomMinTotal > maxValue) {
				isValid = false;
				validationMessage = `Static + random min (${staticTotal + randomMinTotal}${unit}) exceed ${maxValue}${unit}.`;
			} else if (staticTotal + randomMaxTotal < maxValue) {
				isValid = false;
				validationMessage = `Static + random max (${staticTotal + randomMaxTotal}${unit}) less than ${maxValue}${unit}.`;
			} else {
				isValid = true;
				validationWarning = 'Mixing random ranges with static values limits randomization.';
			}
		} else {
			const currentTotal = enabledTypes.reduce((s, t) => s + editedValue[t][prop], 0);
			if (Math.abs(currentTotal - maxValue) <= 0.01) isValid = true;
			else {
				isValid = false;
				validationMessage = `Totals must equal ${maxValue}${unit}. Current: ${currentTotal}${unit}`;
			}
		}
	}

	function handleSliderChange(type, event) {
		const newValue = event.detail.value;
		isUpdatingSliders = true;
		const enabledTypes = getEnabledTypes();
		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();
		const otherTypes = enabledTypes.filter((t) => t !== type);
		const prop = editedValue.mode === 'percentage' ? 'percentageValue' : 'countValue';
		editedValue[type][prop] = newValue;
		if (otherTypes.length === 0) {
			isUpdatingSliders = false;
			isValid = true;
			validationMessage = '';
			return;
		}
		const remaining = maxValue - newValue;
		if (remaining <= 0) {
			otherTypes.forEach((t) => {
				editedValue[t][prop] = 0;
			});
		} else {
			const currentOtherTotal = otherTypes.reduce((s, t) => s + editedValue[t][prop], 0);
			if (currentOtherTotal > 0) {
				let distributed = 0;
				for (let i = 0; i < otherTypes.length - 1; i++) {
					const nv = Math.round(remaining * (editedValue[otherTypes[i]][prop] / currentOtherTotal));
					editedValue[otherTypes[i]][prop] = nv;
					distributed += nv;
				}
				editedValue[otherTypes[otherTypes.length - 1]][prop] = remaining - distributed;
			} else {
				const share = Math.floor(remaining / otherTypes.length);
				const rem = remaining % otherTypes.length;
				otherTypes.forEach((t, i) => {
					editedValue[t][prop] = share + (i < rem ? 1 : 0);
				});
			}
		}
		isUpdatingSliders = false;
		validateAndFixTotal();
	}

	function handleInputChange(type, event) {
		isManualEdit = true;
		const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();
		const v = Math.max(0, Math.min(maxValue, parseInt(event.target.value) || 0));
		if (editedValue.mode === 'percentage') editedValue[type].percentageValue = v;
		else editedValue[type].countValue = v;
		validateAndFixTotal();
	}

	function handleInputBlur(type) {
		if (!isManualEdit) return;
		isManualEdit = false;
		validateAndFixTotal();
	}

	function quickFixValues() {
		quickFixSongDifficulty(editedValue, editedValue.mode, getTotalSongs());
		validateAndFixTotal();
	}

	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			editedValue = initializeSongDifficultyMode(editedValue, editedValue.mode, getTotalSongsMax());
			previousMode = editedValue.mode;
		}
	});

	$effect(() => {
		const enabledTypes = getEnabledTypes();
		if (enabledTypes.length === 0) return;
		if (enabledTypes.length === 1) {
			const maxValue = editedValue.mode === 'percentage' ? 100 : getTotalSongs();
			if (editedValue.mode === 'percentage')
				editedValue[enabledTypes[0]].percentageValue = maxValue;
			else editedValue[enabledTypes[0]].countValue = maxValue;
		}
		validateAndFixTotal();
	});

	$effect(() => {
		if (isSongsRandomRange() && editedValue.mode === 'count') editedValue.mode = 'percentage';
	});
	$effect(() => {
		const ct = getTotalSongs();
		if (editedValue._storedTotalSongs !== ct) editedValue._storedTotalSongs = ct;
	});

	$effect(() => {
		difficultyKeys.forEach((d) => {
			if (editedValue[d]?.randomRange) {
				const def = SONG_DIFFICULTY_DEFAULT_SETTINGS[d];
				if (editedValue[d].minPercentage === undefined)
					editedValue[d].minPercentage = def.minPercentage;
				if (editedValue[d].maxPercentage === undefined)
					editedValue[d].maxPercentage = def.maxPercentage;
				if (editedValue[d].minCount === undefined) editedValue[d].minCount = def.minCount;
				if (editedValue[d].maxCount === undefined) editedValue[d].maxCount = def.maxCount;
			}
		});
	});

	let validationTimeout = null;
	$effect(() => {
		const _w = [
			editedValue.mode,
			editedValue.viewMode,
			editedValue.easy,
			editedValue.medium,
			editedValue.hard,
			editedValue.ranges
		];
		if (validationTimeout) clearTimeout(validationTimeout);
		validationTimeout = setTimeout(() => {
			validateAndFixTotal();
		}, 100);
	});

	let predictedInfoCache = { hash: null, result: null };
	function createCacheHash() {
		if (!editedValue) return null;
		const enabledTypes = getEnabledTypes();
		const mode = editedValue.mode || 'count';
		return JSON.stringify({
			mode,
			targetTotal: mode === 'percentage' ? 100 : getTotalSongsMax(),
			types: enabledTypes.sort().join(','),
			diffs: enabledTypes.map((t) => {
				const d = editedValue[t] || {};
				return {
					randomRange: d.randomRange,
					percentageValue: d.percentageValue,
					countValue: d.countValue,
					minPercentage: d.minPercentage,
					maxPercentage: d.maxPercentage,
					minCount: d.minCount,
					maxCount: d.maxCount
				};
			}),
			isValid,
			validationMessage
		});
	}

	function getPredictedInfo() {
		const enabledTypes = getEnabledTypes();
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
		const typeEntries = enabledTypes.map((t) => {
			const d = editedValue[t] || {};
			if (d.randomRange)
				return {
					label: t,
					kind: /** @type {const} */ ('range'),
					min: isP ? Number(d.minPercentage ?? 0) : Number(d.minCount ?? 0),
					max: isP ? Number(d.maxPercentage ?? 0) : Number(d.maxCount ?? 0)
				};
			return {
				label: t,
				kind: /** @type {const} */ ('static'),
				value: isP ? Number(d.percentageValue || 0) : Number(d.countValue || 0)
			};
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
</script>

<div class="df-hybrid-layout" style="--accent: {getNodeColor()}">
	<!-- Combined toolbar + allocation preview -->
	<div
		class="df-hybrid-full border-ed-border bg-ed-canvas-default flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5"
	>
		<div class="df-pill-group">
			<button
				class:active={editedValue.viewMode === 'basic'}
				disabled={readOnly}
				onclick={() => {
					editedValue.viewMode = 'basic';
					validateAndFixTotal();
				}}>Basic</button
			>
			<button
				class:active={editedValue.viewMode === 'advanced'}
				disabled={readOnly}
				onclick={() => {
					editedValue.viewMode = 'advanced';
					validateAndFixTotal();
				}}>Advanced</button
			>
		</div>

		{#if predictedInfo && !predictedInfo.error && editedValue.viewMode !== 'advanced'}
			{@const pred = predictedInfo}
			<div class="bg-ed-border-muted mx-0.5 h-3.5 w-px shrink-0"></div>
			<div class="flex flex-wrap items-center gap-1">
				{#each getEnabledTypes() as t}
					{@const info = pred.types.find((x) => x.label === t)}
					<div
						class="border-ed-border bg-ed-canvas-subtle flex items-center gap-1 rounded border px-1.5 py-0.5"
					>
						<span class="font-dm text-ed-fg-subtle text-[10px] font-bold uppercase"
							>{difficultyLabels[t]}</span
						>
						{#if info?.min !== undefined && info?.max !== undefined}
							<span class="font-jb text-[10px] text-[#e2e8f0]"
								>{info.min}–{info.max}{pred.unit}</span
							>
							<span class="font-dm text-ed-fg-muted text-[9px] italic">rnd</span>
						{:else}
							<span class="font-jb text-[10px] text-[#e2e8f0]">{info?.value ?? 0}{pred.unit}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<div class="df-pill-group">
				<button
					class:active={editedValue.mode === 'percentage'}
					disabled={isSongsRandomRange() || readOnly || editedValue.percentageModeLocked}
					onclick={() => (editedValue.mode = 'percentage')}>%</button
				>
				<button
					class:active={editedValue.mode === 'count'}
					disabled={isSongsRandomRange() || readOnly || editedValue.percentageModeLocked}
					onclick={() => (editedValue.mode = 'count')}>Count</button
				>
			</div>
			{#if editedValue.percentageModeLocked}
				<span class="font-dm text-[10px] text-[#f59e0b]">locked</span>
			{/if}
		</div>
	</div>

	<!-- Error bar -->
	{#if predictedInfo?.error && editedValue.viewMode !== 'advanced'}
		<div class="df-hybrid-full df-error-bar">
			<div class="flex items-center gap-2"><span>⚠</span><span>{predictedInfo.message}</span></div>
			{#if !readOnly}
				<button class="quick-fix-btn" onclick={quickFixValues}>Quick Fix</button>
			{/if}
		</div>
	{/if}

	{#if editedValue.viewMode === 'basic'}
		<!-- Basic: unified difficulty block — single-line rows -->
		<div
			class="df-hybrid-full border-ed-border bg-ed-canvas-default overflow-hidden rounded-md border"
		>
			{#each difficultyKeys as type, idx}
				{@const d = editedValue[type]}
				<div
					class="border-ed-border flex items-center gap-2 px-2.5"
					class:border-t={idx > 0}
					style="min-height: {d.enabled ? '30px' : '26px'}"
				>
					<!-- Left: checkbox + label -->
					<label class="flex shrink-0 cursor-pointer items-center gap-1.5">
						<input
							type="checkbox"
							class="df-checkbox"
							bind:checked={d.enabled}
							disabled={readOnly}
						/>
						<span
							class="font-dm w-12 text-[11px] font-bold tracking-wide uppercase"
							style="color: {d.enabled ? getNodeColor() : '#8b949e'}">{difficultyLabels[type]}</span
						>
					</label>

					{#if d.enabled}
						<!-- Range toggle -->
						<label class="flex shrink-0 cursor-pointer items-center gap-1">
							<input
								type="checkbox"
								class="df-checkbox"
								style="width:11px;height:11px"
								bind:checked={d.randomRange}
								disabled={readOnly}
							/>
							<span class="font-dm text-ed-fg-muted text-[10px]">Rng</span>
						</label>

						<!-- Center: constrained slider -->
						<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
							{#if d.randomRange}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage' ? d.minPercentage || 0 : d.minCount || 0,
										editedValue.mode === 'percentage'
											? d.maxPercentage || 100
											: d.maxCount || getTotalSongsMax()
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
									step={1}
									range
									pushy
									disabled={readOnly}
									on:change={(e) => {
										if (editedValue.mode === 'percentage') {
											d.minPercentage = e.detail.values[0];
											d.maxPercentage = e.detail.values[1];
										} else {
											d.minCount = e.detail.values[0];
											d.maxCount = e.detail.values[1];
										}
										validateAndFixTotal();
									}}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
							{:else}
								<RangeSlider
									values={[
										editedValue.mode === 'percentage' ? d.percentageValue || 0 : d.countValue || 0
									]}
									min={0}
									max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
									step={1}
									disabled={readOnly}
									on:change={(e) => handleSliderChange(type, e)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
									--progress={getNodeColor()}
								/>
							{/if}
						</div>

						<!-- Right: value inputs -->
						<div class="flex shrink-0 items-center gap-1">
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
								disabled={readOnly}
								value={d.randomRange
									? editedValue.mode === 'percentage'
										? d.minPercentage
										: d.minCount
									: editedValue.mode === 'percentage'
										? d.percentageValue || 0
										: d.countValue || 0}
								oninput={(e) => {
									if (d.randomRange) {
										const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0;
										if (editedValue.mode === 'percentage') d.minPercentage = v;
										else d.minCount = v;
										validateAndFixTotal();
									} else {
										handleInputChange(type, e);
									}
								}}
								onblur={() => {
									if (!d.randomRange) handleInputBlur(type);
								}}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">–</span>
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
								disabled={readOnly || !d.randomRange}
								value={d.randomRange
									? editedValue.mode === 'percentage'
										? d.maxPercentage
										: d.maxCount
									: editedValue.mode === 'percentage'
										? d.percentageValue || 0
										: d.countValue || 0}
								oninput={(e) => {
									const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value) || 0;
									if (editedValue.mode === 'percentage') d.maxPercentage = v;
									else d.maxCount = v;
									validateAndFixTotal();
								}}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]"
								>{editedValue.mode === 'percentage' ? '%' : ''}</span
							>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- Advanced: custom ranges -->
		<div
			class="df-hybrid-full border-ed-border bg-ed-canvas-default overflow-hidden rounded-md border"
		>
			<!-- Header row -->
			<div class="border-ed-border flex items-center justify-between border-b px-3 py-1.5">
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-muted text-[10px] font-semibold tracking-wide uppercase"
						>Difficulty % range</span
					>
					<div class="bg-ed-border-muted h-3 w-px"></div>
					<span class="font-dm text-ed-fg-muted text-[10px] font-semibold tracking-wide uppercase"
						>{editedValue.mode === 'percentage' ? 'Songs %' : 'Songs'}</span
					>
				</div>
			</div>

			{#if !isValid && validationMessage}
				<div
					class="font-dm text-ed-red flex items-center gap-2 border-b border-[#f8514933] bg-[#f8514910] px-3 py-1.5 text-[11px]"
				>
					<span>⚠</span>
					<span>{validationMessage}</span>
				</div>
			{/if}

			{#if editedValue.ranges.length === 0}
				<div class="font-dm text-ed-fg-subtle flex items-center justify-center py-5 text-xs">
					No ranges defined. Click "Add Range" to begin.
				</div>
			{:else}
				{#each editedValue.ranges as range, index}
					<div
						class="border-ed-border flex w-full items-center gap-2 px-2.5"
						class:border-t={index > 0}
						style="min-height: 30px"
					>
						<span class="text-ed-fg-subtle font-jb w-5 shrink-0 text-[10px] font-medium"
							>R{index + 1}</span
						>

						<div class="df-slider-row" style="flex: 1; width: auto; min-width: 0">
							<RangeSlider
								values={[range.from, range.to]}
								min={0}
								max={100}
								step={1}
								range
								pushy
								disabled={readOnly}
								on:change={(e) => handleRangeSliderChange(index, e)}
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
								min="0"
								max="100"
								disabled={readOnly}
								value={range.from}
								oninput={(e) =>
									updateRange(index, 'from', /** @type {HTMLInputElement} */ (e.target).value)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">–</span>
							<input
								type="number"
								class="df-input h-5 w-11 text-[10px]"
								min="0"
								max="100"
								disabled={readOnly}
								value={range.to}
								oninput={(e) =>
									updateRange(index, 'to', /** @type {HTMLInputElement} */ (e.target).value)}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]">%</span>
						</div>

						<div class="bg-ed-border-muted h-3.5 w-px shrink-0"></div>

						<input
							type="number"
							class="df-input h-5 w-11 shrink-0 text-[10px]"
							min="0"
							max={editedValue.mode === 'percentage' ? 100 : getTotalSongsMax()}
							disabled={readOnly}
							value={range.songCount || 0}
							oninput={(e) =>
								updateSongCount(index, /** @type {HTMLInputElement} */ (e.target).value)}
						/>

						{#if !readOnly}
							<button
								class="text-ed-red flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#f8514910] transition-colors hover:bg-[#f8514925]"
								onclick={() => removeRange(index)}
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
				{/each}
			{/if}
		</div>

		{#if !readOnly}
			<button
				class="df-hybrid-full font-dm hover:text-ed-fg text-ed-fg-subtle border-ed-border-muted hover:border-ed-border-subtle flex h-8 w-full items-center justify-center gap-1 rounded-md border border-dashed bg-transparent text-[11px] transition-colors"
				onclick={addRange}><span>+</span> Add Range</button
			>
		{/if}
	{/if}
</div>
