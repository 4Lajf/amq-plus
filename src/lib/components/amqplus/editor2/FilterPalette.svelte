<script>
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { getFilterCatalog, routes, addFilter } from './editor2State.svelte.js';

	let searchQuery = $state('');
	let filterCatalog = $derived(getFilterCatalog());

	let filtered = $derived.by(() => {
		if (!searchQuery.trim()) return filterCatalog;
		const q = searchQuery.toLowerCase();
		return filterCatalog.filter(
			(f) => f.title.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q)
		);
	});

	const categoryLabels = {
		all: 'All Filters'
	};
	const flipDurationMs = 150;

	function toDndItems(catalogFilters) {
		return catalogFilters.map((f) => ({
			id: `palette-${f.id}`,
			filterId: f.id,
			title: f.title,
			icon: f.icon,
			color: f.color,
			category: f.category,
			paletteItem: true
		}));
	}

	function buildGroups() {
		return {
			all: toDndItems(filtered)
		};
	}

	let groupItems = $state(buildGroups());

	$effect(() => {
		const _ = filtered;
		groupItems = buildGroups();
	});

	function handleConsider(category, e) {
		groupItems[category] = e.detail.items;
	}

	function handleFinalize(category, e) {
		groupItems[category] = buildGroups()[category] || [];
	}

	function handleQuickAdd(filterId) {
		if (routes.length > 0) {
			addFilter(routes[0].id, filterId);
		}
	}
</script>

<div class="flex flex-col h-full">
	<div class="flex items-center justify-between px-4 pt-3.5 pb-2.5">
		<h3 class="m-0 font-dm text-[13px] font-semibold text-ed-fg">Filters</h3>
		<span class="font-jb text-[10px] text-ed-fg-subtle bg-ed-border px-[7px] py-0.5 rounded-lg">{filterCatalog.length}</span>
	</div>

	<div class="px-3 pb-2.5">
		<input
			class="w-full font-dm text-xs text-ed-fg bg-ed-canvas-default border border-ed-border rounded-sm px-2.5 py-1.5 outline-none transition-[border-color] duration-150 placeholder:text-ed-fg-subtle focus:border-ed-blue"
			type="text"
			placeholder="Search filters..."
			bind:value={searchQuery}
		/>
	</div>

	<div class="palette-list flex-1 overflow-y-auto px-2">
		{#each Object.entries(groupItems) as [category, items] (category)}
			<div class="mb-3">
				<span class="block font-jb text-[9px] font-semibold text-ed-fg-subtle uppercase tracking-[1px] px-2 pt-1 pb-1.5">{categoryLabels[category] || category}</span>

				<div
					class="min-h-1"
					use:dndzone={{
						items,
						flipDurationMs,
						type: 'filter',
						dropFromOthersDisabled: true,
						dragDisabled: false,
						dropTargetStyle: {},
						centreDraggedOnCursor: true,
						morphDisabled: true,
						transformDraggedElement: (el) => {
							el.style.zIndex = '9999';
							el.style.opacity = '1';
							el.style.outline = 'none';
							el.style.boxShadow = 'none';
						}
					}}
					onconsider={(e) => handleConsider(category, e)}
					onfinalize={(e) => handleFinalize(category, e)}
				>
					{#each items as filter (filter.id)}
						<div
							class="palette-item"
							class:is-shadow={filter[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
							style="--item-color: {filter.color}"
							animate:flip={{ duration: flipDurationMs }}
						>
							<div class="item-accent"></div>
							<span class="text-[13px] shrink-0">{filter.icon}</span>
							<div class="flex-1 min-w-0">
								<span class="block font-dm text-xs font-medium text-ed-fg truncate">{filter.title}</span>
							</div>
							<button
								class="quick-add"
								onclick={() => handleQuickAdd(filter.filterId)}
							>+</button>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		{#if filtered.length === 0}
			<div class="py-6 px-4 text-center">
				<span class="font-dm text-xs text-ed-fg-subtle">No filters match "{searchQuery}"</span>
			</div>
		{/if}
	</div>

	<div class="px-4 py-2.5 border-t border-ed-border">
		<span class="font-dm text-[11px] text-ed-fg-subtle">Drag to a route or click + to add</span>
	</div>
</div>

<style>
	.palette-list {
		scrollbar-width: thin;
		scrollbar-color: #21262d #0d1117;
	}

	.palette-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0;
		height: 34px;
		background: #161b22;
		border: 1px solid transparent;
		border-radius: 6px;
		margin-bottom: 2px;
		cursor: grab;
		transition: all 0.15s ease;
		overflow: hidden;
	}
	.palette-item.is-shadow {
		opacity: 0;
		height: 0;
		margin: 0;
		min-height: 0;
		overflow: hidden;
		border: none;
	}
	.palette-item:hover {
		background: color-mix(in srgb, var(--item-color) 8%, #161b22);
		border-color: color-mix(in srgb, var(--item-color) 25%, transparent);
	}
	.palette-item:active { cursor: grabbing; }

	.item-accent {
		width: 3px;
		height: 100%;
		background: var(--item-color);
		flex-shrink: 0;
		border-radius: 3px 0 0 3px;
	}

	.quick-add {
		width: 24px;
		height: 24px;
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
		margin-right: 6px;
		flex-shrink: 0;
		transition: all 0.12s ease;
		line-height: 1;
	}
	.quick-add:hover {
		color: var(--item-color);
		background: color-mix(in srgb, var(--item-color) 15%, transparent);
	}
</style>
