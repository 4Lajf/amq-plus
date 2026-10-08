/**
 * Season Answer Resolution API endpoint
 *
 * Determines whether a user's answer in Season Split / Season Merge mode
 * should be resolved to a different string, marked wrong, or passed through.
 *
 * The client sends the AMQ name-resolution maps (obtained once per game from
 * /api/season-autocomplete) so this endpoint doesn't need to rebuild them.
 *
 * @module api/season-resolve
 */

import { json, error } from '@sveltejs/kit';
import {
	loadFranchiseData,
	buildAmqNameMaps,
	resolveAnswer,
} from '$lib/server/franchise-data.js';

/**
 * POST /api/season-resolve
 *
 * Body: {
 *   mode: 'split' | 'merge',
 *   userAnswer: string,
 *   annSongId: number,
 *   originalList: string[]
 * }
 *
 * Response: {
 *   resolvedAnswer: string,
 *   action: 'resolve' | 'wrong' | 'passthrough',
 *   reason: string
 * }
 */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const { mode, userAnswer, annSongId, originalList } = body;

		if (!mode || !['split', 'merge'].includes(mode)) {
			return error(400, { message: 'Invalid mode. Must be "split" or "merge".' });
		}
		if (typeof userAnswer !== 'string' || !userAnswer) {
			return error(400, { message: 'userAnswer must be a non-empty string.' });
		}
		if (typeof annSongId !== 'number') {
			return error(400, { message: 'annSongId must be a number.' });
		}
		if (!originalList || !Array.isArray(originalList) || originalList.length === 0) {
			return error(400, { message: 'originalList must be a non-empty array.' });
		}

		loadFranchiseData();
		const maps = buildAmqNameMaps(originalList);
		const result = resolveAnswer(mode, userAnswer, annSongId, maps);

		console.log(
			`[API: Season Resolve] mode=${mode}, answer="${userAnswer}", ` +
			`annSongId=${annSongId}, action=${result.action}, reason="${result.reason}"`
		);

		return json(result);
	} catch (err) {
		console.error('[API: Season Resolve] Error:', err);
		return json(
			{ success: false, message: 'Internal server error: ' + err.message },
			{ status: 500 }
		);
	}
}
