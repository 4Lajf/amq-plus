/**
 * W13 — the client half of resolving imported songs that arrive without an
 * `annSongId`.
 *
 * `$lib/server/song-name-resolver.js` does the matching and never decides:
 * it reports each row as `resolved`, `ambiguous` or `unresolved`. This module
 * takes the user's answer to that report and applies it. It is deliberately
 * separate rather than living next to the resolver, because the resolver is
 * server-only and the confirmation dialog is not.
 *
 * Two invariants carry over from the resolver and are enforced here as well,
 * because this is the code that actually writes an id onto a song:
 *
 *   1. **Nothing is applied that the user did not pick.** An ambiguous row with
 *      no decision stays unidentified. There is no "first candidate" default.
 *   2. **A chosen id must be one of that row's candidates.** A decision that
 *      names an id the server never offered is dropped, not trusted — the
 *      report is the only authority on what a row could legally become.
 *
 * @module lib/utils/songIdResolution
 */

/**
 * @typedef {Object} ResolutionRow
 * @property {'resolved'|'ambiguous'|'unresolved'} status
 * @property {number} index - Position in the array that was submitted
 * @property {number|null} annSongId
 * @property {Array<{annSongId: number}>} candidates
 */

/**
 * Build the decision map a freshly-opened dialog should start from.
 *
 * Unique matches start accepted — the server found exactly one song with that
 * name *and* artist, and making the user tick 400 boxes to accept 400 unambiguous
 * matches is how a safety feature turns into a thing people click through blind.
 *
 * Ambiguous rows start at `null`, which means skip. That is the whole point: a
 * pre-selected candidate is a guess with a confirmation button on it.
 *
 * @param {ResolutionRow[]} outcomes
 * @returns {Record<number, number|null>} index → chosen annSongId, or null for skip
 */
export function defaultDecisions(outcomes) {
	/** @type {Record<number, number|null>} */
	const decisions = {};
	for (const outcome of outcomes || []) {
		decisions[outcome.index] = outcome.status === 'resolved' ? outcome.annSongId : null;
	}
	return decisions;
}

/**
 * Apply confirmed decisions to the songs that were submitted for resolution.
 *
 * Songs the user skipped are **kept, not dropped**. They store with
 * `song_ann_id = null` exactly as they do today and remain unplayable
 * (`sessionStartService.js:291`); dropping them here would lose data the user
 * imported without being asked.
 *
 * @param {Array<Object>} songs - The same array that was sent to the endpoint
 * @param {ResolutionRow[]} outcomes - The endpoint's report
 * @param {Record<number, number|null>} decisions - index → chosen annSongId, or null to skip
 * @returns {{songs: Array<Object>, applied: number, skipped: number}}
 */
export function applyResolutions(songs, outcomes, decisions) {
	/** @type {Map<number, ResolutionRow>} */
	const byIndex = new Map((outcomes || []).map((o) => [o.index, o]));
	let applied = 0;
	let skipped = 0;

	const next = (songs || []).map((song, index) => {
		const outcome = byIndex.get(index);
		if (!outcome) return song; // Already had an id — untouched.

		const chosen = decisions?.[index];
		if (chosen == null) {
			skipped++;
			return song;
		}

		// The report is the authority on what this row may become. A decision
		// naming anything else is a bug or a tampered payload; either way, skip.
		const allowed = (outcome.candidates || []).some((c) => Number(c.annSongId) === Number(chosen));
		if (!allowed) {
			skipped++;
			return song;
		}

		applied++;
		return {
			...song,
			annSongId: Number(chosen),
			// Provenance (spec step 4). When someone reports "this card shows the
			// wrong anime", this is how you find the rows that were guessed at from
			// a name rather than carried a real id.
			annSongIdSource: 'name-match'
		};
	});

	return { songs: next, applied, skipped };
}

/**
 * One-line summary of what confirming will do, for the dialog footer.
 *
 * Phrased as future tense on purpose — this is shown *before* the click, and the
 * skipped count is the part users need to see, not the part to bury.
 *
 * @param {{applied: number, skipped: number}} tally
 * @returns {string}
 */
export function describeOutcome({ applied, skipped }) {
	const parts = [];
	if (applied > 0) parts.push(`${applied} song${applied === 1 ? '' : 's'} will be identified`);
	if (skipped > 0)
		parts.push(`${skipped} will be added without an ID and cannot be played until identified`);
	return parts.length > 0 ? parts.join(', ') : 'Nothing will be identified';
}
