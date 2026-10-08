<script>
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

	let nodesStore;
	try {
		nodesStore = getContext('nodes');
	} catch {
		nodesStore = null;
	}
	const nodes = $derived(nodesStore ? nodesStore.current || nodesStore : []);

	const sourceNodes = $derived(
		nodes.filter((node) => {
			if (!node || !node.data) return false;
			const nodeType = node.type || node.data.type;
			const isSourceNodeType =
				nodeType === 'songList' || nodeType === 'batchUserList' || nodeType === 'liveNode';
			const hasSourceNodeFlag = node.data.isSourceNode === true;
			return isSourceNodeType || hasSourceNodeFlag;
		})
	);

	if (!editedValue) {
		editedValue = { targetSourceId: null, targetSourceName: null };
	}

	$effect(() => {
		if (!editedValue) {
			editedValue = { targetSourceId: null, targetSourceName: null };
		}
		if (editedValue.targetSourceId === undefined) editedValue.targetSourceId = null;
		if (editedValue.targetSourceName === undefined) editedValue.targetSourceName = null;
	});

	$effect(() => {
		if (!editedValue || !editedValue.targetSourceId) {
			if (sourceNodes.length === 0) {
				isValid = false;
				validationMessage = 'No source nodes available in the flow';
			} else {
				isValid = false;
				validationMessage = 'Please select a source node';
			}
		} else {
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

	function getSourceLabel(node) {
		if (!node) return 'Unknown';
		const title = node.data?.title || 'Source';
		let context = '';
		if (node.type === 'songList' && node.data?.currentValue?.mode) {
			const mode = node.data.currentValue.mode;
			if (mode === 'masterlist') context = ' (Master List)';
			else if (mode === 'user-lists') {
				const username = node.data.currentValue.userListImport?.username;
				context = username ? ` (User: ${username})` : ' (User List)';
			} else if (mode === 'saved-lists') {
				const listName = node.data.currentValue.selectedListName;
				context = listName ? ` (${listName})` : ' (Saved List)';
			} else if (mode === 'provider') context = ' (Provider Import)';
		} else if (node.type === 'batchUserList') {
			const userCount = node.data?.currentValue?.userEntries?.length || 0;
			context = ` (${userCount} user${userCount !== 1 ? 's' : ''})`;
		} else if (node.type === 'liveNode') context = ' (Live)';
		return `${title}${context}`;
	}

	function handleSelectionChange(event) {
		const selectedId = event.target.value;
		if (!editedValue) editedValue = { targetSourceId: null, targetSourceName: null };

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

<div class="flex flex-col gap-3" style="--accent: {getNodeColor()}">
	{#if sourceNodes.length === 0}
		<div
			class="flex items-center gap-2 rounded border border-[#f59e0b33] bg-[#f59e0b10] px-3 py-2 text-xs text-[#f59e0b]"
		>
			<span>⚠</span>
			<span>No source nodes available. Add a Song List, Batch User List, or Live Node first.</span>
		</div>
	{:else}
		<div
			class="border-ed-border bg-ed-canvas-default flex items-center gap-3 rounded-md border px-3 py-2"
		>
			<label
				for="source-selector-target"
				class="font-dm text-ed-fg-subtle text-[11px] font-medium whitespace-nowrap">Target</label
			>
			<select
				id="source-selector-target"
				class="df-select h-7 flex-1"
				value={editedValue?.targetSourceId || ''}
				onchange={handleSelectionChange}
				disabled={readOnly}
			>
				<option value="">Select a source node</option>
				{#each sourceNodes as node}
					<option value={node.id}>{getSourceLabel(node)}</option>
				{/each}
			</select>
		</div>
	{/if}
</div>
