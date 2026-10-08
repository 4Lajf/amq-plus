/**
 * Season Autocomplete API endpoint
 *
 * Accepts the AMQ original autocomplete list, season mode, and the quiz's
 * annSongIds.  Returns the filtered autocomplete list plus pre-computed
 * resolution maps so the client can resolve answers instantly without
 * any further server calls.
 *
 * POST: Host builds the full result (with annSongIds). Result is cached
 *        under a random token so non-host players can retrieve it via GET.
 * GET:  Non-hosts fetch the cached result using ?token=<token>.
 *
 * @module api/season-autocomplete
 */

import { json, error } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import {
	loadFranchiseData,
	buildAmqNameMaps,
	buildAutocompleteList,
	buildSongResolveMap,
	buildTitleLookup,
} from '$lib/server/franchise-data.js';

// In-memory cache: token -> { data, timestamp }
const seasonCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupCache() {
	const now = Date.now();
	for (const [key, entry] of seasonCache) {
		if (now - entry.timestamp > CACHE_TTL_MS) {
			seasonCache.delete(key);
		}
	}
}

/**
 * GET /api/season-autocomplete?token=<token>
 *
 * Non-host players use this to retrieve the cached season data
 * that the host's POST created.
 */
export async function GET({ url }) {
	try {
		const token = url.searchParams.get('token');
		if (!token) {
			return error(400, { message: 'Missing token parameter.' });
		}

		const entry = seasonCache.get(token);
		if (!entry) {
			return error(404, { message: 'Token not found or expired.' });
		}

		console.log(`[API: Season Autocomplete] GET token=${token}, age=${Math.round((Date.now() - entry.timestamp) / 1000)}s`);
		return json(entry.data);
	} catch (err) {
		console.error('[API: Season Autocomplete] GET Error:', err);
		return json(
			{ success: false, message: 'Internal server error: ' + err.message },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/season-autocomplete
 *
 * Body: {
 *   mode: 'split' | 'merge',
 *   originalList: string[],
 *   annSongIds?: number[]          // from quizSave blocks
 * }
 *
 * Response: {
 *   token?: string,                              // cache token for non-hosts
 *   autocompleteList: string[],
 *   memberIdToAmqName: Record<string, string>,
 *   annIdToAmqName: Record<string, string>,
 *   songResolveMap?: Record<number, {amqName,mid,cid,sid}>,
 *   titleLookup?: Record<string, {mid,cid,sid}>
 * }
 */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { mode, originalList, annSongIds } = body;

		if (!mode || !['split', 'merge'].includes(mode)) {
			return error(400, { message: 'Invalid mode. Must be "split" or "merge".' });
		}
		if (!originalList || !Array.isArray(originalList) || originalList.length === 0) {
			return error(400, { message: 'originalList must be a non-empty array of strings.' });
		}

		loadFranchiseData();

		const maps = buildAmqNameMaps(originalList);
		const autocompleteList = buildAutocompleteList(mode, originalList, maps);

		// Serialize Maps to plain objects for JSON transport
		const memberIdObj = {};
		maps.memberIdToAmqName.forEach((v, k) => { memberIdObj[k] = v; });

		const annIdObj = {};
		maps.annIdToAmqName.forEach((v, k) => { annIdObj[k] = v; });

		const result = {
			autocompleteList,
			memberIdToAmqName: memberIdObj,
			annIdToAmqName: annIdObj,
		};

		// Always build titleLookup (needed by all players for answer resolution)
		result.titleLookup = buildTitleLookup(autocompleteList, maps);

		// Pre-compute songResolveMap when annSongIds are provided (host has these)
		if (Array.isArray(annSongIds) && annSongIds.length > 0) {
			result.songResolveMap = buildSongResolveMap(annSongIds, maps);
			// Include ordered annSongIds so non-hosts can map songNumber → annSongId
			result.songOrder = annSongIds;

			// Cache the full result so non-hosts can retrieve it by token
			const token = randomUUID();
			cleanupCache();
			seasonCache.set(token, { data: result, timestamp: Date.now() });
			result.token = token;

			console.log(
				`[API: Season Autocomplete] mode=${mode}, original=${originalList.length}, ` +
				`filtered=${autocompleteList.length}, songs=${annSongIds.length}, ` +
				`songResolveMap=${Object.keys(result.songResolveMap).length}, ` +
				`titleLookup=${Object.keys(result.titleLookup).length}, ` +
				`token=${token}`
			);
		} else {
			console.log(
				`[API: Season Autocomplete] mode=${mode}, original=${originalList.length}, ` +
				`filtered=${autocompleteList.length}, titleLookup=${Object.keys(result.titleLookup).length} ` +
				`(no annSongIds provided, skipping songResolveMap + cache)`
			);
		}

		return json(result);
	} catch (err) {
		console.error('[API: Season Autocomplete] Error:', err);
		return json(
			{ success: false, message: 'Internal server error: ' + err.message },
			{ status: 500 }
		);
	}
}
