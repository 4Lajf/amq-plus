<script>
	import { settingConfigs } from '$lib/components/amqplus/dialog/settingsConfig.js';
	import { getDefaultSettingsForNodeType } from '../utils/configExportUtils.js';
	import { NODE_CATEGORIES } from '../utils/nodeDefinitions.js';
	import {
		ROUTER_CONFIG,
		BASIC_SETTINGS_CONFIG,
		NUMBER_OF_SONGS_CONFIG,
		FILTER_NODE_DEFINITIONS
	} from '../utils/nodeDefinitions.js';
	import DialogLayout from '$lib/components/amqplus/dialog/DialogLayout.svelte';
	import ComplexFormFields from '$lib/components/amqplus/dialog/ComplexFormFields.svelte';

	let { open = $bindable(), nodeData, onClose } = $props();

	// Get default settings for the node
	const defaultSettings = $derived(
		!nodeData
			? null
			: (() => {
					const configs = {
						ROUTER_CONFIG,
						BASIC_SETTINGS_CONFIG,
						NUMBER_OF_SONGS_CONFIG,
						FILTER_NODE_DEFINITIONS
					};

					// For filter nodes, use the base node type ID instead of the instance ID
					let nodeId = nodeData.id;
					if (nodeData.type === 'filter') {
						// Extract base node type from instance ID (e.g., 'songs-and-types-2' -> 'songs-and-types')
						const instanceMatch = nodeData.id.match(/^(.+)-\d+$/);
						if (instanceMatch) {
							nodeId = instanceMatch[1];
						}
					}

					return getDefaultSettingsForNodeType(nodeData.type, nodeId, configs);
				})()
	);

	// Create a temporary config entry for this node if it doesn't exist
	$effect(() => {
		if (nodeData && nodeData.formType && !settingConfigs[nodeData.id]) {
			settingConfigs[nodeData.id] = {
				type: nodeData.formType,
				label: nodeData.title,
				size: 'large'
			};
		}
	});

	// Transform nodeData to match the expected format for NodeEditDialog with default values
	let transformedNodeData = $state(null);
	let editedValue = $state(null);
	let isValid = $state(true);
	let validationMessage = $state('');

	// Update transformedNodeData when nodeData or defaultSettings changes
	$effect(() => {
		// Only run when dialog is open to prevent infinite loops
		if (!open) {
			transformedNodeData = null;
			editedValue = null;
			return;
		}

		const settings = defaultSettings; // Get the derived value directly

		if (nodeData && settings && typeof settings === 'object') {
			// Only update if something actually changed
			const newTransformedData = {
				id: nodeData.id,
				title: `Default Settings: ${nodeData.title}`,
				icon: nodeData.icon,
				color: nodeData.color,
				currentValue: settings,
				totalSongs: nodeData.totalSongs,
				readOnly: true // Add read-only flag
			};

			// Check if data actually changed to prevent infinite loops
			const hasChanged =
				!transformedNodeData ||
				transformedNodeData.id !== newTransformedData.id ||
				transformedNodeData.title !== newTransformedData.title ||
				JSON.stringify(transformedNodeData.currentValue) !== JSON.stringify(settings);

			if (hasChanged) {
				transformedNodeData = newTransformedData;
				// Initialize editedValue with default settings
				editedValue = JSON.parse(JSON.stringify(settings)); // Deep clone
			}
		} else {
			transformedNodeData = null;
			editedValue = null;
		}
	});

	// Handle close - just close the dialog
	function handleClose() {
		open = false;
		if (onClose) onClose();
	}

	// Get node color for styling
	const getNodeColor = () => {
		return nodeData?.color || '#6366f1';
	};

	// Get dialog size based on node type
	const getDialogSize = () => {
		if (transformedNodeData) {
			const config = settingConfigs[transformedNodeData.id];
			return config?.size || 'medium';
		}
		return 'medium';
	};

	// No-op save handler since this is read-only
	function handleSave() {
		// Do nothing - this is read-only
	}
</script>

<!-- Use DialogLayout directly with ComplexFormFields for read-only mode -->
<DialogLayout
	bind:open
	bind:nodeData={transformedNodeData}
	{isValid}
	{getNodeColor}
	onSave={handleSave}
	onModalClose={handleClose}
	readOnly={true}
	dialogSize={getDialogSize()}
>
	{#if transformedNodeData && editedValue !== null}
		{@const config = settingConfigs[transformedNodeData.id]}
		<ComplexFormFields
			{config}
			bind:editedValue
			bind:isValid
			bind:validationMessage
			{getNodeColor}
			getTotalSongs={() => transformedNodeData.totalSongs || 20}
			readOnly={true}
		/>
	{:else}
		<div class="p-4 text-center text-gray-500">
			<p>Loading default settings...</p>
		</div>
	{/if}
</DialogLayout>
