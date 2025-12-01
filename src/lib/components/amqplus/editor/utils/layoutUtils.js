/**
 * Layout utility functions for the AMQ+ Editor
 */

export const NODE_SPACING_X = 320;
export const START_X = 100;
export const START_Y = 100;

/**
 * @typedef {Object} NodePosition
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} NodeWithPosition
 * @property {string} id - Node ID
 * @property {Object} position - Node position
 * @property {number} position.x - X coordinate
 * @property {number} position.y - Y coordinate
 * @property {Object} data - Node data
 * @property {string} data.type - Node type
 * @property {boolean} [data.userPositioned] - Whether user positioned this node
 */

/**
 * Mark a node as user-positioned when the user moves it
 * @param {NodeWithPosition[]} nodes - Current nodes array
 * @param {string} nodeId - ID of node to mark as user-positioned
 * @returns {NodeWithPosition[]} Updated nodes array
 */
export function markNodeAsUserPositioned(nodes, nodeId) {
	return nodes.map((node) => {
		if (node.id === nodeId) {
			return {
				...node,
				data: {
					...node.data,
					userPositioned: true
				}
			};
		}
		return node;
	});
}
