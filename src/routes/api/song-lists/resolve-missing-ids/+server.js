/**
 * POST /api/song-lists/resolve-missing-ids
 *
 * W13 — step 1 and 2 of "import songs that lack an annSongId, best-effort".
 *
 * arkanazz, Jul 23: he imported blissfulyoshi's ranked JSON because the provider
 * list mentions it. Most rows have no `annSongId`, so they are stored with
 * `song_ann_id = null` and `sessionStartService` rejects them — they can never
 * be played, and nothing told him.
 *
 * This endpoint **resolves nothing on its own**. It reports what a resolution
 * would do so the UI can ask, which is the approved shape: detect at import,
 * attempt resolution, confirm explicitly, mark provenance.
 *
 * The reason it cannot just do it: name lookup means choosing among candidates,
 * and a song listed under several anime entries can resolve to the wrong one. A
 * wrong annSongId is worse than a skipped song — it silently trains the user on
 * the wrong answer and corrupts that card's history. So ambiguous rows come back
 * as choices, never as decisions.
 *
 * Body: { songs: Array<{songName, songArtist, ...}> }
 */

import { json, error } from '@sveltejs/kit';
import { getMasterlist } from '$lib/server/masterlist.js';
import { resolveSongsByName, matchKey } from '$lib/server/song-name-resolver.js';

const MAX_SONGS = 20000;

// @ts-ignore
export async function POST({ request, locals }) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw error(401, { message: 'Unauthorized' });

	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const { songs } = body ?? {};
	if (!Array.isArray(songs) || songs.length === 0) {
		throw error(400, { message: '`songs` must be a non-empty array' });
	}
	if (songs.length > MAX_SONGS) {
		throw error(400, { message: `Too many songs in one request (max ${MAX_SONGS})` });
	}

	const needsResolution = songs.filter((s) => s?.annSongId == null || s.annSongId === '');

	// Nothing to do — say so plainly rather than making the UI infer it.
	if (needsResolution.length === 0) {
		return json({
			counts: {
				total: songs.length,
				alreadyIdentified: songs.length,
				resolved: 0,
				ambiguous: 0,
				unresolved: 0
			},
			outcomes: [],
			playableWithoutConfirmation: songs.length
		});
	}

	// Candidate pool from the masterlist, restricted to the names we need.
	const wantedKeys = new Set(needsResolution.map((s) => matchKey(s)).filter(Boolean));
	const masterlist = await getMasterlist();
	const candidatePool = masterlist.filter((song) => wantedKeys.has(matchKey(song)));

	const { outcomes, counts } = resolveSongsByName(songs, candidatePool);

	return json({
		counts,
		// Everything the confirmation dialog needs to show: what matched, what is
		// ambiguous and why, and what will be skipped.
		outcomes: outcomes.map((o) => ({
			status: o.status,
			// Position in the submitted array. Rows that already had an id produce no
			// outcome, so the dialog cannot pair these up positionally.
			index: o.index,
			reason: o.reason,
			songName: o.song?.songName ?? null,
			songArtist: o.song?.songArtist ?? null,
			animeENName: o.song?.animeENName ?? null,
			annSongId: o.annSongId,
			candidates: o.candidates
		})),
		playableWithoutConfirmation: counts.alreadyIdentified,
		// Songs that stay unresolved remain storable with song_ann_id = null, but
		// they will not play. Say it here rather than letting the user find out at
		// Start Training.
		note:
			counts.unresolved > 0 || counts.ambiguous > 0
				? `${counts.unresolved + counts.ambiguous} song(s) will be saved without an ID and cannot be played until they are identified.`
				: null
	});
}
