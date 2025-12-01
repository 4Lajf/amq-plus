<script>
	/**
	 * Source Selector Node component for the AMQ+ Editor.
	 * Allows restricting a filter to only affect songs from a specific source node.
	 *
	 * @component
	 */

	import { Handle, Position, useNodesData } from '@xyflow/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import FilterNodeDialog from '../dialogs/FilterNodeDialog.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';

	/**
	 * Component props.
	 * @type {{ data: import('../utils/nodeDefinitions.js').BaseNodeData }}
	 */
	let { data } = $props();

	// Local state
	let currentValue = $state(data.currentValue || data.defaultValue);
	let dialogOpen = $state(false);
	let readOnlyDialogOpen = $state(false);

	// Sync with prop changes
	$effect(() => {
		if (data.currentValue !== undefined) {
			currentValue = data.currentValue;
		}
	});

	// Watch for openDefaultSettings flag from context menu
	$effect(() => {
		if (data.openDefaultSettings) {
			readOnlyDialogOpen = true;
			// Reset the flag
			data.openDefaultSettings = false;
		}
	});

	// Handle value changes
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

	// Handle node click to open configuration dialog
	function handleNodeClick(event) {
		event.stopPropagation();
		dialogOpen = true;
	}

	function hexToRgb(hex) {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (result) {
			const r = parseInt(result[1], 16);
			const g = parseInt(result[2], 16);
			const b = parseInt(result[3], 16);
			return `${r}, ${g}, ${b}`;
		}
		return '0, 0, 0';
	}

	// Real-time validation
	const validationErrors = $derived(
		(() => {
			const errors = [];

			// Execution chance validation
			if (data.executionChance != null) {
				if (typeof data.executionChance === 'object') {
					const min = Number(data.executionChance?.min ?? 0);
					const max = Number(data.executionChance?.max ?? 100);
					if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
						errors.push('Execution chance range must be between 0 and 100 and min ≤ max');
					}
				} else {
					const execChance = Number(data.executionChance);
					if (!Number.isFinite(execChance) || execChance < 0 || execChance > 100) {
						errors.push('Execution chance must be between 0 and 100');
					}
				}
			}

		// Source selector validation - don't show as error in validation list
		// The empty state message will be shown in the UI instead
		
		return errors;
		})()
	);

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));

	// Display value
	const displayValue = $derived(() => {
		if (!currentValue || !currentValue.targetSourceId) {
			return '';
		}
		return currentValue.targetSourceName || currentValue.targetSourceId;
	});

	const nodeColor = $derived(data.color || '#f59e0b');
	const nodeTitle = $derived(data.title || 'Source Selector');
	const nodeIcon = $derived(data.icon || '🔗');
	const backgroundColor = $derived(`rgba(${hexToRgb(nodeColor)}, 0.1)`);
	const borderColor = $derived(hasValidationError || data.validationError ? '#ef4444' : nodeColor);
</script>

<div
	class="source-selector-node relative cursor-pointer transition-all duration-200 hover:shadow-lg"
	style="background: {backgroundColor}; border: 2px solid {borderColor}; border-radius: 8px; width: 240px;"
	role="button"
	tabindex="0"
	onclick={handleNodeClick}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? handleNodeClick(e) : null)}
>
	<!-- Output handle only - connects to filter nodes' source-selector input -->
	<Handle
		type="source"
		position={Position.Right}
		style="width: 10px; height: 10px; background: {nodeColor}; border: 2px solid white;"
	/>

	<!-- Top-right badges -->
	<div class="absolute -top-2 -right-2 flex flex-col gap-1">
		{#if data.executionChance != null}
			{@const executionChance = data.executionChance}
			{@const executionChanceDisplay = formatExecutionChance(executionChance)}
			{@const executionChanceIsDefault =
				executionChance == null
					? true
					: typeof executionChance === 'object'
						? executionChance.kind !== 'range' &&
							(executionChance.min ?? 100) >= 100 &&
							(executionChance.max ?? 100) >= 100
						: Number(executionChance) >= 100}
			{#if !executionChanceIsDefault}
				<Badge
					variant="outline"
					class="border-purple-200 bg-purple-50 text-xs text-purple-700"
					role="presentation"
					href={undefined}
				>
					{executionChanceDisplay}
				</Badge>
			{/if}
		{/if}

		<!-- Route badges -->
		{#if data.routeBadges && Array.isArray(data.routeBadges) && data.routeBadges.length > 0}
			{#each data.routeBadges as routeBadge}
				{#if routeBadge && typeof routeBadge === 'object' && 'name' in routeBadge}
					<Badge variant="outline" class="text-xs" role="presentation" href={undefined}>
						{routeBadge.name || routeBadge.label}
					</Badge>
				{/if}
			{/each}
		{/if}
	</div>

	<div class="p-3">
		<!-- Header with icon and title -->
		<div class="mb-2 flex items-center gap-2">
			<span class="text-lg">{nodeIcon}</span>
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold text-gray-800">{nodeTitle}</div>
			</div>
			<span class="text-xs text-gray-500">⚙️</span>
		</div>

		<!-- Value display -->
		{#if displayValue()}
			<div class="rounded border border-gray-200 bg-white/50 p-2">
				<div class="text-xs font-medium text-gray-800">
					{displayValue()}
				</div>
			</div>
		{:else}
			<div class="rounded border border-gray-200 bg-white/50 p-2">
				<div class="text-xs font-medium text-gray-500 italic">
					No source selected
				</div>
			</div>
		{/if}

		{#if hasValidationError || data.validationError}
			<div class="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
				{#if hasValidationError}
					{#each validationErrors as error, i}
						<div class:mt-1={i > 0}>{error}</div>
					{/each}
				{:else if dialogOpen}
					{data.validationMessage}
				{:else}
					{data.validationShortMessage}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Configuration Dialog -->
{#if dialogOpen}
	<FilterNodeDialog
		bind:open={dialogOpen}
		nodeData={{ ...data, formType: data.formType || 'complex-source-selector' }}
		bind:value={currentValue}
		onSave={handleValueChange}
	/>
{/if}

<!-- Read-only Dialog (for viewing default settings) -->
{#if readOnlyDialogOpen}
	<ReadOnlyNodeDialog
		bind:open={readOnlyDialogOpen}
		nodeData={{ ...data, formType: data.formType || 'complex-source-selector' }}
		onClose={() => (readOnlyDialogOpen = false)}
	/>
{/if}
