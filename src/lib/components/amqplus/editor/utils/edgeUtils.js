/**
 * Edge utility functions for the AMQ+ Editor
 */

import { ConnectionLineType } from '@xyflow/svelte';

/**
 * @typedef {Object} EdgeChange
 * @property {'add'|'remove'|'update'} type - Change type
 * @property {string} id - Edge ID
 * @property {Object} [item] - Edge data (for add/update)
 */

/**
 * @typedef {Object} EdgeData
 * @property {string} id - Edge ID
 * @property {string} source - Source node ID
 * @property {string} target - Target node ID
 * @property {string} [type] - Edge type
 * @property {Object} [style] - Edge style
 * @property {Object} [data] - Edge data
 * @property {string} [data.customType] - Custom edge type override
 */

/**
 * Create a properly configured edge with styling and data
 * @param {EdgeData} edgeData - Basic edge data
 * @param {ConnectionLineType|string} globalEdgeType - Global edge type setting
 * @returns {EdgeData} Configured edge with proper styling
 */
export function createEdgeWithData(edgeData, globalEdgeType = ConnectionLineType.Bezier) {
	const effectiveType = edgeData.data?.customType || edgeData.type || globalEdgeType || ConnectionLineType.Bezier;
	return {
		...edgeData,
		type: effectiveType,
		style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 },
		data: {
			...edgeData.data,
			customType: edgeData.data?.customType // Preserve custom type override
		}
	};
}

/**
 * Update all edges to use a new global edge type (unless they have custom overrides)
 * @param {EdgeData[]} edges - Array of edges to update
 * @param {ConnectionLineType|string} newGlobalEdgeType - New global edge type
 * @returns {EdgeData[]} Updated edges array
 */
export function updateAllEdgeTypes(edges, newGlobalEdgeType) {
	return edges.map((edge) => {
		// Only update if the edge doesn't have a custom type override
		if (!edge.data?.customType) {
			return {
				...edge,
				type: newGlobalEdgeType,
				style: { stroke: '#6366f1', strokeWidth: 2 }
			};
		}
		return edge;
	});
}



/**
 * Handle edge changes (including reconnections and removals)
 * @param {EdgeChange[]} changes - Array of edge changes from SvelteFlow
 * @param {EdgeData[]} currentEdges - Current edges array
 * @param {(edgeData: EdgeData, globalEdgeType?: ConnectionLineType|string) => EdgeData} createEdgeWithDataFn - Function to create properly configured edges
 * @returns {EdgeData[]} Updated edges array
 */
export function handleEdgesChange(changes, currentEdges, createEdgeWithDataFn) {
	let edges = [...currentEdges];

	// Process all changes
	const edgesToAdd = [];
	const edgeIdsToRemove = [];
	const edgesToUpdate = [];

	changes.forEach((change) => {
		if (change.type === 'add') {
			edgesToAdd.push(change.item);
		} else if (change.type === 'remove') {
			edgeIdsToRemove.push(change.id);
		} else if (change.type === 'update') {
			edgesToUpdate.push(change);
		}
	});

	if (edgeIdsToRemove.length > 0) {
		edges = edges.filter((e) => !edgeIdsToRemove.includes(e.id));
	}

	// Handle edge updates (for reconnections)
	if (edgesToUpdate.length > 0) {
		edges = edges.map((edge) => {
			const updateChange = edgesToUpdate.find((change) => change.id === edge.id);
			if (updateChange) {
				// Apply the update and ensure the edge maintains proper configuration
				return createEdgeWithDataFn({ ...edge, ...updateChange.item });
			}
			return edge;
		});
	}

	// Add new edges with proper configuration
	if (edgesToAdd.length > 0) {
		const newEdges = edgesToAdd.map((edge) => createEdgeWithDataFn(edge));
		// Filter out any duplicates
		const uniqueNewEdges = newEdges.filter(
			(newEdge) => !edges.find((existingEdge) => existingEdge.id === newEdge.id)
		);
		edges = [...edges, ...uniqueNewEdges];
	}

	return edges;
}
