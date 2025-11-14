import { NODE_CATEGORIES } from './nodeDefinitions.js';
import { isConnectedToFinalFlow } from './validationUtils.js';

/**
 * Executes a node based on its execution chance
 * Supports both static numbers and range objects
 *
 * @param {number|Object|null|undefined} executionChance - Execution chance as number (0-100) or range object with min/max
 * @returns {boolean} Whether the node should execute
 */
export function shouldExecuteNode(executionChance) {
	if (executionChance === undefined) {
		return true;
	}

	// Handle range objects
	if (typeof executionChance === 'object' && executionChance !== null) {
		if (executionChance.kind === 'range') {
			const min = executionChance.min || 0;
			const max = executionChance.max || 100;
			const randomChance = Math.random() * 100;
			return randomChance >= min && randomChance <= max;
		}
		// Fallback for other object types
		return true;
	}

	// Handle static numbers
	const chance = Number(executionChance);
	if (isNaN(chance) || chance >= 100) {
		return true;
	}
	return Math.random() * 100 < chance;
}

/**
 * Gets default settings for a specific node type
 *
 * @param {string} nodeType - The type of node to get settings for
 * @param {string} nodeId - The ID of the node
 * @param {Object} configs - Configuration object containing node definitions
 * @returns {Object} Default settings for the node type
 */
export function getDefaultSettingsForNodeType(nodeType, nodeId, configs) {
	const { ROUTER_CONFIG, BASIC_SETTINGS_CONFIG, NUMBER_OF_SONGS_CONFIG, FILTER_NODE_DEFINITIONS } =
		configs;

	if (nodeType === NODE_CATEGORIES.ROUTER) {
		return ROUTER_CONFIG.defaultValue;
	}
	if (nodeType === NODE_CATEGORIES.BASIC_SETTINGS) {
		return BASIC_SETTINGS_CONFIG.settings;
	}
	if (nodeType === NODE_CATEGORIES.NUMBER_OF_SONGS) {
		return NUMBER_OF_SONGS_CONFIG.defaultValue;
	}
	if (nodeType === NODE_CATEGORIES.FILTER && FILTER_NODE_DEFINITIONS[nodeId]) {
		return FILTER_NODE_DEFINITIONS[nodeId].defaultValue;
	}
	if (nodeType === NODE_CATEGORIES.SELECTION_MODIFIER) {
		// For selection modifier, we need to find it in the configs
		// This is a fallback since selection modifier might not be in FILTER_NODE_DEFINITIONS
		return { minSelection: 1, maxSelection: 1 };
	}
	return {};
}

/**
 * Selects a route from a router node based on weighted random selection
 *
 * @param {Object} routerNode - Router node configuration
 * @returns {Object|null} Selected route object or null if no route selected
 */
export function selectRouteFromRouter(routerNode) {
	if (!routerNode || !routerNode.data.currentValue?.routes) {
		return null;
	}

	const routes = routerNode.data.currentValue.routes.filter((r) => r.enabled && r.percentage > 0);
	if (routes.length === 0) return null;

	// Weighted random selection
	const totalPercentage = routes.reduce((sum, route) => sum + route.percentage, 0);
	if (totalPercentage <= 0) return null;

	const random = Math.random() * totalPercentage;
	let currentSum = 0;

	for (const route of routes) {
		currentSum += route.percentage;
		if (random <= currentSum) {
			return route;
		}
	}

	return routes[routes.length - 1]; // Fallback to last route
}

/**
 * Builds adjacency map for reachability analysis
 *
 * @param {Array<Object>} edges - Array of edge objects with source and target properties
 * @returns {Map<string, Set<string>>} Adjacency map from source to target nodes
 */
function buildAdjacencyMap(edges) {
	const adjacency = new Map();
	for (const e of edges) {
		if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
		adjacency.get(e.source).add(e.target);
	}
	return adjacency;
}

/**
 * Finds all nodes reachable from a modifier
 *
 * @param {string} startId - Starting node ID
 * @param {Map<string, Set<string>>} adjacency - Adjacency map
 * @returns {Set<string>} Set of reachable node IDs
 */
function findReachableNodes(startId, adjacency) {
	const reachableFromModifier = new Set();
	const queue = [startId];

	while (queue.length) {
		const cur = queue.shift();
		if (reachableFromModifier.has(cur)) continue;
		reachableFromModifier.add(cur);

		const neigh = adjacency.get(cur);
		if (neigh) {
			for (const nId of neigh) {
				if (!reachableFromModifier.has(nId)) {
					queue.push(nId);
				}
			}
		}
	}

	return reachableFromModifier;
}

/**
 * Processes selection modifiers and builds modifier map
 *
 * @param {Array<Object>} nodes - Array of node objects
 * @param {Array<Object>} edges - Array of edge objects
 * @returns {Map<string, Object>} Map from target node ID to modifier configuration
 */
function processSelectionModifiers(nodes, edges) {
	const modifierByTargetId = new Map();
	const modifierNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.SELECTION_MODIFIER);

	// Use only manual edges for consistency with visual indicators
	const manualEdges = (edges || []).filter((e) => !(e.id && String(e.id).startsWith('flow-edge-')));

	const adjacency = buildAdjacencyMap(manualEdges);

	for (const mod of modifierNodes) {
		const willApply = shouldExecuteNode(mod.data.executionChance || 100);
		if (!willApply) continue; // Respect execution chance

		// Find all nodes reachable FROM the modifier via directed paths
		const reachableFromModifier = findReachableNodes(mod.id, adjacency);

		// Only consider targets that are reachable from this modifier
		const outgoing = manualEdges.filter((e) => e.source === mod.id);
		for (const edge of outgoing) {
			const target = nodes.find((n) => n.id === edge.target);
			if (!target || target.data.type === NODE_CATEGORIES.SELECTION_MODIFIER) continue;
			const targetId = target.data.id; // affect by node definition id

			// Check if any nodes of this type are reachable from the modifier
			const hasReachableNodes = nodes.some(
				(n) => n.data.id === targetId && reachableFromModifier.has(n.id)
			);

			if (hasReachableNodes && !modifierByTargetId.has(targetId)) {
				modifierByTargetId.set(targetId, {
					mode: (mod.data.currentValue?.selectionMode || 'random').toLowerCase(),
					min: Number(mod.data.currentValue?.minSelection ?? 1),
					max: Number(mod.data.currentValue?.maxSelection ?? 1),
					modifierInstanceId: mod.data.instanceId,
					reachableNodes: reachableFromModifier
				});
			}
		}
	}

	return modifierByTargetId;
}

/**
 * Groups nodes by category and definition ID
 *
 * @param {Array<Object>} nodes - Array of node objects
 * @returns {Map<string, Map<string, Array<Object>>>} Nested map: category -> definitionId -> nodes
 */
function groupNodesByCategory(nodes) {
	const nodesByCategory = new Map();
	for (const node of nodes) {
		if (
			node.data.type === NODE_CATEGORIES.ROUTER ||
			node.data.type === NODE_CATEGORIES.SELECTION_MODIFIER
		) {
			continue; // Skip routers and modifiers for regular processing
		}
		const category = node.data.type;
		if (!nodesByCategory.has(category)) nodesByCategory.set(category, new Map());
		const byId = nodesByCategory.get(category);
		const id = node.data.id;
		if (!byId.has(id)) byId.set(id, []);
		byId.get(id).push(node);
	}
	return nodesByCategory;
}

/**
 * Applies selection modifier logic to a group of nodes
 *
 * @param {Array<Object>} nodeList - Array of nodes to select from
 * @param {Object} modifier - Modifier configuration with min/max selection
 * @returns {Object} Object with selectedNodes and selectionInfo properties
 */
function applySelectionModifier(nodeList, modifier) {
	const total = nodeList.length;
	const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
	let min = clamp(modifier.min, 0, total);
	let max = clamp(modifier.max, 0, total);
	if (max < min) max = min;

	const availableNodes = [...nodeList];
	const successfulNodes = [];
	const failedNodes = [];
	let attempts = 0;
	const maxAttempts = availableNodes.length * 2; // Prevent infinite loops

	while (successfulNodes.length < max && availableNodes.length > 0 && attempts < maxAttempts) {
		attempts++;

		const randomIndex = Math.floor(Math.random() * availableNodes.length);
		const randomNode = availableNodes.splice(randomIndex, 1)[0];

		const executionChance = randomNode.data.executionChance || 100;
		const willExecute = shouldExecuteNode(executionChance);

		if (willExecute) {
			successfulNodes.push(randomNode);
		} else {
			failedNodes.push(randomNode);
		}
	}

	if (successfulNodes.length < min) {
		const needed = min - successfulNodes.length;
		const availableForForcing = failedNodes.slice(0, needed);

		for (const node of availableForForcing) {
			successfulNodes.push(node);
			const failedIndex = failedNodes.indexOf(node);
			if (failedIndex > -1) failedNodes.splice(failedIndex, 1);
		}
	}

	return {
		selectedNodes: successfulNodes,
		selectionInfo: {
			selectionApplied: true,
			selectionMode: 'random-execution',
			selectedCount: successfulNodes.length,
			minSelection: min,
			maxSelection: max,
			modifierInstanceId: modifier.modifierInstanceId,
			executionAttempts: attempts,
			forcedExecutions: Math.max(
				0,
				min - (successfulNodes.length - Math.max(0, min - successfulNodes.length))
			)
		}
	};
}

/**
 * Processes a group of nodes with potential selection modifier applied
 *
 * @param {Array<Object>} originalNodeList - Original list of nodes
 * @param {Object|null} modifier - Selection modifier configuration or null
 * @param {string} nodeId - Node definition ID
 * @returns {Object} Object with selectedNodes and selectionInfo
 */
function processNodeGroup(originalNodeList, modifier, nodeId) {
	let nodeList = [...originalNodeList];
	let selectedNodes = [...nodeList];
	let selectionInfo = { totalAvailable: nodeList.length };

	// Apply selection modifier if present for this nodeId
	if (modifier) {
		// Filter to only include nodes that are reachable from the modifier
		const reachableNodes = nodeList.filter(
			(n) => modifier.reachableNodes && modifier.reachableNodes.has(n.id)
		);

		// Only apply modifier if there are reachable nodes
		if (reachableNodes.length > 0) {
			// Replace nodeList with only reachable nodes for modifier application
			nodeList = reachableNodes;
			selectionInfo.totalAvailable = nodeList.length;
			selectionInfo.reachabilityFiltered = true;

			const result = applySelectionModifier(nodeList, modifier);
			selectedNodes = result.selectedNodes;
			selectionInfo = { ...selectionInfo, ...result.selectionInfo };
		}
		// If no nodes are reachable, the modifier doesn't apply, so we continue with all nodes
	}

	return { selectedNodes, selectionInfo };
}

/**
 * Processes selected nodes and applies execution chances
 *
 * @param {Array<Object>} selectedNodes - Array of selected nodes
 * @param {Object} selectionInfo - Selection information
 * @param {Function} getDefaultSettings - Function to get default settings for a node type
 * @returns {Object} Object with executedNodes and failedNodes arrays
 */
function processSelectedNodes(selectedNodes, selectionInfo, getDefaultSettings) {
	const executedNodes = [];
	const failedNodes = [];

	for (const node of selectedNodes) {
		const executionChance = node.data.executionChance || 100;
		const willExecute = shouldExecuteNode(executionChance);

		const nodeConfig = {
			id: node.data.id,
			type: node.data.type,
			instanceId: node.data.instanceId,
			executionChance: executionChance,
			executed: willExecute,
			...selectionInfo
		};

		if (willExecute) {
			nodeConfig.currentValue = node.data.currentValue;
			executedNodes.push(nodeConfig);
		} else {
			nodeConfig.currentValue = getDefaultSettings(node.data.type, node.data.id);
			nodeConfig.fallbackToDefault = true;
			failedNodes.push(nodeConfig);
		}
	}

	return { executedNodes, failedNodes };
}

/**
 * Ensures at least one node from each required category executes
 *
 * @param {Array<Object>} executedNodes - Array of executed nodes
 * @param {Array<Object>} nodeList - Array of available nodes
 * @param {Object} selectionInfo - Selection information
 * @param {Function} getDefaultSettings - Function to get default settings for a node type
 * @returns {void} Modifies executedNodes array in place
 */
function ensureRequiredExecution(executedNodes, nodeList, selectionInfo, getDefaultSettings) {
	if (executedNodes.length === 0 && nodeList.length > 0) {
		const fallbackNode = nodeList[Math.floor(Math.random() * nodeList.length)];
		executedNodes.push({
			id: fallbackNode.data.id,
			type: fallbackNode.data.type,
			instanceId: fallbackNode.data.instanceId,
			executionChance: 100,
			executed: true,
			currentValue: fallbackNode.data.currentValue,
			forcedExecution: true, // Mark as forced for guarantee
			...selectionInfo
		});
	}
}

/**
 * Adds default nodes for missing required types
 *
 * @param {Array<Object>} processedNodes - Array of processed nodes
 * @param {Set<string>} nodeTypesCovered - Set of covered node types
 * @param {Function} getDefaultSettings - Function to get default settings for a node type
 */
function addMissingRequiredNodes(processedNodes, nodeTypesCovered, getDefaultSettings) {
	const requiredTypes = [
		{ type: NODE_CATEGORIES.BASIC_SETTINGS, id: 'basic-settings' },
		{ type: NODE_CATEGORIES.NUMBER_OF_SONGS, id: 'number-of-songs' }
	];

	for (const required of requiredTypes) {
		if (!nodeTypesCovered.has(required.type)) {
			processedNodes.push({
				id: required.id,
				type: required.type,
				instanceId: `${required.id}-default`,
				executionChance: 100,
				executed: true,
				currentValue: getDefaultSettings(required.type, required.id),
				addedAsDefault: true
			});
		}
	}
}

/**
 * Main function to export configuration from nodes and edges
 *
 * @param {Array<Object>} nodes - Array of node objects
 * @param {Array<Object>} edges - Array of edge objects
 * @param {Object} configs - Configuration object containing node definitions
 * @returns {Object} Exported configuration object
 */
export function exportConfig(nodes, edges, configs) {
	const { ROUTER_CONFIG, BASIC_SETTINGS_CONFIG, NUMBER_OF_SONGS_CONFIG, FILTER_NODE_DEFINITIONS } =
		configs;

	// Filter out hidden nodes (svelte-flow hidden property)
	const visibleNodes = nodes.filter((node) => !(/** @type {any} */ (node).hidden));

	// Get IDs of visible nodes for edge filtering
	const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

	// Filter out edges connected to hidden nodes
	const visibleEdges = edges.filter(
		(edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
	);

	const processedNodes = [];
	const nodeTypesCovered = new Set();
	let routerInfo = null;

	// Create a bound version of getDefaultSettingsForNodeType with configs
	const getDefaultSettings = (nodeType, nodeId) =>
		getDefaultSettingsForNodeType(nodeType, nodeId, configs);

	// Find the router node first (from visible nodes only)
	const routerNode = visibleNodes.find((n) => n.data.type === NODE_CATEGORIES.ROUTER);
	if (routerNode) {
		const selectedRoute = selectRouteFromRouter(routerNode);
		routerInfo = {
			selectedRoute: selectedRoute?.id || null,
			selectedRouteName: selectedRoute?.name || 'Unknown',
			availableRoutes: routerNode.data.currentValue?.routes || []
		};

		// Add router to processed nodes
		processedNodes.push({
			id: routerNode.data.id,
			type: routerNode.data.type,
			instanceId: routerNode.data.instanceId,
			executionChance: 100,
			executed: true,
			currentValue: routerNode.data.currentValue,
			selectedRoute: selectedRoute?.id
		});
		nodeTypesCovered.add(NODE_CATEGORIES.ROUTER);
	}

	// Build active modifier map (using visible nodes and edges only)
	const modifierByTargetId = processSelectionModifiers(visibleNodes, visibleEdges);

	// Group nodes by category and definition ID (using visible nodes only)
	const nodesByCategory = groupNodesByCategory(visibleNodes);

	// Process each category/id group
	for (const [category, byId] of nodesByCategory) {
		for (const [nodeId, originalNodeList] of byId) {
			const modifier = modifierByTargetId.get(nodeId);

			// Process node group with potential modifier
			const { selectedNodes, selectionInfo } = processNodeGroup(originalNodeList, modifier, nodeId);

			// Process selected nodes with execution chances
			const { executedNodes, failedNodes } = processSelectedNodes(
				selectedNodes,
				selectionInfo,
				getDefaultSettings
			);

			// Ensure at least one node executes from required categories
			ensureRequiredExecution(executedNodes, originalNodeList, selectionInfo, getDefaultSettings);

			processedNodes.push(...executedNodes);
			processedNodes.push(...failedNodes);
			nodeTypesCovered.add(category);
		}
	}

	// Process Song List source nodes (includes both song-list and batch-user-list)
	// Only include source nodes that are connected to Number of Songs nodes (using visible nodes and edges)
	const songListNodes = visibleNodes.filter(
		(n) =>
			(n.data.type === NODE_CATEGORIES.SONG_LIST || n.data.type === NODE_CATEGORIES.BATCH_USER_LIST) &&
			isConnectedToFinalFlow(n.id, visibleEdges, visibleNodes)
	);
	const songLists = songListNodes.map((node) => {
		const value = node.data?.currentValue || {};

		// Check if this is a batch-user-list node
		if (node.data.id === 'batch-user-list') {
			return {
				nodeId: node.data.instanceId,
				nodeType: 'batch-user-list',
				mode: value.mode || 'manual',
				useEntirePool: value.useEntirePool || false,
				songPercentage: value.songPercentage || null, // Node-level percentage
				userEntries: value.userEntries || [] // Per-user percentages already on entries
			};
		}

		// Regular song-list node
		return {
			nodeId: node.data.instanceId,
			nodeType: 'song-list',
			mode: value.mode || 'masterlist',
			useEntirePool: value.useEntirePool || false,
			userListImport:
				value.mode === 'user-lists'
					? {
						platform: value.userListImport?.platform || 'anilist',
						username: value.userListImport?.username || '',
						selectedLists: value.userListImport?.selectedLists || {
							completed: true,
							watching: true,
							planning: false,
							on_hold: false,
							dropped: false
						}
					}
					: undefined,
			selectedListId: value.mode === 'saved-lists' ? value.selectedListId || null : undefined,
			selectedListName: value.mode === 'saved-lists' ? value.selectedListName || null : undefined
		};
	});

	const config = {
		nodes: processedNodes,
		songLists: songLists,
		routerInfo: routerInfo,
		timestamp: new Date().toISOString(),
		exportNote:
			'All nodes execute by default (except Basic Settings and Number of Songs which can only have one instance execute at a time - randomly selected if multiple exist). Execution chance provides fallback with guaranteed minimums. Song Lists define the base song pool(s).'
	};

	return config;
}
