<script>
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { getDefaultSettingsForNodeType } from '../utils/configExportUtils.js';
	import { NODE_CATEGORIES } from '../utils/nodeDefinitions.js';
	import {
		ROUTER_CONFIG,
		BASIC_SETTINGS_CONFIG,
		NUMBER_OF_SONGS_CONFIG,
		FILTER_NODE_DEFINITIONS
	} from '../utils/nodeDefinitions.js';

	let { isOpen = $bindable(false), nodeData = null } = $props();

	// Get default settings for the node
	const defaultSettings = $derived(
		!nodeData
			? null
			: getDefaultSettingsForNodeType(nodeData.type, nodeData.id, {
					ROUTER_CONFIG,
					BASIC_SETTINGS_CONFIG,
					NUMBER_OF_SONGS_CONFIG,
					FILTER_NODE_DEFINITIONS
				})
	);

	// Format settings for display
	function formatSettingValue(key, value) {
		if (value === null || value === undefined) return 'Not set';

		if (typeof value === 'object') {
			if (value.useRange !== undefined) {
				return value.useRange ? `Range: ${value.min}-${value.max}` : `Static: ${value.staticValue}`;
			}
			if (value.random !== undefined) {
				return value.random ? `Random: ${value.min}-${value.max}` : `Static: ${value.value}`;
			}
			if (Array.isArray(value)) {
				return value.length > 0 ? value.join(', ') : 'Empty';
			}
			// For complex objects, show a summary
			const entries = Object.entries(value);
			if (entries.length === 0) return 'Empty';
			return `${entries.length} setting${entries.length === 1 ? '' : 's'}`;
		}

		if (typeof value === 'boolean') {
			return value ? 'Enabled' : 'Disabled';
		}

		return String(value);
	}

	function handleClose() {
		isOpen = false;
	}
</script>

{#if isOpen && nodeData}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
		onclick={handleClose}
		onkeydown={(e) => {
			if (e.key === 'Escape') handleClose();
		}}
	>
		<!-- Modal content -->
		<Card
			class="mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden"
			onclick={(e) => e.stopPropagation()}
		>
			<CardHeader class="">
				<CardTitle id="modal-title" class="flex items-center gap-2 text-lg">
					<span class="text-xl">{nodeData.icon || '⚙️'}</span>
					Default Settings: {nodeData.title || nodeData.id}
				</CardTitle>
				<p class="text-sm text-gray-600">
					These are the default values used when this node type fails to execute
				</p>
			</CardHeader>
			<CardContent class="max-h-[60vh] space-y-4 overflow-y-auto">
				{#if defaultSettings}
					<div class="space-y-3">
						{#each Object.entries(defaultSettings) as [key, value]}
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
								<div class="mb-2 flex items-center justify-between">
									<h4 class="font-medium text-gray-800 capitalize">
										{key.replace(/([A-Z])/g, ' $1').trim()}
									</h4>
									<Badge variant="outline" class="text-xs" href="">
										{typeof value}
									</Badge>
								</div>
								<div class="rounded bg-white px-2 py-1 font-mono text-sm text-gray-700">
									{formatSettingValue(key, value)}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="py-8 text-center text-gray-500">
						<p>No default settings available for this node type.</p>
					</div>
				{/if}

				<div class="mt-6 rounded-lg bg-blue-50 p-4">
					<h4 class="mb-2 font-medium text-blue-800">How Default Settings Work:</h4>
					<ul class="space-y-1 text-sm text-blue-700">
						<li>• Default settings are used when a node fails its execution chance</li>
						<li>• They ensure the quiz configuration remains valid even if nodes don't execute</li>
						<li>• At least one node from each required category will always be present</li>
					</ul>
				</div>
			</CardContent>

			<div class="flex justify-end gap-2 p-6 pt-0">
				<Button variant="outline" onclick={handleClose} class="" disabled={false}>Close</Button>
			</div>
		</Card>
	</div>
{/if}
