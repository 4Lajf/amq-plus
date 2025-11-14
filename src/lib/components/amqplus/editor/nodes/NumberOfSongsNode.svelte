<script>
	/**
	 * Number of Songs Node component for the AMQ+ Editor.
	 * Handles configuration of song count (static or range-based).
	 *
	 * @component
	 */

	import { Handle, Position, useEdges, useNodesData } from '@xyflow/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import DefaultSettingsModal from '../dialogs/DefaultSettingsModal.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';
	import RangeInput from '../ui/RangeInput.svelte';

	/**
	 * @typedef {import('../utils/nodeDefinitions.js').NumberOfSongsSettings} NumberOfSongsSettings
	 */

	/**
	 * Component props.
	 * @type {{ data: import('../utils/nodeDefinitions.js').NumberOfSongsNodeData }}
	 */
	let { data } = $props();

	// Local state for the song count
	/** @type {NumberOfSongsSettings} */
	let songCount = $state(
		data.currentValue || data.defaultValue || { useRange: false, staticValue: 20, min: 15, max: 25 }
	);
	let defaultSettingsOpen = $state(false);
	let readOnlyDialogOpen = $state(false);

	// Sync with prop changes
	$effect(() => {
		if (data.currentValue !== undefined) {
			// Suppress notifying parent while we sync from props
			suppressNotify = true;
			songCount = data.currentValue;
			queueMicrotask(() => (suppressNotify = false));
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

	/**
	 * Handle value change and emit event
	 * @returns {void}
	 */
	function handleValueChange() {
		// Notify parent of changes
		if (data.onValueChange) {
			data.onValueChange({
				nodeId: data.instanceId,
				newValue: songCount
			});
		}
	}

	// Prevent feedback loops when syncing props; changes are committed explicitly via onCommit
	let suppressNotify = $state(false);

	// Real-time validation
	const validationErrors = $derived(
		(() => {
			const errors = [];
			const v = songCount || {};

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

			// @ts-ignore - v is NumberOfSongsSettings
			if (v?.useRange) {
				// @ts-ignore
				const min = Number(v?.min ?? 1);
				// @ts-ignore
				const max = Number(v?.max ?? 200);
				if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 200 || min > max) {
					errors.push('Song count range must be within 1-200 and min ≤ max');
				}
			} else {
				// @ts-ignore
				const sv = Number(v?.staticValue ?? 20);
				if (!Number.isFinite(sv) || sv < 1 || sv > 200) {
					errors.push('Final song count must be within 1-200');
				}
			}

			return errors;
		})()
	);

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));
	const hasValidationWarning = $derived(data.validationWarning || false);

	// Get background color with opacity
	const nodeColor = $derived(data.color || '#dc2626');
	const nodeTitle = $derived(data.title || 'Number of Songs');
	const nodeIcon = $derived(data.icon || '🎵');
	const nodeDescription = $derived(data.description || 'Configure final song count');

	const backgroundColor = $derived(`rgba(220, 38, 38, 0.1)`);
	const borderColor = $derived(
		hasValidationError || data.validationError
			? '#ef4444'
			: hasValidationWarning || data.validationWarning
				? '#f59e0b'
				: nodeColor
	);

	// Computing Flows-style: check if any Selection Modifier targets this node type
	const edgesStore = useEdges();
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
	const isSelectionModified = $derived(
		modifierTargetsData.current.some((n) => n && n.data?.id === data.id)
	);
	const routeBadges = $derived(Array.isArray(data.routeBadges) ? data.routeBadges : []);
</script>

<div
	class="number-of-songs-node relative transition-all duration-200"
	style="background: {backgroundColor}; border: 2px solid {borderColor}; border-radius: 8px; width: 320px;"
>
	<!-- Input handle -->
	<Handle
		type="target"
		position={Position.Left}
		style="width: 12px; height: 12px; background: {nodeColor}; border: 2px solid white;"
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

		<Badge variant="destructive" class="text-xs" role="presentation" href={undefined}>FINAL</Badge>

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
	</div>

	<Card class="border-0 bg-transparent shadow-none">
		<CardHeader class="pb-3">
			<CardTitle class="flex items-center gap-2 text-lg font-semibold text-gray-800">
				<span class="text-xl">{nodeIcon}</span>
				{nodeTitle}
			</CardTitle>
			<p class="text-xs text-gray-600">{nodeDescription}</p>
		</CardHeader>

		<CardContent class="pt-0">
			<div class="space-y-3">
				{#if hasValidationError || data.validationError}
					<div class="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
						{#if hasValidationError}
							{validationMessage}
						{:else}
							{data.validationMessage}
						{/if}
					</div>
				{:else if hasValidationWarning || data.validationWarning}
					<div class="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
						{data.validationMessage}
					</div>
				{/if}
				<!-- Song count input -->
				<div>
					<RangeInput
						label="Final Song Count"
						bind:value={songCount}
						min={1}
						max={200}
						unit=" songs"
						onCommit={handleValueChange}
						locked={songCount.percentageModeLocked || false}
					/>
				</div>

				<!-- Final filter warning - full width below -->
				<div class="rounded-md border border-red-200 bg-red-50 p-2">
					<div class="text-xs text-red-700">
						<div class="mb-1 font-medium">⚠️ Final Filter</div>
						<div>
							This determines the final number of songs selected for the lobby after all filters are
							applied.
						</div>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>

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
</div>

<!-- Default Settings Modal -->
<DefaultSettingsModal bind:isOpen={defaultSettingsOpen} nodeData={data} />

<!-- Read-Only Default Settings Dialog -->
<ReadOnlyNodeDialog
	bind:open={readOnlyDialogOpen}
	nodeData={data}
	onClose={() => (readOnlyDialogOpen = false)}
/>

<style>
	.number-of-songs-node {
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
	}
</style>
