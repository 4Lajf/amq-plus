/**
 * V2 Routes simulation -- resolves all ranges/percentages to static values.
 * Replaces the old simulateQuizConfiguration(nodes, edges) pipeline.
 *
 * @module simulation
 */

import { makeRng, randomInt, allocateToTotal, generateRandomSeed } from '$lib/utils/mathUtils.js';
import { extractBasicSettingsDisplay, extractNumberOfSongsDisplay } from '$lib/utils/displayUtils.js';
import { getDefaultSettingsForNodeType } from '$lib/utils/defaultNodeSettings.js';
import '$lib/filters/index.js';
import { FilterRegistry } from '$lib/filters/FilterRegistry.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveDisplayValueToStatic(dv, rng) {
	if (!dv) return 0;
	if (dv.kind === 'static') return dv.value;
	if (dv.kind === 'range') return randomInt(rng, dv.min, dv.max);
	if (dv.kind === 'random' && Array.isArray(dv.values))
		return dv.values[randomInt(rng, 0, dv.values.length - 1)];
	return 0;
}

function resolveSongPercentage(sp, rng) {
	if (sp == null) return null;
	if (typeof sp === 'object' && sp !== null) {
		if (sp.random) return randomInt(rng, sp.min ?? 0, sp.max ?? 100);
		return sp.value ?? null;
	}
	return null;
}

/* ------------------------------------------------------------------ */
/*  Route selection                                                    */
/* ------------------------------------------------------------------ */

function selectRoute(routes, rng) {
	const eligible = routes.filter((r) => r.enabled && r.percentage > 0);
	if (eligible.length === 0) return null;

	const total = eligible.reduce((s, r) => s + r.percentage, 0);
	if (total <= 0) return null;

	const roll = rng() * total;
	let acc = 0;
	for (const r of eligible) {
		acc += r.percentage;
		if (roll <= acc) return r;
	}
	return eligible[eligible.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Basic settings resolution                                          */
/* ------------------------------------------------------------------ */

function resolveBasicSettings(value, rng) {
	const dv = extractBasicSettingsDisplay(value);
	return {
		guessTime: dv.guessTime.kind === 'range' ? dv.guessTime : resolveDisplayValueToStatic(dv.guessTime, rng),
		extraGuessTime: dv.extraGuessTime.kind === 'range' ? dv.extraGuessTime : resolveDisplayValueToStatic(dv.extraGuessTime, rng),
		samplePoint: dv.samplePoint,
		playbackSpeed:
			dv.playbackSpeed.kind === 'random'
				? dv.playbackSpeed.values[randomInt(rng, 0, dv.playbackSpeed.values.length - 1)]
				: dv.playbackSpeed.value,
		preventSameSongSpam: dv.preventSameSongSpam,
		duplicateShows: dv.duplicateShows
	};
}

/* ------------------------------------------------------------------ */
/*  Execution chance                                                   */
/* ------------------------------------------------------------------ */

function checkExecutionChance(ec, rng) {
	if (ec == null) return true;
	let chance;
	if (typeof ec === 'object' && ec.kind === 'range') {
		chance = randomInt(rng, Number(ec.min) || 0, Number(ec.max) || 100);
	} else {
		chance = Number(ec) || 100;
	}
	return rng() * 100 <= chance;
}

/* ------------------------------------------------------------------ */
/*  Filter conflict resolution (same logic as v1 simulation)           */
/* ------------------------------------------------------------------ */

const CONFLICT_RESOLUTION_STRATEGIES = {
	MERGE_ADDITIVE: 'merge_additive',
	MERGE_EXCLUSIVE: 'merge_exclusive',
	MERGE_MAXIMUM: 'merge_maximum',
	MERGE_MINIMUM: 'merge_minimum',
	MERGE_AVERAGE: 'merge_average',
	MERGE_FIRST: 'merge_first',
	MERGE_LAST: 'merge_last',
	MERGE_RANDOM: 'merge_random',
	MERGE_GENRES_TAGS: 'merge_genres_tags',
	MERGE_SONG_CATEGORIES: 'merge_song_categories',
	MERGE_SCORE_RANGE: 'merge_score_range',
	MERGE_SONG_DIFFICULTY: 'merge_song_difficulty',
	MERGE_VINTAGE: 'merge_vintage',
	MERGE_ANIME_TYPE: 'merge_anime_type',
	MERGE_SONGS_AND_TYPES: 'merge_songs_and_types'
};

const CONFLICT_RESOLUTION_CONFIG = {
	'songs-and-types': {
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		total: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		'types.openings': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'types.endings': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'types.inserts': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'songSelection.random': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES,
		'songSelection.watched': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONGS_AND_TYPES
	},
	vintage: {
		ranges: CONFLICT_RESOLUTION_STRATEGIES.MERGE_VINTAGE,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	},
	'song-difficulty': {
		easy: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		medium: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		hard: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		ranges: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		viewMode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		total: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.easy': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.medium': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY,
		'difficulties.hard': CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_DIFFICULTY
	},
	'player-score': {
		min: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		max: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		disallowed: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		percentages: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE
	},
	'anime-score': {
		min: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		max: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		disallowed: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE,
		percentages: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SCORE_RANGE
	},
	'anime-type': {
		tv: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		movie: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		ova: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		ona: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		special: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		viewMode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		advanced: CONFLICT_RESOLUTION_STRATEGIES.MERGE_ANIME_TYPE
	},
	'song-categories': {
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST,
		enabled: CONFLICT_RESOLUTION_STRATEGIES.MERGE_SONG_CATEGORIES
	},
	genres: {
		included: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		excluded: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		optional: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	},
	tags: {
		included: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		excluded: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		optional: CONFLICT_RESOLUTION_STRATEGIES.MERGE_GENRES_TAGS,
		mode: CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST
	}
};

function getNestedValue(obj, path) {
	return path.split('.').reduce((cur, key) => cur?.[key], obj);
}

function setNestedValue(obj, path, value) {
	const keys = path.split('.');
	const last = keys.pop();
	const target = keys.reduce((cur, key) => {
		if (!cur[key]) cur[key] = {};
		return cur[key];
	}, obj);
	target[last] = value;
}

function getFieldStrategy(fieldPath, config) {
	if (config[fieldPath]) return config[fieldPath];
	const parts = fieldPath.split('.');
	for (let i = 1; i <= parts.length; i++) {
		const partial = parts.slice(0, i).join('.');
		if (config[partial]) return config[partial];
	}
	if (fieldPath.includes('min')) return CONFLICT_RESOLUTION_STRATEGIES.MERGE_MAXIMUM;
	if (fieldPath.includes('max')) return CONFLICT_RESOLUTION_STRATEGIES.MERGE_MINIMUM;
	if (fieldPath.includes('disallowed') || fieldPath.includes('included') ||
		fieldPath.includes('excluded') || fieldPath.includes('optional'))
		return CONFLICT_RESOLUTION_STRATEGIES.MERGE_ADDITIVE;
	return CONFLICT_RESOLUTION_STRATEGIES.MERGE_FIRST;
}

function applyStrategy(strategy, values, fieldPath, rng) {
	const S = CONFLICT_RESOLUTION_STRATEGIES;
	switch (strategy) {
		case S.MERGE_ADDITIVE: {
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'number') {
				const sum = values.reduce((a, b) => a + b, 0);
				return clampPercent(sum, fieldPath);
			}
			if (typeof values[0] === 'object' && values[0] !== null) {
				const merged = {};
				for (const obj of values) {
					for (const key of Object.keys(obj)) {
						if (typeof obj[key] === 'number')
							merged[key] = clampPercent((merged[key] || 0) + obj[key], `${fieldPath}.${key}`);
						else if (Array.isArray(obj[key]))
							merged[key] = [...new Set([...(merged[key] || []), ...obj[key]])];
						else merged[key] = obj[key];
					}
				}
				return merged;
			}
			return values[0];
		}
		case S.MERGE_EXCLUSIVE:
		case S.MERGE_RANDOM:
			return values[randomInt(rng, 0, values.length - 1)];
		case S.MERGE_MAXIMUM: return Math.max(...values);
		case S.MERGE_MINIMUM: return Math.min(...values);
		case S.MERGE_AVERAGE: return values.reduce((a, b) => a + b, 0) / values.length;
		case S.MERGE_FIRST: return values[0];
		case S.MERGE_LAST: return values[values.length - 1];
		case S.MERGE_GENRES_TAGS:
			return Array.isArray(values[0]) ? [...new Set(values.flat())] : values[0];
		case S.MERGE_SONG_CATEGORIES:
			if (typeof values[0] === 'boolean') return values.some(Boolean);
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'number') return values.reduce((a, b) => a + b, 0);
			return values[0];
		case S.MERGE_SCORE_RANGE:
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'number') return values[0];
			if (typeof values[0] === 'object' && values[0] !== null) {
				const m = {};
				for (const obj of values) for (const k of Object.keys(obj)) {
					if (typeof obj[k] === 'number') m[k] = (m[k] || 0) + obj[k];
					else if (Array.isArray(obj[k])) m[k] = [...new Set([...(m[k] || []), ...obj[k]])];
					else m[k] = obj[k];
				}
				return m;
			}
			return values[0];
		case S.MERGE_SONG_DIFFICULTY:
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'number') return values.reduce((a, b) => a + b, 0);
			if (typeof values[0] === 'boolean') return values.some(Boolean);
			if (typeof values[0] === 'string') return values[0];
			if (typeof values[0] === 'object' && values[0] !== null) {
				const m = {};
				for (const obj of values) for (const k of Object.keys(obj)) {
					if (typeof obj[k] === 'number') m[k] = (m[k] || 0) + obj[k];
					else if (typeof obj[k] === 'boolean') m[k] = m[k] || obj[k];
					else m[k] = obj[k];
				}
				return m;
			}
			return values[0];
		case S.MERGE_VINTAGE:
			return fieldPath === 'ranges' ? values.flat() : values[0];
		case S.MERGE_ANIME_TYPE:
			if (['tv', 'movie', 'ova', 'ona', 'special', 'rebroadcast', 'dubbed'].includes(fieldPath))
				return values.some(Boolean);
			if (fieldPath === 'advanced') {
				const m = {};
				for (const obj of values) {
					if (obj && typeof obj === 'object') {
						for (const k of Object.keys(obj)) {
							if (typeof obj[k] === 'object' && obj[k] !== null) {
								if (!m[k]) m[k] = {};
								for (const nk of Object.keys(obj[k])) {
									if (typeof obj[k][nk] === 'boolean') m[k][nk] = m[k][nk] || obj[k][nk];
									else if (typeof obj[k][nk] === 'number') m[k][nk] = (m[k][nk] || 0) + obj[k][nk];
									else m[k][nk] = obj[k][nk];
								}
							} else if (typeof obj[k] === 'boolean') m[k] = m[k] || obj[k];
							else if (typeof obj[k] === 'number') m[k] = (m[k] || 0) + obj[k];
							else m[k] = obj[k];
						}
					}
				}
				return m;
			}
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'number') return values.reduce((a, b) => a + b, 0);
			if (typeof values[0] === 'boolean') return values.some(Boolean);
			return values[0];
		case S.MERGE_SONGS_AND_TYPES:
			if (typeof values[0] === 'number') return values.reduce((a, b) => a + b, 0);
			if (Array.isArray(values[0])) return [...new Set(values.flat())];
			if (typeof values[0] === 'boolean') return values.some(Boolean);
			return values[0];
		default: return values[0];
	}
}

function clampPercent(val, fieldPath) {
	const pct = fieldPath.includes('percentage') || fieldPath.includes('songSelection') ||
		fieldPath.includes('types') || fieldPath.includes('easy') ||
		fieldPath.includes('medium') || fieldPath.includes('hard');
	if (pct) return Math.max(0, Math.min(100, val));
	return val;
}

/**
 * Resolve conflicts when multiple filter entries of the same type exist.
 * Each entry in `entries` has { data: { id, currentValue }, settings }.
 */
function resolveConflicts(entries, rng, inheritedSongCount = 20) {
	if (entries.length === 0) return {};
	if (entries.length === 1) return entries[0].settings || {};

	const defId = entries[0].data.id;
	const config = CONFLICT_RESOLUTION_CONFIG[defId] || {};

	const resolved = {};
	const allFields = new Set();
	for (const e of entries) {
		if (e.settings) flattenKeys(e.settings, '', allFields);
	}

	for (const fp of allFields) {
		const strategy = getFieldStrategy(fp, config);
		const vals = entries.map((e) => getNestedValue(e.settings, fp)).filter((v) => v !== undefined);
		if (vals.length === 0) continue;
		setNestedValue(resolved, fp, applyStrategy(strategy, vals, fp, rng));
	}

	return resolved;
}

function flattenKeys(obj, prefix, set) {
	for (const k of Object.keys(obj)) {
		const full = prefix ? `${prefix}.${k}` : k;
		if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k]))
			flattenKeys(obj[k], full, set);
		else set.add(full);
	}
}

/* ------------------------------------------------------------------ */
/*  Filter resolution                                                  */
/* ------------------------------------------------------------------ */

function resolveFilterSettings(filterEntry, inheritedSongCount, rng) {
	const filter = FilterRegistry.get(filterEntry.filterId);
	if (filter && filter.resolve) {
		const syntheticNode = {
			data: {
				id: filterEntry.filterId,
				instanceId: filterEntry.id,
				currentValue: filterEntry.settings,
				title: filter.metadata?.title || filterEntry.filterId,
				executionChance: filterEntry.executionChance
			}
		};
		return filter.resolve(syntheticNode, { inheritedSongCount }, rng);
	}
	return filterEntry.settings;
}

/* ------------------------------------------------------------------ */
/*  Source mapping                                                     */
/* ------------------------------------------------------------------ */

function mapSource(src, idx, rng) {
	const type = src.sourceType || 'song-list';

	if (type === 'batch-user-list' || type === 'live-node') {
		const nodeLevelPct = resolveSongPercentage(src.songPercentage, rng);
		const raw = src.userEntries || [];
		const hasPerUser = raw.some((e) => e.songPercentage != null);

		let userEntries;
		if (hasPerUser) {
			const alloc = raw
				.map((e, i) => {
					if (!e.songPercentage) return null;
					return e.songPercentage.random
						? { label: `user-${i}`, kind: 'range', min: e.songPercentage.min ?? 0, max: e.songPercentage.max ?? 100 }
						: { label: `user-${i}`, kind: 'static', value: e.songPercentage.value ?? 0 };
				})
				.filter(Boolean);
			const map = allocateToTotal(alloc, 100, rng);
			userEntries = raw.map((e, i) => {
				const v = map.get(`user-${i}`);
				return v !== undefined && e.songPercentage ? { ...e, songPercentage: v } : e;
			});
		} else {
			userEntries = raw;
		}

		return {
			nodeId: `source-${idx}`,
			nodeType: type,
			mode: 'user-lists',
			useEntirePool: src.useEntirePool || false,
			songPercentage: nodeLevelPct,
			songSelectionMode: src.songSelectionMode || 'default',
			userEntries,
			userListImport: {
				platform: 'anilist',
				username: '',
				selectedLists: { completed: true, watching: true, planning: false, on_hold: false, dropped: false }
			}
		};
	}

	return {
		nodeId: `source-${idx}`,
		nodeType: 'song-list',
		mode: src.mode || 'masterlist',
		useEntirePool: src.useEntirePool || false,
		songPercentage: resolveSongPercentage(src.songPercentage, rng),
		userListImport: src.mode === 'user-lists' ? {
			platform: src.userListImport?.platform || 'anilist',
			username: src.userListImport?.username || '',
			selectedLists: src.userListImport?.selectedLists || { completed: true, watching: true, planning: false, on_hold: false, dropped: false }
		} : undefined,
		selectedListId: src.mode === 'saved-lists' ? src.selectedListId || null : undefined,
		selectedListName: src.mode === 'saved-lists' ? src.selectedListName || null : undefined
	};
}

function mapNegativeSource(src, idx) {
	return {
		nodeId: `neg-source-${idx}`,
		nodeType: 'negative-song-list',
		mode: src.mode || 'masterlist',
		useEntirePool: false,
		songPercentage: null,
		userListImport: src.mode === 'user-lists' ? {
			platform: src.userListImport?.platform || 'anilist',
			username: src.userListImport?.username || '',
			selectedLists: src.userListImport?.selectedLists || { completed: true, watching: true, planning: false, on_hold: false, dropped: false }
		} : undefined,
		selectedListId: src.mode === 'saved-lists' ? src.selectedListId || null : undefined,
		selectedListName: src.mode === 'saved-lists' ? src.selectedListName || null : undefined
	};
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Simulate a quiz from v2 routes format.
 * Output shape is identical to the old simulateQuizConfiguration().
 *
 * @param {Array} routes - Array of route objects from configuration_data.routes
 * @param {string|null} [providedSeed] - Optional seed for reproducible results
 * @returns {Object} Fully resolved simulation result with static values
 */
export function simulateQuizFromRoutes(routes, providedSeed = null) {
	const seed = providedSeed || generateRandomSeed();
	const rng = makeRng(seed);

	const result = {
		timestamp: new Date().toISOString(),
		seed,
		router: null,
		basicSettings: null,
		numberOfSongs: null,
		filters: [],
		songLists: [],
		negativeSongLists: []
	};

	if (!routes || routes.length === 0) return result;

	// 1. Route selection
	const chosen = routes.length === 1 ? routes[0] : selectRoute(routes, rng);
	if (!chosen) return result;

	result.router = {
		selectedRoute: chosen.name || 'Unknown',
		selectedRouteId: chosen.id || null
	};

	// 2. Basic settings
	if (chosen.basicSettings) {
		result.basicSettings = resolveBasicSettings(chosen.basicSettings, rng);
	}

	// 3. Number of songs
	if (chosen.numberOfSongs) {
		const dv = extractNumberOfSongsDisplay(chosen.numberOfSongs);
		result.numberOfSongs = resolveDisplayValueToStatic(dv, rng);
	}

	const inheritedSongCount = result.numberOfSongs || 20;

	// 4. Filters
	const enabledFilters = (chosen.filters || []).filter((f) => f.enabled !== false);

	// Check execution chances
	const passedFilters = enabledFilters.filter((f) => checkExecutionChance(f.executionChance, rng));

	// Apply selection modifiers: group by filterId + sourceSelector combo
	const groups = new Map();
	for (const f of passedFilters) {
		const srcIds = f.sourceSelector?.targetSourceId ? [f.sourceSelector.targetSourceId] : [];
		const key = `${f.filterId}|||${srcIds.length > 0 ? srcIds.sort().join('+') : 'all-sources'}`;
		if (!groups.has(key)) groups.set(key, { filterId: f.filterId, targetSourceIds: srcIds, entries: [] });
		groups.get(key).entries.push(f);
	}

	// Apply selection modifier within each group
	for (const [, group] of groups) {
		let entries = group.entries;

		// Check if any entry has a selectionModifier
		const withModifier = entries.filter((e) => e.selectionModifier?.maxSelection != null);
		if (withModifier.length > 0 && entries.length > 1) {
			const max = withModifier[0].selectionModifier.maxSelection;
			if (entries.length > max) {
				const shuffled = [...entries].sort(() => rng() - 0.5);
				entries = shuffled.slice(0, max);
			}
		}

		// Resolve each filter entry
		const resolvedEntries = [];
		for (const entry of entries) {
			try {
				const settings = resolveFilterSettings(entry, inheritedSongCount, rng);
				resolvedEntries.push({
					data: { id: entry.filterId, instanceId: entry.id, currentValue: entry.settings },
					settings
				});
			} catch (err) {
				console.error(`[SIMULATION] Error resolving filter ${entry.filterId}:`, err);
			}
		}

		if (resolvedEntries.length === 0) continue;

		let resolvedFilter;
		if (resolvedEntries.length === 1) {
			resolvedFilter = {
				definitionId: group.filterId,
				instanceId: resolvedEntries[0].data.instanceId,
				settings: resolvedEntries[0].settings
			};
		} else {
			const merged = resolveConflicts(resolvedEntries, rng, inheritedSongCount);
			resolvedFilter = {
				definitionId: group.filterId,
				instanceId: `merged-${group.filterId}-${Date.now()}`,
				settings: merged,
				isMerged: true,
				sourceNodes: resolvedEntries.map((e) => e.data.instanceId)
			};
		}

		if (group.targetSourceIds.length === 1) {
			resolvedFilter.targetSourceId = group.targetSourceIds[0];
		} else if (group.targetSourceIds.length > 1) {
			resolvedFilter.targetSourceIds = group.targetSourceIds;
		}

		result.filters.push(resolvedFilter);
	}

	// 5. Add default settings for missing filter types
	const presentTypes = new Set(result.filters.map((f) => f.definitionId));
	const allConfiguredTypes = new Set(enabledFilters.map((f) => f.filterId));
	const missingTypes = [...allConfiguredTypes].filter((t) => !presentTypes.has(t));

	for (const filterType of missingTypes) {
		const defaults = getDefaultSettingsForNodeType(filterType);
		result.filters.push({
			definitionId: filterType,
			instanceId: `default-${filterType}-${Date.now()}`,
			isDefault: true,
			...(defaults ? { settings: defaults } : {})
		});
	}

	// 6. Sources
	result.songLists = (chosen.sources || []).map((s, i) => mapSource(s, i, rng));

	// 7. Negative sources
	result.negativeSongLists = (chosen.negativeSources || []).map((s, i) => mapNegativeSource(s, i));

	return result;
}
