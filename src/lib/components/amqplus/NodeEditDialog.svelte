<script>
	/**
	 * Main dialog for editing node settings in the AMQ+ Editor.
	 * Handles all node types with dynamic form generation based on node configuration.
	 *
	 * @component
	 */

	import DialogLayout from './dialog/DialogLayout.svelte';
	import SimpleFormFields from './dialog/SimpleFormFields.svelte';
	import ComplexFormFields from './dialog/ComplexFormFields.svelte';
	import { settingConfigs } from './dialog/settingsConfig.js';

	/**
	 * Node data structure for editing (dialog-specific format).
	 * This is a flattened structure used by the dialog, not the full NodeInstance.
	 * @typedef {Object} NodeDialogData
	 * @property {string} id - Node ID (setting identifier)
	 * @property {string} title - Display title
	 * @property {string} icon - Emoji icon
	 * @property {string} color - Hex color code for styling
	 * @property {Object} currentValue - Current settings/values for the node
	 * @property {number} [totalSongs] - Total songs count for validation context
	 */

	/**
	 * Component props.
	 * @type {{
	 *   open: boolean,
	 *   nodeData: NodeDialogData | null,
	 *   onSave: (saveData: {nodeId: string, newValue: any}) => void,
	 *   onModalClose: () => void,
	 *   readOnly: boolean
	 * }}
	 */
	let {
		open = $bindable(false),
		nodeData = $bindable(null),
		onSave = () => {},
		onModalClose = () => {},
		readOnly = false
	} = $props();

	// Local state for editing
	let editedValue = $state(null);
	let isValid = $state(true);
	let validationMessage = $state('');

	// Get node color for slider styling
	const getNodeColor = () => {
		return nodeData?.color || '#6366f1'; // Default to indigo if no color
	};

	// Simple deep clone function to avoid structuredClone issues
	function deepClone(obj) {
		if (obj === null || typeof obj !== 'object') {
			return obj;
		}
		if (obj instanceof Date) {
			return new Date(obj.getTime());
		}
		if (Array.isArray(obj)) {
			return obj.map((item) => deepClone(item));
		}
		const cloned = {};
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				cloned[key] = deepClone(obj[key]);
			}
		}
		return cloned;
	}

	// Watch for nodeData changes to initialize editedValue
	$effect(() => {
		if (nodeData && open) {
			const settingId = nodeData.id?.replace('-setting', '');
			const config = settingConfigs[settingId];

			if (!config) {
				editedValue = null;
				return;
			}

			// Initialize editedValue based on the setting type and current value
			if (config.type === 'number-with-random') {
				if (
					typeof nodeData.currentValue === 'object' &&
					nodeData.currentValue.random !== undefined
				) {
					editedValue = deepClone(nodeData.currentValue);
				} else {
					editedValue = {
						random: false,
						value: nodeData.currentValue,
						min: config.min,
						max: config.max
					};
				}
			} else if (config.type === 'select-with-random') {
				if (
					typeof nodeData.currentValue === 'object' &&
					nodeData.currentValue.random !== undefined
				) {
					editedValue = deepClone(nodeData.currentValue);
				} else {
					const options = {};
					config.options.forEach((opt) => (options[opt.value] = false));
					editedValue = { random: false, value: nodeData.currentValue, options };
				}
			} else {
				editedValue = deepClone(nodeData.currentValue);
			}
		}
	});

	// Get configuration for current node
	const config = $derived(nodeData ? settingConfigs[nodeData.id?.replace('-setting', '')] : null);

	// This determines which CSS class and layout to use.
	const dialogSize = $derived(config?.size || 'medium');

	// Get total songs setting for validation context
	const getTotalSongs = () => {
		// Try to get from nodeData context or use default
		return nodeData?.totalSongs || 20; // Default fallback
	};

	// Auto-save callback for reactive components
	function handleAutoSave(newValue) {
		console.log('🔧 Auto-save called with:', newValue);
		if (nodeData) {
			console.log('🔧 Calling onSave with nodeId:', nodeData.id);
			onSave({
				nodeId: nodeData.id,
				newValue: newValue
			});
		}
	}

	function handleSave() {
		if (!isValid || !nodeData) return;

		onSave({
			nodeId: nodeData.id,
			newValue: editedValue
		});

		open = false;
	}

	function handleCancel() {
		open = false;
		editedValue = null;
	}

	// Determine if this is a complex form type
	const isComplexForm = $derived(config?.type?.startsWith('complex-') || false);
</script>

<DialogLayout
	bind:open
	bind:nodeData
	{dialogSize}
	{isValid}
	{getNodeColor}
	onSave={handleSave}
	onCancel={handleCancel}
	{onModalClose}
	{readOnly}
>
	{#snippet children()}
		{#if config && editedValue !== null}
			{#if isComplexForm}
				<ComplexFormFields
					{config}
					bind:editedValue
					bind:isValid
					bind:validationMessage
					{getNodeColor}
					{getTotalSongs}
					onAutoSave={handleAutoSave}
				/>
			{:else}
				<SimpleFormFields
					{config}
					bind:editedValue
					bind:isValid
					bind:validationMessage
					{getNodeColor}
					{readOnly}
				/>
			{/if}
		{/if}
	{/snippet}
</DialogLayout>
