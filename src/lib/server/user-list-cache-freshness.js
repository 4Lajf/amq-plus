/**
 * Freshness rules for `user_list_cache`.
 *
 * The cache is global (platform + username + status) with a 24h TTL. Expired
 * rows are deliberately still read - they are the fallback when MAL/AnisongDB
 * is down and the alternative is handing the caller an empty pool - but they
 * are NOT cache hits. Treating them as hits (which is what happened when the
 * `expires_at` filter was simply dropped) means `uncached` is always empty, no
 * refresh is ever attempted, and a user who adds anime to their list never sees
 * it again.
 *
 * @module lib/server/user-list-cache-freshness
 */

/**
 * @typedef {Object} CacheRow
 * @property {string} status
 * @property {string} expires_at
 * @property {string} [created_at]
 */

/**
 * Split cache rows into fresh hits and expired fallbacks.
 *
 * @param {Array<CacheRow>|null|undefined} rows - Rows for one platform/username
 * @param {string[]} requestedStatuses - Statuses the caller asked for (DB format)
 * @param {number} [now] - Current epoch ms (injectable for tests)
 * @returns {{ fresh: Object<string, CacheRow>, stale: Object<string, CacheRow>, uncached: string[] }}
 */
export function partitionCacheEntries(rows, requestedStatuses, now = Date.now()) {
	/** @type {Object<string, CacheRow>} */
	const fresh = {};
	/** @type {Object<string, CacheRow>} */
	const stale = {};

	for (const entry of rows || []) {
		if (!requestedStatuses.includes(entry.status)) continue;

		const expiresAt = entry.expires_at ? new Date(entry.expires_at).getTime() : NaN;
		const isFresh = Number.isFinite(expiresAt) && expiresAt > now;
		const bucket = isFresh ? fresh : stale;
		const existing = bucket[entry.status];

		// Duplicates are possible (the cache is global); keep the newest write.
		if (!existing || newerThan(entry, existing)) {
			bucket[entry.status] = entry;
		}
	}

	return { fresh, stale, uncached: requestedStatuses.filter((status) => !fresh[status]) };
}

/**
 * @param {CacheRow} candidate
 * @param {CacheRow} incumbent
 * @returns {boolean}
 */
function newerThan(candidate, incumbent) {
	const a = new Date(candidate.created_at || candidate.expires_at || 0).getTime();
	const b = new Date(incumbent.created_at || incumbent.expires_at || 0).getTime();
	return a > b;
}

/**
 * Move expired entries into the served set after a failed refresh.
 * Mutates `cachedStatuses`.
 *
 * @param {Object<string, CacheRow>} cachedStatuses - Statuses being served
 * @param {Object<string, CacheRow>} staleStatuses - Expired rows available as fallback
 * @param {string[]} uncachedStatuses - Statuses the refresh was supposed to cover
 * @returns {{ promoted: string[], stillMissing: string[] }}
 */
export function promoteStaleEntries(cachedStatuses, staleStatuses, uncachedStatuses) {
	const promoted = [];
	const stillMissing = [];

	for (const status of uncachedStatuses) {
		if (staleStatuses[status]) {
			cachedStatuses[status] = staleStatuses[status];
			promoted.push(status);
		} else {
			stillMissing.push(status);
		}
	}

	return { promoted, stillMissing };
}
