/**
 * Validation utility functions for the AMQ+ Editor.
 * Provides comprehensive validation for all node types and their configurations.
 *
 * @module validationUtils
 */

import { NODE_CATEGORIES } from './nodeDefinitions.js';
import {
	VALIDATION_BOUNDS,
	isValidValue,
	isValidRange,
	ERROR_MESSAGES
} from './validationConfig.js';
import {
	BASIC_SETTINGS_DEFAULT_SETTINGS,
	SONG_DIFFICULTY_DEFAULT_SETTINGS,
	PLAYER_SCORE_DEFAULT_SETTINGS,
	ANIME_SCORE_DEFAULT_SETTINGS
} from './defaultNodeSettings.js';
import {
	extractBasicSettingsDisplay,
	extractNumberOfSongsDisplay
} from './displayUtils.js';
import { FilterRegistry } from './filters/index.js';

/**
 * Validation result for a single issue.
 * @typedef {Object} ValidationIssue
 * @property {boolean} ok - Whether the validation passed
 * @property {string} [nodeId] - ID of the node being validated (optional for graph-level issues)
 * @property {string} severity - Severity level of the issue
 * @property {string} short - Short description of the issue
 * @property {string} full - Detailed description of the issue
 */

/**
 * Validation result for a node.
 * @typedef {Object} NodeValidationResult
 * @property {string} nodeId - ID of the validated node
 * @property {boolean} isValid - Whether the node is valid
 * @property {ValidationIssue[]} issues - Array of validation issues
 * @property {Object} [displayData] - Display data for the node (if valid)
 */

/**
 * Complete validation result for the entire graph.
 * @typedef {Object} GraphValidationResult
 * @property {ValidationIssue[]} issues - All validation issues (errors and warnings)
 * @property {ValidationIssue[]} warnings - Warning-level validation issues
 * @property {boolean} isValid - Whether the entire graph is valid
 * @property {NodeValidationResult[]} nodes - Validation results for each node
 * @property {ValidationIssue[]} globalIssues - Issues that affect the entire graph
 * @property {number} totalIssues - Total number of issues found
 * @property {number} errorCount - Number of errors
 * @property {number} warningCount - Number of warnings
 */

/**
 * Validate router node configuration.
 * @param {import('./nodeDefinitions.js').NodeInstance} node - Router node to validate
 * @param {Array} edges - Array of edges to check for connections
 * @returns {ValidationIssue[]} Array of validation issues
 */
export function validateRouterNode(node, edges = []) {
	const routes = node?.data?.currentValue?.routes || [];
	const enabled = routes.filter((r) => r.enabled);
	if (enabled.length === 0) {
		return [
			{
				ok: false,
				nodeId: node.id,
				severity: 'error',
				short: 'Router has no enabled routes',
				full: 'At least one route must be enabled for the router to function.'
			}
		];
	}
	const total = enabled.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
	if (total !== 100) {
		return [
			{
				ok: false,
				nodeId: node.id,
				severity: 'error',
				short: `Router routes total ${total}% (must be 100%)`,
				full: 'The sum of percentages for enabled routes must equal 100%. Adjust route percentages or disable routes.'
			}
		];
	}

	// Warn if any enabled route has no outgoing edge
	const routeWarnings = [];
	for (const r of enabled) {
		const hasEdge = (edges || []).some(
			(e) => e.source === node.id && (e.sourceHandle ? e.sourceHandle === r.id : true)
		);
		if (!hasEdge) {
			routeWarnings.push({
				ok: true,
				nodeId: node.id,
				severity: /** @type {const} */ ('warning'),
				short: `Route "${r.name || r.id}" is not connected`,
				full: 'This route has no outgoing connection and will lead nowhere when selected.'
			});
		}
	}
	return routeWarnings;
}

/**
 * Validate basic settings node configuration
 * @param {import('./nodeDefinitions.js').NodeInstance} node - Basic settings node to validate
 * @returns {ValidationIssue[]} Array of validation issues
 */
export function validateBasicSettingsNode(node) {
	const v = node?.data?.currentValue || {};
	const gt = v.guessTime?.value || v.guessTime || {};
	if (gt.useRange) {
		const min = Number(gt.min ?? VALIDATION_BOUNDS.guessTime.min);
		const max = Number(gt.max ?? VALIDATION_BOUNDS.guessTime.max);
		if (!isValidRange(min, max, VALIDATION_BOUNDS.guessTime)) {
			return [
				{
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: 'Guess time range invalid',
					full: ERROR_MESSAGES.invalidRange(
						'Guess time',
						VALIDATION_BOUNDS.guessTime.min,
						VALIDATION_BOUNDS.guessTime.max
					)
				}
			];
		}
	} else {
		const sv = Number(
			gt.staticValue ?? BASIC_SETTINGS_DEFAULT_SETTINGS.guessTime.value.staticValue
		);
		if (!isValidValue(sv, VALIDATION_BOUNDS.guessTime)) {
			return [
				{
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: 'Guess time invalid',
					full: ERROR_MESSAGES.outOfRange(
						'Guess time',
						VALIDATION_BOUNDS.guessTime.min,
						VALIDATION_BOUNDS.guessTime.max
					)
				}
			];
		}
	}

	// Sample point
	const sp = v.samplePoint?.value || {};
	const spsv = Number(
		sp.staticValue ?? BASIC_SETTINGS_DEFAULT_SETTINGS.samplePoint.value.staticValue
	);
	if (sp.useRange) {
		const start = Number(sp.start ?? VALIDATION_BOUNDS.samplePoint.min);
		const end = Number(sp.end ?? VALIDATION_BOUNDS.samplePoint.max);
		if (!isValidRange(start, end, VALIDATION_BOUNDS.samplePoint)) {
			return [
				{
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: 'Sample point range invalid',
					full: ERROR_MESSAGES.invalidRange(
						'Sample point',
						VALIDATION_BOUNDS.samplePoint.min,
						VALIDATION_BOUNDS.samplePoint.max
					)
				}
			];
		}
	} else if (!isValidValue(spsv, VALIDATION_BOUNDS.samplePoint)) {
		return [
			{
				ok: false,
				nodeId: node.id,
				severity: 'error',
				short: 'Sample point invalid',
				full: ERROR_MESSAGES.outOfRange(
					'Sample point',
					VALIDATION_BOUNDS.samplePoint.min,
					VALIDATION_BOUNDS.samplePoint.max
				)
			}
		];
	}

	return [];
}

/**
 * Validate number of songs node configuration
 * @param {import('./nodeDefinitions.js').NodeInstance} node - Number of songs node to validate
 * @returns {ValidationIssue[]} Array of validation issues
 */
export function validateNumberOfSongsNode(node) {
	const v = node?.data?.currentValue || node?.data?.defaultValue || {};
	if (v.useRange) {
		const min = Number(v.min ?? 1);
		const max = Number(v.max ?? 200);
		if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 200 || min > max) {
			return [
				{
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: 'Song count range invalid',
					full: 'Final song count range must be within 1-200 and min ≤ max.'
				}
			];
		}
	} else {
		const sv = Number(v.staticValue ?? 20);
		if (!Number.isFinite(sv) || sv < 1 || sv > 200) {
			return [
				{
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: 'Song count invalid',
					full: 'Final song count must be within 1-200.'
				}
			];
		}
	}
	return [];
}


/**
 * Get inherited song total for validation purposes
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - Array of nodes to analyze
 * @returns {number|Object} Song total information
 */
export function getInheritedSongTotalForValidation(nodes = []) {
	// Find number of songs nodes
	const songNodes = nodes.filter((n) => n.data.type === 'numberOfSongs');

	if (songNodes.length === 0) {
		return {
			kind: 'static',
			value: 20,
			min: 20,
			max: 20
		}; // Default fallback with all properties
	}

	// Use the first active number of songs node
	const songNode = songNodes[0];
	const v = songNode?.data?.currentValue || {};

	if (v.useRange) {
		const min = Number(v.min ?? 1);
		const max = Number(v.max ?? 200);
		return {
			kind: 'range',
			min: min,
			max: max,
			value: max // Also provide value as max for compatibility
		};
	} else {
		const value = Number(v.staticValue ?? 20);
		return {
			kind: 'static',
			value: value,
			min: value, // For compatibility with range access
			max: value // For compatibility with range access
		};
	}
}

/**
 * Generate human-readable validation report
 * @param {ValidationIssue[]} issues - Validation issues
 * @param {ValidationIssue[]} warnings - Validation warnings
 * @param {Object} prediction - Prediction results
 * @returns {string} Human-readable report
 */
export function generateHumanReport(issues, warnings, prediction) {
	const parts = [];

	if (issues.length === 0 && warnings.length === 0) {
		parts.push('✅ Configuration looks good!');
	} else {
		if (issues.length > 0) {
			parts.push(`❌ ${issues.length} error${issues.length === 1 ? '' : 's'} found`);
		}
		if (warnings.length > 0) {
			parts.push(`⚠️ ${warnings.length} warning${warnings.length === 1 ? '' : 's'} found`);
		}
	}

	if (prediction) {
		if (!prediction.hasBasics) {
			parts.push('📝 Missing Basic Settings node');
		}
		if (!prediction.hasSongs) {
			parts.push('🎵 Missing Number of Songs node');
		}
		if (prediction.basicsCount > 1) {
			parts.push(`🔄 Multiple Basic Settings (${prediction.basicsCount})`);
		}
		if (prediction.songsCount > 1) {
			parts.push(`🔄 Multiple Number of Songs (${prediction.songsCount})`);
		}
	}

	return parts.join(' • ');
}

/**
 * Clear all node errors
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - Array of nodes to clear errors from
 * @returns {import('./nodeDefinitions.js').NodeInstance[]} Updated nodes with errors cleared
 */
export function clearAllNodeErrors(nodes) {
	return nodes.map((node) => ({
		...node,
		data: {
			...node.data,
			hasError: false,
			errorShort: null,
			errorFull: null
		}
	}));
}

/**
 * Build validation details for report
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - Array of nodes to analyze
 * @param {Array} edges - Array of edges to analyze for reachability
 * @returns {Object} Validation details structured for the ValidationModal
 */
export function buildValidationDetails(nodes = [], edges = []) {
	const basics = nodes.filter((n) => n.data.type === 'basicSettings');
	const songs = nodes.filter((n) => n.data.type === 'numberOfSongs');
	const filters = nodes.filter((n) => n.data.type === 'filter');
	const routerNode = nodes.find((n) => n.data.type === 'router');

	// Calculate reachability from router nodes
	const reachableNodeIds = new Set();
	if (routerNode) {
		const graphAdj = new Map();
		for (const e of edges) {
			if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
			graphAdj.get(e.source).add(e.target);
		}
		const seen = new Set();
		const q = [routerNode.id];
		while (q.length) {
			const cur = q.shift();
			if (seen.has(cur)) continue;
			seen.add(cur);
			const neigh = graphAdj.get(cur);
			if (neigh) for (const n of neigh) q.push(n);
		}
		// All seen nodes are reachable
		for (const nodeId of seen) {
			reachableNodeIds.add(nodeId);
		}
	}

	// Calculate probability for basic settings nodes
	const basicsCount = basics.length;
	const basicsData = basics.map((node) => {
		// Simple equal probability distribution for now
		const probability = basicsCount > 0 ? 1 / basicsCount : 1;
		return {
			id: node.id,
			instanceId: node.data.instanceId,
			title: node.data.title || 'Basic Settings',
			probability: probability,
			displayValues: extractBasicSettingsDisplay(node.data.currentValue),
			reachable: reachableNodeIds.has(node.id)
		};
	});

	// Calculate probability for number of songs nodes
	const songsCount = songs.length;
	const songsData = songs.map((node) => {
		// Simple equal probability distribution for now
		const probability = songsCount > 0 ? 1 / songsCount : 1;
		return {
			id: node.id,
			instanceId: node.data.instanceId,
			title: node.data.title || 'Number of Songs',
			probability: probability,
			displayValues: extractNumberOfSongsDisplay(node.data.currentValue),
			reachable: reachableNodeIds.has(node.id)
		};
	});

	// Build router data
	let routerData = null;
	if (routerNode) {
		const routes = (routerNode.data?.currentValue?.routes || [])
			.filter((r) => r && r.enabled)
			.map((r) => ({
				id: r.id,
				name: r.name || 'Unnamed Route',
				percentage: Number(r.percentage) || 0
			}));
		routerData = {
			id: routerNode.id,
			instanceId: routerNode.data.instanceId,
			title: routerNode.data.title || 'Router',
			routes: routes,
			reachable: reachableNodeIds.has(routerNode.id)
		};
	}

	// Build filters data
	const filtersData = filters.map((node) => {
		const inheritedSongCount = getInheritedSongTotalForValidation(nodes);
		let settings = null;

		// Use filter registry to extract settings
		const filter = FilterRegistry.get(node.data.id);
		if (filter && filter.extract) {
			settings = filter.extract(node.data.currentValue, { inheritedSongCount });
		} else {
			// Fallback to raw value if no extract function
			settings = node.data.currentValue;
		}

		// Calculate estimated execution probability from executionChance
		let estimatedExecutionProbability = { min: 1.0, max: 1.0 }; // Default 100%
		const executionChance = node.data?.executionChance;

		if (executionChance != null) {
			if (typeof executionChance === 'object' && executionChance !== null) {
				// Range-based execution chance
				if (executionChance.kind === 'range') {
					estimatedExecutionProbability = {
						min: (Number(executionChance.min) || 0) / 100,
						max: (Number(executionChance.max) || 100) / 100
					};
				}
			} else {
				// Static execution chance
				const chance = (Number(executionChance) || 100) / 100;
				estimatedExecutionProbability = { min: chance, max: chance };
			}
		}

		return {
			id: node.id,
			instanceId: node.data.instanceId,
			definitionId: node.data.id,
			title: node.data.title || node.data.id,
			settings: settings,
			rawCurrentValue: node.data.currentValue,
			estimatedExecutionProbability: estimatedExecutionProbability,
			reachable: reachableNodeIds.has(node.id)
		};
	});

	// Return structured data for ValidationModal
	return {
		router: routerData,
		basics: basicsData,
		numberOfSongs: songsData,
		filters: filtersData
	};
}

/**
 * Get node label for display purposes
 * @param {import('./nodeDefinitions.js').NodeInstance} node - Node to get label for
 * @returns {string} Display label for the node
 */
export function getNodeLabel(node) {
	if (!node) return 'Unknown node';
	return `${node.data?.title || node.data?.id || node.id} (${node.data?.instanceId || node.id})`;
}

/**
 * Predict validation outcome and unique basics/songs
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - Array of nodes to analyze
 * @returns {Object} Prediction object with hasBasics and hasSongs
 */
export function predictOutcomeUniqueBasicsAndSongs(nodes) {
	const basics = nodes.filter((n) => n.data?.id === 'basic-settings');
	const songs = nodes.filter((n) => n.data?.id === 'number-of-songs');

	return {
		hasBasics: basics.length > 0,
		hasSongs: songs.length > 0,
		uniqueBasics: basics.length,
		uniqueSongs: songs.length
	};
}

/**
 * Check if a node is connected to the final Number of Songs flow
 * This includes nodes that can reach Number of Songs nodes through any path,
 * including branching paths and direct connections
 * @param {string} nodeId - ID of the node to check
 * @param {Array} edges - Array of edges
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - Array of all nodes
 * @returns {boolean} True if the node is connected to a Number of Songs node
 */
export function isConnectedToFinalFlow(nodeId, edges, nodes) {
	// Find all Number of Songs nodes
	const numberOfSongsNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS);
	if (numberOfSongsNodes.length === 0) {
		// If no Number of Songs nodes exist, consider all nodes as connected
		return true;
	}

	// Build adjacency graph (directed graph)
	const graphAdj = new Map();
	for (const e of edges) {
		if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
		graphAdj.get(e.source).add(e.target);
	}

	// Build reverse adjacency graph (for incoming edges)
	const reverseGraphAdj = new Map();
	for (const e of edges) {
		if (!reverseGraphAdj.has(e.target)) reverseGraphAdj.set(e.target, new Set());
		reverseGraphAdj.get(e.target).add(e.source);
	}

	// First, find all nodes that CAN reach Number of Songs (by going forward)
	const nodesThatCanReachNumberOfSongs = new Set();
	for (const node of nodes) {
		if (node.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS) {
			nodesThatCanReachNumberOfSongs.add(node.id);
			continue;
		}

		const visited = new Set();
		const queue = [node.id];

		while (queue.length > 0) {
			const current = queue.shift();
			if (visited.has(current)) continue;
			visited.add(current);

			if (numberOfSongsNodes.some((n) => n.id === current)) {
				nodesThatCanReachNumberOfSongs.add(node.id);
				break;
			}

			const neighbors = graphAdj.get(current);
			if (neighbors) {
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor)) {
						queue.push(neighbor);
					}
				}
			}
		}
	}

	// Check if this specific node can reach Number of Songs OR if it's in the same connected component as a node that can
	if (nodesThatCanReachNumberOfSongs.has(nodeId)) {
		return true;
	}

	// Use bidirectional BFS to check if this node is in the same connected component as any node that can reach Number of Songs
	const visited = new Set();
	const queue = [nodeId];

	while (queue.length > 0) {
		const current = queue.shift();
		if (visited.has(current)) continue;
		visited.add(current);

		// If we reach a node that can reach Number of Songs, this node is connected
		if (nodesThatCanReachNumberOfSongs.has(current)) {
			return true;
		}

		// Add outgoing neighbors
		const neighbors = graphAdj.get(current);
		if (neighbors) {
			for (const neighbor of neighbors) {
				if (!visited.has(neighbor)) {
					queue.push(neighbor);
				}
			}
		}

		// Add incoming neighbors
		const incomingNeighbors = reverseGraphAdj.get(current);
		if (incomingNeighbors) {
			for (const neighbor of incomingNeighbors) {
				if (!visited.has(neighbor)) {
					queue.push(neighbor);
				}
			}
		}
	}

	return false;
}

/**
 * Get nodes reachable from a specific router route
 * @param {string} routerId - Router node ID
 * @param {string} routeId - Route ID
 * @param {Array} edges - Graph edges
 * @returns {Set<string>} Set of node IDs reachable from this route
 */
function getNodesReachableFromRoute(routerId, routeId, edges) {
	const graphAdj = new Map();
	for (const e of edges) {
		if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
		graphAdj.get(e.source).add(e.target);
	}

	// Start from edges that come from the selected route handle
	const startEdges = edges.filter(
		(e) => e.source === routerId && e.sourceHandle === routeId
	);

	const queue = startEdges.map((e) => e.target);
	const seen = new Set([routerId]); // Include router itself

	while (queue.length) {
		const nodeId = queue.shift();
		if (!nodeId || seen.has(nodeId)) continue;
		seen.add(nodeId);

		const neighbors = graphAdj.get(nodeId);
		if (neighbors) {
			for (const neighborId of neighbors) {
				if (!seen.has(neighborId)) {
					queue.push(neighborId);
				}
			}
		}
	}

	return seen;
}

/**
 * Validate per-user percentages within a single Batch User List or Live Node.
 * Per-user percentages must sum to 100% within the node if any are set.
 * @param {import('./nodeDefinitions.js').NodeInstance} node - The node to validate
 * @returns {ValidationIssue[]} Array of validation issues
 */
function validatePerUserPercentages(node) {
	const issues = [];
	const value = node.data?.currentValue;
	const userEntries = value?.userEntries || [];

	if (userEntries.length === 0) {
		return issues;
	}

	const nodeTitle = node.data.title ||
		(node.data.type === NODE_CATEGORIES.BATCH_USER_LIST ? 'Batch User List' : 'Live Node');
	const userLabel = node.data.type === NODE_CATEGORIES.BATCH_USER_LIST ? 'user' : 'player';

	// Collect per-user percentages
	const entries = [];
	let hasAnyPercentage = false;

	for (let i = 0; i < userEntries.length; i++) {
		const entry = userEntries[i];
		if (!entry.songPercentage) continue;

		hasAnyPercentage = true;
		const isRandom = entry.songPercentage.random === true;

		if (isRandom) {
			const min = entry.songPercentage.min ?? 0;
			const max = entry.songPercentage.max ?? 100;

			if (min < 0 || max > 100 || min > max) {
				issues.push({
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: `Invalid ${userLabel} percentage range in ${nodeTitle}`,
					full: `${nodeTitle}: ${userLabel} ${i + 1} has an invalid percentage range (${min}-${max}). Range must be 0-100 and min ≤ max.`
				});
				continue;
			}

			entries.push({ min, max, isRange: true });
		} else {
			const value = entry.songPercentage.value;
			if (value !== null && value !== undefined) {
				if (value < 0 || value > 100) {
					issues.push({
						ok: false,
						nodeId: node.id,
						severity: 'error',
						short: `Invalid ${userLabel} percentage in ${nodeTitle}`,
						full: `${nodeTitle}: ${userLabel} ${i + 1} has an invalid percentage (${value}%). Must be 0-100.`
					});
					continue;
				}
				entries.push({ value, isRange: false });
			}
		}
	}

	// If any per-user percentage is set, validate they sum to 100%
	if (hasAnyPercentage) {
		const staticSum = entries.filter((e) => !e.isRange).reduce((sum, e) => sum + e.value, 0);
		const rangeMins = entries.filter((e) => e.isRange).map((e) => e.min);
		const rangeMaxs = entries.filter((e) => e.isRange).map((e) => e.max);
		const minSum = rangeMins.reduce((sum, min) => sum + min, 0);
		const maxSum = rangeMaxs.reduce((sum, max) => sum + max, 0);

		if (entries.every((e) => !e.isRange)) {
			// All static values - must sum to exactly 100%
			if (Math.abs(staticSum - 100) > 0.01) {
				issues.push({
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: `Per-${userLabel} percentages sum to ${staticSum.toFixed(1)}% in ${nodeTitle}`,
					full: `${nodeTitle}: Per-${userLabel} percentages must sum to exactly 100% within this node. Current total: ${staticSum.toFixed(1)}%. Please adjust the percentages.`
				});
			}
		} else if (entries.every((e) => e.isRange)) {
			// All ranges - must allow for 100%
			if (minSum > 100 || maxSum < 100) {
				issues.push({
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: `Per-${userLabel} ranges don't allow 100% in ${nodeTitle}`,
					full: `${nodeTitle}: Per-${userLabel} percentage ranges must allow for a total of 100% (min sum: ${minSum}%, max sum: ${maxSum}%). Adjust the ranges.`
				});
			}
		} else {
			// Mixed static and ranges - combined must allow for 100%
			const totalMinPossible = staticSum + minSum;
			const totalMaxPossible = staticSum + maxSum;
			if (totalMinPossible > 100 || totalMaxPossible < 100) {
				issues.push({
					ok: false,
					nodeId: node.id,
					severity: 'error',
					short: `Per-${userLabel} percentages don't allow 100% in ${nodeTitle}`,
					full: `${nodeTitle}: Per-${userLabel} percentages must allow for 100% (range: ${totalMinPossible.toFixed(1)}% - ${totalMaxPossible.toFixed(1)}%). Adjust the values.`
				});
			}
		}
	}

	return issues;
}

/**
 * Validate source node percentages across all Song List, Batch User List, and Live Node nodes.
 * Ensures that if any percentage is set, all must be set and sum to 100%.
 * Only validates source nodes that are connected to a Number of Songs node.
 * Groups source nodes by route and validates each route separately.
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - The graph nodes
 * @param {Array} edges - Graph edges
 * @returns {ValidationIssue[]} Array of validation issues
 */
export function validateSourceNodePercentages(nodes = [], edges = []) {
	const issues = [];

	// Find all source nodes (Song List, Batch User List, and Live Node)
	const allSourceNodes = nodes.filter(
		(n) => n.data.type === NODE_CATEGORIES.SONG_LIST ||
			n.data.type === NODE_CATEGORIES.BATCH_USER_LIST ||
			n.data.type === NODE_CATEGORIES.LIVE_NODE
	);

	// Filter to only source nodes connected to Number of Songs
	const connectedSourceNodes = allSourceNodes.filter((n) => isConnectedToFinalFlow(n.id, edges, nodes));

	if (connectedSourceNodes.length === 0) {
		return issues;
	}

	// First, validate per-user percentages within each Batch User List and Live Node
	for (const node of connectedSourceNodes) {
		if (node.data.type === NODE_CATEGORIES.BATCH_USER_LIST ||
			node.data.type === NODE_CATEGORIES.LIVE_NODE) {
			issues.push(...validatePerUserPercentages(node));
		}
	}

	// Check if there's a router node
	const routerNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.ROUTER);

	// Group source nodes by route
	const routeGroups = [];

	if (routerNodes.length === 0) {
		// No router - all connected source nodes are in one group
		routeGroups.push({
			name: 'Main Flow',
			nodes: connectedSourceNodes
		});
	} else {
		// Has router(s) - group by route
		// For each router, check each enabled route
		for (const routerNode of routerNodes) {
			const routes = routerNode.data?.currentValue?.routes || [];
			const enabledRoutes = routes.filter((r) => r.enabled);

			for (const route of enabledRoutes) {
				const reachableNodeIds = getNodesReachableFromRoute(routerNode.id, route.id, edges);
				const routeSourceNodes = connectedSourceNodes.filter((n) => reachableNodeIds.has(n.id));

				if (routeSourceNodes.length > 0) {
					routeGroups.push({
						name: `Route: ${route.name || route.id}`,
						nodes: routeSourceNodes,
						routeId: route.id,
						routerId: routerNode.id
					});
				}
			}
		}

		// Also check for source nodes not on any route
		const allRouteNodeIds = new Set();
		for (const group of routeGroups) {
			for (const node of group.nodes) {
				allRouteNodeIds.add(node.id);
			}
		}

		const nodesNotOnAnyRoute = connectedSourceNodes.filter((n) => !allRouteNodeIds.has(n.id));
		if (nodesNotOnAnyRoute.length > 0) {
			routeGroups.push({
				name: 'Not on any route',
				nodes: nodesNotOnAnyRoute
			});
		}
	}

	// Validate each route group separately
	for (const group of routeGroups) {
		const groupIssues = validateSourceNodePercentagesForGroup(group.nodes, group.name);
		issues.push(...groupIssues);
	}

	return issues;
}

/**
 * Validate source node percentages for a specific group of source nodes
 * @param {import('./nodeDefinitions.js').NodeInstance[]} sourceNodes - Source nodes in this group
 * @param {string} groupName - Name of the group for error messages
 * @returns {ValidationIssue[]} Array of validation issues
 */
function validateSourceNodePercentagesForGroup(sourceNodes, groupName) {
	const issues = [];

	// Collect all source percentages in this group
	const percentages = [];

	for (const node of sourceNodes) {
		if (node.data.type === NODE_CATEGORIES.SONG_LIST) {
			const value = node.data?.currentValue;
			const sp = value?.songPercentage;

			percentages.push({
				nodeId: node.id,
				nodeTitle: node.data.title || 'Song List',
				value: sp?.value ?? null,
				isRange: sp?.random === true,
				min: sp?.min ?? null,
				max: sp?.max ?? null,
				source: 'song-list'
			});
		} else if (node.data.type === NODE_CATEGORIES.BATCH_USER_LIST) {
			const value = node.data?.currentValue;
			const nodeLevelPercentage = value?.songPercentage;

			// Only check node-level percentage for cross-node validation
			// Per-user percentages are internal distribution within this node
			if (nodeLevelPercentage !== null && nodeLevelPercentage !== undefined) {
				const sp = nodeLevelPercentage;
				percentages.push({
					nodeId: node.id,
					nodeTitle: node.data.title || 'Batch User List',
					value: sp?.value ?? null,
					isRange: sp?.random === true,
					min: sp?.min ?? null,
					max: sp?.max ?? null,
					source: 'batch-user-list'
				});
			}
			// If no node-level percentage, this node doesn't participate in cross-node percentage validation
		} else if (node.data.type === NODE_CATEGORIES.LIVE_NODE) {
			const value = node.data?.currentValue;
			const nodeLevelPercentage = value?.songPercentage;

			// Only check node-level percentage for cross-node validation
			// Per-player percentages are internal distribution within this node
			if (nodeLevelPercentage !== null && nodeLevelPercentage !== undefined) {
				const sp = nodeLevelPercentage;
				percentages.push({
					nodeId: node.id,
					nodeTitle: node.data.title || 'Live Node',
					value: sp?.value ?? null,
					isRange: sp?.random === true,
					min: sp?.min ?? null,
					max: sp?.max ?? null,
					source: 'live-node'
				});
			}
			// If no node-level percentage, this node doesn't participate in cross-node percentage validation
		}
	}

	// If no source nodes in this group, no validation needed
	if (percentages.length === 0) {
		return issues;
	}

	// Check if any percentages are set (either value or range)
	const hasAnyPercentage = percentages.some(p => p.value !== null || (p.min !== null && p.max !== null));
	const hasAllPercentages = percentages.every(p => p.value !== null || (p.min !== null && p.max !== null));

	// If some but not all have percentages, that's an error
	if (hasAnyPercentage && !hasAllPercentages) {
		const withoutPercentage = percentages.filter(p => p.value === null && (p.min === null || p.max === null));
		issues.push({
			ok: false,
			severity: 'error',
			short: `Incomplete source percentage configuration (${groupName})`,
			full: `In ${groupName}: Some source nodes have percentages set while others do not. Either all source nodes in this route must have percentages, or none should. Missing percentages: ${withoutPercentage.map(p => p.nodeTitle).join(', ')}`
		});
		return issues;
	}

	// If no percentages are set, that's fine (use all songs)
	if (!hasAnyPercentage) {
		return issues;
	}

	// Validate individual percentages
	const invalidPercentages = [];
	let staticTotal = 0;
	let hasRandomRanges = false;
	let minTotal = 0;
	let maxTotal = 0;

	for (const item of percentages) {
		if (item.isRange) {
			hasRandomRanges = true;
			const min = Number(item.min);
			const max = Number(item.max);

			if (!Number.isFinite(min) || !Number.isFinite(max)) {
				invalidPercentages.push({
					...item,
					reason: 'min/max must be valid numbers'
				});
				continue;
			}

			if (min < 0 || max > 100 || min > max) {
				invalidPercentages.push({
					...item,
					reason: `range ${min}-${max} is invalid (must be 0-100 and min ≤ max)`
				});
				continue;
			}

			minTotal += min;
			maxTotal += max;
		} else {
			const val = Number(item.value);

			if (!Number.isFinite(val)) {
				invalidPercentages.push({
					...item,
					reason: 'not a valid number'
				});
				continue;
			}

			if (val < 0 || val > 100) {
				invalidPercentages.push({
					...item,
					reason: 'out of range (0-100)'
				});
				continue;
			}

			staticTotal += val;
		}
	}

	// Report invalid percentages
	if (invalidPercentages.length > 0) {
		for (const invalid of invalidPercentages) {
			issues.push({
				ok: false,
				nodeId: invalid.nodeId,
				severity: 'error',
				short: `Invalid percentage: ${invalid.nodeTitle}`,
				full: `In ${groupName}: Percentage for "${invalid.nodeTitle}" is ${invalid.reason}.`
			});
		}
	}

	// Validate totals
	if (!hasRandomRanges) {
		// All static - must equal 100
		const tolerance = 0.01;
		if (Math.abs(staticTotal - 100) > tolerance) {
			issues.push({
				ok: false,
				severity: 'error',
				short: `Source percentages sum to ${staticTotal.toFixed(1)}% (${groupName})`,
				full: `In ${groupName}: All source node percentages must sum to exactly 100%. Current total: ${staticTotal.toFixed(1)}%. Please adjust the percentages.`
			});
		}
	} else {
		// Has random ranges - validate min/max totals
		if (staticTotal + minTotal > 100) {
			issues.push({
				ok: false,
				severity: 'error',
				short: `Source percentage min total exceeds 100% (${groupName})`,
				full: `In ${groupName}: Combined minimum values (static: ${staticTotal}% + random min: ${minTotal}%) exceed 100%. Adjust ranges.`
			});
		}

		if (staticTotal + maxTotal < 100) {
			issues.push({
				ok: false,
				severity: 'error',
				short: `Source percentage max total below 100% (${groupName})`,
				full: `In ${groupName}: Combined maximum values (static: ${staticTotal}% + random max: ${maxTotal}%) cannot reach 100%. Adjust ranges.`
			});
		}
	}

	return issues;
}

/**
 * Main validation function that orchestrates all checks.
 * @param {import('./nodeDefinitions.js').NodeInstance[]} nodes - The graph nodes.
 * @param {Array} edges - The graph edges.
 * @returns {GraphValidationResult} Validation result with issues and warnings
 */
export function validateConfiguration(nodes = [], edges = []) {
	/** @type {ValidationIssue[]} */
	const issues = [];
	/** @type {ValidationIssue[]} */
	const warnings = [];

	// Check connectivity to final flow for all nodes
	for (const n of nodes) {
		// Skip Number of Songs nodes themselves (they are the final destination)
		if (n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS) {
			continue;
		}

		// Check if node is connected to the final flow
		if (!isConnectedToFinalFlow(n.id, edges, nodes)) {
			warnings.push({
				ok: true,
				nodeId: n.id,
				severity: 'warning',
				short: 'Node not connected to final flow',
				full: 'This node is not in the same connected component as any Number of Songs node and will not affect the final quiz configuration.'
			});
		}
	}

	// Execution chance sanity for all nodes
	for (const n of nodes) {
		const executionChance = n.data?.executionChance;
		if (executionChance == null) {
			continue; // Use default
		}
		if (typeof executionChance === 'object' && executionChance !== null) {
			if (
				executionChance &&
				typeof executionChance === 'object' &&
				/** @type {any} */ (executionChance).kind === 'range'
			) {
				const min = Number(/** @type {any} */(executionChance).min);
				const max = Number(/** @type {any} */(executionChance).max);
				if (!Number.isFinite(min) || !Number.isFinite(max)) {
					issues.push({
						ok: false,
						nodeId: n.id,
						severity: 'error',
						short: 'Execution chance range invalid',
						full: 'Execution chance range values must be valid numbers.'
					});
				} else if (min < 0 || min > 100 || max < 0 || max > 100) {
					issues.push({
						ok: false,
						nodeId: n.id,
						severity: 'error',
						short: 'Execution chance range out of bounds',
						full: 'Execution chance range values must be between 0 and 100.'
					});
				} else if (min > max) {
					issues.push({
						ok: false,
						nodeId: n.id,
						severity: 'error',
						short: 'Execution chance range invalid',
						full: 'Minimum execution chance must be less than or equal to maximum.'
					});
				}
			} else {
				issues.push({
					ok: false,
					nodeId: n.id,
					severity: 'error',
					short: 'Execution chance format invalid',
					full: 'Execution chance must be a number or range object.'
				});
			}
		} else {
			const ch = Number(executionChance);
			if (!Number.isFinite(ch) || ch < 0 || ch > 100) {
				issues.push({
					ok: false,
					nodeId: n.id,
					severity: 'error',
					short: 'Execution chance invalid',
					full: 'Execution chance must be between 0 and 100.'
				});
			}
		}
	}

	// Router validation(s)
	for (const router of nodes.filter((n) => n.data.type === NODE_CATEGORIES.ROUTER)) {
		const res = validateRouterNode(router, edges) || [];
		for (const r of res) (r.severity === 'warning' ? warnings : issues).push(r);
	}

	// Basic settings validation
	for (const b of nodes.filter((n) => n.data.type === NODE_CATEGORIES.BASIC_SETTINGS)) {
		for (const r of validateBasicSettingsNode(b)) issues.push(r);
	}

	// Number of songs validation
	const numberOfSongsNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS);
	for (const s of numberOfSongsNodes) {
		for (const r of validateNumberOfSongsNode(s)) issues.push(r);
	}

	// Validate count mode restriction when multiple number-of-songs nodes exist on the SAME route
	if (numberOfSongsNodes.length > 1) {
		// Check if multiple Number of Songs nodes are on the same route
		const routerNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.ROUTER);
		let multipleSongsOnSameRoute = false;

		if (routerNodes.length > 0) {
			// Build a graph to determine which nodes are reachable from each route
			const graphAdj = new Map();
			for (const edge of edges) {
				if (!graphAdj.has(edge.source)) graphAdj.set(edge.source, new Set());
				graphAdj.get(edge.source).add(edge.target);
			}

			// For each router, find which Number of Songs nodes are reachable from each route
			for (const routerNode of routerNodes) {
				const routes = routerNode.data?.currentValue?.routes || [];
				const enabledRoutes = routes.filter((r) => r.enabled);

				for (const route of enabledRoutes) {
					const reachableNodes = new Set();
					const queue = [];

					// Find edges from this specific route
					const routeEdges = edges.filter(
						(e) => e.source === routerNode.id && e.sourceHandle === route.id
					);

					for (const edge of routeEdges) {
						queue.push(edge.target);
					}

					// BFS to find all reachable nodes from this route
					while (queue.length > 0) {
						const nodeId = queue.shift();
						if (reachableNodes.has(nodeId)) continue;
						reachableNodes.add(nodeId);

						const neighbors = graphAdj.get(nodeId);
						if (neighbors) {
							for (const neighborId of neighbors) {
								if (!reachableNodes.has(neighborId)) {
									queue.push(neighborId);
								}
							}
						}
					}

					// Check which Number of Songs nodes are reachable from this route
					const reachableSongsNodes = numberOfSongsNodes.filter((node) =>
						reachableNodes.has(node.id)
					);

					if (reachableSongsNodes.length > 1) {
						multipleSongsOnSameRoute = true;
						break;
					}
				}
				if (multipleSongsOnSameRoute) break;
			}
		}

		// Only restrict count mode if multiple songs nodes are on the same route
		if (multipleSongsOnSameRoute) {
			// Check all nodes for count mode
			for (const node of nodes) {
				const value = node?.data?.currentValue || {};
				const nodeId = node.data.id;

				// Check if node has count mode
				let hasCountMode = false;

				if (nodeId === 'songs-and-types' && value.mode === 'count') {
					hasCountMode = true;
				} else if (nodeId === 'song-difficulty' && value.mode === 'count') {
					hasCountMode = true;
				} else if (nodeId === 'anime-type' && value.mode === 'count') {
					hasCountMode = true;
				} else if ((nodeId === 'genres' || nodeId === 'tags') && value.mode === 'count') {
					hasCountMode = true;
				} else if (nodeId === 'vintage' && value.mode === 'count') {
					hasCountMode = true;
				} else if (
					(nodeId === 'player-score' || nodeId === 'anime-score') &&
					value.mode === 'count'
				) {
					hasCountMode = true;
				}

				if (hasCountMode) {
					issues.push({
						ok: false,
						nodeId: node.id,
						severity: 'error',
						short: 'Count mode not allowed with multiple song count nodes',
						full: 'Count mode is not allowed when there are multiple "Number of Songs" nodes in the same route. Please use percentage mode instead or remove duplicate song count nodes.'
					});
				}
			}
		}
	}

	// Filter nodes validation using FilterRegistry
	for (const f of nodes.filter((n) => n.data.type === NODE_CATEGORIES.FILTER)) {
		const filter = FilterRegistry.get(f.data.id);
		if (filter && filter.validate) {
			const totalSongs = getInheritedSongTotalForValidation(nodes);
			const context = {
				inheritedSongCount: totalSongs,
				mode: f.data.currentValue?.mode,
				executionChance: f.data.executionChance
			};

			try {
				const result = filter.validate(f.data.currentValue || {}, context);
				if (result && result.errors && result.errors.length > 0) {
					// Convert validation errors to ValidationIssue format
					for (const errorMsg of result.errors) {
						issues.push({
							ok: false,
							nodeId: f.id,
							severity: 'error',
							short: errorMsg,
							full: errorMsg
						});
					}
				}
				if (result && result.warnings && result.warnings.length > 0) {
					// Convert validation warnings to ValidationIssue format
					for (const warningMsg of result.warnings) {
						warnings.push({
							ok: true,
							nodeId: f.id,
							severity: 'warning',
							short: warningMsg,
							full: warningMsg
						});
					}
				}
			} catch (error) {
				console.error(`Validation error for filter ${f.data.id}:`, error);
				issues.push({
					ok: false,
					nodeId: f.id,
					severity: 'error',
					short: 'Validation system error',
					full: `An error occurred during validation: ${error.message}`
				});
			}
		}
	}

	const manualEdges = (edges || []).filter((e) => !(e.id && String(e.id).startsWith('flow-edge-')));
	const adjacency = new Map();
	for (const e of manualEdges) {
		if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
		adjacency.get(e.source).add(e.target);
	}
	function reachableFrom(startId) {
		const visited = new Set();
		const q = [startId];
		while (q.length) {
			const cur = q.shift();
			if (visited.has(cur)) continue;
			visited.add(cur);
			const neigh = adjacency.get(cur);
			if (neigh) for (const n of neigh) q.push(n);
		}
		return visited;
	}
	for (const mod of nodes.filter((n) => n.data.type === NODE_CATEGORIES.SELECTION_MODIFIER)) {
		const reach = reachableFrom(mod.id);
		const targetsByTypeId = new Map();
		for (const n of nodes) {
			if (n.data.type === NODE_CATEGORIES.SELECTION_MODIFIER) continue;
			if (reach.has(n.id)) {
				const id = n.data.id;
				if (!targetsByTypeId.has(id)) targetsByTypeId.set(id, []);
				targetsByTypeId.get(id).push(n);
			}
		}
		const minSel = Number(mod.data.currentValue?.minSelection ?? 1);
		const maxSel = Number(mod.data.currentValue?.maxSelection ?? 1);
		for (const [tId, list] of targetsByTypeId) {
			if (maxSel > list.length) {
				issues.push({
					ok: false,
					nodeId: mod.id,
					severity: 'error',
					short: `Modifier maxSelection ${maxSel} > reachable ${list.length}`,
					full: `Reduce maxSelection or connect more "${tId}" nodes.`
				});
			}
			if (minSel > list.length) {
				issues.push({
					ok: false,
					nodeId: mod.id,
					severity: 'error',
					short: `Modifier minSelection ${minSel} > reachable ${list.length}`,
					full: `Reduce minSelection or connect more "${tId}" nodes.`
				});
			}
		}
	}

	for (const e of edges) {
		const source = nodes.find((n) => n.id === e.source);
		const target = nodes.find((n) => n.id === e.target);
		if (
			source &&
			target &&
			target.data.type === NODE_CATEGORIES.BASIC_SETTINGS &&
			!(
				source.data.type === NODE_CATEGORIES.ROUTER ||
				source.data.type === NODE_CATEGORIES.SELECTION_MODIFIER ||
				source.data.type === NODE_CATEGORIES.BASIC_SETTINGS ||
				(source.data.type === NODE_CATEGORIES.SONG_LIST && source.data['isSourceNode']) ||
				(source.data.type === NODE_CATEGORIES.BATCH_USER_LIST && source.data['isSourceNode']) ||
				(source.data.type === NODE_CATEGORIES.LIVE_NODE && source.data['isSourceNode'])
			)
		) {
			issues.push({
				ok: false,
				nodeId: target.id,
				severity: 'error',
				short: 'Invalid connection',
				full: 'Basic Settings can only accept connections from Router nodes, Selection Modifiers, other Basic Settings nodes, and source nodes.'
			});
		}
	}

	const router = nodes.find((n) => n.data.type === NODE_CATEGORIES.ROUTER);
	if (router) {
		const graphAdj = new Map();
		for (const e of edges) {
			if (!graphAdj.has(e.source)) graphAdj.set(e.source, new Set());
			graphAdj.get(e.source).add(e.target);
		}
		const seen = new Set();
		const q = [router.id];
		while (q.length) {
			const cur = q.shift();
			if (seen.has(cur)) continue;
			seen.add(cur);
			const neigh = graphAdj.get(cur);
			if (neigh) for (const n of neigh) q.push(n);
		}
		for (const n of nodes) {
			if (
				!seen.has(n.id) &&
				n.data.type !== NODE_CATEGORIES.ROUTER &&
				n.data.type !== NODE_CATEGORIES.SELECTION_MODIFIER
			) {
				warnings.push({
					ok: false,
					nodeId: n.id,
					severity: /** @type {const} */ ('error'),
					short: 'Node unreachable from Router',
					full: `${getNodeLabel(n)} is not reachable from any Router route.`
				});
			}
		}
	}

	(function detectCycles() {
		const g = new Map();
		for (const e of edges) {
			if (!g.has(e.source)) g.set(e.source, []);
			g.get(e.source).push(e.target);
		}
		const temp = new Set();
		const perm = new Set();
		let found = false;
		function visit(v) {
			if (perm.has(v) || found) return;
			if (temp.has(v)) {
				found = true;
				return;
			}
			temp.add(v);
			for (const n of g.get(v) || []) visit(n);
			temp.delete(v);
			perm.add(v);
		}
		for (const n of nodes) visit(n.id);
		if (found)
			warnings.push({
				ok: true,
				severity: /** @type {const} */ ('warning'),
				short: 'Cycle detected in graph',
				full: 'Cycles may cause unexpected behavior.'
			});
	})();

	const basics = nodes.filter((n) => n.data.type === NODE_CATEGORIES.BASIC_SETTINGS);
	const songs = nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS);

	function isGuaranteedExecution(executionChance) {
		if (executionChance == null) return true;
		if (typeof executionChance === 'object' && executionChance !== null) {
			if (
				executionChance &&
				typeof executionChance === 'object' &&
				/** @type {any} */ (executionChance).kind === 'range'
			) {
				return /** @type {any} */ (executionChance).max >= 100;
			}
			return false;
		}
		return Number(executionChance) >= 100;
	}

	const guaranteedBasics = basics.filter((n) => isGuaranteedExecution(n.data.executionChance));
	const guaranteedSongs = songs.filter((n) => isGuaranteedExecution(n.data.executionChance));

	// Only warn about multiple Number of Songs nodes if they're on the same route
	if (guaranteedSongs.length > 1) {
		// Check if there are any router nodes that would separate these into different routes
		const routerNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.ROUTER);

		if (routerNodes.length === 0) {
			// No router nodes, so all songs nodes are on the same route - warn
			warnings.push({
				ok: true,
				nodeId: guaranteedSongs[0].id,
				severity: 'warning',
				short: 'Multiple Number of Songs with 100% execution chance',
				full: 'Multiple Number of Songs nodes have 100% execution chance. Only one will execute at runtime by random selection.'
			});
		}
	}
	if (basics.length > 1 && guaranteedBasics.length <= 1) {
		warnings.push({
			ok: true,
			severity: 'warning',
			short: 'Multiple Basic Settings present',
			full: 'Only one Basic Settings will be used at runtime by random choice.'
		});
	}
	if (songs.length > 1 && guaranteedSongs.length <= 1) {
		warnings.push({
			ok: true,
			severity: 'warning',
			short: 'Multiple Number of Songs present',
			full: 'Only one Number of Songs will be used at runtime by random choice.'
		});
	}

	// Check for required filter nodes
	const requiredFilters = [
		'songs-and-types',
		'anime-type',
		'vintage',
		'song-difficulty',
		'player-score',
		'anime-score',
		'song-categories',
		'genres',
		'tags'
	];

	const presentFilterIds = new Set();
	for (const node of nodes) {
		if (node.data.type === NODE_CATEGORIES.FILTER) {
			presentFilterIds.add(node.data.id);
		}
	}

	for (const requiredFilter of requiredFilters) {
		if (!presentFilterIds.has(requiredFilter)) {
			issues.push({
				ok: false,
				severity: 'error',
				short: `Missing required filter: ${requiredFilter}`,
				full: `The filter node "${requiredFilter}" is required for proper configuration. Please add it to your setup.`
			});
		}
	}

	// Number of Songs node validation - at least one is required
	const songsNodes = nodes.filter((n) => n.data.type === NODE_CATEGORIES.NUMBER_OF_SONGS);
	if (songsNodes.length === 0) {
		issues.push({
			ok: false,
			severity: 'error',
			short: 'Missing Number of Songs node',
			full: 'A Number of Songs node is required to determine the final song count.'
		});
	}

	// Source node validation - at least one Song List node is required
	const sourceNodes = nodes.filter(
		(n) =>
			n.data.type === NODE_CATEGORIES.SONG_LIST ||
			n.data.type === NODE_CATEGORIES.BATCH_USER_LIST ||
			n.data.type === NODE_CATEGORIES.LIVE_NODE
	);
	if (sourceNodes.length === 0) {
		issues.push({
			ok: false,
			severity: 'error',
			short: 'No source node found',
			full: 'At least one Song List source node is required. Add a Song List node, Batch User List node, or Live Node to provide the base song pool.'
		});
	}

	// Check if at least one source node is connected to a Number of Songs node
	const connectedSourceNodes = sourceNodes.filter((n) => isConnectedToFinalFlow(n.id, edges, nodes));
	if (connectedSourceNodes.length === 0 && sourceNodes.length > 0) {
		issues.push({
			ok: false,
			severity: 'error',
			short: 'No connected source nodes',
			full: 'At least one Song List, Batch User List, or Live Node must be connected to other nodes that ultimately reach a Number of Songs node. Disconnected source nodes will not be used.'
		});
	}

	// Validate each Song List, Batch User List, and Live Node node configuration
	for (const sourceNode of sourceNodes) {
		const value = sourceNode.data?.currentValue;
		if (!value) {
			issues.push({
				ok: false,
				nodeId: sourceNode.id,
				severity: 'error',
				short: 'Source node not configured',
				full: 'Source node has no configuration. Please configure the node.'
			});
			continue;
		}

		// Validate Song List nodes
		if (sourceNode.data.id === 'song-list') {
			// Validate based on mode
			if (value.mode === 'user-lists') {
				if (!value.userListImport?.username?.trim()) {
					issues.push({
						ok: false,
						nodeId: sourceNode.id,
						severity: 'error',
						short: 'Username required',
						full: 'User list import requires a username. Please enter a username in the node settings.'
					});
				}
			} else if (value.mode === 'saved-lists') {
				if (!value.selectedListId) {
					issues.push({
						ok: false,
						nodeId: sourceNode.id,
						severity: 'error',
						short: 'No list selected',
						full: 'Exactly one saved list must be selected. Please select a list in the node settings.'
					});
				}
			}
			// masterlist mode has no additional validation requirements
		}

		// Validate Batch User List nodes
		if (sourceNode.data.id === 'batch-user-list') {
			if (!value.userEntries || !Array.isArray(value.userEntries)) {
				issues.push({
					ok: false,
					nodeId: sourceNode.id,
					severity: 'error',
					short: 'No user entries',
					full: 'Batch User List requires at least one user entry. Please add user entries in the node settings.'
				});
			} else if (value.userEntries.length === 0) {
				issues.push({
					ok: false,
					nodeId: sourceNode.id,
					severity: 'error',
					short: 'No user entries',
					full: 'Batch User List requires at least one user entry. Please add user entries in the node settings.'
				});
			} else {
				// Check if at least one entry has a valid username
				const validEntries = value.userEntries.filter((entry) => entry.username?.trim());
				if (validEntries.length === 0) {
					issues.push({
						ok: false,
						nodeId: sourceNode.id,
						severity: 'error',
						short: 'No valid usernames',
						full: 'At least one user entry must have a valid username. Please enter usernames in the node settings.'
					});
				}
			}
		}

		// Validate Live Node nodes
		// Live Node is configured from AMQ, so we skip username validation
		// Empty userEntries is okay for Live Node - they'll be populated from AMQ
	}

	// Validate source node percentages
	const percentageIssues = validateSourceNodePercentages(nodes, edges);
	issues.push(...percentageIssues);

	const totalIssues = issues.length;
	const errorCount = issues.filter((i) => i.severity === 'error').length;
	const warningCount = issues.filter((i) => i.severity === 'warning').length;
	const isValid = errorCount === 0;

	return {
		// @ts-ignore - some global issues don't have nodeId, which is valid for graph-level issues
		issues,
		// @ts-ignore
		warnings,
		isValid,
		nodes: [],
		// @ts-ignore
		globalIssues: issues,
		totalIssues,
		errorCount,
		warningCount
	};
}
