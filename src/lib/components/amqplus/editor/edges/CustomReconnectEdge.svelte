<script lang="ts">
	import { BaseEdge, useEdges, type EdgeProps } from '@xyflow/svelte';
	import { getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/system';

	let {
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		selected,
		data,
		id,
		markerEnd,
		markerStart,
		style,
		type
	}: EdgeProps = $props();

	function getPath(typeName: string | undefined) {
		switch (typeName) {
			case 'straight':
				return getStraightPath({
					sourceX,
					sourceY,
					targetX,
					targetY
				});
			case 'step':
			case 'smoothstep':
				return getSmoothStepPath({
					sourceX,
					sourceY,
					targetX,
					targetY,
					sourcePosition,
					targetPosition,
					borderRadius: typeName === 'step' ? 0 : undefined
				});
			case 'default':
			default:
				return getBezierPath({
					sourceX,
					sourceY,
					sourcePosition,
					targetX,
					targetY,
					targetPosition
				});
		}
	}

	const effectiveType = $derived((data?.customType ?? type ?? 'default') as string);
	const [edgePath] = $derived(getPath(effectiveType));

	// Use useEdges like the working examples
	const edges = useEdges();

	// Handle double-click to delete edge using useEdges
	function handleDoubleClick(event) {
		// Prevent event propagation to avoid conflicts
		event.stopPropagation();

		// Use the same pattern as ButtonEdge examples
		edges.update((eds) => eds.filter((edge) => edge.id !== id));
	}
</script>

<!-- Simple edge with deletion capability -->
<BaseEdge path={edgePath} {markerEnd} {markerStart} {style} ondblclick={handleDoubleClick} />
