<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		useSvelteFlow,
		ConnectionLineType,
		type Node as BaseNode,
		type Edge as BaseEdge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	// Custom type definitions for node data
	interface CustomNodeData {
		id: string;
		type: string;
		instanceId: string;
		title: string;
		description: string;
		icon: string;
		color: string;
		deletable: boolean;
		currentValue?: any;
		executionChance?: number | { kind: string; min?: number; max?: number };
		onValueChange?: (payload: { nodeId: string; newValue: any }) => void;
		onDelete?: (instanceId: string) => void;
		userPositioned?: boolean;
		selectionModified?: boolean;
		routeBadges?: Array<{ label: string; name: string; routeId: string; routerId: string }>;
		validationError?: boolean;
		validationWarning?: boolean;
		validationMessage?: string;
		validationShortMessage?: string;
		openDefaultSettings?: boolean;
		[key: string]: any;
	}

	// Custom node type that extends BaseNode with custom data
	type CustomNode = BaseNode<CustomNodeData>;

	// Custom edge type that extends BaseEdge
	type CustomEdge = BaseEdge;

	// Import node components
	import RouterNode from '$lib/components/amqplus/editor/nodes/RouterNode.svelte';
	import BasicSettingsNode from '$lib/components/amqplus/editor/nodes/BasicSettingsNode.svelte';
	import FilterNode from '$lib/components/amqplus/editor/nodes/FilterNode.svelte';
	import NumberOfSongsNode from '$lib/components/amqplus/editor/nodes/NumberOfSongsNode.svelte';
	import SelectionModifierNode from '$lib/components/amqplus/editor/nodes/SelectionModifierNode.svelte';
	import SongListNode from '$lib/components/amqplus/editor/nodes/SongListNode.svelte';
	import BatchUserListNode from '$lib/components/amqplus/editor/nodes/BatchUserListNode.svelte';
	import LiveNode from '$lib/components/amqplus/editor/nodes/LiveNode.svelte';
	import SourceSelectorNode from '$lib/components/amqplus/editor/nodes/SourceSelectorNode.svelte';

	import AddNodesDrawer from '$lib/components/amqplus/editor/ui/AddNodesDrawer.svelte';

	import { Button } from '$lib/components/ui/button';
	import ContextMenu from '$lib/components/amqplus/editor/ui/ContextMenu.svelte';
	import PercentageChanceModal from '$lib/components/amqplus/editor/dialogs/PercentageChanceModal.svelte';
	import HelpDialog from '$lib/components/amqplus/editor/dialogs/HelpDialog.svelte';
	import ValidationModal from '$lib/components/amqplus/editor/dialogs/ValidationModal.svelte';
	import ExportSimulationModal from '$lib/components/amqplus/editor/dialogs/ExportSimulationModal.svelte';
	import LoadQuizModal from '$lib/components/amqplus/editor/dialogs/LoadQuizModal.svelte';
	import TemplateGuideModal from '$lib/components/amqplus/editor/dialogs/TemplateGuideModal.svelte';
	import ShareDialog from '$lib/components/amqplus/editor/dialogs/ShareDialog.svelte';

	// Import SvelteKit utilities
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	// @ts-ignore
	import { onMount, setContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	// Import node definitions and utilities
	import {
		createNodeInstance,
		NODE_CATEGORIES,
		getDefaultTemplate
	} from '$lib/components/amqplus/editor/utils/nodeDefinitions.js';

	// Import utility functions
	import { handleNodeValueChangeRescaling } from '$lib/components/amqplus/editor/utils/rescalingUtils.js';
	import { exportConfig as exportConfigUtil } from '$lib/components/amqplus/editor/utils/configExportUtils.js';
	import {
		createEdgeWithData,
		updateAllEdgeTypes,
		handleEdgesChange
	} from '$lib/components/amqplus/editor/utils/edgeUtils.js';
	import {
		NODE_SPACING_X,
		START_X,
		START_Y,
		markNodeAsUserPositioned
	} from '$lib/components/amqplus/editor/utils/layoutUtils.js';
	import { validateConfiguration } from '$lib/components/amqplus/editor/utils/validationUtils.js';
	import {
		initializeSongsAndTypesMode,
		initializeSongDifficultyMode,
		initializeAnimeTypeMode
	} from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';

	// Define node types for the new system
	const nodeTypes = {
		router: RouterNode,
		basicSettings: BasicSettingsNode,
		filter: FilterNode,
		numberOfSongs: NumberOfSongsNode,
		selectionModifier: SelectionModifierNode,
		songList: SongListNode,
		batchUserList: BatchUserListNode,
		liveNode: LiveNode,
		sourceSelector: SourceSelectorNode
	};

	// Use custom deletable edge
	import CustomReconnectEdge from '$lib/components/amqplus/editor/edges/CustomReconnectEdge.svelte';
	const edgeTypes = {
		deletable: CustomReconnectEdge,
		default: CustomReconnectEdge,
		straight: CustomReconnectEdge,
		step: CustomReconnectEdge,
		smoothstep: CustomReconnectEdge
	};

	// Global edge type setting
	let globalEdgeType = $state(ConnectionLineType.Bezier);
	const edgeTypeOptions = [
		{ value: ConnectionLineType.Bezier, label: 'Bezier' },
		{ value: ConnectionLineType.Straight, label: 'Straight' },
		{ value: ConnectionLineType.Step, label: 'Step' },
		{ value: ConnectionLineType.SmoothStep, label: 'Smooth Step' }
	];

	// Get page data for session/user
	// @ts-ignore
	let { data } = $props();
	let { session, user } = $derived(data || {});

	// Drawer state
	let drawerOpen = $state(false);

	// Node and edge state
	let nodes = $state.raw<CustomNode[]>([]);
	let edges = $state.raw<CustomEdge[]>([]);
	let nodeCounter = $state(0);
	
	// Set context for nodes so dialogs can access them
	setContext('nodes', {
		get current() {
			return nodes;
		}
	});

	// Current quiz state (for updating existing quizzes)
	let currentQuizId = $state(null);
	let currentQuizName = $state('');
	let currentQuizDescription = $state('');

	// Auto-save state
	let autoSaveInterval = null;
	let isSyncingWithServer = $state(false);
	let serverDataMismatch = $state(false);
	let syncConfirmModalOpen = $state(false);

	// Helper function to clear current working quiz
	function clearCurrentWorkingQuiz() {
		try {
			localStorage.removeItem('amq_plus_current_working_quiz');
			localStorage.removeItem('amq_plus_current_share_token');
			localStorage.removeItem('amq_plus_local_draft');
			serverDataMismatch = false;
		} catch (error) {
			console.error('Error clearing current working quiz:', error);
		}
	}

	// Auto-save draft to localStorage
	function autoSaveDraft() {
		if (!currentQuizId) return;

		try {
			const shareToken = localStorage.getItem('amq_plus_current_share_token');
			const draft = {
				quizId: currentQuizId,
				quizName: currentQuizName,
				shareToken: shareToken,
				nodes: nodes.map((node) => ({
					...node,
					data: {
						.../** @type {any} */ (node).data,
						onValueChange: undefined,
						onDelete: undefined
					}
				})),
				edges: edges,
				savedAt: Date.now()
			};

			localStorage.setItem('amq_plus_local_draft', JSON.stringify(draft));
			console.log('Auto-saved draft to localStorage');
		} catch (error) {
			console.error('Error auto-saving draft:', error);
		}
	}

	// Confirm sync with server
	function confirmSyncWithServer() {
		syncConfirmModalOpen = true;
	}

	// Sync with server data
	async function syncWithServer() {
		if (!currentQuizId) return;

		syncConfirmModalOpen = false;
		isSyncingWithServer = true;
		try {
			const shareToken = localStorage.getItem('amq_plus_current_share_token');
			if (!shareToken) {
				throw new Error('No share token found');
			}

			// Strip db_ prefix if present
			const databaseId = currentQuizId?.startsWith('db_')
				? currentQuizId.replace('db_', '')
				: currentQuizId;

			// Fetch fresh data from server
			const url = `/api/quiz-configurations/${databaseId}/load?share_token=${shareToken}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error('Failed to sync with server');
			}

			const data = await response.json();
			const configData = data.configuration_data;

			if (!configData || !configData.nodes || !configData.edges) {
				throw new Error('Invalid server data');
			}

			// Restore nodes with event handlers
			const loadedNodes = configData.nodes.map((node) => ({
				...node,
				data: {
					...node.data,
					onValueChange: handleNodeValueChange,
					onDelete: handleNodeDelete
				}
			}));

			// Restore edges with proper styling
			const loadedEdges = configData.edges.map((edge) => createEdgeWithData(edge, globalEdgeType));

			// Update state
			nodes = loadedNodes;
			edges = loadedEdges;

			// Update localStorage
			localStorage.removeItem('amq_plus_local_draft');
			serverDataMismatch = false;

			toast.success('Synced with server');
		} catch (error) {
			console.error('Error syncing with server:', error);
			toast.error('Failed to sync with server');
		} finally {
			isSyncingWithServer = false;
		}
	}

	// Start auto-save interval
	function startAutoSave() {
		if (autoSaveInterval) {
			clearInterval(autoSaveInterval);
		}

		// Auto-save every 2 minutes if there's a current quiz
		autoSaveInterval = setInterval(
			() => {
				if (currentQuizId) {
					autoSaveDraft();
				}
			},
			2 * 60 * 1000
		); // 2 minutes
	}

	// Stop auto-save interval
	function stopAutoSave() {
		if (autoSaveInterval) {
			clearInterval(autoSaveInterval);
			autoSaveInterval = null;
		}
	}

	// Track edge changes to ensure updateModifierIndicators is called
	let lastEdgeChangeTime = $state(0);

	$effect(() => {
		const currentTime = Date.now();

		// Only call updateModifierIndicators if enough time has passed and we're initialized
		// This prevents infinite loops while ensuring the function gets called
		if (initialized && currentTime - lastEdgeChangeTime > 100) {
			lastEdgeChangeTime = currentTime;
			setTimeout(() => updateModifierIndicators(), 10);
		}
	});

	// Context menu state
	let menu = $state(null);
	let clientWidth = $state();
	let clientHeight = $state();

	// Percentage chance modal state
	let chanceModalOpen = $state(false);
	let chanceModalNodeId = $state<string | null>(null);
	let currentNodeChance = $state<number | { kind: string; min?: number; max?: number }>(100);
	let helpDialogOpen = $state(false);

	// Validation results modal
	let validationOpen = $state(false);

	// Export simulation modal
	let exportSimulationOpen = $state(false);

	// Load quiz modal
	let loadQuizModalOpen = $state(false);
	let templateGuideModalOpen = $state(false);
	let currentTemplateMetadata = $state(null);

	// Share dialog
	let shareDialogOpen = $state(false);

	/**
	 * Mark a node as user-positioned when the user moves it
	 * @param {string} nodeId - ID of the node to mark as user-positioned
	 * @returns {void}
	 */
	function markNodeAsUserPositionedLocal(nodeId: string) {
		nodes = markNodeAsUserPositioned(nodes as any, nodeId) as CustomNode[];
	}

	/**
	 * Update all edges to use the new global edge type (unless they have custom overrides)
	 * @returns {void}
	 */
	function updateAllEdgeTypesLocal() {
		edges = updateAllEdgeTypes(edges as any, globalEdgeType) as CustomEdge[];
	}

	/**
	 * Set custom edge type for a specific edge
	 * @param {string} edgeId - ID of the edge to update
	 * @param {string|null} customType - Custom edge type or null to use global type
	 * @returns {void}
	 */
	function handleSetEdgeType(edgeId: string, customType: string | null) {
		edges = edges.map((edge) => {
			if (edge.id === edgeId) {
				if (customType === null) {
					return {
						...edge,
						type: globalEdgeType,
						data: {
							...(edge.data || {}),
							customType: undefined
						}
					} as CustomEdge;
				} else {
					// Set custom type override
					return {
						...edge,
						type: customType,
						data: {
							...(edge.data || {}),
							customType: customType
						}
					} as CustomEdge;
				}
			}
			return edge;
		});
		menu = null; // Close context menu
	}

	/**
	 * Build adjacency map from edge list
	 * @param {Array<Object>} edgeList - Array of edge objects with source and target properties
	 * @returns {Map<string, Set<string>>} Adjacency map from source to target nodes
	 */
	function buildAdjacency(edgeList: CustomEdge[]) {
		const adjacency = new Map<string, Set<string>>();
		for (const edge of edgeList) {
			if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
			adjacency.get(edge.source)!.add(edge.target);
		}
		return adjacency;
	}

	/**
	 * Compute route badges for router nodes
	 * @param {Array<Object>} allNodes - Array of all nodes
	 * @param {Array<Object>} manualEdges - Array of manual edges
	 * @param {Map<string, Set<string>>} adjacency - Adjacency map
	 * @returns {Map<string, string>} Map from node ID to route badge
	 */
	function computeRouteBadges(
		allNodes: CustomNode[],
		manualEdges: CustomEdge[],
		adjacency: Map<string, Set<string>>
	) {
		const routeAssignments = new Map<
			string,
			Array<{ routerId: string; routeId: string; label: string; name: string }>
		>();
		const routerNodes = allNodes.filter(
			(n) => (n?.data as CustomNodeData)?.type === NODE_CATEGORIES.ROUTER
		);
		if (!routerNodes.length) return routeAssignments;

		const nodesById = new Map(allNodes.map((n) => [n.id, n]));

		for (const router of routerNodes) {
			const routerData = router.data as CustomNodeData;
			const routes = ((routerData?.currentValue as any)?.routes || []).filter(
				(r: any) => r && r.enabled
			);
			if (!routes.length) continue;

			routes.forEach((route: any, index: number) => {
				const label = `R${index + 1}`;
				const routeName = route?.name || `Route ${index + 1}`;
				const startEdges = manualEdges.filter(
					(edge) =>
						edge.source === router.id && (edge.sourceHandle ? edge.sourceHandle === route.id : true)
				);
				if (!startEdges.length) return;

				const visited = new Set<string>();
				const queue = startEdges.map((edge) => edge.target).filter(Boolean) as string[];

				while (queue.length) {
					const nodeId = queue.shift();
					if (!nodeId || visited.has(nodeId)) continue;
					visited.add(nodeId);

					if (nodeId === router.id) continue;

					const node = nodesById.get(nodeId);
					if (!node) continue;

					const nodeData = node.data as CustomNodeData;
					if (nodeData?.type !== NODE_CATEGORIES.ROUTER) {
						const badge = {
							routerId: router.id,
							routeId: route.id,
							label,
							name: routeName
						};
						const list = routeAssignments.get(node.id) || [];
						const exists = list.some(
							(existing) =>
								existing.routerId === badge.routerId && existing.routeId === badge.routeId
						);
						if (!exists) {
							list.push(badge);
							routeAssignments.set(node.id, list);
						}
					}

					const neighbours = adjacency.get(nodeId);
					if (!neighbours) continue;
					for (const neighbourId of neighbours) {
						if (!visited.has(neighbourId)) {
							queue.push(neighbourId);
						}
					}
				}
			});
		}

		for (const list of routeAssignments.values()) {
			list.sort((a, b) => a.label.localeCompare(b.label));
		}

		return routeAssignments;
	}

	/**
	 * Update nodes with selection modifier indicators and router route badges
	 * @returns {void}
	 */
	function updateModifierIndicators() {
		try {
			const currentNodes = nodes || [];
			const manualEdges = (edges || []).filter(
				(e) => !(e.id && String(e.id).startsWith('flow-edge-'))
			);
			const adjacency = buildAdjacency(manualEdges);
			const nextNodes = currentNodes.map((n) => ({
				...n,
				data: {
					...(n.data as CustomNodeData),
					selectionModified: false,
					routeBadges: []
				} as CustomNodeData
			}));
			const nodesById = new Map(nextNodes.map((n) => [n.id, n]));

			const modifierNodes = nextNodes.filter(
				(n) => (n?.data as CustomNodeData)?.type === NODE_CATEGORIES.SELECTION_MODIFIER
			);

			if (modifierNodes.length) {
				const decidedForType = new Set<string>();

				for (const mod of modifierNodes) {
					const modData = mod.data as CustomNodeData;
					const modValue = modData?.currentValue || {};
					const outgoing = manualEdges.filter((e) => e.source === mod.id);
					if (!outgoing.length) continue;

					const reachableFromModifier = new Set<string>();
					const queue = [mod.id];
					while (queue.length) {
						const cur = queue.shift();
						if (!cur || reachableFromModifier.has(cur)) continue;
						reachableFromModifier.add(cur);

						const neighbours = adjacency.get(cur);
						if (neighbours) {
							for (const nId of neighbours) {
								if (!reachableFromModifier.has(nId)) {
									queue.push(nId);
								}
							}
						}
					}

					const targetTypes = new Set<string>();
					for (const edge of outgoing) {
						const target = nodesById.get(edge.target);
						if (!target) continue;
						const targetData = target.data as CustomNodeData;
						const targetTypeId = targetData?.id;
						if (!targetTypeId || targetData?.type === NODE_CATEGORIES.SELECTION_MODIFIER) {
							continue;
						}
						if (decidedForType.has(targetTypeId)) {
							continue;
						}
						targetTypes.add(targetTypeId);
					}

					for (const targetTypeId of targetTypes) {
						const sameTypeNodes = nextNodes.filter(
							(n) => (n.data as CustomNodeData)?.id === targetTypeId
						);
						const reachableSameTypeNodes = sameTypeNodes.filter((n) =>
							reachableFromModifier.has(n.id)
						);
						if (!reachableSameTypeNodes.length) continue;

						for (const node of reachableSameTypeNodes) {
							(node.data as CustomNodeData).selectionModified = true;
						}

						decidedForType.add(targetTypeId);
					}
				}
			}

			const routeAssignments = computeRouteBadges(nextNodes, manualEdges, adjacency);
			for (const [nodeId, badges] of routeAssignments.entries()) {
				const node = nodesById.get(nodeId);
				if (node) {
					(node.data as CustomNodeData).routeBadges = badges.slice();
				}
			}

			// Only update if there are actual changes to prevent infinite loops
			const hasChanges = nextNodes.some((node, index) => {
				const current = currentNodes[index];
				if (!current) return true;
				const nodeData = node.data as CustomNodeData;
				const currentData = current.data as CustomNodeData;
				return (
					nodeData.selectionModified !== currentData.selectionModified ||
					JSON.stringify(nodeData.routeBadges) !== JSON.stringify(currentData.routeBadges)
				);
			});

			if (hasChanges) {
				nodes = nextNodes;
			}
		} catch (e) {
			// Silent error handling
		}
	}

	// Initialize with default template
	/**
	 * Initialize the default template with nodes and edges
	 * @returns {void}
	 */
	function initializeDefaultTemplate() {
		// Get template with fully loaded filter definitions
		const template = getDefaultTemplate();
		
		// Process template nodes with proper event handlers and unique IDs
		const templateNodes = template.nodes.map((templateNode) => {
			// Create a new node instance with unique ID
			const nodeId = `${templateNode.id}-${++nodeCounter}`;
			const node = {
				...templateNode,
				id: nodeId,
				data: {
					...templateNode.data,
					instanceId: nodeId,
					onValueChange: handleNodeValueChange,
					onDelete: handleNodeDelete,
					userPositioned: false // Will become true when user moves them
				}
			};

			// Initialize nodes that need mode-based initialization
			if (node.data.id === 'song-difficulty' && node.data.currentValue) {
				const mode = node.data.currentValue.mode || 'count';
				node.data.currentValue = initializeSongDifficultyMode(node.data.currentValue, mode, 20);
			} else if (node.data.id === 'songs-and-types' && node.data.currentValue) {
				const mode = node.data.currentValue.mode || 'percentage';
				node.data.currentValue = initializeSongsAndTypesMode(node.data.currentValue, mode, 20);
			} else if (node.data.id === 'anime-type' && node.data.currentValue) {
				const mode = node.data.currentValue.mode || 'basic';
				node.data.currentValue = initializeAnimeTypeMode(node.data.currentValue, mode, 20);
			}

			return node;
		});

		nodes = templateNodes;

		// Process template edges with updated node IDs
		const templateEdges = template.edges
			.map((templateEdge) => {
				// Find the actual node IDs for source and target
				const sourceNode = templateNodes.find((node) => node.data.id === templateEdge.source);
				const targetNode = templateNodes.find((node) => node.data.id === templateEdge.target);

				if (sourceNode && targetNode) {
					return createEdgeWithData(
						{
							...templateEdge,
							source: sourceNode.id,
							target: targetNode.id
						},
						globalEdgeType
					);
				}
				return null;
			})
			.filter((edge) => edge !== null);

		edges = templateEdges;

		// Clear current working quiz when starting fresh
		clearCurrentWorkingQuiz();
		currentQuizId = null;
		currentQuizName = '';
		currentQuizDescription = '';

		// Use setTimeout to avoid reactive loop during initialization
		setTimeout(() => {
			updateModifierIndicators();
		}, 0);
	}

	// Get SvelteFlow utilities for viewport calculations
	let screenToFlowPosition, getViewport;

	// Initialize SvelteFlow utilities when component mounts
	$effect(() => {
		try {
			const flowUtils = useSvelteFlow();
			screenToFlowPosition = flowUtils.screenToFlowPosition;
			getViewport = flowUtils.getViewport;
		} catch (e) {
			// SvelteFlow context not available yet
			screenToFlowPosition = null;
			getViewport = null;
		}
	});

	// Handle adding new nodes from sidebar
	/**
	 * Handle adding a new node to the editor
	 * @param {Object} nodeDefinition - Node definition object
	 * @returns {void}
	 */
	function handleAddNode(nodeDefinition) {
		// Check if it's a unique node that already exists
		if (nodeDefinition.unique && nodes.some((n) => n.data.id === nodeDefinition.id)) {
			return; // Don't add duplicate unique nodes
		}

		// Calculate center of viewport for new node position
		let newX = START_X;
		let newY = START_Y;

		try {
			if (getViewport && typeof clientWidth === 'number' && typeof clientHeight === 'number') {
				const viewport = getViewport();
				// Calculate the center of the visible viewport
				newX = (-viewport.x + clientWidth / 2) / viewport.zoom;
				newY = (-viewport.y + clientHeight / 2) / viewport.zoom;
			}
		} catch (e) {
			// Fallback: if viewport utilities aren't available yet, use default position
			console.warn('Viewport not available, using default position');
		}

		// Create new node instance with calculated position
		const newNode = createNodeInstance(
			nodeDefinition,
			{ x: newX, y: newY },
			`${nodeDefinition.id}-${++nodeCounter}`
		);

		// Add event handlers and mark as not user-positioned initially
		newNode.data.onValueChange = handleNodeValueChange;
		newNode.data.onDelete = handleNodeDelete;
		newNode.data.userPositioned = false;

		// Add the new node
		nodes = [...nodes, newNode];

		// Check for multiple number of songs nodes and switch to percentage mode
		checkMultipleNumberOfSongsNodes();

		// Close drawer
		drawerOpen = false;
	}

	// Handle node value changes
	/**
	 * Handle node value change and trigger rescaling if needed
	 * @param {Object} changeData - Change data object with nodeId and newValue
	 * @returns {void}
	 */
	function handleNodeValueChange(changeData: { nodeId: string; newValue: any }) {
		const result = handleNodeValueChangeRescaling(
			nodes as any,
			edges as any,
			changeData,
			updateModifierIndicators
		);

		// Only update if there are actual changes to prevent infinite loops
		if (result.updatedNodes !== nodes) {
			nodes = result.updatedNodes as CustomNode[];
		}

		// Check if this was a Number of Songs node change and re-evaluate lock state
		const changedNode = nodes.find(
			(n) =>
				n.id === changeData.nodeId || (n.data as CustomNodeData).instanceId === changeData.nodeId
		);
		if ((changedNode?.data as CustomNodeData)?.type === NODE_CATEGORIES.NUMBER_OF_SONGS) {
			checkMultipleNumberOfSongsNodes();
		}
	}

	// Handle node deletion
	/**
	 * Handle node deletion
	 * @param {string} nodeId - ID of the node to delete
	 * @returns {void}
	 */
	function handleNodeDelete(nodeId: string) {
		const nodeIndex = nodes.findIndex(
			(n) => n.id === nodeId || (n.data as CustomNodeData).instanceId === nodeId
		);
		if (nodeIndex !== -1 && nodes[nodeIndex].deletable !== false) {
			nodes = nodes.filter((n, index) => index !== nodeIndex);
			edges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
			updateModifierIndicators();

			// Check for multiple number of songs nodes and switch to percentage mode
			checkMultipleNumberOfSongsNodes();
		}
	}

	// Check for multiple number of songs nodes or random range enabled and switch all filter nodes to percentage mode
	/**
	 * Check for multiple Number of Songs nodes and show warning
	 * @returns {void}
	 */
	function checkMultipleNumberOfSongsNodes() {
		const numberOfSongsNodes = nodes.filter(
			(n) => (n.data as CustomNodeData).type === NODE_CATEGORIES.NUMBER_OF_SONGS
		);

		// Check if any number of songs node has random range enabled
		const hasRandomRange = numberOfSongsNodes.some((node) => {
			const currentValue = (node.data as CustomNodeData).currentValue as any;
			return currentValue?.useRange === true;
		});

		// Check if multiple Number of Songs nodes are on the SAME route (not different routes)
		const routerNodes = nodes.filter(
			(n) => (n.data as CustomNodeData).type === NODE_CATEGORIES.ROUTER
		);
		let multipleSongsOnSameRoute = false;

		if (numberOfSongsNodes.length > 1 && routerNodes.length > 0) {
			// Build a graph to determine which nodes are reachable from each route
			const graphAdj = new Map();
			for (const edge of edges) {
				if (!graphAdj.has(edge.source)) graphAdj.set(edge.source, new Set());
				graphAdj.get(edge.source).add(edge.target);
			}

			// For each router, find which Number of Songs nodes are reachable from each route
			const songsNodesByRoute = new Map();

			for (const routerNode of routerNodes) {
				const routerData = routerNode.data as CustomNodeData;
				const routes = ((routerData?.currentValue as any)?.routes || []) as Array<{
					enabled: boolean;
					id: string;
				}>;
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

					if (reachableSongsNodes.length > 0) {
						songsNodesByRoute.set(route.id, reachableSongsNodes);
					}
				}
			}

			// Check if any single route has multiple Number of Songs nodes
			for (const [routeId, songsNodes] of songsNodesByRoute) {
				if (songsNodes.length > 1) {
					multipleSongsOnSameRoute = true;
					console.log(
						`[EDITOR] Route ${routeId} has ${songsNodes.length} Number of Songs nodes, forcing percentage mode`
					);
					break;
				}
			}

			console.log(`[EDITOR] Found ${songsNodesByRoute.size} routes with Number of Songs nodes`);
		}

		if ((numberOfSongsNodes.length > 1 && multipleSongsOnSameRoute) || hasRandomRange) {
			const reason = multipleSongsOnSameRoute
				? `Multiple number of songs nodes on the same route detected`
				: 'Random range enabled in number of songs node';
			console.log(`[EDITOR] ${reason}, switching all filter nodes to percentage mode`);

			// Update all filter nodes to use percentage mode
			let hasChanges = false;
			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				const nodeData = node.data as CustomNodeData;
				if (nodeData.type === NODE_CATEGORIES.FILTER) {
					console.log(`[EDITOR] Switching filter node ${nodeData.instanceId} to percentage mode`);

					// Ensure currentValue exists and has proper structure
					if (!nodeData.currentValue) {
						nodeData.currentValue = {};
					}

					const currentValue = nodeData.currentValue as any;

					// First, ensure all nodes are set to percentage mode before locking
					if (nodeData.id === 'player-score' || nodeData.id === 'anime-score') {
						// For score nodes, set perScoreMode to percentage and lock it
						currentValue.perScoreMode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					} else if (nodeData.id === 'songs-and-types') {
						// For songs-and-types, ensure mode is set to percentage before locking
						currentValue.mode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					} else if (nodeData.id === 'song-difficulty') {
						// For song-difficulty, ensure mode is set to percentage before locking
						currentValue.mode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					} else if (nodeData.id === 'vintage') {
						// For vintage, ensure mode is set to percentage before locking
						currentValue.mode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					} else if (nodeData.id === 'anime-type') {
						// For anime-type, ensure mode is set to percentage before locking
						currentValue.mode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					} else {
						// For all other filter nodes, set mode to percentage and lock it
						currentValue.mode = 'percentage';
						currentValue.percentageModeLocked = true;
						hasChanges = true;
					}
				}
			}

			// Trigger reactivity by reassigning the array
			if (hasChanges) {
				nodes = [...nodes];
			}
		} else {
			// If locking conditions are not met, unlock percentage mode for any locked filter nodes
			let hasChanges = false;
			const lockedNodes = [];
			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				const nodeData = node.data as CustomNodeData;
				if (nodeData.type === NODE_CATEGORIES.FILTER) {
					const currentValue = nodeData.currentValue as any;
					const isLocked = currentValue?.percentageModeLocked;
					lockedNodes.push({
						id: nodeData.instanceId,
						type: nodeData.id,
						isLocked,
						hasCurrentValue: !!nodeData.currentValue
					});

					if (isLocked) {
						console.log(
							`[EDITOR] Lock conditions no longer met, unlocking ${nodeData.instanceId} (${nodeData.id})`
						);

						// Modify the node directly in the array to ensure reactivity
						nodes[i] = {
							...nodes[i],
							data: {
								...nodeData,
								currentValue: {
									...currentValue,
									percentageModeLocked: false
								}
							} as CustomNodeData
						};
						hasChanges = true;
					}
				}
			}

			if (lockedNodes.length > 0) {
				console.log(`[EDITOR] Filter nodes status:`, lockedNodes);
			}

			// Trigger reactivity by reassigning the array
			if (hasChanges) {
				nodes = [...nodes];
			}
		}
	}

	// Handle removing all edges connected to a node
	/**
	 * Remove all edges connected to a node
	 * @param {string} nodeId - ID of the node to remove edges from
	 * @returns {void}
	 */
	function handleRemoveNodeEdges(nodeId) {
		// Filter out all edges that are connected to this node (either as source or target)
		edges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
		// Close the context menu
		menu = null;
		updateModifierIndicators();
	}

	// Handle edge changes (including reconnections and removals)
	/**
	 * Handle edges change and update modifier indicators
	 * @param {Array<Object>} changes - Array of edge changes
	 * @returns {void}
	 */
	function handleEdgesChangeLocal(changes) {
		edges = handleEdgesChange(changes, edges, (edgeData) =>
			createEdgeWithData(edgeData, globalEdgeType)
		);
		updateModifierIndicators();
	}

	/**
	 * Handle node context menu
	 * @param {Object} params - Context menu parameters
	 * @param {MouseEvent} params.event - Mouse event
	 * @param {Object} params.node - Node object
	 * @returns {void}
	 */
	function handleNodeContextMenu({ event, node }) {
		// Prevent native context menu from showing
		event.preventDefault();

		if (!node) return;

		// Calculate position of the context menu. We want to make sure it
		// doesn't get positioned off-screen.
		menu = {
			id: node.id,
			type: 'node',
			top:
				typeof clientHeight === 'number' && event.clientY < clientHeight - 200
					? event.clientY
					: undefined,
			left:
				typeof clientWidth === 'number' && event.clientX < clientWidth - 200
					? event.clientX
					: undefined,
			right:
				typeof clientWidth === 'number' && event.clientX >= clientWidth - 200
					? clientWidth - event.clientX
					: undefined,
			bottom:
				typeof clientHeight === 'number' && event.clientY >= clientHeight - 200
					? clientHeight - event.clientY
					: undefined
		};
	}

	/**
	 * Handle edge context menu
	 * @param {Object} params - Context menu parameters
	 * @param {MouseEvent} params.event - Mouse event
	 * @param {Object} params.edge - Edge object
	 * @returns {void}
	 */
	function handleEdgeContextMenu({ event, edge }) {
		// Prevent native context menu from showing
		event.preventDefault();

		if (!edge) return;

		// Calculate position of the context menu. We want to make sure it
		// doesn't get positioned off-screen.
		menu = {
			id: edge.id,
			type: 'edge',
			top:
				typeof clientHeight === 'number' && event.clientY < clientHeight - 200
					? event.clientY
					: undefined,
			left:
				typeof clientWidth === 'number' && event.clientX < clientWidth - 200
					? event.clientX
					: undefined,
			right:
				typeof clientWidth === 'number' && event.clientX >= clientWidth - 200
					? clientWidth - event.clientX
					: undefined,
			bottom:
				typeof clientHeight === 'number' && event.clientY >= clientHeight - 200
					? clientHeight - event.clientY
					: undefined
		};
	}

	/**
	 * Handle pane click to close context menu
	 * @returns {void}
	 */
	function handlePaneClick() {
		menu = null;
	}

	// Handle node changes (position, selection, etc.) - update indicators reactively
	/**
	 * Handle node changes and update indicators reactively
	 * @param {Array<Object>} changes - Array of node changes
	 * @returns {void}
	 */
	function handleNodesChange(changes) {
		// Track position changes to mark nodes as user-positioned
		changes.forEach((change) => {
			if (change.type === 'position' && change.dragging === false) {
				// Node was moved by user and is no longer being dragged
				markNodeAsUserPositionedLocal(change.id);
			}
		});
		updateModifierIndicators();
	}

	// Handle connection validation
	/**
	 * Validate if a connection between nodes is valid
	 * @param {Object} connection - Connection object with source, target, sourceHandle, and targetHandle
	 * @returns {boolean} Whether the connection is valid
	 */
	function isValidConnection(connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }): boolean {
		const sourceNode = nodes.find((n) => n.id === connection.source);
		const targetNode = nodes.find((n) => n.id === connection.target);

		if (!sourceNode || !targetNode) {
			return false;
		}

		const sourceData = sourceNode.data as CustomNodeData;
		const targetData = targetNode.data as CustomNodeData;

		// Source Selector nodes can ONLY connect to source-selector handles
		if (sourceData.type === NODE_CATEGORIES.SOURCE_SELECTOR) {
			return connection.targetHandle === 'source-selector';
		}

		// Source Selector handle on filter nodes - only allow source selector nodes to connect
		if (connection.targetHandle === 'source-selector') {
			return sourceData.type === NODE_CATEGORIES.SOURCE_SELECTOR;
		}

		// Basic Settings can accept connections from Router nodes, source nodes, Selection Modifier nodes, Batch User List nodes, Live Node nodes, and other Basic Settings nodes
		if (targetData.type === NODE_CATEGORIES.BASIC_SETTINGS) {
			return (
				sourceData.type === NODE_CATEGORIES.ROUTER ||
				sourceData.type === NODE_CATEGORIES.SELECTION_MODIFIER ||
				sourceData.type === NODE_CATEGORIES.BASIC_SETTINGS ||
				sourceData.type === NODE_CATEGORIES.BATCH_USER_LIST ||
				(sourceData.type === NODE_CATEGORIES.LIVE_NODE && (sourceData as any)['isSourceNode']) ||
				(sourceData.type === NODE_CATEGORIES.SONG_LIST && (sourceData as any)['isSourceNode'])
			);
		}

		// All other connections are valid
		return true;
	}

	// Handle opening percentage chance modal
	/**
	 * Handle setting execution chance for a node
	 * @param {string} nodeId - ID of the node to set chance for
	 * @returns {void}
	 */
	function handleSetChance(nodeId: string) {
		const node = nodes.find((n) => n.id === nodeId);
		if (node) {
			chanceModalNodeId = nodeId;
			const nodeData = node.data as CustomNodeData;
			const chance = nodeData.executionChance;
			currentNodeChance = chance || 100;
			chanceModalOpen = true;
		}
		menu = null;
	}

	// Handle opening default settings modal
	/**
	 * Handle viewing default settings for a node
	 * @param {string} nodeId - ID of the node to view defaults for
	 * @returns {void}
	 */
	function handleViewDefaults(nodeId) {
		const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
		if (nodeIndex !== -1) {
			// Create a new nodes array to trigger reactivity
			nodes = nodes.map((node, index) => {
				if (index === nodeIndex) {
					return {
						...node,
						data: {
							...node.data,
							openDefaultSettings: true
						}
					};
				}
				return node;
			});
		}
		menu = null;
	}

	// Handle saving percentage chance
	/**
	 * Handle saving execution chance for a node
	 * @param {number|Object} newChance - New execution chance value or range object
	 * @returns {void}
	 */
	function handleSaveChance(newChance: number | { kind: string; min?: number; max?: number }) {
		if (chanceModalNodeId) {
			const nodeIndex = nodes.findIndex((n) => n.id === chanceModalNodeId);
			if (nodeIndex !== -1) {
				// Create a new nodes array to trigger reactivity
				nodes = nodes.map((node, index) => {
					if (index === nodeIndex) {
						return {
							...node,
							data: {
								...(node.data as CustomNodeData),
								executionChance: newChance
							} as CustomNodeData
						};
					}
					return node;
				});
			}
		}
		chanceModalOpen = false;
		chanceModalNodeId = null;
		// Re-evaluate modifier indicators in case chance changed for a modifier
		updateModifierIndicators();
	}

	// Save quiz configuration
	let exportedConfigForInspect = $state(null);

	/**
	 * Save quiz configuration (opens export/save modal)
	 * @returns {Object} Exported configuration object
	 */
	function exportConfig() {
		// First, run validation
		const { issues } = validateConfiguration(nodes as any, edges as any);
		if (issues.length > 0) {
			toast.error(`Cannot export with ${issues.length} validation error(s).`);
			// Optionally, open the validation modal to show errors
			// validateAll();
			return;
		}

		// Open the export simulation modal instead of just logging
		exportSimulationOpen = true;
	}

	/**
	 * Mark a node with an error message
	 * @param {string} nodeId - ID of the node to mark with error
	 * @param {string} shortMessage - Short error message
	 * @param {string} fullMessage - Full error message
	 * @param {string} severity - 'error' or 'warning'
	 * @returns {void}
	 */
	function markNodeError(nodeId, shortMessage, fullMessage, severity = 'error') {
		nodes = nodes.map((node) =>
			node.id === nodeId
				? {
						...node,
						data: {
							...node.data,
							validationError: severity === 'error',
							validationWarning: severity === 'warning',
							validationShortMessage: shortMessage,
							validationMessage: fullMessage || shortMessage
						}
					}
				: node
		);
	}

	/**
	 * Clear all node error messages
	 * @returns {void}
	 */
	function clearAllNodeErrors() {
		nodes = nodes.map((node) => ({
			...node,
			data: {
				...node.data,
				validationError: false,
				validationWarning: false,
				validationShortMessage: undefined,
				validationMessage: undefined
			}
		}));
	}

	$effect(() => {
		if (exportedConfigForInspect) {
			$inspect('Exported configuration:', exportedConfigForInspect);
		}
	});

	/**
	 * Validate all nodes and edges
	 * @returns {void}
	 */
	function validateAll() {
		validationOpen = true;
	}

	// Initialize on mount (only once)
	let initialized = $state(false);
	$effect(() => {
		if (!initialized) {
			// Check if a template was passed from QuickStartTemplates
			let templateData = null;
			if (typeof window !== 'undefined') {
				const sessionTemplate = sessionStorage.getItem('templateToLoad');
				if (sessionTemplate) {
					try {
						templateData = JSON.parse(sessionTemplate);
						sessionStorage.removeItem('templateToLoad');
					} catch (e) {
						console.error('Failed to parse template from sessionStorage:', e);
					}
				}
			}

			if (templateData && templateData.nodes && templateData.edges) {
				initializeTemplateData(templateData);
			} else {
				initializeDefaultTemplate();
			}
			initialized = true;
		}
	});

	// Load template from loaded template data
	/**
	 * Initialize template data from saved quiz
	 * @param {Object} templateData - Template data object with nodes and edges
	 * @returns {void}
	 */
	function initializeTemplateData(templateData) {
		// Set template metadata for detailed explanation button
		if (templateData.metadata && templateData.metadata.isTemplate) {
			currentTemplateMetadata = templateData.metadata;
			console.log('Loaded template:', currentTemplateMetadata.name);
		} else {
			currentTemplateMetadata = null;
		}

		// Process template nodes with proper event handlers and layout
		const templateNodes = templateData.nodes.map((templateNode) => {
			// Use saved position if available, otherwise use default positioning
			let position = templateNode.position;
			if (!position) {
				// Fallback to default positioning if no saved position
				position = { x: START_X + templateNodes.length * NODE_SPACING_X, y: 100 };
			}

			const node = {
				...templateNode,
				data: {
					...templateNode.data,
					onValueChange: handleNodeValueChange,
					onDelete: handleNodeDelete,
					userPositioned: true // Mark as user-positioned since it's from a template
				}
			};
			return node;
		});

		nodes = templateNodes;

		// Process template edges - use original IDs since we preserved them
		const templateEdges = templateData.edges.map((templateEdge) => {
			return createEdgeWithData(templateEdge, globalEdgeType);
		});

		edges = templateEdges;

		// Find highest node counter to avoid ID conflicts (same as Load Quiz)
		const maxCounter = templateNodes.reduce((max, node) => {
			const match = node.id.match(/-(\d+)$/);
			if (match) {
				return Math.max(max, parseInt(match[1]));
			}
			return max;
		}, 0);
		nodeCounter = maxCounter;

		updateModifierIndicators();

		// Check for multiple Number of Songs nodes immediately after loading
		checkMultipleNumberOfSongsNodes();
	}

	// Refresh localStorage with fresh server data
	async function refreshLocalStorageFromServer() {
		try {
			// For logged-in users, refresh all database-linked quizzes silently
			if (session && user) {
				const { getDatabaseLinkedQuizzes } = await import('$lib/utils/localQuizStorage.js');
				const dbQuizzes = getDatabaseLinkedQuizzes();

				// Refresh each database-linked quiz (skip failures silently)
				for (const localQuiz of dbQuizzes) {
					if (localQuiz.database_id && localQuiz.share_token) {
						try {
							const url = `/api/quiz-configurations/${localQuiz.database_id}/load?share_token=${localQuiz.share_token}`;
							const response = await fetch(url);

							if (response.ok) {
								const data = await response.json();

								// Update localStorage with fresh server data
								const { storeDatabaseQuiz } = await import('$lib/utils/localQuizStorage.js');
								storeDatabaseQuiz({
									id: localQuiz.database_id,
									name: data.name,
									description: data.description,
									configuration_data: data.configuration_data,
									creator_username: data.creator_username,
									share_token: data.share_token,
									play_token: data.play_token,
								is_temporary: false,
								is_public: data.is_public || false
								});
							} else if (response.status === 404) {
								const { removeDatabaseQuiz } = await import('$lib/utils/localQuizStorage.js');
								removeDatabaseQuiz(localQuiz.database_id);
							}
							// Silently skip other errors - quiz might not be accessible
						} catch (error) {
							// Silently skip errors during background refresh
						}
					}
				}
			}

			// Refresh current working quiz for all users
			const currentWorkingQuiz = localStorage.getItem('amq_plus_current_working_quiz');
			if (!currentWorkingQuiz) return;

			const { id: quizId } = JSON.parse(currentWorkingQuiz);
			const shareToken = localStorage.getItem('amq_plus_current_share_token');

			// Only refresh if we have a valid quiz ID and share token
			if (!quizId || !shareToken) return;

			// Strip db_ prefix if present
			const databaseId = quizId?.startsWith('db_') ? quizId.replace('db_', '') : quizId;

			// Fetch fresh data from server
			const url = `/api/quiz-configurations/${databaseId}/load?share_token=${shareToken}`;
			const response = await fetch(url);

			if (response.ok) {
				const data = await response.json();

				// Update localStorage with fresh server data
				const { storeDatabaseQuiz } = await import('$lib/utils/localQuizStorage.js');
				storeDatabaseQuiz({
					id: databaseId,
					name: data.name,
					description: data.description,
					configuration_data: data.configuration_data,
					creator_username: data.creator_username,
					share_token: data.share_token,
					play_token: data.play_token,
				is_temporary: false,
				is_public: data.is_public || false
				});

				// Update current working quiz in localStorage
				localStorage.setItem(
					'amq_plus_current_working_quiz',
					JSON.stringify({
						id: databaseId,
						name: data.name
					})
				);

				console.log('Refreshed localStorage with server data');
			} else if (response.status === 404) {
				// Quiz was deleted - clear current working quiz
				localStorage.removeItem('amq_plus_current_working_quiz');
				localStorage.removeItem('amq_plus_current_share_token');
				localStorage.removeItem('amq_plus_local_draft');
			}
		} catch (error) {
			// Silently ignore errors during background refresh
		}
	}

	// Load quiz from URL parameter
	onMount(async () => {
		const loadQuizId = $page.url.searchParams.get('loadQuiz');
		const shareToken = $page.url.searchParams.get('share');

		// Only refresh if not loading via share token
		// (share token loads handle their own refresh)
		if (!shareToken) {
			await refreshLocalStorageFromServer();
		}

		if (loadQuizId) {
			await loadQuiz(loadQuizId);
		} else if (shareToken) {
			await loadQuizByShareToken(shareToken);
		}
	});

	// Handle load quiz from modal
	/**
	 * Handle loading quiz from modal
	 * @param {string} quizId - ID of the quiz to load
	 * @returns {void}
	 */
	function handleLoadQuizFromModal(quizId) {
		loadQuiz(quizId);
		// Update URL without navigation to preserve state
		goto(`/quizzes/create?loadQuiz=${quizId}`, { replaceState: true });
	}

	// Load quiz configuration by share token
	/**
	 * Load quiz configuration by share token
	 * @param {string} shareToken - Share token for the quiz
	 * @returns {Promise<void>}
	 */
	async function loadQuizByShareToken(shareToken) {
		try {
			console.log('[loadQuizByShareToken] Loading with share token:', shareToken);
			toast.info('Loading shared quiz configuration...');

			// Check for local draft first
			const localDraft = localStorage.getItem('amq_plus_local_draft');
			let draftData = null;
			if (localDraft) {
				try {
					draftData = JSON.parse(localDraft);
					console.log('[loadQuizByShareToken] Found local draft:', draftData.shareToken);
					// Only use draft if it matches the share token
					if (draftData.shareToken !== shareToken) {
						console.log('[loadQuizByShareToken] Draft token mismatch, ignoring draft');
						draftData = null;
					}
				} catch (e) {
					console.log('[loadQuizByShareToken] Error parsing draft:', e);
					draftData = null;
				}
			}

			// Try local quiz storage
			const { getLocalQuizByShareToken } = await import('$lib/utils/localQuizStorage.js');
			const localQuiz = getLocalQuizByShareToken(shareToken);
			console.log('[loadQuizByShareToken] Local quiz found:', !!localQuiz);

			let data;
			let loadedFromServer = false;

			// Priority: 1. Local draft, 2. Local quiz storage, 3. Server
			if (draftData && draftData.nodes && draftData.edges) {
				// Load from draft
				console.log('[loadQuizByShareToken] Loading from local draft');
				data = {
					id: draftData.quizId,
					name: draftData.quizName,
					configuration_data: {
						nodes: draftData.nodes,
						edges: draftData.edges
					},
					share_token: shareToken
				};
			} else if (localQuiz) {
				// Load from localStorage
				console.log('[loadQuizByShareToken] Loading from localStorage');
				let databaseId = localQuiz.database_id;
				if (!databaseId && localQuiz.id?.startsWith('db_')) {
					databaseId = localQuiz.id.replace('db_', '');
				} else if (!databaseId) {
					databaseId = localQuiz.id;
				}
				console.log('[loadQuizByShareToken] Database ID:', databaseId);

				data = {
					id: databaseId,
					name: localQuiz.name,
					description: localQuiz.description,
					configuration_data: localQuiz.configuration_data,
					creator_username: localQuiz.creator_username,
					share_token: localQuiz.share_token
				};
			} else {
				// Load from API
				console.log('[loadQuizByShareToken] Loading from API');
				const response = await fetch(`/api/quiz-configurations/share/${shareToken}`);

				if (!response.ok) {
					console.log('[loadQuizByShareToken] API load failed:', response.status);
					const errorData = await response.json();
					console.log('[loadQuizByShareToken] Error data:', errorData);
					throw new Error(errorData.message || 'Failed to load shared quiz');
				}

				data = await response.json();
				console.log('[loadQuizByShareToken] Successfully loaded from API:', data.name);
				loadedFromServer = true;
			}

			// Store quiz ID and share token for updates
			if (data.id && data.share_token) {
				currentQuizId = data.id;
				currentQuizName = data.name || '';
				currentQuizDescription = data.description || '';

				// Store in localStorage for persistence
				try {
					localStorage.setItem('amq_plus_current_share_token', data.share_token);

					// If loaded from server, overwrite localStorage with server data
					if (loadedFromServer) {
						const { storeDatabaseQuiz } = await import('$lib/utils/localQuizStorage.js');
						storeDatabaseQuiz({
							id: data.id,
							name: data.name,
							description: data.description,
							configuration_data: data.configuration_data,
							creator_username: data.creator_username,
							share_token: data.share_token,
							play_token: data.play_token,
						is_temporary: false,
						is_public: data.is_public || false
						});
					}
				} catch (error) {
					console.error('Error storing share token:', error);
				}
			}

			// Extract configuration data
			const configData = data.configuration_data;

			if (!configData || !configData.nodes || !configData.edges) {
				throw new Error('Invalid shared quiz configuration data');
			}

			// Compare with server data if we loaded from local storage
			if (!loadedFromServer && data.id) {
				console.log('[loadQuizByShareToken] Comparing local data with server');
				try {
					const serverResponse = await fetch(`/api/quiz-configurations/share/${shareToken}`);
					if (serverResponse.ok) {
						const serverData = await serverResponse.json();
						const localNodesStr = JSON.stringify(configData.nodes);
						const serverNodesStr = JSON.stringify(serverData.configuration_data?.nodes);

						if (localNodesStr !== serverNodesStr) {
							serverDataMismatch = true;
							console.log('[loadQuizByShareToken] Local data differs from server data');
						} else {
							console.log('[loadQuizByShareToken] Local data matches server data');
						}
					} else {
						console.log('[loadQuizByShareToken] Server comparison failed:', serverResponse.status);
					}
				} catch (error) {
					console.error('[loadQuizByShareToken] Error comparing with server:', error);
				}
			}

			// Check if this is a template and store metadata
			if (configData.metadata && configData.metadata.isTemplate) {
				currentTemplateMetadata = configData.metadata;
				console.log('Loaded shared template:', currentTemplateMetadata.name);
			} else {
				currentTemplateMetadata = null;
			}

			// Restore nodes with event handlers
			const loadedNodes = configData.nodes.map((node) => ({
				...node,
				data: {
					...node.data,
					onValueChange: handleNodeValueChange,
					onDelete: handleNodeDelete
				}
			}));

			// Restore edges with proper styling
			const loadedEdges = configData.edges.map((edge) => createEdgeWithData(edge, globalEdgeType));

			// Update state
			nodes = loadedNodes;
			edges = loadedEdges;

			// Find highest node counter to avoid ID conflicts
			const maxCounter = loadedNodes.reduce((max, node) => {
				const match = node.id.match(/-(\d+)$/);
				if (match) {
					return Math.max(max, parseInt(match[1]));
				}
				return max;
			}, 0);
			nodeCounter = maxCounter;

			// Update modifier indicators after a short delay
			setTimeout(() => {
				updateModifierIndicators();
				checkMultipleNumberOfSongsNodes();
			}, 100);

			// Start auto-save interval
			startAutoSave();

			toast.success(`Loaded shared quiz: ${data.name}`);
		} catch (error) {
			console.error('Error loading shared quiz:', error);
			toast.error(`Failed to load shared quiz: ${error.message}`);
		}
	}

	// Load quiz configuration from API or localStorage
	/**
	 * Load quiz configuration by ID
	 * @param {string} quizId - ID of the quiz to load
	 * @returns {Promise<void>}
	 */
	async function loadQuiz(quizId) {
		try {
			// Clear current working quiz when loading a different quiz
			clearCurrentWorkingQuiz();

			toast.info('Loading quiz configuration...');

			let data;
			let configData;

			// Try to load from API first (works for logged-in users, public quizzes, and remixable quizzes)
			// If API fails and user is not logged in, fall back to localStorage
			try {
				console.log('[loadQuiz] Attempting to load from API:', quizId);
				const response = await fetch(`/api/quiz-configurations/${quizId}/load`);

				if (response.ok) {
					// Successfully loaded from API
					data = await response.json();
					console.log('[loadQuiz] Successfully loaded from API:', data.name);
				} else {
					// API call failed - check if guest user and try localStorage
					if (!session || !user) {
						console.log('[loadQuiz] API call failed, attempting fallback for guest user');
						const { getLocalQuizByDatabaseId } = await import('$lib/utils/localQuizStorage.js');
						const localQuiz = getLocalQuizByDatabaseId(quizId);

						if (localQuiz) {
							console.log('[loadQuiz] Found quiz in localStorage');
							data = {
								id: localQuiz.database_id,
								name: localQuiz.name,
								description: localQuiz.description,
								configuration_data: localQuiz.configuration_data,
								user_id: null
							};

							configData = localQuiz.configuration_data;
						} else {
							console.log('[loadQuiz] Quiz not found in localStorage or API');
							const errorData = await response.json();
							throw new Error(errorData.message || 'Quiz not found');
						}
					} else {
						// Logged-in user but API failed - try with share token
						console.log('[loadQuiz] Logged-in user API call failed, checking for share token');
						const shareToken = localStorage.getItem('amq_plus_current_share_token');

						if (shareToken) {
							console.log('[loadQuiz] Attempting to load with share token');
							try {
								const shareResponse = await fetch(
									`/api/quiz-configurations/${quizId}/load?share_token=${shareToken}`
								);

								if (!shareResponse.ok) {
									const shareErrorData = await shareResponse.json();
									let errorMessage = shareErrorData.message || 'Failed to load quiz';

									if (shareResponse.status === 404) {
										errorMessage = 'Quiz not found. It may have been deleted.';
									} else if (shareResponse.status === 403) {
										errorMessage =
											shareErrorData.message || 'You do not have permission to load this quiz.';
									}

									console.log(
										'[loadQuiz] Share token load failed:',
										shareResponse.status,
										errorMessage
									);
									throw new Error(errorMessage);
								}

								data = await shareResponse.json();
								console.log('[loadQuiz] Successfully loaded with share token');
							} catch (error) {
								console.log('[loadQuiz] Share token load error:', error);
								throw error;
							}
						} else {
							const errorData = await response.json();
							const errorMessage = errorData.message || 'Failed to load quiz';
							console.log('[loadQuiz] No share token available, throwing error');
							throw new Error(errorMessage);
						}
					}
				}
			} catch (apiError) {
				// If we haven't already handled this error, throw it
				if (!data && !configData) {
					throw apiError;
				}
			}

			// For guest users, set currentQuizId and store share token if available
			if (!session || !user) {
				if (data.id) {
					currentQuizId = data.id;
					currentQuizName = data.name || '';
					currentQuizDescription = data.description || '';

					// Store share token for updates if available
					if (data.share_token) {
						try {
							localStorage.setItem('amq_plus_current_share_token', data.share_token);
						} catch (error) {
							console.error('Error storing share token:', error);
						}
					}
				}
			} else {
				// Logged-in users: check if they own the quiz
				const isOwner = user && data.user_id === user.id;

				if (isOwner) {
					currentQuizId = quizId;
					currentQuizName = data.name || '';
					currentQuizDescription = data.description || '';

					// Store share token in localStorage if available
					if (data.share_token) {
						try {
							localStorage.setItem('amq_plus_current_share_token', data.share_token);
						} catch (error) {
							console.error('Error storing share token:', error);
						}
					}
				} else {
					// User doesn't own this quiz - allow remixing if enabled
					currentQuizId = null;
					currentQuizName = `${data.name || 'Quiz'} (Copy)`;
					currentQuizDescription = data.description || '';

					// Store share token temporarily if available (for remixing)
					if (data.share_token) {
						try {
							localStorage.setItem('amq_plus_current_share_token', data.share_token);
						} catch (error) {
							console.error('Error storing share token:', error);
						}
					}
				}
			}

			// Extract configuration data if not already extracted
			configData = configData || data.configuration_data;

			if (!configData || !configData.nodes || !configData.edges) {
				throw new Error('Invalid quiz configuration data');
			}

			// Check if this is a template and store metadata
			if (configData.metadata && configData.metadata.isTemplate) {
				currentTemplateMetadata = configData.metadata;
				console.log('Loaded template:', currentTemplateMetadata.name);
			} else {
				currentTemplateMetadata = null;
			}

			// Restore nodes with event handlers
			const loadedNodes = configData.nodes.map((node) => ({
				...node,
				data: {
					...node.data,
					onValueChange: handleNodeValueChange,
					onDelete: handleNodeDelete
				}
			}));

			// Restore edges with proper styling
			const loadedEdges = configData.edges.map((edge) => createEdgeWithData(edge, globalEdgeType));

			// Update state
			nodes = loadedNodes;
			edges = loadedEdges;

			// Find highest node counter to avoid ID conflicts
			const maxCounter = loadedNodes.reduce((max, node) => {
				const match = node.id.match(/-(\d+)$/);
				if (match) {
					return Math.max(max, parseInt(match[1]));
				}
				return max;
			}, 0);
			nodeCounter = maxCounter;

			// Update modifier indicators
			setTimeout(() => {
				updateModifierIndicators();
				// Check for multiple Number of Songs nodes immediately after loading
				checkMultipleNumberOfSongsNodes();
			}, 100);

			// Start auto-save interval
			startAutoSave();

			toast.success(`Loaded quiz: ${data.name}`);
		} catch (error) {
			console.error('Error loading quiz:', error);
			toast.error(`Error loading quiz: ${error.message}`);
		}
	}
</script>

<!-- Fullscreen Editor -->
<main class="absolute inset-0 h-full w-full">
	<!-- Top toolbar -->
	<div class="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
		<Button
			variant="outline"
			size="sm"
			class=""
			disabled={false}
			onclick={() => (drawerOpen = !drawerOpen)}
		>
			{drawerOpen ? 'Hide Panel' : 'Add Nodes'}
		</Button>

		<Button
			variant="outline"
			size="sm"
			class=""
			disabled={false}
			onclick={() => (loadQuizModalOpen = true)}
		>
			Load Quiz
		</Button>

		<!-- Template Guide Button (shown only when template is loaded) -->
		{#if currentTemplateMetadata}
			<Button
				variant="outline"
				size="sm"
				class="border-amber-400 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 hover:text-amber-950"
				disabled={false}
				onclick={() => (templateGuideModalOpen = true)}
			>
				📚 About This Template
			</Button>
		{/if}

		<!-- Global Edge Type Selector -->
		<div class="flex items-center gap-1 rounded border bg-white px-2 py-1">
			<span class="text-xs text-gray-600">Edges:</span>
			<select
				bind:value={globalEdgeType}
				class="cursor-pointer border-0 bg-transparent text-xs focus:outline-none"
				onchange={updateAllEdgeTypesLocal}
			>
				{#each edgeTypeOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<Button variant="outline" size="sm" class="" disabled={false} onclick={validateAll}
			>Validate</Button
		>
		<Button variant="outline" size="sm" class="" disabled={false} onclick={exportConfig}
			>Save Quiz</Button
		>
		{#if currentQuizId}
			<Button
				variant="outline"
				size="sm"
				class=""
				disabled={false}
				onclick={() => (shareDialogOpen = true)}
			>
				Share
			</Button>
		{/if}
		{#if serverDataMismatch}
			<button
				class="flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
				onclick={confirmSyncWithServer}
				disabled={isSyncingWithServer}
				title="Local changes differ from server. Click to sync."
			>
				<svg class="h-4 w-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="text-xs font-medium text-amber-700">
					{#if isSyncingWithServer}
						Syncing...
					{:else}
						Sync
					{/if}
				</span>
			</button>
		{/if}
		<Button
			variant="outline"
			size="sm"
			class=""
			disabled={false}
			onclick={() => (helpDialogOpen = true)}>Help</Button
		>
	</div>

	<!-- Add Nodes Panel -->
	<AddNodesDrawer bind:isOpen={drawerOpen} onAddNode={handleAddNode} existingNodes={nodes} />

	<!-- Flow Editor -->
	<div
		class="h-full w-full"
		bind:clientWidth
		bind:clientHeight
		role="application"
		oncontextmenu={(e) => e.preventDefault()}
	>
		<SvelteFlow
			bind:nodes
			bind:edges
			{nodeTypes}
			{edgeTypes}
			{isValidConnection}
			proOptions={{ hideAttribution: true }}
			nodesDraggable={true}
			nodesConnectable={true}
			elementsSelectable={true}
			zoomOnDoubleClick={false}
			connectionLineType={globalEdgeType}
			defaultEdgeOptions={{
				type: globalEdgeType,
				style: 'stroke: rgba(99, 102, 241, 0.7); strokeWidth: 2;'
			}}
			onnodecontextmenu={handleNodeContextMenu}
			onedgecontextmenu={handleEdgeContextMenu}
			onpaneclick={handlePaneClick}
			onconnect={(params) => {
				// Call updateModifierIndicators after connection
				setTimeout(() => {
					updateModifierIndicators();
				}, 50);
			}}
			ondelete={(params) => {
				// Call updateModifierIndicators after any delete operation
				setTimeout(() => {
					updateModifierIndicators();
				}, 50);
			}}
		>
			<Background />
			<Controls />
			<MiniMap />
			{#if menu}
				<ContextMenu
					onclick={handlePaneClick}
					id={menu.id}
					top={menu.top}
					left={menu.left}
					right={menu.right}
					bottom={menu.bottom}
					label={menu.type}
					onDuplicate={menu.type === 'node'
						? () => {
								const n = nodes.find((x) => x.id === menu.id);
								if (n) {
									// Create a proper deep copy of the node with new instance ID
									const newInstanceId = `${n.data.id}-${++nodeCounter}`;
									const duplicatedNode = {
										...n,
										id: newInstanceId,
										position: { x: n.position.x + 20, y: n.position.y + 50 },
										data: {
											...n.data,
											instanceId: newInstanceId,
											userPositioned: false, // Mark as not user-positioned initially
											// Deep copy currentValue to avoid shared references
											currentValue: n.data.currentValue
												? JSON.parse(JSON.stringify(n.data.currentValue))
												: undefined,
											onValueChange: handleNodeValueChange,
											onDelete: handleNodeDelete
										}
									};

									// Add the duplicated node without repositioning others
									nodes = [...nodes, duplicatedNode];

									// Check for multiple number of songs nodes and switch to percentage mode
									checkMultipleNumberOfSongsNodes();
								}
								menu = null;
							}
						: undefined}
					onSetChance={menu.type === 'node' ? () => handleSetChance(menu.id) : undefined}
					onViewDefaults={menu.type === 'node' ? () => handleViewDefaults(menu.id) : undefined}
					onRemoveEdges={menu.type === 'node' ? () => handleRemoveNodeEdges(menu.id) : undefined}
					onSetEdgeType={menu.type === 'edge'
						? (customType) => handleSetEdgeType(menu.id, customType)
						: undefined}
					onDelete={() => {
						if (menu.type === 'node') {
							handleNodeDelete(menu.id);
						} else if (menu.type === 'edge') {
							edges = edges.filter((e) => e.id !== menu.id);
							updateModifierIndicators();
						}
						menu = null;
					}}
				/>
			{/if}
		</SvelteFlow>
	</div>

	<!-- Validation Modal -->
	<ValidationModal
		bind:isOpen={validationOpen}
		{nodes}
		{edges}
		onClose={() => (validationOpen = false)}
		onMarkNodeError={markNodeError}
		onClearAllNodeErrors={clearAllNodeErrors}
	/>

	<!-- Export Simulation Modal -->
	<ExportSimulationModal
		bind:isOpen={exportSimulationOpen}
		nodes={nodes as any}
		edges={edges as any}
		onClose={() => (exportSimulationOpen = false)}
		{currentQuizId}
		{currentQuizName}
		{session}
		{user}
		onSave={(quizId, quizName) => {
			currentQuizId = quizId;
			currentQuizName = quizName;
		}}
	/>

	<!-- Help Tutorial Dialog -->
	<HelpDialog bind:open={helpDialogOpen} />

	<!-- Load Quiz Modal -->
	<LoadQuizModal bind:isOpen={loadQuizModalOpen} onLoadQuiz={handleLoadQuizFromModal} {session} />

	<!-- Template Guide Modal -->
	<TemplateGuideModal
		bind:isOpen={templateGuideModalOpen}
		templateMetadata={currentTemplateMetadata}
	/>

	<!-- Percentage Chance Modal -->
	<PercentageChanceModal
		bind:isOpen={chanceModalOpen}
		currentChance={currentNodeChance as any}
		nodeTitle={chanceModalNodeId
			? ((nodes.find((n) => n.id === chanceModalNodeId)?.data as CustomNodeData)
					?.title as string) || 'Node'
			: 'Node'}
		onSave={handleSaveChance}
	/>

	<!-- Share Dialog -->
	<ShareDialog
		bind:open={shareDialogOpen}
		quizId={currentQuizId}
		quizName={currentQuizName}
		quizDescription={currentQuizDescription}
		{session}
	/>

	<!-- Sync Confirmation Modal -->
	{#if syncConfirmModalOpen}
		<div
			class="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
			role="dialog"
			aria-modal="true"
			tabindex="0"
			onkeydown={(e) => (e.key === 'Escape' ? (syncConfirmModalOpen = false) : null)}
			onmousedown={(e) => {
				if (e.currentTarget === e.target) syncConfirmModalOpen = false;
			}}
		>
			<div class="w-[400px] max-w-[90vw] rounded-md border bg-white p-6 shadow-xl" role="document">
				<div class="mb-4 flex items-start gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100"
					>
						<svg class="h-6 w-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="mb-2 text-lg font-semibold text-gray-900">Sync with Server?</h3>
						<p class="text-sm text-gray-600">
							This will replace your current flow with the version from the server. Your local
							changes will be lost.
						</p>
					</div>
				</div>

				<div class="flex justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						class=""
						disabled={isSyncingWithServer}
						onclick={() => (syncConfirmModalOpen = false)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						class=""
						disabled={isSyncingWithServer}
						onclick={syncWithServer}
					>
						{#if isSyncingWithServer}
							Syncing...
						{:else}
							Sync with Server
						{/if}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	:global(.svelte-flow) {
		background: #fafafa;
		/* CSS variables for consistent edge and connection line styling */
		--xy-edge-stroke: rgba(99, 102, 241, 0.7);
		--xy-edge-stroke-width: 2px;
		--xy-connectionline-stroke: rgba(99, 102, 241, 0.7);
		--xy-connectionline-stroke-width: 2px;
	}

	/* Ensure all edges are blue with transparency */
	:global(.svelte-flow__edge-path) {
		stroke: rgba(99, 102, 241, 0.7) !important;
		stroke-width: 2 !important;
	}

	:global(.svelte-flow__edge) {
		stroke: rgba(99, 102, 241, 0.7) !important;
		stroke-width: 2 !important;
	}

	/* Style connection lines during drag */
	:global(.svelte-flow__connectionline) {
		stroke: rgba(99, 102, 241, 0.7) !important;
		stroke-width: 2 !important;
	}
</style>
