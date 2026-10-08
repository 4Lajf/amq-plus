/**
 * N8 - grouping "the same recording" across anime entries.
 *
 * AnisongDB carries one row per (song, anime entry), so a song reused across a
 * long-running franchise appears many times: "Anpanman no March" has 38 rows,
 * "CHA-LA HEAD-CHA-LA" has 14. Training then schedules each row as an
 * independent FSRS card, which is what lng and doomchicken reported on Mar 5.
 * Measured on production, copies of one recording ended up an average of 461
 * days apart in due date - the same fact being re-learned from scratch N times.
 *
 * What this module does NOT do is decide that those rows are interchangeable.
 * In AMQ the answer is the anime, not the song, so 38 Anpanman entries are 38
 * distinct correct answers. Nothing here merges or deletes a card; it only
 * identifies which cards cover the same audio so the caller can schedule one of
 * them per session and keep their schedules in step.
 *
 * The grouping key is deliberately narrower than the `songName + songArtist`
 * used by `update-masterlist.js` for working titles. On production that naive
 * key would have pulled together 5,398 training rows, but 1,399 of its groups
 * mix Openings with Endings and the average song-length spread inside a group
 * is 40 seconds - different cuts, not different copies. Here a group additionally
 * requires the same song-type family and a song length within
 * `LENGTH_TOLERANCE_SECONDS`, and separately unions anything sharing a byte-identical
 * audio file, which catches re-cut metadata on the same recording.
 */

/** Songs whose lengths differ by more than this are treated as different cuts. */
export const LENGTH_TOLERANCE_SECONDS = 3;

/**
 * Casefold and collapse whitespace so "CHA-LA  HEAD-CHA-LA " and
 * "CHA-LA HEAD-CHA-LA" land in the same bucket.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * "Opening 1" / "Ending 3" / "Insert Song" -> "opening" / "ending" / "insert".
 *
 * The number is dropped on purpose: the same recording is often Opening 1 of one
 * entry and Opening 2 of the next. The family is kept because an Opening and an
 * Ending are different quiz items even when the audio is identical.
 *
 * @param {unknown} songType
 * @returns {string}
 */
export function songTypeFamily(songType) {
	const text = normalizeText(songType);
	if (!text) return '';
	if (text.startsWith('opening')) return 'opening';
	if (text.startsWith('ending')) return 'ending';
	if (text.startsWith('insert')) return 'insert';
	return text.split(' ')[0];
}

/**
 * Pull the fields we group on out of either a masterlist song or an AnisongDB
 * payload. Callers pass whichever shape they already have.
 *
 * @param {Record<string, any>} song
 * @returns {{annSongId: number|null, name: string, artist: string, family: string, length: number|null, audio: string}}
 */
export function readSongFields(song) {
	const payload = song?.payload && typeof song.payload === 'object' ? song.payload : song;
	const rawId = song?.annSongId ?? song?.ann_song_id ?? payload?.annSongId;
	const annSongId = Number(rawId);

	const rawLength = payload?.songLength ?? song?.songLength;
	const length = Number(rawLength);

	const audioSource = payload?.audio || payload?.HQ || payload?.MQ || '';
	// Only the file name identifies the recording - hosts and CDN prefixes vary.
	const audio = normalizeText(String(audioSource).split('/').pop() || '');

	return {
		annSongId: Number.isFinite(annSongId) ? annSongId : null,
		name: normalizeText(payload?.songName ?? song?.song_name ?? song?.songName),
		artist: normalizeText(payload?.songArtist ?? song?.song_artist ?? song?.songArtist),
		family: songTypeFamily(payload?.songType ?? song?.songType),
		length: Number.isFinite(length) && length > 0 ? length : null,
		audio
	};
}

/** Minimal union-find over string keys. */
function makeUnionFind() {
	/** @type {Map<string, string>} */
	const parent = new Map();

	const find = (key) => {
		if (!parent.has(key)) {
			parent.set(key, key);
			return key;
		}
		let root = key;
		while (parent.get(root) !== root) root = /** @type {string} */ (parent.get(root));
		// Path compression, so repeated lookups stay flat.
		let walk = key;
		while (parent.get(walk) !== root) {
			const next = /** @type {string} */ (parent.get(walk));
			parent.set(walk, root);
			walk = next;
		}
		return root;
	};

	const union = (a, b) => {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parent.set(rootB, rootA);
	};

	return { find, union };
}

/**
 * Map every song to a group id shared by its duplicate recordings.
 *
 * Songs with no duplicates still get an id; callers can treat "group of one" and
 * "ungrouped" identically. Songs without a usable annSongId are skipped, since
 * there would be nothing to key the result on.
 *
 * @param {Array<Record<string, any>>} songs
 * @returns {Map<number, string>} annSongId -> group id
 */
export function buildDuplicateGroups(songs) {
	/** @type {Map<number, string>} */
	const result = new Map();
	if (!Array.isArray(songs) || songs.length === 0) return result;

	const uf = makeUnionFind();
	/** @type {Map<number, string>} */
	const seedByAnnSongId = new Map();
	/** @type {Map<string, Array<{annSongId: number, length: number|null, seed: string}>>} */
	const buckets = new Map();
	/** @type {Map<string, string>} */
	const seedByAudio = new Map();

	for (const song of songs) {
		const { annSongId, name, artist, family, length, audio } = readSongFields(song);
		if (annSongId === null) continue;
		if (seedByAnnSongId.has(annSongId)) continue; // same song listed twice in the pool

		// Every song starts in its own group, so anything we fail to match stays
		// separate rather than being silently pooled with an unrelated song.
		const seed = `song:${annSongId}`;
		seedByAnnSongId.set(annSongId, seed);
		uf.find(seed);

		if (name && artist) {
			const bucketKey = `${name}|${artist}|${family}`;
			if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
			/** @type {Array<{annSongId: number, length: number|null, seed: string}>} */ (
				buckets.get(bucketKey)
			).push({ annSongId, length, seed });
		}

		// A shared audio file is the strongest evidence there is, and it applies
		// even when the metadata disagrees - production has entries whose stored
		// songLength differs by 20s while pointing at the same mp3.
		if (audio) {
			const existing = seedByAudio.get(audio);
			if (existing) uf.union(existing, seed);
			else seedByAudio.set(audio, seed);
		}
	}

	for (const entries of buckets.values()) {
		if (entries.length < 2) continue;

		// Cluster by length within the bucket. Sorting first means a run of
		// near-identical lengths chains together while a genuinely different cut
		// starts a new cluster.
		const withLength = entries.filter((e) => e.length !== null);
		const withoutLength = entries.filter((e) => e.length === null);

		withLength.sort((a, b) => /** @type {number} */ (a.length) - /** @type {number} */ (b.length));
		for (let i = 1; i < withLength.length; i++) {
			const previous = withLength[i - 1];
			const current = withLength[i];
			const gap = /** @type {number} */ (current.length) - /** @type {number} */ (previous.length);
			if (gap <= LENGTH_TOLERANCE_SECONDS) uf.union(previous.seed, current.seed);
		}

		// No length recorded means no evidence either way. Grouping those on name
		// alone is exactly the over-merge this module exists to avoid, so they are
		// left alone unless the audio file already united them.
		void withoutLength;
	}

	for (const [annSongId, seed] of seedByAnnSongId) {
		result.set(annSongId, uf.find(seed));
	}

	return result;
}

/**
 * Find the other songs that are the same recording as `annSongId`.
 *
 * Candidates are narrowed from the masterlist by exact song name + artist
 * (duplicates come from one AnisongDB record, so the strings are
 * byte-identical), then the same grouping rules as `buildDuplicateGroups`
 * decide which of them actually match.
 *
 * @param {any} _supabase - unused; kept so call sites stay stable
 * @param {number} annSongId
 * @returns {Promise<number[]>} sibling annSongIds, excluding the input
 */
export async function findDuplicateSiblings(_supabase, annSongId) {
	const { getSongByAnnSongId, getMasterlist } = await import('$lib/server/masterlist.js');
	const target = await getSongByAnnSongId(annSongId);
	if (!target?.songName || !target?.songArtist) return [];

	const name = String(target.songName);
	const artist = String(target.songArtist);
	const master = await getMasterlist();
	const candidates = master.filter(
		(s) => s?.songName === name && s?.songArtist === artist
	);

	if (candidates.length < 2) return [];

	const groups = buildDuplicateGroups(candidates);
	const targetGroup = groups.get(Number(annSongId));
	if (!targetGroup) return [];

	const siblings = [];
	for (const [id, groupId] of groups) {
		if (groupId === targetGroup && id !== Number(annSongId)) siblings.push(id);
	}
	return siblings;
}

/**
 * Put every duplicate sibling of a just-rated card on the same schedule.
 *
 * Deliberately narrow: only `fsrs_state` (and reactivation) is written. Attempt
 * counters and history are what the stats endpoints and the per-song table read,
 * and a propagated rating is not something the user was asked - inflating them
 * would make those numbers lie. Suspended siblings are left alone, since R9's
 * whole point is that a suspension is user-owned.
 *
 * @param {any} supabase - service-role client
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.quizId
 * @param {number} opts.annSongId - the card that was actually rated
 * @param {Object} opts.fsrsAfter - resulting FSRS state to copy onto siblings
 * @param {string} opts.now - ISO timestamp
 * @returns {Promise<number>} how many sibling cards were updated
 */
export async function propagateScheduleToDuplicates(supabase, { userId, quizId, annSongId, fsrsAfter, now }) {
	if (!fsrsAfter) return 0;

	const siblings = await findDuplicateSiblings(supabase, annSongId);
	if (siblings.length === 0) return 0;

	const { data: rows, error } = await supabase
		.from('training_progress')
		.select('id, song_ann_id, fsrs_state, suspended_at')
		.eq('user_id', userId)
		.eq('quiz_id', quizId)
		.in('song_ann_id', siblings);

	if (error || !Array.isArray(rows) || rows.length === 0) return 0;

	let updated = 0;
	for (const row of rows) {
		if (row.suspended_at) continue;
		const { error: updateError } = await supabase
			.from('training_progress')
			.update({
				// songKey identifies the sibling's own card; only the schedule travels.
				fsrs_state: { ...fsrsAfter, songKey: row.fsrs_state?.songKey ?? String(row.song_ann_id) },
				is_active: true,
				inactivated_at: null,
				updated_at: now
			})
			.eq('id', row.id);

		if (updateError) {
			console.error('[DUPLICATE PROPAGATION] Failed to update sibling', row.song_ann_id, updateError);
			continue;
		}
		updated++;
	}

	return updated;
}

/**
 * Collapse a list of songs to one per duplicate group, keeping the first
 * occurrence. Order therefore encodes priority - callers pass the pool they
 * most want to keep first.
 *
 * @template {Record<string, any>} T
 * @param {Array<T>} items
 * @param {Map<number, string>} groups
 * @param {(item: T) => number|null} getAnnSongId
 * @param {Set<string>} [seen] - shared across calls to dedupe across pools
 * @returns {Array<T>}
 */
export function dedupeByGroup(items, groups, getAnnSongId, seen = new Set()) {
	if (!Array.isArray(items) || !(groups instanceof Map) || groups.size === 0) {
		return Array.isArray(items) ? items : [];
	}

	const kept = [];
	for (const item of items) {
		const annSongId = getAnnSongId(item);
		const groupId = annSongId === null ? null : groups.get(annSongId);
		// A song we know nothing about is never dropped.
		if (!groupId) {
			kept.push(item);
			continue;
		}
		if (seen.has(groupId)) continue;
		seen.add(groupId);
		kept.push(item);
	}
	return kept;
}
