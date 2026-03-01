/**
 * Editor2 State Management
 * Svelte 5 runes-based state for the list-based editor.
 * Flat, hierarchical data model -- no graph/edge concept.
 */

import {
	BASIC_SETTINGS_DEFAULT_SETTINGS,
	NUMBER_OF_SONGS_DEFAULT_SETTINGS,
	SONG_LIST_DEFAULT_SETTINGS,
	NEGATIVE_SONG_LIST_DEFAULT_SETTINGS,
	BATCH_USER_LIST_DEFAULT_SETTINGS,
	SELECTION_MODIFIER_DEFAULT_SETTINGS,
	SOURCE_SELECTOR_DEFAULT_SETTINGS
} from '$lib/utils/defaultNodeSettings.js';

import { FilterRegistry } from '$lib/filters/FilterRegistry.js';

let uid = 0;
function genId(prefix = 'id') {
	return `${prefix}-${Date.now()}-${uid++}`;
}

function deepClone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Creates a default route object.
 * @param {Partial<{name: string, percentage: number}>} overrides
 */
function createDefaultRoute(overrides = {}) {
	const defaultSource = deepClone(SONG_LIST_DEFAULT_SETTINGS);
	defaultSource.sourceType = 'song-list';
	const defaultFilters = ['songs-and-types', 'song-difficulty']
		.map(createFilterEntry)
		.filter(Boolean);
	return {
		id: genId('route'),
		name: overrides.name ?? `Route ${Date.now() % 1000}`,
		percentage: overrides.percentage ?? 100,
		enabled: true,
		basicSettings: deepClone(BASIC_SETTINGS_DEFAULT_SETTINGS),
		numberOfSongs: deepClone(NUMBER_OF_SONGS_DEFAULT_SETTINGS),
		sources: [defaultSource],
		negativeSources: [],
		filters: defaultFilters
	};
}

/**
 * Creates a filter entry from a filter ID.
 * @param {string} filterId
 */
function createFilterEntry(filterId) {
	const filterDef = FilterRegistry.get(filterId);
	if (!filterDef) {
		console.warn(`Unknown filter: ${filterId}`);
		return null;
	}
	return {
		id: genId('filter'),
		filterId,
		settings: deepClone(filterDef.defaultSettings),
		enabled: true,
		executionChance: 100,
		sourceSelector: null,
		selectionModifier: null
	};
}

// ── Reactive state ──────────────────────────────────────────────────

let routes = $state([createDefaultRoute({ name: 'Route 1', percentage: 100 })]);

let expandedFilterId = $state(null);
let dragState = $state({ active: false, filterId: null, sourceRouteId: null });

// ── Current quiz tracking ───────────────────────────────────────────

let currentQuizId = $state(null);
let currentShareToken = $state(null);
let currentQuizName = $state('');
let currentQuizDescription = $state('');
let currentIsPublic = $state(false);
let currentAllowRemixing = $state(false);
let currentOwnerUserId = $state(null); // user_id of whoever originally created this quiz

// ── Derived ─────────────────────────────────────────────────────────

function getTotalPercentage() {
	return routes.reduce((sum, r) => sum + (r.enabled ? r.percentage : 0), 0);
}

function getFilterCatalog() {
	const all = FilterRegistry.getAll();
	return all.map((f) => ({
		id: f.id,
		title: f.metadata.title,
		icon: f.metadata.icon,
		color: f.metadata.color,
		description: f.metadata.description,
		category: f.metadata.category,
		formType: f.formType
	}));
}

// ── Route operations ────────────────────────────────────────────────

function addRoute() {
	const count = routes.length + 1;
	const newPct = Math.floor(100 / count);
	routes.forEach((r) => (r.percentage = newPct));
	const remainder = 100 - newPct * count;
	const newRoute = createDefaultRoute({
		name: `Route ${count}`,
		percentage: newPct + remainder
	});
	routes.push(newRoute);
}

function removeRoute(routeId) {
	if (routes.length <= 1) return;
	const idx = routes.findIndex((r) => r.id === routeId);
	if (idx === -1) return;
	routes.splice(idx, 1);
	const each = Math.floor(100 / routes.length);
	routes.forEach((r, i) => {
		r.percentage = i === 0 ? each + (100 - each * routes.length) : each;
	});
}

function updateRoutePercentage(routeId, pct) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.percentage = Math.max(0, Math.min(100, pct));
}

function updateRouteName(routeId, name) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.name = name;
}

function toggleRoute(routeId) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.enabled = !route.enabled;
}

function updateBasicSettings(routeId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.basicSettings = settings;
}

function updateNumberOfSongs(routeId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.numberOfSongs = settings;
}

function updateSource(routeId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.sources) || route.sources.length === 0) {
		const fallback = deepClone(SONG_LIST_DEFAULT_SETTINGS);
		fallback.sourceType = 'song-list';
		route.sources = [fallback];
	}
	route.sources[0] = settings;
}

function toggleNegativeSource(routeId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.negativeSources)) route.negativeSources = [];
	if (route.negativeSources.length > 0) {
		route.negativeSources.pop();
	} else {
		const neg = deepClone(NEGATIVE_SONG_LIST_DEFAULT_SETTINGS);
		neg.sourceType = 'negative-song-list';
		route.negativeSources.push(neg);
	}
}

function updateNegativeSource(routeId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.negativeSources) || route.negativeSources.length === 0) {
		const fallback = deepClone(NEGATIVE_SONG_LIST_DEFAULT_SETTINGS);
		fallback.sourceType = 'negative-song-list';
		route.negativeSources = [fallback];
	}
	route.negativeSources[0] = settings;
}

function addSource(routeId, sourceType = 'song-list') {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.sources)) route.sources = [];
	if (sourceType === 'batch-user-list') {
		const src = deepClone(BATCH_USER_LIST_DEFAULT_SETTINGS);
		src.sourceType = 'batch-user-list';
		route.sources.push(src);
		return;
	}
	const src = deepClone(SONG_LIST_DEFAULT_SETTINGS);
	src.sourceType = 'song-list';
	route.sources.push(src);
}

function removeSource(routeId, sourceIndex) {
	const route = routes.find((r) => r.id === routeId);
	if (!route || !Array.isArray(route.sources)) return;
	if (route.sources.length <= 1) return;
	route.sources.splice(sourceIndex, 1);
}

function updateSourceAt(routeId, sourceIndex, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.sources) || route.sources.length === 0) {
		const fallback = deepClone(SONG_LIST_DEFAULT_SETTINGS);
		fallback.sourceType = 'song-list';
		route.sources = [fallback];
	}
	if (sourceIndex < 0 || sourceIndex >= route.sources.length) return;
	route.sources[sourceIndex] = settings;
}

function addNegativeSource(routeId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.negativeSources)) route.negativeSources = [];
	const src = deepClone(NEGATIVE_SONG_LIST_DEFAULT_SETTINGS);
	src.sourceType = 'negative-song-list';
	route.negativeSources.push(src);
}

function removeNegativeSource(routeId, sourceIndex) {
	const route = routes.find((r) => r.id === routeId);
	if (!route || !Array.isArray(route.negativeSources)) return;
	if (sourceIndex < 0 || sourceIndex >= route.negativeSources.length) return;
	route.negativeSources.splice(sourceIndex, 1);
}

function updateNegativeSourceAt(routeId, sourceIndex, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	if (!Array.isArray(route.negativeSources)) route.negativeSources = [];
	if (sourceIndex < 0 || sourceIndex >= route.negativeSources.length) return;
	route.negativeSources[sourceIndex] = settings;
}

// ── Filter operations ───────────────────────────────────────────────

function addFilter(routeId, filterId, atIndex = -1) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = createFilterEntry(filterId);
	if (!entry) return;
	if (atIndex >= 0 && atIndex <= route.filters.length) {
		route.filters.splice(atIndex, 0, entry);
	} else {
		route.filters.push(entry);
	}
	return entry.id;
}

function removeFilter(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const idx = route.filters.findIndex((f) => f.id === filterEntryId);
	if (idx !== -1) route.filters.splice(idx, 1);
}

function moveFilter(routeId, filterEntryId, toIndex) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const idx = route.filters.findIndex((f) => f.id === filterEntryId);
	if (idx === -1) return;
	const [entry] = route.filters.splice(idx, 1);
	route.filters.splice(Math.min(toIndex, route.filters.length), 0, entry);
}

function updateFilterSettings(routeId, filterEntryId, newSettings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.settings = newSettings;
}

function toggleFilter(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.enabled = !entry.enabled;
}

// ── Sub-node operations ─────────────────────────────────────────────

function addSourceSelector(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.sourceSelector = deepClone(SOURCE_SELECTOR_DEFAULT_SETTINGS);
}

function removeSourceSelector(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.sourceSelector = null;
}

function updateSourceSelector(routeId, filterEntryId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.sourceSelector = settings;
}

function addSelectionModifier(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.selectionModifier = deepClone(SELECTION_MODIFIER_DEFAULT_SETTINGS);
}

function removeSelectionModifier(routeId, filterEntryId) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.selectionModifier = null;
}

function updateSelectionModifier(routeId, filterEntryId, settings) {
	const route = routes.find((r) => r.id === routeId);
	if (!route) return;
	const entry = route.filters.find((f) => f.id === filterEntryId);
	if (entry) entry.selectionModifier = settings;
}

// ── Expand/collapse ─────────────────────────────────────────────────

function setExpandedFilter(id) {
	expandedFilterId = expandedFilterId === id ? null : id;
}

function collapseAll() {
	expandedFilterId = null;
}

// ── Drag state ──────────────────────────────────────────────────────

function startDrag(filterId, sourceRouteId = null) {
	dragState = { active: true, filterId, sourceRouteId };
}

function endDrag() {
	dragState = { active: false, filterId: null, sourceRouteId: null };
}

// ── Helper: get filter display text ─────────────────────────────────

function getFilterDisplayText(filterId, settings, context = {}) {
	try {
		return FilterRegistry.getDisplayString(filterId, settings, context) || 'Configured';
	} catch {
		return 'Configured';
	}
}

function getFilterMeta(filterId) {
	const f = FilterRegistry.get(filterId);
	if (!f) return { title: filterId, icon: '🎯', color: '#6366f1', formType: 'complex' };
	return {
		title: f.metadata.title,
		icon: f.metadata.icon,
		color: f.metadata.color,
		description: f.metadata.description,
		formType: f.formType
	};
}

// ── Snapshot / restore ──────────────────────────────────────────────

function getRoutesSnapshot() {
	return JSON.parse(JSON.stringify(routes));
}

function setRoutes(newRoutes) {
	routes.length = 0;
	for (const r of newRoutes) {
		routes.push(r);
	}
}

function getCurrentQuizInfo() {
	return {
		id: currentQuizId,
		shareToken: currentShareToken,
		name: currentQuizName,
		description: currentQuizDescription,
		isPublic: currentIsPublic,
		allowRemixing: currentAllowRemixing,
		ownerUserId: currentOwnerUserId
	};
}

function setCurrentQuizInfo({ id, shareToken, name, description, isPublic, allowRemixing, ownerUserId }) {
	if (id !== undefined) currentQuizId = id;
	if (shareToken !== undefined) currentShareToken = shareToken;
	if (name !== undefined) currentQuizName = name;
	if (description !== undefined) currentQuizDescription = description;
	if (isPublic !== undefined) currentIsPublic = isPublic;
	if (allowRemixing !== undefined) currentAllowRemixing = allowRemixing;
	if (ownerUserId !== undefined) currentOwnerUserId = ownerUserId;
}

function resetEditor() {
	routes.length = 0;
	routes.push(createDefaultRoute({ name: 'Route 1', percentage: 100 }));
	currentQuizId = null;
	currentShareToken = null;
	currentQuizName = '';
	currentQuizDescription = '';
	currentIsPublic = false;
	currentAllowRemixing = false;
	currentOwnerUserId = null;
	expandedFilterId = null;
}

// ── Export ───────────────────────────────────────────────────────────

function getExpandedFilterId() {
	return expandedFilterId;
}

function getDragState() {
	return dragState;
}

function setRouteFilters(routeId, newFilters) {
	const route = routes.find((r) => r.id === routeId);
	if (route) route.filters = newFilters;
}

export {
	routes,
	getTotalPercentage,
	getFilterCatalog,
	getExpandedFilterId,
	getDragState,
	addRoute,
	removeRoute,
	updateRoutePercentage,
	updateRouteName,
	toggleRoute,
	updateBasicSettings,
	updateNumberOfSongs,
	updateSource,
	toggleNegativeSource,
	updateNegativeSource,
	addSource,
	removeSource,
	updateSourceAt,
	addNegativeSource,
	removeNegativeSource,
	updateNegativeSourceAt,
	addFilter,
	removeFilter,
	moveFilter,
	updateFilterSettings,
	toggleFilter,
	addSourceSelector,
	removeSourceSelector,
	updateSourceSelector,
	addSelectionModifier,
	removeSelectionModifier,
	updateSelectionModifier,
	setExpandedFilter,
	collapseAll,
	startDrag,
	endDrag,
	getFilterDisplayText,
	getFilterMeta,
	createFilterEntry,
	setRouteFilters,
	getRoutesSnapshot,
	setRoutes,
	getCurrentQuizInfo,
	setCurrentQuizInfo,
	resetEditor
};
