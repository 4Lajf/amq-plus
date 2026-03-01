<script>
	import { dragHandle } from 'svelte-dnd-action';
	import ComplexFormFields from '../dialog/ComplexFormFields.svelte';
	import SubNodeLine from './SubNodeLine.svelte';
	import {
		removeFilter,
		toggleFilter,
		updateFilterSettings,
		addSourceSelector,
		addSelectionModifier,
		getExpandedFilterId,
		setExpandedFilter,
		getFilterMeta,
		getFilterDisplayText
	} from './editor2State.svelte.js';

	let { route, entry, index } = $props();

	let meta = $derived(getFilterMeta(entry.filterId));
	let inheritedSongCount = $derived(
		route.numberOfSongs.useRange
			? { kind: 'range', min: route.numberOfSongs.min, max: route.numberOfSongs.max }
			: (route.numberOfSongs.staticValue ?? 20)
	);
	let displayText = $derived(
		getFilterDisplayText(entry.filterId, entry.settings, { inheritedSongCount })
	);
	let isExpanded = $derived(getExpandedFilterId() === entry.id);
	let showAddMenu = $state(false);

	let editedValue = $state(null);
	let isValid = $state(true);
	let validationMessage = $state('');

	$effect(() => {
		if (isExpanded) {
			editedValue = JSON.parse(JSON.stringify(entry.settings));
		}
	});

	function saveSettings() {
		if (editedValue && isValid) {
			updateFilterSettings(route.id, entry.id, editedValue);
			setExpandedFilter(null);
		}
	}

	function cancelEdit() {
		setExpandedFilter(null);
	}

	function handleAddSubNode(type) {
		if (type === 'source-selector') addSourceSelector(route.id, entry.id);
		else if (type === 'selection-modifier') addSelectionModifier(route.id, entry.id);
		showAddMenu = false;
	}

	let addMenuRef = $state(null);

	$effect(() => {
		if (!showAddMenu) return;
		function onWindowClick(e) {
			if (addMenuRef && !addMenuRef.contains(e.target)) {
				showAddMenu = false;
			}
		}
		window.addEventListener('click', onWindowClick, true);
		return () => window.removeEventListener('click', onWindowClick, true);
	});

	let formConfig = $derived({
		type: meta.formType,
		nodeId: entry.filterId,
		title: meta.title
	});

	function gridReveal(node, { duration = 260 } = {}) {
		return {
			duration,
			easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
			css: (t) => `display:grid;grid-template-rows:${t}fr;overflow:hidden`
		};
	}

	function getTotalSongs() {
		const nos = route.numberOfSongs;
		if (nos?.useRange) return { min: nos.min, max: nos.max };
		return nos?.staticValue ?? 20;
	}
</script>

<div
	class="filter-line-wrapper border-ed-border-faint relative border-b {!entry.enabled
		? 'opacity-40'
		: ''}"
	style="--accent: {meta.color}"
>
	<!-- Main bar -->
	<div class="filter-bar" role="button" tabindex="0">
		<div class="filter-accent"></div>

		<span
			class="drag-handle"
			use:dragHandle
			aria-label="drag handle"
			onpointerdown={() => {
				if (isExpanded) setExpandedFilter(null);
			}}>⠿</span
		>

		<span class="shrink-0 text-[13px]">{meta.icon}</span>
		<span class="font-dm text-ed-fg mx-2 ml-1.5 shrink-0 text-xs font-semibold whitespace-nowrap"
			>{meta.title}</span
		>

		<button class="filter-summary" onclick={() => setExpandedFilter(entry.id)}>
			{displayText}
		</button>

		<div class="mr-2.5 flex shrink-0 items-center gap-1">
			{#if entry.executionChance < 100}
				<span
					class="font-jb rounded-[3px] border border-amber-500/27 bg-amber-500/9 px-[5px] py-px text-[9px] font-semibold text-amber-500"
					>{entry.executionChance}%</span
				>
			{/if}

			<div class="relative" bind:this={addMenuRef}>
				<button
					class="add-sub-btn"
					onclick={(e) => {
						e.stopPropagation();
						showAddMenu = !showAddMenu;
					}}>+</button
				>
				{#if showAddMenu}
					<div class="add-sub-menu">
						{#if !entry.sourceSelector}
							<button class="sub-menu-item" onclick={() => handleAddSubNode('source-selector')}>
								<span class="text-[13px]">🔗</span>
								Source Selector
							</button>
						{/if}
						{#if !entry.selectionModifier}
							<button class="sub-menu-item" onclick={() => handleAddSubNode('selection-modifier')}>
								<span class="text-[13px]">🎯</span>
								Selection Modifier
							</button>
						{/if}
						{#if entry.sourceSelector && entry.selectionModifier}
							<span class="font-dm text-ed-fg-subtle block px-2.5 py-1.5 text-[11px] italic"
								>All attached</span
							>
						{/if}
					</div>
				{/if}
			</div>

			<button
				class="toggle-btn"
				class:off={!entry.enabled}
				aria-label={entry.enabled ? 'Disable filter' : 'Enable filter'}
				onclick={(e) => {
					e.stopPropagation();
					toggleFilter(route.id, entry.id);
				}}
			>
				<span class="toggle-dot" class:active={entry.enabled}></span>
			</button>

			<button
				class="text-ed-fg-muted hover:bg-ed-red/8 hover:text-ed-red/75 flex size-[22px] cursor-pointer items-center justify-center rounded-[4px] border-none bg-transparent text-[15px] leading-none transition-all duration-120"
				onclick={(e) => {
					e.stopPropagation();
					removeFilter(route.id, entry.id);
				}}>×</button
			>
		</div>
	</div>

	<!-- Expanded inline config -->
	{#if isExpanded}
		<div transition:gridReveal>
			<div class="filter-expanded">
				<div class="expanded-form">
					{#if editedValue}
						<ComplexFormFields
							config={formConfig}
							bind:editedValue
							bind:isValid
							bind:validationMessage
							getNodeColor={() => meta.color}
							{getTotalSongs}
						/>
					{/if}
				</div>
				<div
					class="border-ed-border bg-ed-canvas-subtle/60 flex items-center justify-between border-t px-5 py-2.5"
				>
					{#if validationMessage}
						<span class="font-dm text-[11px] {!isValid ? 'text-ed-red' : 'text-ed-fg-subtle'}"
							>{validationMessage}</span
						>
					{/if}
					<div class="ml-auto flex gap-2">
						<button
							class="font-dm text-ed-fg-subtle bg-ed-border border-ed-border-muted hover:bg-ed-border-muted hover:text-ed-fg cursor-pointer rounded-sm border px-3.5 py-[5px] text-xs font-medium transition-all duration-150"
							onclick={cancelEdit}>Cancel</button
						>
						<button
							class="font-dm cursor-pointer rounded-sm border-none px-4 py-[5px] text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!isValid}
							onclick={saveSettings}
							style="background: color-mix(in srgb, {meta.color} 70%, #161b22)">Save</button
						>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if entry.sourceSelector}
		<SubNodeLine
			type="source-selector"
			{route}
			{entry}
			settings={entry.sourceSelector}
			parentColor={meta.color}
		/>
	{/if}
	{#if entry.selectionModifier}
		<SubNodeLine
			type="selection-modifier"
			{route}
			{entry}
			settings={entry.selectionModifier}
			parentColor={meta.color}
		/>
	{/if}
</div>

<style>
	/* Bar uses color-mix with --accent */
	.filter-bar {
		display: flex;
		align-items: center;
		gap: 0;
		height: 38px;
		background: color-mix(in srgb, var(--accent) 4%, #161b22);
		transition: background 0.15s ease;
	}
	.filter-bar:hover {
		background: color-mix(in srgb, var(--accent) 9%, #161b22);
	}

	.filter-accent {
		width: 4px;
		height: 100%;
		background: var(--accent);
		flex-shrink: 0;
		border-radius: 0 2px 2px 0;
	}

	.drag-handle {
		font-size: 14px;
		color: #6e7681;
		padding: 0 6px 0 8px;
		cursor: grab;
		user-select: none;
		transition: color 0.15s ease;
	}
	.filter-bar:hover .drag-handle {
		color: #8b949e;
	}

	.filter-summary {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: #8b949e;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 4px 6px;
		border-radius: 3px;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.filter-summary:hover {
		background: color-mix(in srgb, var(--accent) 12%, #161b22);
		color: #c9d1d9;
	}

	.add-sub-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 15px;
		font-weight: 300;
		color: #6e7681;
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
		line-height: 1;
	}
	.add-sub-btn:hover {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	.add-sub-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: #1c2128;
		border: 1px solid #30363d;
		border-radius: 8px;
		padding: 4px;
		z-index: 100;
		min-width: 180px;
		box-shadow: 0 8px 24px #00000066;
		animation: menuIn 0.12s ease-out;
	}
	@keyframes menuIn {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.sub-menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 12px;
		color: #c9d1d9;
		background: none;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		transition: background 0.12s ease;
	}
	.sub-menu-item:hover {
		background: #21262d;
	}

	.toggle-btn {
		width: 22px;
		height: 14px;
		border-radius: 7px;
		background: #30363d;
		border: none;
		cursor: pointer;
		position: relative;
		padding: 0;
		transition: background 0.15s ease;
	}
	.toggle-btn.off {
		background: #21262d;
	}

	.toggle-dot {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #6e7681;
		transition: all 0.15s ease;
	}
	.toggle-dot.active {
		left: 10px;
		background: #3fb950;
	}

	/* Expanded form — transition:gridReveal handles open & close */
	.filter-expanded {
		min-height: 0; /* required for 0fr to collapse fully */
		background: #0d1117;
		border-top: 1px solid color-mix(in srgb, var(--accent) 20%, #21262d);
	}

	.expanded-form {
		padding: 16px 20px;
		max-height: 50vh;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #30363d #0d1117;
	}
</style>
