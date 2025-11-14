<script lang="ts">
	/**
	 * Filter Node component for the AMQ+ Editor.
	 * Handles various filter types like songs, vintage, difficulty, etc.
	 *
	 * @component
	 */

	import { Handle, Position, useEdges, useNodesData } from '@xyflow/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { getNodeDisplayValue } from '../utils/nodeDefinitions.js';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import FilterNodeDialog from '../dialogs/FilterNodeDialog.svelte';
	import DefaultSettingsModal from '../dialogs/DefaultSettingsModal.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';
	import { FilterRegistry } from '../utils/filters/index.js';

	/**
	 * @typedef {import('../utils/nodeDefinitions.js').NodeInstance} NodeInstance
	 */

	/**
	 * Component props.
	 * @type {{ data: import('../utils/nodeDefinitions.js').FilterNodeData }}
	 */
	let { data } = $props();

	// Local state
	/** @type {NodeInstance['data']['currentValue']} */
	let currentValue = $state(data.currentValue || data.defaultValue);
	let dialogOpen = $state(false);
	let defaultSettingsOpen = $state(false);
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
		console.log('🔧 FilterNode handleValueChange called with:', newValue);
		currentValue = newValue;

		// Notify parent of changes
		if (data.onValueChange) {
			console.log('🔧 FilterNode calling parent onValueChange with:', {
				nodeId: data.instanceId,
				newValue: currentValue
			});
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

	// Handle delete
	function handleDelete(event) {
		event.stopPropagation();
		if (data.onDelete) {
			data.onDelete(data.instanceId);
		}
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

	// Compute inherited total songs from Number of Songs node for use in validation
	const edgesStore = useEdges();
	const allNodeIds = $derived(
		Array.from(
			new Set([
				...edgesStore.current.map((e) => e.source),
				...edgesStore.current.map((e) => e.target),
				data.instanceId
			])
		)
	);
	const allNodesData = $derived(useNodesData(allNodeIds));
	const routeBadges = $derived(Array.isArray(data.routeBadges) ? data.routeBadges : []);
	let inheritedTotalSongs = $state(20); // Default to 20 songs

	// Check if source selector is connected
	const sourceSelectorConnected = $derived(
		edgesStore.current.some(
			(edge) => edge.target === data.instanceId && edge.targetHandle === 'source-selector'
		)
	);

	$effect(() => {
		const list = allNodesData.current || [];
		const candidates = list.filter((n) => n && n.type === 'numberOfSongs');

		// If no Number of Songs nodes found, use default of 20
		if (candidates.length === 0) {
			inheritedTotalSongs = 20;
			return;
		}

		// Find the appropriate Number of Songs node
		let chosenNode = null;

		// If current node has route badges, try to find a matching Number of Songs node
		if (routeBadges.length > 0) {
			for (const routeBadge of routeBadges) {
				const routeSpecificNode = candidates.find(
					(n) =>
						n.data.routeBadges &&
						Array.isArray(n.data.routeBadges) &&
						n.data.routeBadges.some(
							(rb) =>
								rb && typeof rb === 'object' && 'routeId' in rb && rb.routeId === routeBadge.routeId
						)
				);
				if (routeSpecificNode) {
					chosenNode = routeSpecificNode;
					break;
				}
			}
		}

		// Fallback to highest execution chance if no route-specific node found
		if (!chosenNode) {
			chosenNode = candidates.reduce((a, b) => {
				const chanceA = Number(a?.data?.executionChance ?? 100);
				const chanceB = Number(b?.data?.executionChance ?? 100);
				return chanceA >= chanceB ? a : b;
			});
		}

		// Extract the value from the chosen node
		const nodeValue = chosenNode?.data?.currentValue || chosenNode?.data?.defaultValue;
		if (!nodeValue) {
			inheritedTotalSongs = 20;
			return;
		}

		// Handle range vs static value
		if (nodeValue.useRange) {
			//@ts-ignore
			inheritedTotalSongs = {
				min: Number(nodeValue.min ?? 1),
				max: Number(nodeValue.max ?? 200)
			};
		} else {
			inheritedTotalSongs = Number(nodeValue.staticValue ?? nodeValue.value ?? 20);
		}
	});

	// Real-time validation based on filter type
	const validationErrors = $derived(
		(() => {
			const errors = [];
			const v = currentValue || {};

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

			// Use filter registry for filter-specific validation
			const filter = FilterRegistry.get(data.id);
			if (filter && filter.validate) {
				const context = {
					inheritedSongCount: inheritedTotalSongs,
					mode: v.mode,
					executionChance: data.executionChance
				};
				const result = filter.validate(v, context);
				if (result && result.errors) {
					errors.push(...result.errors);
				}
			}
			// Note: All filters are now migrated to registry, no fallback needed

			return errors;
		})()
	);

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));
	const hasValidationWarning = $derived(data.validationWarning || false);

	// Reactive "Computing Flows" style: is this node type affected by any Selection Modifier?
	const modifierSourceIds = $derived(Array.from(new Set(edgesStore.current.map((e) => e.source))));
	const modifierSourcesData = $derived(useNodesData(modifierSourceIds));
	const modifierEdges = $derived(
		edgesStore.current.filter((e) =>
			modifierSourcesData.current.some(
				(n) => n && n.id === e.source && n.type === 'selectionModifier'
			)
		)
	);
	const modifierTargets = $derived(Array.from(new Set(modifierEdges.map((e) => e.target))));
	const modifierTargetsData = $derived(useNodesData(modifierTargets));
	// Use the selectionModified flag from the main logic instead of local computation
	const isSelectionModified = $derived(data.selectionModified || false);

	// Get display value for the node
	const displayValue = $derived(
		getNodeDisplayValue(
			{
				id: data.instanceId,
				type: data.type,
				position: { x: 0, y: 0 },
				deletable: data.deletable,
				data: { ...data, currentValue }
			},
			inheritedTotalSongs
		)
	);

	const nodeColor = $derived(data.color || '#000000');
	const nodeTitle = $derived(data.title || data.id || 'Filter');
	const nodeIcon = $derived(data.icon || '🎛️');

	// Get background color with opacity
	const backgroundColor = $derived(`rgba(${hexToRgb(nodeColor)}, 0.1)`);
	const borderColor = $derived(
		hasValidationError || data.validationError
			? '#ef4444'
			: hasValidationWarning || data.validationWarning
				? '#f59e0b'
				: nodeColor
	);
</script>

<div
	class="filter-node relative cursor-pointer transition-all duration-200 hover:shadow-lg"
	style="background: {backgroundColor}; border: 2px solid {borderColor}; border-radius: 8px; width: 240px;"
	role="button"
	tabindex="0"
	onclick={handleNodeClick}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? handleNodeClick(e) : null)}
>
	<!-- Source Selector input handle (secondary, positioned at top center) -->
	<Handle
		id="source-selector"
		type="target"
		position={Position.Top}
		style="width: 10px; height: 10px; background: #ef4444; border: 2px solid white;"
	/>

	<!-- Main input handle -->
	<Handle
		id="main"
		type="target"
		position={Position.Left}
		style="width: 10px; height: 10px; background: {data.color}; border: 2px solid white;"
	/>

	<!-- Output handle -->
	<Handle
		type="source"
		position={Position.Right}
		style="width: 10px; height: 10px; background: {data.color}; border: 2px solid white;"
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

		{#if isSelectionModified}
			<Badge
				variant="outline"
				class="border-amber-200 bg-amber-50 text-xs text-amber-700"
				role="presentation"
				href={undefined}
			>
				🎯 Modified
			</Badge>
		{/if}

		{#each routeBadges as badge}
			<Badge
				variant="outline"
				class="border-indigo-200 bg-indigo-50 text-xs text-indigo-700"
				title={`Route: ${badge.name}`}
				role="presentation"
				href={undefined}
			>
				{badge.label}
			</Badge>
		{/each}

		{#if data.deletable}
			<Button
				variant="ghost"
				size="sm"
				class="h-6 w-6 rounded-full bg-red-500 p-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
				onclick={handleDelete}
				disabled={false}
			>
				×
			</Button>
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
		<div class="rounded border border-gray-200 bg-white/50 p-2">
			<div class="text-xs font-medium text-gray-800">
				{displayValue}
			</div>
		</div>

		{#if data.id === 'songs-and-types' && inheritedTotalSongs !== undefined}
			<div class="mt-1 text-[11px] text-gray-600">
				Total songs: {typeof inheritedTotalSongs === 'object'
					? //@ts-ignore
						`${inheritedTotalSongs.min}\u2013${inheritedTotalSongs.max}`
					: inheritedTotalSongs}
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
		{:else if hasValidationWarning || data.validationWarning}
			<div class="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
				{#if dialogOpen}
					{data.validationMessage}
				{:else}
					{data.validationShortMessage}
				{/if}
			</div>
		{/if}

		<!-- Quick status indicators based on node type -->
		<div class="mt-2 flex flex-wrap gap-1">
			{#if sourceSelectorConnected}
				<Badge
					variant="outline"
					class="text-xs"
					style="border-color: #f59e0b; color: #f59e0b;"
					role="presentation"
					href={undefined}
				>
					🔗 Scoped
				</Badge>
			{/if}
			{#if data.id === 'songs-and-types'}
				{#if currentValue.openings}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>OP</Badge>
				{/if}
				{#if currentValue.endings}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>ED</Badge>
				{/if}
				{#if currentValue.inserts}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>IN</Badge>
				{/if}
			{:else if data.id === 'vintage'}
				{#if currentValue.ranges && currentValue.ranges.length > 0}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>
						{currentValue.ranges.length} range{currentValue.ranges.length > 1 ? 's' : ''}
					</Badge>
				{/if}
			{:else if ['player-score', 'anime-score'].includes(data.id)}
				<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>
					{currentValue.mode || 'range'}
				</Badge>
			{:else if data.id === 'song-categories'}
				{#if currentValue.included && currentValue.included.length > 0}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>
						+{currentValue.included.length}
					</Badge>
				{/if}
				{#if currentValue.excluded && currentValue.excluded.length > 0}
					<Badge variant="destructive" class="text-xs" role="presentation" href={undefined}>
						-{currentValue.excluded.length}
					</Badge>
				{/if}
			{:else if data.id === 'genres' || data.id === 'tags'}
				{#if currentValue.included && currentValue.included.length > 0}
					<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>
						+{currentValue.included.length}
					</Badge>
				{/if}
				{#if currentValue.excluded && currentValue.excluded.length > 0}
					<Badge variant="destructive" class="text-xs" role="presentation" href={undefined}>
						-{currentValue.excluded.length}
					</Badge>
				{/if}
			{/if}
		</div>
	</div>
</div>

{#if hasValidationError || data.validationError}
	<div
		class="absolute -bottom-2 left-2 rounded bg-red-500 px-2 py-0.5 text-[10px] text-white shadow"
	>
		Error: {hasValidationError ? validationErrors[0] : data.validationShortMessage}
	</div>
{:else if hasValidationWarning || data.validationWarning}
	<div
		class="absolute -bottom-2 left-2 rounded bg-amber-500 px-2 py-0.5 text-[10px] text-white shadow"
	>
		Warning: {data.validationShortMessage}
	</div>
{/if}

<!-- Configuration Dialog -->
<FilterNodeDialog
	bind:open={dialogOpen}
	nodeData={{ ...data, formType: data.formType || 'simple', totalSongs: inheritedTotalSongs }}
	bind:value={currentValue}
	onSave={handleValueChange}
/>

<!-- Default Settings Modal -->
<DefaultSettingsModal bind:isOpen={defaultSettingsOpen} nodeData={data} />

<!-- Read-Only Default Settings Dialog -->
<ReadOnlyNodeDialog
	bind:open={readOnlyDialogOpen}
	nodeData={{ ...data, formType: data.formType || 'simple', totalSongs: inheritedTotalSongs }}
	onClose={() => (readOnlyDialogOpen = false)}
/>

<style>
	.filter-node {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.filter-node:hover {
		transform: translateY(-1px);
	}

	.filter-node:hover .absolute {
		opacity: 1;
	}
</style>
