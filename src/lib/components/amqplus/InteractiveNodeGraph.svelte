<script>
	import { SvelteFlow, Controls, Background, BackgroundVariant, MiniMap } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	// Define initial nodes for the AMQ PLUS mockup (simplified for demo)
	let initialNodes = [
		{
			id: '1',
			type: 'default',
			position: { x: 0, y: 80 },
			data: {
				label: '🎵 Song List',
				description: 'Select song source'
			},
			style:
				'background: rgba(59, 130, 246, 0.1); color: #1f2937; border: 2px solid rgba(59, 130, 246, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 150px;'
		},
		{
			id: '2',
			type: 'default',
			position: { x: 170, y: 80 },
			data: {
				label: '⚙️ Basic Settings',
				description: 'Scoring & Players'
			},
			style:
				'background: rgba(168, 85, 247, 0.1); color: #1f2937; border: 2px solid rgba(168, 85, 247, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 150px;'
		},
		{
			id: '3',
			type: 'default',
			position: { x: 340, y: 80 },
			data: {
				label: '🔍 Content Filters',
				description: 'Type, Genre, Tags'
			},
			style:
				'background: rgba(239, 68, 68, 0.1); color: #1f2937; border: 2px solid rgba(239, 68, 68, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 150px;'
		},
		{
			id: '4',
			type: 'default',
			position: { x: 510, y: 20 },
			data: {
				label: '🎲 Config A',
				description: '60% probability'
			},
			style:
				'background: rgba(251, 146, 60, 0.1); color: #1f2937; border: 2px solid rgba(251, 146, 60, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 130px;'
		},
		{
			id: '5',
			type: 'default',
			position: { x: 510, y: 140 },
			data: {
				label: '🎲 Config B',
				description: '40% probability'
			},
			style:
				'background: rgba(251, 146, 60, 0.1); color: #1f2937; border: 2px solid rgba(251, 146, 60, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 130px;'
		},
		{
			id: '6',
			type: 'default',
			position: { x: 680, y: 80 },
			data: {
				label: '📤 Export',
				description: 'Ready to use'
			},
			style:
				'background: rgba(99, 102, 241, 0.1); color: #1f2937; border: 2px solid rgba(99, 102, 241, 0.6); border-radius: 12px; padding: 12px; font-weight: 600; min-width: 150px;'
		}
	];

	// Define initial edges (connections between nodes)
	let initialEdges = [
		{
			id: 'e1-2',
			source: '1',
			target: '2',
			type: 'step',
			style: 'stroke: #3b82f6; stroke-width: 2; stroke-dasharray: 5,5;',
			animated: true
		},
		{
			id: 'e2-3',
			source: '2',
			target: '3',
			type: 'step',
			style: 'stroke: #a855f7; stroke-width: 2; stroke-dasharray: 5,5;',
			animated: true
		},
		{
			id: 'e3-4',
			source: '3',
			target: '4',
			type: 'step',
			style: 'stroke: #ef4444; stroke-width: 2; stroke-dasharray: 5,5;',
			animated: true
		},
		{
			id: 'e3-5',
			source: '3',
			target: '5',
			type: 'step',
			style: 'stroke: #ef4444; stroke-width: 2; stroke-dasharray: 5,5;',
			animated: true
		},
		{
			id: 'e4-6',
			source: '4',
			target: '6',
			type: 'step',
			style: 'stroke: #fb923c; stroke-width: 2;',
			animated: true
		},
		{
			id: 'e5-6',
			source: '5',
			target: '6',
			type: 'step',
			style: 'stroke: #fb923c; stroke-width: 2;',
			animated: true
		}
	];

	// Create reactive variables instead of stores
	let nodes = $state(initialNodes);
	let edges = $state(initialEdges);

	// Handle node drag end
	function onNodeDragStop(event) {
		// Node drag handling
	}

	// Handle node click
	function onNodeClick(event) {
		// Node click handling
	}

	// Handle edge click
	function onEdgeClick(event) {
		// Edge click handling
	}
</script>

<div
	class="border-amq-light h-96 w-full overflow-hidden rounded-xl border bg-white/95 shadow-lg backdrop-blur-sm"
>
	<SvelteFlow
		{nodes}
		{edges}
		onnodedragstop={onNodeDragStop}
		onnodeclick={onNodeClick}
		onedgeclick={onEdgeClick}
		fitView
		proOptions={{ hideAttribution: true }}
	>
		<Background
			variant={BackgroundVariant.Dots}
			gap={20}
			size={1}
			patternColor="rgba(223, 105, 117, 0.1)"
		/>
	</SvelteFlow>
</div>

<style>
	:global(.svelte-flow__node) {
		font-family: 'Montserrat', sans-serif;
	}

	:global(.svelte-flow__controls) {
		background: rgba(255, 255, 255, 0.9);
		border: 1px solid rgba(223, 105, 117, 0.2);
		border-radius: 8px;
	}

	:global(.svelte-flow__controls button) {
		background: rgba(223, 105, 117, 0.1);
		border: none;
		color: #df6975;
		transition: all 0.2s ease;
	}

	:global(.svelte-flow__controls button:hover) {
		background: rgba(223, 105, 117, 0.2);
		transform: scale(1.05);
	}

	:global(.svelte-flow__minimap) {
		background: rgba(255, 255, 255, 0.9);
		border: 1px solid rgba(223, 105, 117, 0.2);
		border-radius: 8px;
	}

	:global(.svelte-flow__attribution) {
		background: rgba(255, 255, 255, 0.8);
		color: #df6975;
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
	}
</style>
