<script>
	/**
	 * Router Node component for the AMQ+ Editor.
	 * Handles route configuration and percentage distribution for node routing.
	 *
	 * @component
	 */

	import { Handle, Position } from '@xyflow/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import DefaultSettingsModal from '../dialogs/DefaultSettingsModal.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';
	import { Trash2, Plus } from 'lucide-svelte';

	/**
	 * @typedef {import('../utils/nodeDefinitions.js').RouterSettings} RouterSettings
	 */

	/**
	 * Route configuration for router node.
	 * @typedef {Object} Route
	 * @property {string} id - Unique route identifier
	 * @property {string} name - Route display name
	 * @property {number} percentage - Route percentage (0-100)
	 * @property {boolean} enabled - Whether route is active
	 */

	/**
	 * Component props.
	 * @type {{ data: import('../utils/nodeDefinitions.js').RouterNodeData }}
	 */
	let { data } = $props();

	// Local state for routes configuration
	let routes = $state(
		data.currentValue?.routes || [
			{ id: 'route-1', name: 'Route 1', percentage: 100, enabled: true }
		]
	);
	let isExpanded = $state(true);
	let defaultSettingsOpen = $state(false);
	let readOnlyDialogOpen = $state(false);

	// Sync with prop changes
	$effect(() => {
		if (data.currentValue?.routes) {
			routes = [...data.currentValue.routes];
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
	 * Update routes and emit change event
	 * @returns {void}
	 */
	function updateRoutes() {
		const newValue = {
			...data.currentValue,
			routes: [...routes]
		};

		// Notify parent of changes
		if (data.onValueChange) {
			data.onValueChange({
				nodeId: data.instanceId,
				newValue: newValue
			});
		}
	}

	/**
	 * Add a new route
	 * @returns {void}
	 */
	function addRoute() {
		const routeId = `route-${routes.length + 1}`;
		routes.push({
			id: routeId,
			name: `Route ${routes.length + 1}`,
			percentage: 0,
			enabled: true
		});
		balancePercentages();
		updateRoutes();
	}

	/**
	 * Remove a route by index
	 * @param {number} index - Index of route to remove
	 * @returns {void}
	 */
	function removeRoute(index) {
		if (routes.length > 1) {
			routes.splice(index, 1);
			balancePercentages();
			updateRoutes();
		}
	}

	// Balance percentages to total 100%
	/**
	 * Balance percentages across all routes
	 * @returns {void}
	 */
	function balancePercentages() {
		const enabledRoutes = routes.filter((r) => r.enabled);
		if (enabledRoutes.length === 0) return;

		const equalPercentage = Math.floor(100 / enabledRoutes.length);
		const remainder = 100 - equalPercentage * enabledRoutes.length;

		enabledRoutes.forEach((route, index) => {
			route.percentage = equalPercentage + (index < remainder ? 1 : 0);
		});

		// Set disabled routes to 0%
		routes.forEach((route) => {
			if (!route.enabled) {
				route.percentage = 0;
			}
		});
	}

	// Handle percentage change
	/**
	 * Handle percentage change for a route
	 * @param {number} index - Index of the route
	 * @param {number} newPercentage - New percentage value
	 * @returns {void}
	 */
	function handlePercentageChange(index, newPercentage) {
		const percentage = Math.max(0, Math.min(100, parseInt(String(newPercentage)) || 0));
		routes[index].percentage = percentage;

		// Auto-adjust other percentages to maintain 100% total
		const otherRoutes = routes.filter((_, i) => i !== index && routes[i].enabled);
		const remainingPercentage = Math.max(0, 100 - percentage);

		if (otherRoutes.length > 0 && remainingPercentage >= 0) {
			const perOther = Math.floor(remainingPercentage / otherRoutes.length);
			const remainder = remainingPercentage - perOther * otherRoutes.length;

			let remainderIndex = 0;
			routes.forEach((route, i) => {
				if (i !== index && route.enabled) {
					route.percentage = perOther + (remainderIndex < remainder ? 1 : 0);
					remainderIndex++;
				}
			});
		}

		updateRoutes();
	}

	// Handle route enabled/disabled
	/**
	 * Handle route toggle (enable/disable)
	 * @param {number} index - Index of the route
	 * @returns {void}
	 */
	function handleRouteToggle(index) {
		routes[index].enabled = !routes[index].enabled;
		balancePercentages();
		updateRoutes();
	}

	// Handle route name change
	/**
	 * Handle route name change
	 * @param {number} index - Index of the route
	 * @param {string} newName - New route name
	 * @returns {void}
	 */
	function handleNameChange(index, newName) {
		routes[index].name = newName;
		updateRoutes();
	}

	/**
	 * Toggle expanded state
	 * @returns {void}
	 */
	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	// Calculate total percentage
	const totalPercentage = $derived(
		routes.filter((r) => r.enabled).reduce((sum, route) => sum + route.percentage, 0)
	);

	// Real-time validation
	const validationErrors = $derived(
		(() => {
			const errors = [];
			const enabled = routes.filter((r) => r.enabled);

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

			// Error: no enabled routes
			if (enabled.length === 0) {
				errors.push('No enabled routes');
			}

			// Error: enabled routes do not sum to exactly 100%
			if (enabled.length > 0 && totalPercentage !== 100) {
				errors.push(`Routes total ${totalPercentage}% (must be 100%)`);
			}

			return errors;
		})()
	);

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));

	// Get background color with opacity
	const nodeColor = $derived(data.color || '#7c3aed');
	const nodeTitle = $derived(data.title || 'Router');
	const nodeDescription = $derived(data.description || 'Configure routes');
	const nodeIcon = $derived(data.icon || '🔀');

	const backgroundColor = $derived(`rgba(124, 58, 237, 0.1)`);
	const borderColor = $derived(hasValidationError || data.validationError ? '#ef4444' : nodeColor);
</script>

<div
	class="router-node relative transition-all duration-200"
	style="background: {backgroundColor}; border: 2px solid {borderColor}; border-radius: 8px; min-width: 240px;"
>
	<!-- Input handle -->
	<Handle
		type="target"
		position={Position.Left}
		style="width: 12px; height: 12px; background: {nodeColor}; border: 2px solid white;"
	/>

	<!-- Output handles for each route -->
	{#each routes as route, index}
		{#if route.enabled}
			<Handle
				type="source"
				position={Position.Right}
				id={route.id}
				style="top: {60 +
					index *
						30}px; width: 10px; height: 10px; background: {nodeColor}; border: 2px solid white;"
			/>
		{/if}
	{/each}

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
	</div>

	<Card class="border-0 bg-transparent shadow-none">
		<CardHeader class="pb-2">
			<div class="flex items-center justify-between">
				<CardTitle class="flex items-center gap-2 text-base font-semibold text-gray-800">
					<span class="text-lg">{nodeIcon}</span>
					{isExpanded ? nodeTitle : `${routes.filter((r) => r.enabled).length} routes`}
				</CardTitle>
				<Button
					variant="ghost"
					size="sm"
					onclick={toggleExpanded}
					class="h-5 w-5 p-0"
					disabled={false}
				>
					{isExpanded ? '−' : '+'}
				</Button>
			</div>
			{#if isExpanded}
				<p class="text-xs text-gray-600">{nodeDescription}</p>
			{/if}
		</CardHeader>

		{#if isExpanded}
			<CardContent class="space-y-4 pt-0">
				{#if hasValidationError || data.validationError}
					<div class="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
						{#if hasValidationError}
							{validationMessage}
						{:else}
							{data.validationMessage}
						{/if}
					</div>
				{/if}
				<!-- Routes configuration -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h4 class="text-sm font-medium text-gray-700">Routes Configuration</h4>
						<Button
							variant="outline"
							size="sm"
							onclick={addRoute}
							class="h-6 text-xs"
							disabled={false}
						>
							<Plus size="12" class="mr-1" />
							Add Route
						</Button>
					</div>

					<!-- Total percentage indicator -->
					<div class="rounded bg-gray-50 p-2 text-xs text-gray-600">
						Total: {totalPercentage}%
						{#if totalPercentage !== 100}
							<span class="text-amber-600">(Should be 100%)</span>
						{/if}
					</div>

					<!-- Routes list -->
					<div class="max-h-48 space-y-2 overflow-y-auto">
						{#each routes as route, index}
							<div class="flex items-center gap-2 rounded-md border bg-white/50 p-2">
								<!-- Enable/disable toggle -->
								<input
									type="checkbox"
									bind:checked={route.enabled}
									onchange={() => handleRouteToggle(index)}
									class="h-4 w-4"
								/>

								<!-- Route name -->
								<Input
									value={route.name}
									type="text"
									oninput={(e) => handleNameChange(index, e.target.value)}
									class="h-6 flex-1 text-xs"
									placeholder="Route name"
								/>

								<!-- Percentage -->
								<div class="flex items-center gap-1">
									<Input
										type="number"
										min="0"
										max="100"
										value={route.percentage}
										oninput={(e) => handlePercentageChange(index, e.target.value)}
										disabled={!route.enabled}
										class="h-6 w-16 text-center text-xs"
									/>
									<span class="text-xs text-gray-500">%</span>
								</div>

								<!-- Delete button -->
								{#if routes.length > 1}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => removeRoute(index)}
										class="h-6 w-6 p-0 text-red-500 hover:text-red-700"
										disabled={false}
									>
										<Trash2 size="12" />
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Info section -->
				<div class="rounded-md border border-purple-200 bg-purple-50 p-2">
					<div class="text-xs text-purple-700">
						<div class="mb-1 font-medium">🔀 Route Selection</div>
						<div>
							Each output connects to a different path. The router randomly selects one enabled
							route based on the configured percentages.
						</div>
					</div>
				</div>
			</CardContent>
		{/if}
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
	.router-node {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.router-node:hover {
		transform: translateY(-1px);
	}
</style>
