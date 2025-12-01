<script>
	import NodeEditDialog from '$lib/components/amqplus/NodeEditDialog.svelte';
	import { settingConfigs } from '$lib/components/amqplus/dialog/settingsConfig.js';

	/**
	 * Component props.
	 * @type {{
	 *   open: boolean,
	 *   nodeData: any,
	 *   value: any,
	 *   onSave: (newValue: any) => void
	 * }}
	 */
	let { open = $bindable(), nodeData, value = $bindable(), onSave } = $props();

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

	// Transform nodeData to match the expected format for NodeEditDialog
	let transformedNodeData = $state(null);

	// Update transformedNodeData when nodeData or value changes
	$effect(() => {
		transformedNodeData = nodeData
			? {
					id: nodeData.id,
					title: nodeData.title,
					icon: nodeData.icon,
					color: nodeData.color,
					currentValue: value,
					totalSongs: nodeData.totalSongs
				}
			: null;
	});

	// Handle save from the mature dialog
	function handleSave(saveData) {
		console.log('🔧 FilterNodeDialog handleSave called with:', saveData);
		if (onSave && saveData) {
			console.log('🔧 FilterNodeDialog calling onSave with:', saveData.newValue);
			onSave(saveData.newValue);
		}
	}
</script>

<NodeEditDialog
	bind:open
	bind:nodeData={transformedNodeData}
	onSave={handleSave}
	onModalClose={() => {}}
	readOnly={false}
/>
