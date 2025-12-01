/**
 * Core node system architecture for the AMQ+ editor.
 * Defines all node types, their configurations, and helper functions for node management.
 *
 * @module nodeDefinitions
 */

import {
	ROUTER_DEFAULT_SETTINGS,
	BASIC_SETTINGS_DEFAULT_SETTINGS,
	SELECTION_MODIFIER_DEFAULT_SETTINGS,
	NUMBER_OF_SONGS_DEFAULT_SETTINGS,
	SONG_LIST_DEFAULT_SETTINGS,
	BATCH_USER_LIST_DEFAULT_SETTINGS,
	LIVE_NODE_DEFAULT_SETTINGS,
	SOURCE_SELECTOR_DEFAULT_SETTINGS
} from './defaultNodeSettings.js';
import { clamp } from './mathUtils.js';
import { analyzeGroup } from './mathUtils.js';

// Filter registry will be initialized by importing filters/index.js
// We use a getter pattern to avoid circular dependencies
let _filterRegistry = null;
export function setFilterRegistry(registry) {
	_filterRegistry = registry;
	// Rebuild FILTER_NODE_DEFINITIONS from registry when registry is set
	FILTER_NODE_DEFINITIONS = buildFilterNodeDefinitions();
}
export function getFilterRegistryForDisplay() {
	return _filterRegistry;
}

/**
 * Node category types used throughout the editor.
 * @typedef {'router' | 'basicSettings' | 'filter' | 'numberOfSongs' | 'selectionModifier' | 'songList' | 'batchUserList' | 'liveNode' | 'sourceSelector'} NodeCategory
 */

/**
 * Router settings configuration.
 * @typedef {Object} RouterSettings
 * @property {Array<{id: string, name: string, percentage: number, enabled: boolean}>} routes - Available routes
 * @property {'random' | 'weighted'} selectionMode - Route selection algorithm
 */

/**
 * Song List node settings for source song selection.
 * @typedef {Object} SongListSettings
 * @property {'masterlist' | 'user-lists' | 'saved-lists'} mode - Song source mode
 * @property {boolean} useEntirePool - If true, bypass all filters for this list's songs
 * @property {Object} [userListImport] - User list import configuration (for user-lists mode)
 * @property {string} userListImport.platform - Platform to import from ('anilist' | 'mal')
 * @property {string} userListImport.username - Username to import
 * @property {Object} userListImport.selectedLists - List types to import
 * @property {boolean} userListImport.selectedLists.completed - Include completed anime
 * @property {boolean} userListImport.selectedLists.watching - Include watching anime
 * @property {boolean} userListImport.selectedLists.planning - Include planning anime
 * @property {boolean} userListImport.selectedLists.on_hold - Include on-hold anime
 * @property {boolean} userListImport.selectedLists.dropped - Include dropped anime
 * @property {string} [selectedListId] - Selected list ID (for saved-lists mode, exactly one)
 * @property {number|null} [songPercentage] - Percentage of songs to pick from this list (0-100, null = not using percentages)
 */

/**
 * Batch User List user entry configuration.
 * @typedef {Object} BatchUserListEntry
 * @property {string} id - Unique identifier for this user entry
 * @property {'anilist' | 'mal'} platform - Platform to import from
 * @property {string} username - Username to import
 * @property {Object} selectedLists - List types to import
 * @property {boolean} selectedLists.completed - Include completed anime
 * @property {boolean} selectedLists.watching - Include watching anime
 * @property {boolean} selectedLists.planning - Include planning anime
 * @property {boolean} selectedLists.on_hold - Include on-hold anime
 * @property {boolean} selectedLists.dropped - Include dropped anime
 * @property {number|null} [songPercentage] - Percentage of songs to pick from this user's list (0-100, null = not using percentages)
 */

/**
 * Batch User List node settings for importing multiple user lists.
 * @typedef {Object} BatchUserListSettings
 * @property {boolean} useEntirePool - If true, bypass all filters for this list's songs
 * @property {BatchUserListEntry[]} userEntries - Array of user import configurations
 */

/**
 * Basic lobby settings configuration.
 * @typedef {Object} BasicSettings
 * @property {{value: string, label: string, type: string, options: string[]}} scoring - Scoring method
 * @property {{value: string, label: string, type: string, options: string[]}} answering - Answering method
 * @property {{value: number, label: string, type: string, min: number, max: number}} players - Number of players
 * @property {{value: number, label: string, type: string, min: number, max: number}} teamSize - Team size
 * @property {{value: {useRange: boolean, staticValue: number, min: number, max: number}, label: string, type: string}} guessTime - Guess time configuration
 * @property {{value: {useRange: boolean, staticValue: number, min: number, max: number}, label: string, type: string}} extraGuessTime - Extra guess time
 * @property {{value: {useRange: boolean, start: number, end: number, staticValue: number}, label: string, type: string}} samplePoint - Sample point configuration
 * @property {{value: {mode: string, staticValue: number, randomValues: number[]}, label: string, type: string}} playbackSpeed - Playback speed
 * @property {{value: string[], label: string, type: string}} modifiers - Enabled modifiers
 * @property {{value: boolean, label: string, type: string}} duplicateShows - Allow duplicate shows
 */

/**
 * Songs and types filter settings.
 * @typedef {Object} SongsAndTypesSettings
 * @property {'count' | 'percentage'} mode - Allocation mode
 * @property {{value: number, random: boolean, min: number, max: number}} songCount - Total song count
 * @property {Object} songTypes - Song type distribution
 * @property {{enabled: boolean, count: number, percentage: number, random: boolean, percentageMin: number, percentageMax: number, countMin: number, countMax: number}} songTypes.openings - Opening songs
 * @property {{enabled: boolean, count: number, percentage: number, random: boolean, percentageMin: number, percentageMax: number, countMin: number, countMax: number}} songTypes.endings - Ending songs
 * @property {{enabled: boolean, count: number, percentage: number, random: boolean, percentageMin: number, percentageMax: number, countMin: number, countMax: number}} songTypes.inserts - Insert songs
 * @property {Object} songSelection - Song selection criteria
 * @property {{enabled: boolean, count: number, percentage: number, random: boolean}} songSelection.random - Random selection
 * @property {{enabled: boolean, count: number, percentage: number, random: boolean}} songSelection.watched - Watched selection
 */

/**
 * Vintage (year/season) filter settings.
 * @typedef {Object} VintageSettings
 * @property {Array<{from: {season: string, year: number}, to: {season: string, year: number}, percentage: number, count: number, useAdvanced: boolean}>} ranges - Year/season ranges
 * @property {'percentage' | 'count'} mode - Allocation mode
 */

/**
 * Song difficulty filter settings.
 * @typedef {Object} SongDifficultySettings
 * @property {'basic' | 'advanced'} viewMode - View mode
 * @property {'percentage' | 'count'} mode - Allocation mode
 * @property {{enabled: boolean, count: number, percentage: number, randomRange: boolean, minCount: number, maxCount: number, minPercentage: number, maxPercentage: number}} easy - Easy difficulty
 * @property {{enabled: boolean, count: number, percentage: number, randomRange: boolean, minCount: number, maxCount: number, minPercentage: number, maxPercentage: number}} medium - Medium difficulty
 * @property {{enabled: boolean, count: number, percentage: number, randomRange: boolean, minCount: number, maxCount: number, minPercentage: number, maxPercentage: number}} hard - Hard difficulty
 * @property {Array<{min: number, max: number, percentage: number, count: number}>} ranges - Custom difficulty ranges
 */

/**
 * Score range filter settings (used for player score and anime score).
 * @typedef {Object} ScoreRangeSettings
 * @property {number} min - Minimum score
 * @property {number} max - Maximum score
 * @property {'range' | 'percentage'} mode - Selection mode
 * @property {Object.<string, number>} percentages - Score-specific percentages
 * @property {number[]} disallowed - Disallowed scores
 */

/**
 * Anime type filter settings.
 * @typedef {Object} AnimeTypeSettings
 * @property {'simple' | 'advanced'} viewMode - View mode
 * @property {boolean} [tv] - Include TV shows (simple mode)
 * @property {boolean} [movie] - Include movies (simple mode)
 * @property {boolean} [ova] - Include OVAs (simple mode)
 * @property {boolean} [ona] - Include ONAs (simple mode)
 * @property {boolean} [special] - Include specials (simple mode)
 * @property {'percentage' | 'count'} [mode] - Allocation mode (advanced)
 * @property {Object} [advanced] - Advanced mode settings
 */

/**
 * Number of songs settings.
 * @typedef {Object} NumberOfSongsSettings
 * @property {boolean} useRange - Whether to use a range
 * @property {number} staticValue - Static song count
 * @property {number} min - Minimum count (if range)
 * @property {number} max - Maximum count (if range)
 * @property {boolean} [percentageModeLocked] - Whether percentage mode is locked
 */

/**
 * Available node categories and their string identifiers.
 * @type {Object.<string, NodeCategory>}
 */
export const NODE_CATEGORIES = {
	ROUTER: 'router',
	BASIC_SETTINGS: 'basicSettings',
	FILTER: 'filter',
	NUMBER_OF_SONGS: 'numberOfSongs',
	SELECTION_MODIFIER: 'selectionModifier',
	SONG_LIST: 'songList',
	BATCH_USER_LIST: 'batchUserList',
	LIVE_NODE: 'liveNode',
	SOURCE_SELECTOR: 'sourceSelector'
};

/**
 * Allocation entry for deterministic value distribution.
 * @typedef {Object} AllocationEntry
 * @property {'static' | 'range'} kind - Type of allocation
 * @property {string} label - Label for the allocated value
 * @property {number} [value] - Static value (for kind='static')
 * @property {number} [min] - Minimum value (for kind='range')
 * @property {number} [max] - Maximum value (for kind='range')
 */

/**
 * Allocates values to maximize the total using a greedy approach.
 * Distributes a target total across multiple entries, respecting static values and range constraints.
 *
 * @param {AllocationEntry[]} entries - Array of allocation entries
 * @param {number} targetTotal - Target total to allocate
 * @returns {Map<string, number>} Map of labels to allocated values
 */
function allocateToMax(entries, targetTotal) {
	const assigned = new Map();
	const statics = [];
	const ranges = [];
	for (const e of entries) {
		if (e.kind === 'static') statics.push(e);
		else ranges.push(e);
	}
	const staticTotal = statics.reduce((s, e) => s + Number(e.value || 0), 0);
	let remaining = Math.max(0, Math.round(Number(targetTotal || 0)) - Math.round(staticTotal));
	for (const s of statics) assigned.set(s.label, Math.round(Number(s.value || 0)));

	if (ranges.length === 0) return assigned;

	const mins = ranges.map((e) => Math.round(Number(e.min || 0)));
	const maxs = ranges.map((e) => Math.round(Number(e.max || 0)));
	const sumMins = mins.reduce((a, b) => a + b, 0);
	const sumMaxs = maxs.reduce((a, b) => a + b, 0);

	// Clamp remaining to feasible bounds
	remaining = clamp(remaining, sumMins, sumMaxs);

	if (ranges.length === 1) {
		// Single range - take the maximum possible
		const val = clamp(remaining, mins[0], maxs[0]);
		assigned.set(ranges[0].label, val);
		return assigned;
	}

	// Multiple ranges - greedy approach: maximize each range in order
	let left = remaining;
	for (let i = 0; i < ranges.length - 1; i++) {
		const feasibleMax = Math.min(maxs[i], left - (ranges.length - 1 - i) * mins[i + 1]);
		const val = Math.max(mins[i], feasibleMax);
		assigned.set(ranges[i].label, val);
		left -= val;
	}

	// Last range gets whatever is left (within its bounds)
	const lastIdx = ranges.length - 1;
	const lastVal = clamp(left, mins[lastIdx], maxs[lastIdx]);
	assigned.set(ranges[lastIdx].label, lastVal);

	return assigned;
}

/**
 * Node definition configuration object.
 * @typedef {Object} NodeDefinition
 * @property {string} id - Unique identifier for the node type
 * @property {NodeCategory} type - Node category
 * @property {string} title - Display title
 * @property {string} description - Description of node functionality
 * @property {string} icon - Emoji icon
 * @property {string} color - Hex color code for the node
 * @property {boolean} deletable - Whether the node can be deleted
 * @property {boolean} unique - Whether only one instance is allowed
 * @property {Object} defaultValue - Default settings for this node type
 * @property {Object} [settings] - Alternative to defaultValue for some node types
 * @property {string} [formType] - Form type identifier for filter nodes
 * @property {{x: number, y: number}} [position] - Default position for node instances
 * @property {boolean} [mustBeLast] - Whether this node type must be the last in the flow
 * @property {boolean} [isSourceNode] - Whether this node provides source songs (Song List nodes)
 */

/**
 * Router node configuration for flow path selection.
 * @type {NodeDefinition}
 */
export const ROUTER_CONFIG = {
	id: 'router',
	type: NODE_CATEGORIES.ROUTER,
	title: 'Route Selector',
	description: 'Randomly selects one route to execute from multiple connected paths',
	icon: '🔀',
	color: '#7c3aed',
	deletable: true,
	unique: false,
	defaultValue: ROUTER_DEFAULT_SETTINGS
};

/**
 * Basic Settings node configuration for core lobby settings.
 * @type {NodeDefinition}
 */
export const BASIC_SETTINGS_CONFIG = {
	id: 'basic-settings',
	type: NODE_CATEGORIES.BASIC_SETTINGS,
	title: 'Basic Settings',
	description: 'Core lobby configuration settings',
	icon: '⚙️',
	color: '#6366f1',
	deletable: true,
	unique: false,
	defaultValue: BASIC_SETTINGS_DEFAULT_SETTINGS
};

/**
 * All available filter node definitions.
 * Each filter can be instantiated multiple times in the editor.
 * @type {Object.<string, NodeDefinition>}
 */
/**
 * Build FILTER_NODE_DEFINITIONS dynamically from FilterRegistry
 * This ensures UI metadata is always in sync with filter definitions
 * @returns {Object} Filter node definitions
 */
function buildFilterNodeDefinitions() {
	const definitions = {};
	const filters = _filterRegistry?.getAll() || [];

	filters.forEach(filter => {
		definitions[filter.id] = {
			id: filter.id,
			type: filter.metadata?.type || NODE_CATEGORIES.FILTER,
			title: filter.metadata?.title || filter.id,
			description: filter.metadata?.description || '',
			icon: filter.metadata?.icon || '🎯',
			color: filter.metadata?.color || '#6366f1',
			deletable: true,
			unique: false,
			formType: filter.formType || 'complex',
			defaultValue: filter.defaultSettings || {}
		};
	});

	return definitions;
}

// Build filter definitions from registry
// Note: This is built after filters/index.js is imported and registry is initialized
export let FILTER_NODE_DEFINITIONS = {};

/**
 * Selection Modifier node configuration for limiting node instance selection.
 * @type {NodeDefinition}
 */
export const SELECTION_MODIFIER_CONFIG = {
	id: 'selection-modifier',
	type: NODE_CATEGORIES.SELECTION_MODIFIER,
	title: 'Selection Modifier',
	description:
		'Limits how many instances of a connected node type by type are considered during export',
	icon: '🎯',
	color: '#f59e0b',
	deletable: true,
	unique: false,
	defaultValue: SELECTION_MODIFIER_DEFAULT_SETTINGS
};

/**
 * Number of Songs node configuration for setting final song count.
 * @type {NodeDefinition}
 */
export const NUMBER_OF_SONGS_CONFIG = {
	id: 'number-of-songs',
	type: NODE_CATEGORIES.NUMBER_OF_SONGS,
	title: 'Number of Songs',
	description: 'Determines final song count for the lobby',
	icon: '🔢',
	color: '#dc2626',
	deletable: true,
	unique: false,
	mustBeLast: false,
	defaultValue: NUMBER_OF_SONGS_DEFAULT_SETTINGS
};

/**
 * Song List node configuration for source song selection.
 * @type {NodeDefinition}
 */
export const SONG_LIST_CONFIG = {
	id: 'song-list',
	type: NODE_CATEGORIES.SONG_LIST,
	title: 'Song List',
	description: 'Choose base song pool (entire database, user lists, or public lists)',
	icon: '📋',
	color: '#3b82f6',
	deletable: true,
	unique: false,
	isSourceNode: true,
	defaultValue: SONG_LIST_DEFAULT_SETTINGS
};

/**
 * Batch User List node configuration for importing multiple user lists.
 * Uses shared implementation with Live Node but defaults to manual mode.
 * @type {NodeDefinition}
 */
export const BATCH_USER_LIST_CONFIG = {
	id: 'batch-user-list',
	type: NODE_CATEGORIES.BATCH_USER_LIST,
	title: 'Batch User List',
	description: 'Import anime lists from multiple users simultaneously',
	icon: '👥',
	color: '#8b5cf6',
	deletable: true,
	unique: false,
	isSourceNode: true,
	defaultValue: BATCH_USER_LIST_DEFAULT_SETTINGS
};

/**
 * Live Node node configuration for importing lists from players in the room.
 * Uses shared implementation with Batch User List but forces live mode.
 * @type {NodeDefinition}
 */
export const LIVE_NODE_CONFIG = {
	id: 'live-node',
	type: NODE_CATEGORIES.LIVE_NODE,
	title: 'Live Node',
	description: 'Gathers anime lists from players in the room (configured from AMQ)',
	icon: '🔴',
	color: '#ef4444',
	deletable: true,
	unique: true,
	isSourceNode: true,
	defaultValue: {
		...BATCH_USER_LIST_DEFAULT_SETTINGS,
		mode: 'live' // Force live mode for Live Node
	}
};

/**
 * Source Selector node configuration for restricting filters to specific source nodes.
 * @type {NodeDefinition}
 */
export const SOURCE_SELECTOR_CONFIG = {
	id: 'source-selector',
	type: NODE_CATEGORIES.SOURCE_SELECTOR,
	title: 'Source Selector',
	description: 'Restrict a filter to only affect songs from a specific source node',
	icon: '🔗',
	color: '#f59e0b',
	deletable: true,
	unique: false,
	formType: 'complex-source-selector',
	defaultValue: SOURCE_SELECTOR_DEFAULT_SETTINGS
};

/**
 * Execution chance configuration (single value or range).
 * @typedef {number | {kind: 'range', min?: number, max?: number}} ExecutionChance
 */

/**
 * Route badge descriptor used for annotating node cards.
 * @typedef {Object} RouteBadge
 * @property {string} label
 * @property {string} name
 * @property {string} routeId
 * @property {string} routerId
 */

/**
 * Payload emitted when node values change.
 * @typedef {{nodeId: string, newValue: any}} NodeValueChangePayload
 */

/**
 * Common node data shared by all node categories.
 * @typedef {Object} BaseNodeData
 * @property {string} id
 * @property {NodeCategory} type
 * @property {string} instanceId
 * @property {string} title
 * @property {string} description
 * @property {string} icon
 * @property {string} color
 * @property {boolean} deletable
 * @property {boolean} [unique]
 * @property {*} [defaultValue]
 * @property {*} currentValue
 * @property {ExecutionChance} [executionChance]
 * @property {boolean} [validationError]
 * @property {boolean} [validationWarning]
 * @property {string} [validationMessage]
 * @property {string} [validationShortMessage]
 * @property {(payload: NodeValueChangePayload) => void} [onValueChange]
 * @property {(instanceId: string) => void} [onDelete]
 * @property {boolean} [openDefaultSettings]
 * @property {boolean} [selectionModified]
 * @property {RouteBadge[]} [routeBadges]
 * @property {boolean} [userPositioned]
 * @property {string} [formType]
 */

/**
 * Filter node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.FILTER}} FilterNodeData
 */

/**
 * Router node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.ROUTER, currentValue: import('./nodeDefinitions.js').RouterSettings | Object}} RouterNodeData
 */

/**
 * Basic settings node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.BASIC_SETTINGS, currentValue: import('./nodeDefinitions.js').BasicSettings | Object}} BasicSettingsNodeData
 */

/**
 * Number of songs node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.NUMBER_OF_SONGS, currentValue: import('./nodeDefinitions.js').NumberOfSongsSettings | Object}} NumberOfSongsNodeData
 */

/**
 * Selection modifier node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.SELECTION_MODIFIER, currentValue: {minSelection: number, maxSelection: number}}} SelectionModifierNodeData
 */

/**
 * Song list node instance data.
 * @typedef {BaseNodeData & {type: typeof NODE_CATEGORIES.SONG_LIST, currentValue: import('./nodeDefinitions.js').SongListSettings | Object, isSourceNode?: boolean}} SongListNodeData
 */

/**
 * Node instance data structure for the flow editor.
 * @typedef {Object} NodeInstance
 * @property {string} id - Unique instance ID
 * @property {NodeCategory} type - Node category type
 * @property {{x: number, y: number}} position - Position on canvas
 * @property {FilterNodeData | RouterNodeData | NumberOfSongsNodeData | SelectionModifierNodeData | SongListNodeData | BasicSettingsNodeData} data - Node data including settings (extends NodeDefinition)
 * @property {boolean} deletable - Whether node can be deleted
 */

/**
 * Creates a new node instance from a node definition
 *
 * @param {Object} definition - Node definition object
 * @param {Object} [position={x: 0, y: 0}] - Initial position for the node
 * @param {string|null} [instanceId=null] - Optional custom instance ID
 * @returns {Object} Node instance object
 */
export function createNodeInstance(definition, position = { x: 0, y: 0 }, instanceId = null) {
	const id = instanceId || `${definition.id}-${Date.now()}`;

	/** @type {NodeInstance} */
	const node = {
		id,
		type: definition.type,
		position,
		data: {
			...definition,
			instanceId: id,
			currentValue: definition.defaultValue || definition.settings || definition.defaultValue,
			executionChance: 100
		},
		deletable: definition.deletable
	};

	return node;
}

/**
 * Generates a display string for a node based on its current configuration.
 * Used to show a summary of the node's settings in the UI.
 *
 * @param {NodeInstance} node - Node instance to generate display value for
 * @param {number | {kind: 'range', min?: number, max?: number} | {kind: 'static', value: number}} [inheritedSongCount] - Optional inherited song count for allocation calculations
 * @returns {string} Formatted display string showing node configuration
 */
export function getNodeDisplayValue(node, inheritedSongCount) {
	const { data } = node;

	// For basic settings, show a summary (only show relevant fields)
	if (data.type === NODE_CATEGORIES.BASIC_SETTINGS) {
		const settings = data.currentValue;
		const guessTime = settings.guessTime?.value || settings.guessTime;
		const guessTimeDisplay = guessTime?.useRange
			? `${guessTime.min ?? 1}-${guessTime.max ?? 99}s`
			: `${guessTime?.staticValue ?? 20}s`;
		return `Guess: ${guessTimeDisplay}`;
	}

	// For number of songs, show the count or range
	if (data.type === NODE_CATEGORIES.NUMBER_OF_SONGS) {
		const currentValue = data.currentValue;
		if (currentValue?.useRange) {
			return `Songs ${currentValue.min}-${currentValue.max}`;
		} else {
			return `Songs ${currentValue?.staticValue || currentValue || 0}`;
		}
	}

	// For filter nodes, try to use registry for display
	if (data.type === NODE_CATEGORIES.FILTER) {
		const registry = getFilterRegistryForDisplay();
		if (registry) {
			const filter = registry.get(data.id);
			if (filter && filter.display) {
				return filter.display(data.currentValue, { inheritedSongCount });
			}
		}
		// Note: All filters now migrated to registry, fallback not needed
		return 'Configured';
	}

	const value = data.currentValue;

	// Handle non-filter nodes that still use switch statement
	switch (data.id) {
		case 'song-list':
			if (!value) return 'Not configured';

			if (value.mode === 'masterlist') {
				return 'Entire Database';
			} else if (value.mode === 'user-lists') {
				const username = value.userListImport?.username || 'No user';
				const platform = value.userListImport?.platform || 'anilist';
				return `${username} (${platform})`;
			} else if (value.mode === 'saved-lists') {
				if (value.selectedListId && value.selectedListName) {
					return value.selectedListName;
				}
				return value.selectedListId ? 'List selected' : 'No list selected';
			}
			return 'Not configured';

		case 'batch-user-list':
			if (!value || !value.userEntries || value.userEntries.length === 0) {
				return 'No users configured';
			}

			const configuredUsers = value.userEntries.filter((entry) => entry.username?.trim()).length;
			const totalUsers = value.userEntries.length;

			if (configuredUsers === 0) {
				return 'No users configured';
			}

			// Show imported count if available, otherwise show configured count
			if (value.importedData) {
				const songCount = value.importedData.totalSongCount || 0;
				return `${configuredUsers} users • ${songCount} songs`;
			}

			return `${configuredUsers} user${configuredUsers !== 1 ? 's' : ''} configured`;

		case 'live-node':
			if (!value || !value.userEntries || value.userEntries.length === 0) {
				return 'Synced from AMQ';
			}

			const liveConfiguredUsers = value.userEntries.filter((entry) => entry.username?.trim()).length;
			const liveTotalUsers = value.userEntries.length;

			if (liveConfiguredUsers === 0) {
				return 'Synced from AMQ';
			}

			// Show imported count if available, otherwise show configured count
			if (value.importedData) {
				const songCount = value.importedData.totalSongCount || 0;
				return `${liveConfiguredUsers} players • ${songCount} songs`;
			}

			return `${liveConfiguredUsers} player${liveConfiguredUsers !== 1 ? 's' : ''} synced`;

		case 'source-selector':
			if (!value || !value.targetSourceId) {
				return 'No source selected';
			}
			// Will be replaced with actual source node title in display
			return value.targetSourceName || value.targetSourceId;

		default:
			return 'Configured';
	}
}

/**
 * Build default template configuration with all node types connected in sequence.
 * Used as the starting point for new editor instances.
 * Must be called as a function to ensure filter definitions are loaded.
 *
 * @returns {{nodes: NodeInstance[], edges: Array<{id: string, source: string, target: string, type: string, style?: {stroke: string, strokeWidth: number}}>}}
 */
export function getDefaultTemplate() {
	return {
		nodes: [
			{
				id: 'song-list',
				type: NODE_CATEGORIES.SONG_LIST,
				position: { x: -450, y: 100 },
				data: {
					...SONG_LIST_CONFIG,
					instanceId: 'song-list',
					currentValue: SONG_LIST_CONFIG.defaultValue,
					executionChance: 100
				},
				deletable: SONG_LIST_CONFIG.deletable
			},
			{
				id: 'basic-settings',
				type: NODE_CATEGORIES.BASIC_SETTINGS,
				position: { x: 0, y: 100 },
				data: {
					...BASIC_SETTINGS_CONFIG,
					instanceId: 'basic-settings',
					currentValue: BASIC_SETTINGS_CONFIG.defaultValue,
					executionChance: 100
				},
				deletable: BASIC_SETTINGS_CONFIG.deletable
			},
			{
				id: 'songs-and-types',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 450, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['songs-and-types'],
					instanceId: 'songs-and-types',
					currentValue: FILTER_NODE_DEFINITIONS['songs-and-types']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['songs-and-types']?.deletable ?? true
			},
			{
				id: 'anime-type',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 800, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['anime-type'],
					instanceId: 'anime-type',
					currentValue: FILTER_NODE_DEFINITIONS['anime-type']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['anime-type']?.deletable ?? true
			},
			{
				id: 'vintage',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 1150, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['vintage'],
					instanceId: 'vintage',
					currentValue: FILTER_NODE_DEFINITIONS['vintage']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['vintage']?.deletable ?? true
			},
			{
				id: 'song-difficulty',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 1500, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['song-difficulty'],
					instanceId: 'song-difficulty',
					currentValue: FILTER_NODE_DEFINITIONS['song-difficulty']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['song-difficulty']?.deletable ?? true
			},
			{
				id: 'player-score',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 1850, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['player-score'],
					instanceId: 'player-score',
					currentValue: FILTER_NODE_DEFINITIONS['player-score']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['player-score']?.deletable ?? true
			},
			{
				id: 'anime-score',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 2200, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['anime-score'],
					instanceId: 'anime-score',
					currentValue: FILTER_NODE_DEFINITIONS['anime-score']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['anime-score']?.deletable ?? true
			},
			{
				id: 'song-categories',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 2550, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['song-categories'],
					instanceId: 'song-categories',
					currentValue: FILTER_NODE_DEFINITIONS['song-categories']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['song-categories']?.deletable ?? true
			},
			{
				id: 'genres',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 2900, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['genres'],
					instanceId: 'genres',
					currentValue: FILTER_NODE_DEFINITIONS['genres']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['genres']?.deletable ?? true
			},
			{
				id: 'tags',
				type: NODE_CATEGORIES.FILTER,
				position: { x: 3250, y: 100 },
				data: {
					...FILTER_NODE_DEFINITIONS['tags'],
					instanceId: 'tags',
					currentValue: FILTER_NODE_DEFINITIONS['tags']?.defaultValue || {},
					executionChance: 100
				},
				deletable: FILTER_NODE_DEFINITIONS['tags']?.deletable ?? true
			},
			{
				id: 'number-of-songs',
				type: NODE_CATEGORIES.NUMBER_OF_SONGS,
				position: { x: 3600, y: 100 },
				data: {
					...NUMBER_OF_SONGS_CONFIG,
					instanceId: 'number-of-songs',
					currentValue: NUMBER_OF_SONGS_CONFIG.defaultValue,
					executionChance: 100
				},
				deletable: NUMBER_OF_SONGS_CONFIG.deletable
			}
		],
		edges: [
			// Connect all nodes in sequence
			// For filter nodes, explicitly use main input handle (not source-selector)
			// For other nodes, use default handle (no targetHandle specified)
			{ id: 'e0', source: 'song-list', target: 'basic-settings', type: 'default', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e1', source: 'basic-settings', target: 'songs-and-types', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e2', source: 'songs-and-types', target: 'anime-type', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e3', source: 'anime-type', target: 'vintage', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e4', source: 'vintage', target: 'song-difficulty', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e5', source: 'song-difficulty', target: 'player-score', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e6', source: 'player-score', target: 'anime-score', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e7', source: 'anime-score', target: 'song-categories', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e8', source: 'song-categories', target: 'genres', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			// @ts-ignore
			{ id: 'e9', source: 'genres', target: 'tags', type: 'default', targetHandle: 'main', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } },
			{ id: 'e10', source: 'tags', target: 'number-of-songs', type: 'default', style: { stroke: 'rgba(99, 102, 241, 0.7)', strokeWidth: 2 } }
		]
	};
}
