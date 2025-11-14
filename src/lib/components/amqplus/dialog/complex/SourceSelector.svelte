<script>
	import { Label } from '$lib/components/ui/label';
	import { getContext } from 'svelte';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#f59e0b',
		getTotalSongs = () => 20,
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		onAutoSave = () => {},
		readOnly = false
	} = $props();

	// Get nodes from context to find source nodes
	const nodesStore = getContext('nodes');
	const nodes = $derived(nodesStore ? (nodesStore.current || nodesStore) : []);

	// Filter for source nodes (Song List, Batch User List, Live Node)
	const sourceNodes = $derived(
		nodes.filter(
			(node) => {
				if (!node || !node.data) return false;
				
				// Check if it's a source node by type or isSourceNode flag
				const nodeType = node.type || node.data.type;
				const isSourceNodeType = 
					nodeType === 'songList' || 
					nodeType === 'batchUserList' || 
					nodeType === 'liveNode';
				
				const hasSourceNodeFlag = node.data.isSourceNode === true;
				
				return isSourceNodeType || hasSourceNodeFlag;
			}
		)
	);

	// Ensure editedValue has correct structure - initialize immediately
	if (!editedValue) {
		editedValue = {
			targetSourceId: null,
			targetSourceName: null
		};
	}
	
	// Additional effect to ensure structure is maintained
	$effect(() => {
		if (!editedValue) {
			editedValue = {
				targetSourceId: null,
				targetSourceName: null
			};
		}
		if (editedValue.targetSourceId === undefined) {
			editedValue.targetSourceId = null;
		}
		if (editedValue.targetSourceName === undefined) {
			editedValue.targetSourceName = null;
		}
	});

	// Validation
	$effect(() => {
		if (!editedValue || !editedValue.targetSourceId) {
			// Don't mark as invalid if no source nodes exist yet
			if (sourceNodes.length === 0) {
				isValid = false;
				validationMessage = 'No source nodes available in the flow';
			} else {
				isValid = false;
				validationMessage = 'Please select a source node';
			}
		} else {
			// Check if selected source still exists
			const exists = sourceNodes.some((node) => node.id === editedValue.targetSourceId);
			if (!exists) {
				isValid = false;
				validationMessage = 'Selected source node no longer exists';
			} else {
				isValid = true;
				validationMessage = '';
			}
		}
	});

	// Get display label for a source node
	function getSourceLabel(node) {
		if (!node) return 'Unknown';

		const title = node.data?.title || 'Source';
		const instanceId = node.id || node.data?.instanceId || '';

		// Add additional context based on node type and configuration
		let context = '';
		if (node.type === 'songList' && node.data?.currentValue?.mode) {
			const mode = node.data.currentValue.mode;
			if (mode === 'masterlist') {
				context = ' (Master List)';
			} else if (mode === 'user-lists') {
				const username = node.data.currentValue.userListImport?.username;
				context = username ? ` (User: ${username})` : ' (User List)';
			} else if (mode === 'saved-lists') {
				const listName = node.data.currentValue.selectedListName;
				context = listName ? ` (${listName})` : ' (Saved List)';
			} else if (mode === 'provider') {
				context = ' (Provider Import)';
			}
		} else if (node.type === 'batchUserList') {
			const userCount = node.data?.currentValue?.userEntries?.length || 0;
			context = ` (${userCount} user${userCount !== 1 ? 's' : ''})`;
		} else if (node.type === 'liveNode') {
			context = ' (Live)';
		}

		return `${title}${context}`;
	}

	// Handle selection change
	function handleSelectionChange(event) {
		const selectedId = event.target.value;
		
		// Ensure editedValue exists
		if (!editedValue) {
			editedValue = {
				targetSourceId: null,
				targetSourceName: null
			};
		}
		
		if (!selectedId) {
			editedValue.targetSourceId = null;
			editedValue.targetSourceName = null;
			onAutoSave(editedValue);
			return;
		}

		const sourceNode = sourceNodes.find((node) => node.id === selectedId);
		editedValue.targetSourceId = selectedId;
		editedValue.targetSourceName = sourceNode ? getSourceLabel(sourceNode) : selectedId;
		onAutoSave(editedValue);
	}
</script>

<div class="space-y-4">
	<div>
		<Label for="source-selector" class="mb-2 block">Target Source Node</Label>
		{#if sourceNodes.length === 0}
			<div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
				<p class="font-semibold">No source nodes available</p>
				<p class="mt-1 text-xs">
					Add a Song List, Batch User List, or Live Node to your flow first.
				</p>
			</div>
		{:else}
			<select
				id="source-selector"
				class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				value={editedValue?.targetSourceId || ''}
				onchange={handleSelectionChange}
				disabled={readOnly}
			>
				<option value="">Select a source node</option>
				{#each sourceNodes as node}
					<option value={node.id}>
						{getSourceLabel(node)}
					</option>
				{/each}
			</select>
		{/if}
	</div>

</div>

