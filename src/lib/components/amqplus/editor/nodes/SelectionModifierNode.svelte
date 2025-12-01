<script>
	/**
	 * Selection Modifier Node component for the AMQ+ Editor.
	 * Handles configuration of selection range (min/max songs to select).
	 *
	 * @component
	 */

	import { Handle, Position } from '@xyflow/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import DefaultSettingsModal from '../dialogs/DefaultSettingsModal.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	/**
	 * Component props.
	 * @type {{ data: import('../utils/nodeDefinitions.js').SelectionModifierNodeData }}
	 */
	let { data } = $props();

	/** @type {import('../utils/nodeDefinitions.js').SelectionModifierNodeData['currentValue']} */
	let cfg = $state({
		minSelection: Number(data.currentValue?.minSelection ?? 1),
		maxSelection: Number(data.currentValue?.maxSelection ?? 1)
	});
	let defaultSettingsOpen = $state(false);
	let readOnlyDialogOpen = $state(false);

	$effect(() => {
		if (data.currentValue) {
			cfg = {
				minSelection: Number(data.currentValue.minSelection ?? 1),
				maxSelection: Number(data.currentValue.maxSelection ?? 1)
			};
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
	 * Emit value change event
	 * @returns {void}
	 */
	function emitChange() {
		if (data.onValueChange) {
			data.onValueChange({ nodeId: data.instanceId, newValue: { ...cfg } });
		}
	}

	/**
	 * Set minimum selection value
	 * @param {number|string} val - Minimum value
	 * @returns {void}
	 */
	function setMin(val) {
		cfg.minSelection = Math.max(0, Number(val || 0));
		if (cfg.maxSelection < cfg.minSelection) cfg.maxSelection = cfg.minSelection;
		emitChange();
	}

	/**
	 * Set maximum selection value
	 * @param {number|string} val - Maximum value
	 * @returns {void}
	 */
	function setMax(val) {
		cfg.maxSelection = Math.max(0, Number(val || 0));
		if (cfg.maxSelection < cfg.minSelection) cfg.minSelection = cfg.maxSelection;
		emitChange();
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

			// Basic range validation
			if (!Number.isFinite(cfg.minSelection) || cfg.minSelection < 0) {
				errors.push('Min selection must be ≥ 0');
			}

			if (!Number.isFinite(cfg.maxSelection) || cfg.maxSelection < 0) {
				errors.push('Max selection must be ≥ 0');
			}

			if (cfg.minSelection > cfg.maxSelection) {
				errors.push('Min selection cannot exceed max selection');
			}

			return errors;
		})()
	);

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));

	// Get node display properties
	const nodeColor = $derived(data.color || '#f59e0b');
	const nodeTitle = $derived(data.title || 'Selection Modifier');
	const nodeDescription = $derived(data.description || 'Modify selection range');
	const nodeIcon = $derived(data.icon || '🎯');
</script>

<div
	class="selection-modifier-node relative"
	style="background: rgba(245, 158, 11, 0.08); border: 2px solid {hasValidationError ||
	data.validationError
		? '#ef4444'
		: nodeColor}; border-radius: 8px; width: 260px;"
>
	<!-- Output handle only (no inputs) -->
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
		<Badge variant="secondary" class="text-xs" role="presentation" href={undefined}>Modifier</Badge>
	</div>

	<Card class="border-0 bg-transparent shadow-none">
		<CardHeader class="pb-2">
			<CardTitle class="flex items-center gap-2 text-base font-semibold text-gray-800">
				<span class="text-lg">{nodeIcon}</span>
				{nodeTitle}
			</CardTitle>
			<p class="text-xs text-gray-600">{nodeDescription}</p>
		</CardHeader>
		<CardContent class="space-y-3 pt-0">
			{#if hasValidationError || data.validationError}
				<div class="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
					{hasValidationError ? validationMessage : data.validationMessage}
				</div>
			{/if}
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label class="text-xs">Min Selection</Label>
					<Input
						class="h-8"
						type="number"
						min="0"
						max="100"
						value={cfg.minSelection}
						oninput={(e) => setMin(e.target.value)}
						placeholder="Minimum nodes to select"
						title="Minimum number of reachable nodes that will be selected from each affected type"
					/>
				</div>
				<div class="space-y-1">
					<Label class="text-xs">Max Selection</Label>
					<Input
						class="h-8"
						type="number"
						min="0"
						max="100"
						value={cfg.maxSelection}
						oninput={(e) => setMax(e.target.value)}
						placeholder="Maximum nodes to select"
						title="Maximum number of reachable nodes that will be selected from each affected type"
					/>
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
	.selection-modifier-node {
		box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);
	}
</style>
