<script>
	import { flip } from 'svelte/animate';
	import { dragHandleZone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import SourceLine from './SourceLine.svelte';
	import FilterLine from './FilterLine.svelte';
	import {
		addSource,
		addNegativeSource,
		createFilterEntry,
		setRouteFilters
	} from './editor2State.svelte.js';

	let { route } = $props();

	const flipDurationMs = 180;

	function handleConsider(e) {
		setRouteFilters(route.id, e.detail.items);
	}

	function handleFinalize(e) {
		const items = e.detail.items.map((item) => {
			if (item.paletteItem) {
				return createFilterEntry(item.filterId) ?? item;
			}
			return item;
		});
		setRouteFilters(route.id, items);
	}
</script>

<div class="relative flex flex-col">
	{#each Array.isArray(route.sources) ? route.sources : [route.source].filter(Boolean) as _src, idx (idx)}
		<SourceLine {route} isNegative={false} sourceIndex={idx} />
	{/each}
	<div class="grid grid-cols-2">
		<button class="add-source-btn" onclick={() => addSource(route.id, 'song-list')}>
			<span class="text-[11px] opacity-50">📋</span>
			<span class="font-dm text-ed-fg-subtle text-[11px] italic">Add Song Source</span>
		</button>
		<button
			class="add-source-btn border-ed-border border-l"
			onclick={() => addSource(route.id, 'batch-user-list')}
		>
			<span class="text-[11px] opacity-50">👥</span>
			<span class="font-dm text-ed-fg-subtle text-[11px] italic">Add Batch User Source</span>
		</button>
	</div>

	{#each Array.isArray(route.negativeSources) ? route.negativeSources : [route.negativeSource].filter(Boolean) as _neg, idx (idx)}
		<SourceLine {route} isNegative={true} sourceIndex={idx} />
	{/each}
	<button class="add-negative-btn" onclick={() => addNegativeSource(route.id)}>
		<span class="text-[11px] opacity-50">🚫</span>
		<span class="font-dm text-ed-fg-subtle text-[11px] italic">Add Negative Source</span>
	</button>

	<div
		class="dnd-filter-zone"
		use:dragHandleZone={{
			items: route.filters,
			flipDurationMs,
			type: 'filter',
			dropTargetStyle: {},
			dropTargetClasses: ['dnd-drop-active'],
			centreDraggedOnCursor: false,
			morphDisabled: false,
			transformDraggedElement: (el) => {
				el.style.zIndex = '999';
				el.style.opacity = '1';
				el.style.outline = 'none';
				el.style.boxShadow = 'none';
			}
		}}
		onconsider={handleConsider}
		onfinalize={handleFinalize}
	>
		{#each route.filters as entry (entry.id)}
			<div
				class="relative"
				class:dnd-shadow={entry[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
				animate:flip={{ duration: flipDurationMs }}
			>
				{#if entry.paletteItem}
					<div class="palette-placeholder" style="--accent: {entry.color}">
						<span class="text-[13px]">{entry.icon}</span>
						<span class="font-dm text-ed-fg text-xs font-semibold">{entry.title}</span>
					</div>
				{:else}
					<FilterLine {route} {entry} index={route.filters.indexOf(entry)} />
				{/if}
			</div>
		{/each}
	</div>

	<div class="drag-hint">↑ Drag filters above this line from menu on the right</div>
</div>

<style>
	.add-negative-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 28px;
		padding: 0 16px;
		background: #f9731608;
		border: none;
		border-bottom: 1px solid #21262d;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.add-source-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 28px;
		padding: 0 16px;
		background: #3b82f608;
		border: none;
		border-bottom: 1px solid #21262d;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.add-source-btn:hover {
		background: #3b82f615;
	}
	.add-source-btn:hover :global(.italic) {
		color: #3b82f6;
	}
	.add-negative-btn:hover {
		background: #f9731615;
	}
	.add-negative-btn:hover :global(.italic) {
		color: #f97316;
	}

	/* DnD zone */
	.dnd-filter-zone {
		min-height: 8px;
		transition: background 0.2s ease;
		position: relative;
	}
	:global(.dnd-drop-active) {
		outline: none !important;
		background: rgba(88, 166, 255, 0.05) !important;
	}

	.drag-hint {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		border: 1px dashed #30363d;
		border-radius: 4px;
		margin: 4px 0 2px;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 12px;
		color: #6e7681;
		pointer-events: none;
		transition:
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.dnd-shadow {
		opacity: 0.2;
		background: rgba(255, 255, 255, 0.03);
	}

	.palette-placeholder {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 12px;
		background: color-mix(in srgb, var(--accent) 8%, #161b22);
		border-left: 4px solid var(--accent);
		border-bottom: 1px solid #1a1f27;
	}
</style>
