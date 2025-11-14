<script>
	import { Button } from '$lib/components/ui/button/index.js';
	let {
		id,
		top,
		left,
		right,
		bottom,
		onclick,
		onDuplicate,
		onDelete,
		onRemoveEdges,
		onSetChance,
		onSetEdgeType,
		onViewDefaults,
		label
	} = $props();

	let menuElement;

	// Handle click outside to close menu
	function handleClickOutside(event) {
		if (menuElement && !menuElement.contains(event.target)) {
			onclick();
		}
	}

	// Add click outside listener when menu is mounted
	$effect(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div
	bind:this={menuElement}
	style="top: {top}px; left: {left}px; right: {right}px; bottom: {bottom}px;"
	class="absolute z-10 inline-flex flex-col rounded border bg-white shadow"
	role="menu"
	tabindex="0"
	aria-label="Context menu"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') onclick();
	}}
>
	{#if onDuplicate}
		<Button variant="ghost" class="text-left" disabled={false} onclick={onDuplicate}>
			Duplicate
		</Button>
	{/if}
	{#if onSetChance}
		<Button
			variant="ghost"
			class="text-left text-purple-600"
			disabled={false}
			onclick={onSetChance}
		>
			Set Execution Chance
		</Button>
	{/if}
	{#if onViewDefaults}
		<Button
			variant="ghost"
			class="text-left text-blue-600"
			disabled={false}
			onclick={onViewDefaults}
		>
			View Default Settings
		</Button>
	{/if}
	{#if onRemoveEdges}
		<Button
			variant="ghost"
			class="text-left text-orange-600"
			disabled={false}
			onclick={onRemoveEdges}
		>
			Remove All Edges
		</Button>
	{/if}
	{#if onSetEdgeType && label === 'edge'}
		<div class="border-t px-3 py-1">
			<span class="text-xs font-medium text-gray-500">Edge Type:</span>
			<div class="mt-1 flex flex-col gap-1">
				<Button
					variant="ghost"
					size="sm"
					class="text-left"
					disabled={false}
					onclick={() => onSetEdgeType('default')}
				>
					Bezier
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-left"
					disabled={false}
					onclick={() => onSetEdgeType('straight')}
				>
					Straight
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-left"
					disabled={false}
					onclick={() => onSetEdgeType('step')}
				>
					Step
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-left"
					disabled={false}
					onclick={() => onSetEdgeType('smoothstep')}
				>
					Smooth Step
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-left text-orange-600"
					disabled={false}
					onclick={() => onSetEdgeType(null)}
				>
					Use Global
				</Button>
			</div>
		</div>
	{/if}
	<Button variant="ghost" class="text-left text-red-600" disabled={false} onclick={onDelete}>
		Delete
	</Button>
	<div class="h-1"></div>
</div>
