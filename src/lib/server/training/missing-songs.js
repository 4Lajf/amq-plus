/**
 * Classifying songs a user has played that we have no metadata for.
 *
 * Historically every one of these rendered the same alarming line asking the
 * user to report it on Discord. Not one of them was ever actionable: SirG. and
 * Tugia between them hand-typed roughly 40 song names into the channel across
 * May 2026, and the answer in every case was either "AnisongDB has not ingested
 * that upload yet" or "AnisongDB does not have it and never will".
 *
 * The audit behind this (2026-08-10) took every `annSongId` referenced by
 * `training_progress` with no matching masterlist entry - 96 of them - and looked
 * each one up across six historical `masterlist.json` revisions in git LFS:
 *
 *   87  never in any masterlist, id >= 49409. New AMQ uploads AnisongDB has not
 *       ingested yet. `POST /api/ann_song_ids_request` returns [] for all of
 *       them while a control id returns a full record, so the always-fetch list
 *       in update-masterlist.js is working; the data simply is not upstream.
 *       These resolve on their own at the next AnisongDB ingest.
 *    1  never in any masterlist, id 13714. Played once, by one user.
 *    8  present in an old masterlist and gone from AnisongDB now. Ten progress
 *       rows between them.
 *
 * So there is almost nothing to remap, which is why this module classifies
 * rather than repairs.
 *
 * @module lib/server/training/missing-songs
 */

/**
 * annSongIds confirmed absent from AnisongDB, below the masterlist frontier.
 *
 * Verified 2026-08-10 by `POST /api/ann_song_ids_request` (empty result) and a
 * name search that turned up either nothing or an unrelated artist, after
 * recovering each song's metadata from the historical masterlists in git LFS.
 *
 * These are the genuine holes. Everything else below the frontier would be a new
 * problem worth looking at, which is why this is an explicit list rather than a
 * blanket "below the max means dead" rule.
 *
 *   1544  Youma Kazoe Uta        / Midori Karashima  (Blood Reign: Curse of the Yoma)
 *   11587 Akujo                  / Miyuki Nakajima   (Jewelpet Sunshine)
 *   13714 (never in any masterlist we have shipped)
 *   29660 Kioku no Unabara       / Yutaka Minobe     (Submarine 707R)
 *
 * @type {ReadonlySet<number>}
 */
export const KNOWN_MISSING_ANN_SONG_IDS = Object.freeze(new Set([1544, 11587, 13714, 29660]));

/** @typedef {'newer-than-database'|'known-absent'|'unknown'} MissingSongKind */

export const MISSING_SONG_MESSAGES = Object.freeze({
	'newer-than-database':
		'This song is newer than our song database. It will appear automatically after the next refresh — no need to report it.',
	'known-absent':
		'This song is not in AnisongDB and cannot be played. You can remove it from your history to stop it appearing.',
	unknown:
		'This song is not in our song database. It will usually appear after the next refresh; if it sticks around, let 4lajf know.'
});

/**
 * Why is this annSongId missing metadata?
 *
 * @param {number|string} annSongId
 * @param {number} masterlistMaxAnnSongId highest id we currently know about
 * @returns {MissingSongKind}
 */
export function classifyMissingSong(annSongId, masterlistMaxAnnSongId) {
	const id = Number(annSongId);
	if (!Number.isFinite(id)) return 'unknown';

	// Above the frontier means AMQ issued it after our last refresh. Nothing for
	// the user to do and nothing for anyone to report.
	if (masterlistMaxAnnSongId > 0 && id > masterlistMaxAnnSongId) {
		return 'newer-than-database';
	}

	if (KNOWN_MISSING_ANN_SONG_IDS.has(id)) {
		return 'known-absent';
	}

	// Below the frontier and not a known hole. This one is genuinely unexpected,
	// so it is the only case that still asks for a report.
	return 'unknown';
}

/**
 * Bucket a list of unresolved ids for display.
 *
 * @param {Array<number|string>} annSongIds
 * @param {number} masterlistMaxAnnSongId
 * @returns {{ kind: MissingSongKind, message: string, ids: number[] }[]} non-empty groups only
 */
export function groupMissingSongs(annSongIds, masterlistMaxAnnSongId) {
	/** @type {Record<MissingSongKind, number[]>} */
	const buckets = { 'newer-than-database': [], 'known-absent': [], unknown: [] };

	for (const raw of annSongIds || []) {
		const id = Number(raw);
		if (!Number.isFinite(id)) continue;
		buckets[classifyMissingSong(id, masterlistMaxAnnSongId)].push(id);
	}

	return /** @type {MissingSongKind[]} */ (Object.keys(buckets))
		.filter((kind) => buckets[kind].length > 0)
		.map((kind) => ({
			kind,
			message: MISSING_SONG_MESSAGES[kind],
			ids: buckets[kind].sort((a, b) => a - b)
		}));
}
