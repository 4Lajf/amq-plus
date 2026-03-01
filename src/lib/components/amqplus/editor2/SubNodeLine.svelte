<script>
	import {
		removeSourceSelector,
		removeSelectionModifier,
		updateSourceSelector,
		updateSelectionModifier
	} from './editor2State.svelte.js';

	/**
	 * @type {{
	 *   type: 'source-selector' | 'selection-modifier',
	 *   route: any,
	 *   entry: any,
	 *   settings: any,
	 *   parentColor: string
	 * }}
	 */
	let { type, route, entry, settings, parentColor } = $props();

	let isSourceSelector = $derived(type === 'source-selector');
	let icon = $derived(isSourceSelector ? '🔗' : '🎯');
	let title = $derived(isSourceSelector ? 'Source Selector' : 'Selection Modifier');
	let color = $derived(isSourceSelector ? '#f59e0b' : '#dc2626');

	let sourceName = $derived.by(() => {
		if (!isSourceSelector) return '';
		if (!settings?.targetSourceId) return 'No source selected';
		return settings.targetSourceName || settings.targetSourceId;
	});

	function handleRemove() {
		if (isSourceSelector) removeSourceSelector(route.id, entry.id);
		else removeSelectionModifier(route.id, entry.id);
	}

	function setMin(val) {
		const updated = { ...settings, minSelection: Math.max(1, Math.min(val, settings.maxSelection)) };
		updateSelectionModifier(route.id, entry.id, updated);
	}

	function setMax(val) {
		const updated = { ...settings, maxSelection: Math.max(settings.minSelection, val) };
		updateSelectionModifier(route.id, entry.id, updated);
	}

	let availableSources = $derived.by(() => {
		const sources = [];
		const positiveSources = Array.isArray(route.sources)
			? route.sources
			: [route.source].filter(Boolean);
		positiveSources.forEach((src, idx) => {
			let label = src?.sourceType === 'batch-user-list' ? `Batch Source ${idx + 1}` : `Song Source ${idx + 1}`;
			if (src?.sourceType !== 'batch-user-list') {
				if (src?.mode === 'masterlist') label = `Song Source ${idx + 1} · Entire Database`;
				else if (src?.mode === 'user-lists') label = `Song Source ${idx + 1} · ${src.userListImport?.username || 'User List'}`;
			}
			sources.push({ id: `source-main-${idx}`, name: label });
		});

		const negativeSources = Array.isArray(route.negativeSources)
			? route.negativeSources
			: [route.negativeSource].filter(Boolean);
		negativeSources.forEach((_, idx) => {
			sources.push({ id: `source-negative-${idx}`, name: `Negative Source ${idx + 1}` });
		});

		if (sources.length > 0) {
			sources.push({ id: 'source-main', name: sources[0].name });
		}
		if (negativeSources.length > 0) {
			sources.push({ id: 'source-negative', name: 'Negative Source 1' });
		}
		return sources;
	});

	function selectTarget(targetId) {
		const target = availableSources.find((s) => s.id === targetId);
		updateSourceSelector(route.id, entry.id, {
			...settings,
			targetSourceId: targetId,
			targetSourceName: target?.name || targetId
		});
	}
</script>

<div class="sub-node-line flex items-stretch" style="--sub-color: {color}; --parent-color: {parentColor}">
	<div class="w-6 flex justify-center shrink-0 ml-1">
		<div class="indent-line"></div>
	</div>

	<div class="sub-bar">
		<div class="sub-accent"></div>
		<span class="text-[11px] ml-1 shrink-0">{icon}</span>
		<span class="font-dm text-[11px] font-medium text-ed-fg-subtle shrink-0 whitespace-nowrap">{title}</span>

		{#if isSourceSelector}
			<select
				class="sub-select"
				value={settings?.targetSourceId || ''}
				onchange={(e) => selectTarget(e.currentTarget.value)}
			>
				<option value="" disabled>Select source...</option>
				{#each availableSources as src}
					<option value={src.id}>{src.name}</option>
				{/each}
			</select>
		{:else}
			<div class="flex items-center gap-1 flex-1">
				<span class="font-jb text-[10px] text-ed-fg-subtle">Min</span>
				<input type="number" class="mod-input" min="1" value={settings?.minSelection ?? 1} oninput={(e) => setMin(parseInt(e.currentTarget.value) || 1)} />
				<span class="font-jb text-[10px] text-ed-fg-subtle">Max</span>
				<input type="number" class="mod-input" min="1" value={settings?.maxSelection ?? 1} oninput={(e) => setMax(parseInt(e.currentTarget.value) || 1)} />
			</div>
		{/if}

		<button class="flex items-center justify-center size-5 text-[13px] bg-transparent border-none rounded-[3px] cursor-pointer mr-2 shrink-0 transition-all duration-120 text-ed-border-muted hover:text-ed-red hover:bg-ed-red/13" onclick={handleRemove}>×</button>
	</div>
</div>

<style>
	.indent-line {
		width: 1px;
		height: 100%;
		background: linear-gradient(180deg, var(--parent-color) 0%, var(--sub-color) 100%);
		opacity: 0.35;
	}

	.sub-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		height: 32px;
		background: color-mix(in srgb, var(--sub-color) 5%, #0f1117);
		border-bottom: 1px solid #1a1f27;
		transition: background 0.15s ease;
	}
	.sub-bar:hover {
		background: color-mix(in srgb, var(--sub-color) 9%, #0f1117);
	}

	.sub-accent {
		width: 3px;
		height: 100%;
		background: var(--sub-color);
		opacity: 0.6;
		flex-shrink: 0;
		border-radius: 0 1px 1px 0;
	}

	.sub-select {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: #c9d1d9;
		background: #0d1117;
		border: 1px solid #21262d;
		border-radius: 4px;
		padding: 2px 6px;
		outline: none;
		cursor: pointer;
		flex: 1;
		max-width: 200px;
	}
	.sub-select:focus { border-color: var(--sub-color); }

	.mod-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: #c9d1d9;
		background: #0d1117;
		border: 1px solid #21262d;
		border-radius: 4px;
		padding: 2px 4px;
		width: 40px;
		text-align: center;
		outline: none;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.mod-input:focus { border-color: var(--sub-color); }
	.mod-input::-webkit-inner-spin-button,
	.mod-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
