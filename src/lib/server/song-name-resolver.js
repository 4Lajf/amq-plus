/**
 * Best-effort resolution of songs that arrive without an `annSongId`.
 *
 * W13 — arkanazz, Jul 23, importing blissfulyoshi's ranked JSON because the
 * provider list mentions it. Most rows have no `annSongId`, they are stored with
 * `song_ann_id = null`, and `sessionStartService` rejects them, so they can
 * never be played. N6 closed the premise ("imports don't drop them") but the
 * user's actual ask stayed unmet.
 *
 * **The hazard is the whole design constraint.** Resolving a song by name means
 * picking among candidates, and a song that appears under several anime entries
 * — exactly the duplicate problem N8 exists for — can resolve to the wrong one.
 * A wrong `annSongId` is worse than a skipped song: it silently trains the user
 * on the wrong answer and corrupts that card's history.
 *
 * So this module never decides. It returns:
 *   - `resolved`   exactly one candidate matched — safe to offer
 *   - `ambiguous`  several matched — the user picks, or it is skipped
 *   - `unresolved` nothing matched — skipped, and said so
 *
 * There is deliberately no "take the first result" path. If that makes the
 * feature less magical, that is the correct trade.
 *
 * @module lib/server/song-name-resolver
 */

/**
 * Normalize a title or artist for comparison.
 * Case, surrounding whitespace and the punctuation that varies between
 * providers are noise; everything else is signal.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    // Curly apostrophes are the same character as a straight one for our
    // purposes; curly *double* quotes are decoration and get stripped with the
    // rest of the punctuation below.
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Build the key a song is matched on.
 *
 * Artist is part of the key on purpose: song titles collide constantly across
 * anime ("Again", "Kimi no Shiranai Monogatari" covers), and title alone would
 * turn most lookups ambiguous or, worse, confidently wrong.
 *
 * @param {{songName?: string, songArtist?: string}} song
 * @returns {string|null} null when there is not enough to match on
 */
export function matchKey(song) {
  const name = normalizeForMatch(song?.songName);
  const artist = normalizeForMatch(song?.songArtist);
  if (!name || !artist) return null;
  return `${name}|${artist}`;
}

/**
 * @typedef {Object} ResolutionOutcome
 * @property {'resolved'|'ambiguous'|'unresolved'} status
 * @property {number} index - Position in the input array. Rows that already have
 *   an id produce no outcome, so outcome order does not track song order and the
 *   confirmation dialog needs this to point a decision back at a song.
 * @property {Object} song - The input song
 * @property {number|null} annSongId - Set only when status is 'resolved'
 * @property {Array<{annSongId: number, songName: string, songArtist: string, animeENName: string, songType: string}>} candidates
 * @property {string} reason
 */

/**
 * Resolve songs lacking an annSongId against a candidate pool.
 *
 * The pool is supplied rather than fetched so the caller decides the source
 * Pure so the candidate pool can come from the masterlist (or a fixture)
 * and so this stays testable.
 *
 * @param {Array<Object>} songs - Imported songs, some without annSongId
 * @param {Array<Object>} candidatePool - Known songs to match against
 * @returns {{outcomes: ResolutionOutcome[], counts: {total: number, alreadyIdentified: number, resolved: number, ambiguous: number, unresolved: number}}}
 */
export function resolveSongsByName(songs, candidatePool) {
  /** @type {Map<string, Object[]>} */
  const byKey = new Map();
  for (const candidate of candidatePool || []) {
    const key = matchKey(candidate);
    if (!key || candidate?.annSongId == null) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(candidate);
  }

  /** @type {ResolutionOutcome[]} */
  const outcomes = [];
  const counts = {
    total: 0,
    alreadyIdentified: 0,
    resolved: 0,
    ambiguous: 0,
    unresolved: 0
  };

  const list = songs || [];
  for (let index = 0; index < list.length; index++) {
    const song = list[index];
    counts.total++;

    if (song?.annSongId != null && song.annSongId !== '') {
      counts.alreadyIdentified++;
      continue;
    }

    const key = matchKey(song);
    if (!key) {
      counts.unresolved++;
      outcomes.push({
        status: 'unresolved',
        index,
        song,
        annSongId: null,
        candidates: [],
        reason: 'No song name and artist to match on.'
      });
      continue;
    }

    const matches = byKey.get(key) || [];

    // Several rows can be the *same* recording listed under several anime
    // entries. Those share an annSongId, so collapsing by id first keeps a
    // genuine single match from looking ambiguous.
    const distinctIds = [...new Set(matches.map((m) => Number(m.annSongId)))];

    if (distinctIds.length === 0) {
      counts.unresolved++;
      outcomes.push({
        status: 'unresolved',
        index,
        song,
        annSongId: null,
        candidates: [],
        reason: 'No song in the database matches that name and artist.'
      });
      continue;
    }

    const candidates = matches.map((m) => ({
      annSongId: Number(m.annSongId),
      songName: m.songName,
      songArtist: m.songArtist,
      animeENName: m.animeENName,
      songType: m.songType
    }));

    if (distinctIds.length === 1) {
      counts.resolved++;
      outcomes.push({
        status: 'resolved',
        index,
        song,
        annSongId: distinctIds[0],
        candidates,
        reason: 'Exactly one song matched that name and artist.'
      });
      continue;
    }

    counts.ambiguous++;
    outcomes.push({
      status: 'ambiguous',
      index,
      song,
      annSongId: null,
      candidates,
      reason:
        `${distinctIds.length} different songs match that name and artist. ` +
        `Pick one, or it will be skipped — guessing here would train you on the wrong answer.`
    });
  }

  return { outcomes, counts };
}
