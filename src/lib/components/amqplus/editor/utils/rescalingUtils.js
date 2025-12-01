import { NODE_CATEGORIES } from './nodeDefinitions.js';

/**
 * Utility for handling node value changes in the quiz editor
 * @module rescalingUtils
 */

/**
 * Handle node value changes and update modifier indicators
 * @param {Array} nodes - Array of nodes
 * @param {Array} edges - Array of edges
 * @param {Object} changeData - Change data with nodeId and newValue
 * @param {Function} updateModifierIndicators - Function to update modifier indicators
 * @returns {Object} Updated nodes and validation report
 */
export function handleNodeValueChangeRescaling(nodes, edges, changeData, updateModifierIndicators) {
	let updatedNodes = [...nodes];
	let validationReport = null;

	// Find the node that changed
	const nodeIndex = nodes.findIndex(
		(n) => n.id === changeData.nodeId || n.data.instanceId === changeData.nodeId
	);

	if (nodeIndex !== -1) {
		const node = nodes[nodeIndex];
		updatedNodes[nodeIndex] = {
			...node,
			data: {
				...node.data,
				currentValue: changeData.newValue
			}
		};

		// If a selection modifier changed, refresh indicators
		if (node.data.type === NODE_CATEGORIES.SELECTION_MODIFIER) {
			updateModifierIndicators();
		}
	}

	return { updatedNodes, validationReport };
}