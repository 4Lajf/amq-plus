/**
 * Process-wide cache of resolved training/play song pools.
 *
 * Keyed by quiz id + config stamp + referenced song-list stamps so a repeat
 * Start Training after a cold Pixeldrain fetch is milliseconds instead of tens
 * of seconds. FSRS still runs per user/session — only the shared pool is cached.
 *
 * @module lib/server/training/song-pool-cache
 */

import { createHash } from 'node:crypto';

/**
 * @typedef {Object} PoolCacheEntry
 * @property {any[]} songs
 * @property {number} createdAt
 * @property {number} expiresAt
 */

/** @type {Map<string, PoolCacheEntry>} */
const cache = new Map();

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;

function prune(now = Date.now()) {
	for (const [key, entry] of cache) {
		if (entry.expiresAt <= now) cache.delete(key);
	}
	if (cache.size <= MAX_ENTRIES) return;
	const ordered = [...cache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
	for (const [key] of ordered.slice(0, cache.size - MAX_ENTRIES)) {
		cache.delete(key);
	}
}

/**
 * Stamp the parts of a simulated config that actually determine which songs
 * come back.
 *
 * `simulateQuizFromRoutes` re-rolls on every call: it picks ONE route at random,
 * rolls each filter's executionChance, and applies selection modifiers. Two
 * calls for the same quiz can therefore legitimately produce different pools.
 * Without this in the cache key, the first roll's pool was pinned for the whole
 * TTL and multi-route quizzes stopped rotating.
 *
 * Deliberately excluded:
 * - `basicSettings` (guess time, sample point, playback speed) - presentation
 *   only, does not change which songs match.
 * - `instanceId` - merged/default filters embed `Date.now()`, which would make
 *   every key unique and disable the cache entirely.
 *
 * @param {Object} simulatedConfig - Output of simulateQuizFromRoutes
 * @returns {string} Stable stamp for the resolved song-selection inputs
 */
export function buildResolvedConfigStamp(simulatedConfig) {
	if (!simulatedConfig) return '';

	const filters = (simulatedConfig.filters || [])
		.map((f) => ({
			definitionId: f.definitionId,
			settings: f.settings ?? null,
			targetSourceId: f.targetSourceId ?? null,
			targetSourceIds: f.targetSourceIds ?? null,
			isDefault: f.isDefault === true
		}))
		.sort((a, b) => String(a.definitionId).localeCompare(String(b.definitionId)));

	return JSON.stringify({
		routeId: simulatedConfig.router?.selectedRouteId ?? null,
		filters,
		songLists: simulatedConfig.songLists ?? [],
		negativeSongLists: simulatedConfig.negativeSongLists ?? [],
		songSelection: simulatedConfig.songSelection ?? null
	});
}

/**
 * @param {string} quizId
 * @param {string|number|Date|null|undefined} quizUpdatedAt
 * @param {Array<{ id: string, updated_at?: string|null, songs_list_link?: string|null }>} sourceLists
 * @param {Object} [extra] - Extra dimensions (trainingMode, resolved config stamp, …)
 * @returns {string}
 */
export function buildSongPoolCacheKey(quizId, quizUpdatedAt, sourceLists = [], extra = {}) {
	const listStamp = [...sourceLists]
		.map((l) => `${l.id}:${l.updated_at || ''}:${l.songs_list_link || ''}`)
		.sort()
		.join('|');
	const raw = JSON.stringify({
		quizId,
		quizUpdatedAt: quizUpdatedAt ? String(quizUpdatedAt) : '',
		listStamp,
		extra
	});
	return createHash('sha256').update(raw).digest('hex');
}

/**
 * @param {string} key
 * @returns {any[]|null}
 */
export function getCachedSongPool(key) {
	prune();
	const entry = cache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key);
		return null;
	}
	return entry.songs;
}

/**
 * @param {string} key
 * @param {any[]} songs
 * @param {number} [ttlMs]
 */
export function setCachedSongPool(key, songs, ttlMs = DEFAULT_TTL_MS) {
	prune();
	const now = Date.now();
	cache.set(key, {
		songs,
		createdAt: now,
		expiresAt: now + ttlMs
	});
}

/**
 * Drop every cache entry. Quiz saves call this — source stamps usually change
 * the key anyway, but a full clear keeps behaviour obvious.
 */
export function clearSongPoolCache() {
	cache.clear();
}

/** @returns {void} */
export function resetSongPoolCacheForTests() {
	cache.clear();
}
