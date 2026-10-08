/**
 * Song lookups by MAL id from the bundled masterlist.
 *
 * The Phase 2.5 `public.songs` Postgres cache was removed — masterlist.json is
 * the only song database the app uses.
 *
 * @module lib/server/songs-db
 */

import { getMasterlist } from './masterlist.js';

/**
 * @param {number[]} malIds
 * @returns {Promise<any[]>}
 */
export async function getSongsByMalIds(malIds) {
	const unique = [...new Set((malIds || []).map(Number).filter(Number.isFinite))];
	if (unique.length === 0) return [];

	const want = new Set(unique);
	const master = await getMasterlist();
	const rows = master.filter((s) => want.has(Number(s.linked_ids?.myanimelist || s.malId)));
	if (rows.length > 0) {
		console.log(`[MASTERLIST] Resolved ${rows.length} songs for ${unique.length} MAL ids`);
	}
	return rows;
}

/** @deprecated Use getSongsByMalIds — masterlist is the only source. */
export const getSongsByMalIdsFromMasterlist = getSongsByMalIds;
