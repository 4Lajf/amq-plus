<script lang="ts">
	/**
	 * Live Node Source Node Component
	 * Displays a source node for importing anime lists from players in the room.
	 * Configured from AMQ side, shows players' lists.
	 * Shows a yellow outline when "use entire pool" mode is enabled.
	 *
	 * @component
	 */

	import { Handle, Position } from '@xyflow/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { getNodeDisplayValue } from '../utils/nodeDefinitions.js';
	import LiveNodeDialog from '../dialogs/LiveNodeDialog.svelte';

	/** @type {{id: string, data: any}} */
	let { id, data } = $props();

	// Dialog state
	let dialogOpen = $state(false);

	// Local state for current value
	let currentValue = $state(data.currentValue || data.defaultValue);

	// Sync with prop changes
	$effect(() => {
		if (data.currentValue !== undefined) {
			currentValue = data.currentValue;
		}
	});

	// Get display value for current settings
	const displayValue = $derived(
		getNodeDisplayValue({
			id,
			type: data.type,
			position: { x: 0, y: 0 },
			data: { ...data, currentValue },
			deletable: data.deletable
		})
	);

	// Determine if using entire pool (for yellow outline)
	const useEntirePool = $derived(currentValue?.useEntirePool || false);

	// Handle node click to open settings dialog
	function handleClick() {
		dialogOpen = true;
	}

	// Handle value changes from dialog (shouldn't happen for Live Node, but keep for consistency)
	function handleValueChange(newValue) {
		currentValue = newValue;

		// Notify parent of changes
		if (data.onValueChange) {
			data.onValueChange({
				nodeId: data.instanceId,
				newValue: currentValue
			});
		}
	}

	// Determine if node has any routes/connections to show badges
	const routeBadges = $derived(data?.routeBadges || []);
</script>

<div
	class="live-node relative rounded-lg border-2 bg-white p-3 shadow-md transition-all hover:shadow-lg"
	style="
		border-color: {useEntirePool ? '#fbbf24' : data.color};
		min-width: 200px;
		cursor: pointer;
	"
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}}
>
	<!-- Output Handle (right side) -->
	<Handle type="source" position={Position.Right} />

	<!-- Input Handle (left side) - Live Node nodes can be chained -->
	<Handle type="target" position={Position.Left} />

	<!-- Node Header -->
	<div class="mb-2 flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<span class="text-xl">{data.icon}</span>
			<div class="font-semibold text-gray-800">{data.title}</div>
		</div>

		{#if useEntirePool}
			<span
				class="inline-flex items-center rounded-md bg-yellow-400 px-2 py-1 text-xs font-medium text-yellow-900"
			>
				⚠️ Unfiltered
			</span>
		{/if}
	</div>

	<!-- Source Node Badge -->
	<div class="mt-2">
		<span
			class="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
		>
			Source Node
		</span>
	</div>

	<!-- Route Badges (if connected via router) -->
	{#if routeBadges.length > 0}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each routeBadges as badge}
				<span
					class="inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700"
					title={badge.name}
				>
					{badge.label}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Selection Modified Indicator -->
	{#if data.selectionModified}
		<div class="mt-2">
			<span
				class="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
			>
				🎯 Modified
			</span>
		</div>
	{/if}

	<!-- Execution Chance Indicator (if not 100%) -->
	{#if data.executionChance !== undefined && data.executionChance < 100}
		<div class="mt-2">
			<span
				class="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
			>
				{data.executionChance}% chance
			</span>
		</div>
	{/if}

	<!-- Validation Error Indicator -->
	{#if data.validationError}
		<div class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
			<div class="font-semibold">⚠️ {data.validationShortMessage || 'Error'}</div>
			{#if data.validationMessage && data.validationMessage !== data.validationShortMessage}
				<div class="mt-1">{data.validationMessage}</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Configuration Dialog -->
<LiveNodeDialog
	bind:open={dialogOpen}
	bind:value={currentValue}
	onSave={handleValueChange}
	nodeData={data}
/>

<style>
	.live-node {
		font-family: inherit;
	}

	.live-node:focus {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}
</style>
