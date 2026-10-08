/**
 * Server-side franchise data loading and season mode logic.
 *
 * Loads anilist-franchise-components.json once into memory, builds lookup
 * maps, and exposes helpers consumed by the /api/season-autocomplete and
 * /api/season-resolve endpoints.
 *
 * AMQ-accepted names (member.amqName) are pre-computed at build time by
 * scripts/update-franchise-components.js from the masterlist. Runtime matching
 * only does exact title lookups as a fallback.
 *
 * @module lib/server/franchise-data
 */

import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// In-memory cache (auto-invalidated when the JSON file changes on disk)
// ---------------------------------------------------------------------------

/** @type {object | null} */
let franchiseData = null;
let _jsonMtime = 0;

/** annSongId -> { component, member } */
let annSongIdToMember = new Map();

/** normalizedTitle -> { component, member } */
let titleToMember = new Map();

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function stripDiacritics(str) {
	return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeTitle(str) {
	return stripDiacritics(String(str || '')).trim().toLowerCase().replace(/['']/g, "'");
}

function normalizeForMatch(str) {
	return stripDiacritics(String(str || '')).trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadFranchiseData() {
	const filePath = resolve('static', 'anilist-franchise-components.json');
	const mtime = statSync(filePath).mtimeMs;
	if (franchiseData && mtime === _jsonMtime) return franchiseData;

	_jsonMtime = mtime;
	amqMapCache = null;
	const raw = readFileSync(filePath, 'utf-8');
	franchiseData = JSON.parse(raw);

	if (!franchiseData || !Array.isArray(franchiseData.components)) {
		throw new Error('Invalid franchise data format');
	}

	annSongIdToMember = new Map();
	titleToMember = new Map();

	for (const comp of franchiseData.components) {
		if (!Array.isArray(comp.members)) continue;
		for (const member of comp.members) {
			if (Array.isArray(member.annSongIds)) {
				for (const songId of member.annSongIds) {
					annSongIdToMember.set(songId, { component: comp, member });
				}
			}

			const titles = [];
			if (member.romaji) titles.push(member.romaji);
			if (member.english) titles.push(member.english);
			if (Array.isArray(member.synonyms)) titles.push(...member.synonyms);
			if (member.amqName?.en) titles.push(member.amqName.en);
			if (member.amqName?.jp) titles.push(member.amqName.jp);

			for (const t of titles) {
				const norm = normalizeTitle(t);
				if (norm && !titleToMember.has(norm)) {
					titleToMember.set(norm, { component: comp, member });
				}
			}
		}
	}

	console.log(
		`[Franchise] Loaded ${franchiseData.components.length} components, ` +
		`annSongIdToMember=${annSongIdToMember.size}, titleToMember=${titleToMember.size}`
	);
	return franchiseData;
}

// ---------------------------------------------------------------------------
// AMQ-name resolution maps
// ---------------------------------------------------------------------------

/** @type {{ key: string, maps: object } | null} */
let amqMapCache = null;

function amqListCacheKey(amqList) {
	const mid = amqList[Math.floor(amqList.length / 2)] || '';
	const q1 = amqList[Math.floor(amqList.length / 4)] || '';
	return `${amqList.length}:${amqList[0] || ''}:${q1}:${mid}:${amqList[amqList.length - 1] || ''}`;
}

/**
 * Build maps that translate between franchise member IDs and the AMQ-accepted
 * name from the autocomplete list.
 *
 * Uses pre-computed member.amqName (from the build step) first, then falls
 * back to exact title matching against the AMQ list. No substring matching,
 * no scoring, no multi-pass.
 *
 * @param {string[]} amqList  Original AMQ autocomplete list
 */
function buildAmqNameMaps(amqList) {
	const key = amqListCacheKey(amqList);
	if (amqMapCache && amqMapCache.key === key) return amqMapCache.maps;
	const maps = _buildAmqNameMaps(amqList);
	amqMapCache = { key, maps };
	return maps;
}

function _buildAmqNameMaps(amqList) {
	const data = loadFranchiseData();

	// Set for O(1) existence checks + map for normalized → original
	const amqSet = new Set(amqList);
	const normalizedAmqMap = new Map();
	for (const name of amqList) {
		normalizedAmqMap.set(normalizeTitle(name), name);
	}

	const annIdToAmqName = new Map();
	const memberIdToAmqName = new Map();

	for (const comp of data.components) {
		if (!Array.isArray(comp.members)) continue;
		for (const member of comp.members) {
			let resolved = null;

			// 1) Pre-computed amqName — check en then jp against AMQ list
			if (member.amqName?.en && amqSet.has(member.amqName.en)) {
				resolved = member.amqName.en;
			} else if (member.amqName?.jp && amqSet.has(member.amqName.jp)) {
				resolved = member.amqName.jp;
			}

			// 2) Exact title fallback (normalizeTitle only)
			if (!resolved) {
				const candidates = [];
				if (member.romaji) candidates.push(member.romaji);
				if (member.english) candidates.push(member.english);
				if (Array.isArray(member.synonyms)) candidates.push(...member.synonyms);

				for (const c of candidates) {
					const found = normalizedAmqMap.get(normalizeTitle(c));
					if (found) { resolved = found; break; }
				}
			}

			if (resolved) {
				if (member.id) memberIdToAmqName.set(member.id, resolved);
				if (member.annId) annIdToAmqName.set(member.annId, resolved);
			}
		}
	}

	// Index AMQ names back into titleToMember so answer resolution can look
	// them up by their AMQ-accepted form
	const titleToMemberExt = new Map(titleToMember);
	for (const comp of data.components) {
		if (!Array.isArray(comp.members)) continue;
		for (const member of comp.members) {
			const amqName = memberIdToAmqName.get(member.id);
			if (amqName) {
				const norm = normalizeTitle(amqName);
				if (!titleToMemberExt.has(norm)) {
					titleToMemberExt.set(norm, { component: comp, member });
				}
			}
		}
	}

	console.log(
		`[Franchise] AMQ name maps built: annIdToAmqName=${annIdToAmqName.size}, ` +
		`memberIdToAmqName=${memberIdToAmqName.size}`
	);

	return { memberIdToAmqName, annIdToAmqName, normalizedAmqMap, titleToMemberExt };
}

// ---------------------------------------------------------------------------
// Autocomplete list builder
// ---------------------------------------------------------------------------

/**
 * Build the filtered autocomplete list for a given season mode.
 *
 * @param {'split'|'merge'} mode
 * @param {string[]} originalList  Original AMQ autocomplete entries
 * @param {ReturnType<typeof _buildAmqNameMaps>} maps
 * @returns {string[]}
 */
function buildAutocompleteList(mode, originalList, maps) {
	const data = loadFranchiseData();
	const { memberIdToAmqName } = maps;

	const newList = [];
	const addedTitles = new Set(); // normalizeTitle-keyed dedup for newList

	if (mode === 'merge') {
		// Build from scratch: only seed display names + pass-through for unclaimed entries.
		//
		// Step 1 — collect every title "owned" by any component member so we can
		//           detect which originalList entries belong to a component at all.
		//           normalizeForMatch is used so punctuation/diacritic variants
		//           (e.g. "Fate/EXTRA" vs "Fate/Extra") are treated as the same title.
		const claimed = new Set();
		for (const comp of data.components) {
			if (!Array.isArray(comp.members)) continue;
			for (const member of comp.members) {
				const titles = [
					member.romaji,
					member.english,
					member.amqName?.en,
					member.amqName?.jp,
					...(Array.isArray(member.synonyms) ? member.synonyms : []),
					memberIdToAmqName.get(member.id),
				].filter(Boolean);
				for (const t of titles) claimed.add(normalizeForMatch(t));
			}
		}

		// Step 2 — add only the seed's display names for each component, and
		//           collect seed name prefixes.  The prefix set catches AMQ entries
		//           that use abbreviations differing from our stored titles but still
		//           starting with the seed name (e.g. "Kidou Senshi Gundam Unicorn"
		//           when our data says "Kidou Senshi Gundam UC", or "Mobile Suit
		//           Gundam NT" when we store "Mobile Suit Gundam Narrative").
		const seedPrefixes = new Set();
		for (const comp of data.components) {
			if (!Array.isArray(comp.members)) continue;
			const seedMember = comp.members.find(m => m.id === comp.seedId);
			if (!seedMember) continue;

			// romaji + english from stored data, plus the live AMQ-matched name when
			// it differs (ensures we expose the exact string AMQ accepts as an answer).
			const seedNames = [seedMember.romaji, seedMember.english].filter(Boolean);
			const amqResolved = memberIdToAmqName.get(seedMember.id);
			if (amqResolved && !seedNames.some(n => normalizeTitle(n) === normalizeTitle(amqResolved))) {
				seedNames.push(amqResolved);
			}

			for (const name of seedNames) {
				const norm = normalizeTitle(name);
				if (!addedTitles.has(norm)) {
					newList.push(name);
					addedTitles.add(norm);
				}
				const sp = normalizeForMatch(name);
				if (sp.length >= 4) seedPrefixes.add(sp);
			}
			// Also register the live AMQ name as a prefix even when it duplicates a stored title.
			if (amqResolved) {
				const sp = normalizeForMatch(amqResolved);
				if (sp.length >= 4) seedPrefixes.add(sp);
			}
		}

		// Step 3 — pass through anything from the original AMQ list that isn't
		//           owned by any component member and isn't a variant of a seed name.
		for (const name of originalList) {
			const norm = normalizeTitle(name);
			if (addedTitles.has(norm)) continue;

			const matchNorm = normalizeForMatch(name);
			if (claimed.has(matchNorm)) continue;

			// Suppress AMQ entries that start with a seed prefix — these are season/
			// sequel titles AMQ abbreviates differently from our stored data.
			let isSeedVariant = false;
			for (const sp of seedPrefixes) {
				if (matchNorm.length > sp.length && matchNorm.startsWith(sp)) {
					isSeedVariant = true;
					break;
				}
			}
			if (isSeedVariant) continue;

			newList.push(name);
			addedTitles.add(norm);
		}
	} else {
		// Split mode: add romaji + english for every member, claim synonyms/AMQ
		// name variants, then pass through anything not in any component.
		for (const comp of data.components) {
			if (!Array.isArray(comp.members)) continue;
			for (const member of comp.members) {
				const displayTitles = [member.romaji, member.english].filter(Boolean);
				for (const t of displayTitles) {
					if (!addedTitles.has(normalizeTitle(t))) {
						newList.push(t);
						addedTitles.add(normalizeTitle(t));
					}
				}
				// Claim synonyms / AMQ name variants so they don't re-appear from
				// the original AMQ list as duplicate entries.
				const claimOnly = [
					...(Array.isArray(member.synonyms) ? member.synonyms : []),
					member.amqName?.en,
					member.amqName?.jp,
					memberIdToAmqName.get(member.id),
				].filter(Boolean);
				for (const t of claimOnly) {
					addedTitles.add(normalizeTitle(t));
				}
			}
		}

		for (const name of originalList) {
			const norm = normalizeTitle(name);
			if (!addedTitles.has(norm)) {
				newList.push(name);
				addedTitles.add(norm);
			}
		}
	}

	return newList;
}

// ---------------------------------------------------------------------------
// Shared helper: find the AMQ-accepted name for a member
// ---------------------------------------------------------------------------

/**
 * @param {object} member   Franchise member object
 * @param {object} maps     Output of buildAmqNameMaps()
 * @returns {string|null}
 */
function _findAmqName(member, maps) {
	const { memberIdToAmqName, annIdToAmqName } = maps;

	return memberIdToAmqName.get(member.id)
		|| (member.annId && annIdToAmqName.get(member.annId))
		|| member.amqName?.en
		|| member.amqName?.jp
		|| null;
}

// ---------------------------------------------------------------------------
// Pre-computed resolution maps (sent to client at game start)
// ---------------------------------------------------------------------------

/**
 * For every annSongId in the quiz, pre-compute the correct AMQ name and
 * franchise metadata so the client can resolve answers instantly.
 *
 * @param {number[]} annSongIds
 * @param {object} maps  Output of buildAmqNameMaps()
 * @returns {Record<number, {amqName: string|null, mid: number, cid: string, sid: number}>}
 */
function buildSongResolveMap(annSongIds, maps) {
	/** @type {Record<number, {amqName: string|null, mid: number, cid: string, sid: number}>} */
	const result = {};
	for (const songId of annSongIds) {
		const entry = annSongIdToMember.get(songId);
		if (!entry) continue;
		const { member, component } = entry;
		result[songId] = {
			amqName: _findAmqName(member, maps) || null,
			mid: member.id,
			cid: component.componentId,
			sid: component.seedId,
		};
	}
	return result;
}

/**
 * Build a lightweight lookup: normalizedTitle -> { mid, cid, sid }
 * Only includes titles present in the autocomplete list that map to a
 * franchise member — keeps the payload small.
 *
 * @param {string[]} autocompleteList
 * @param {object} maps  Output of buildAmqNameMaps()
 * @returns {Record<string, {mid: number, cid: string, sid: number}>}
 */
function buildTitleLookup(autocompleteList, maps) {
	const { titleToMemberExt } = maps;
	/** @type {Record<string, {mid: number, cid: string, sid: number}>} */
	const result = {};
	for (const name of autocompleteList) {
		const norm = normalizeTitle(name);
		const entry = titleToMemberExt.get(norm);
		if (entry) {
			result[norm] = {
				mid: entry.member.id,
				cid: entry.component.componentId,
				sid: entry.component.seedId,
			};
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Answer resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a user's answer for season mode.
 *
 * @param {'split'|'merge'} mode
 * @param {string} userAnswer
 * @param {number} annSongId
 * @param {object} maps  Output of buildAmqNameMaps()
 * @returns {{ resolvedAnswer: string, action: 'resolve'|'wrong'|'passthrough', reason: string }}
 */
function resolveAnswer(mode, userAnswer, annSongId, maps) {
	const { titleToMemberExt } = maps;

	const correctEntry = annSongIdToMember.get(annSongId);
	if (!correctEntry) {
		return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'annSongId not in franchise data' };
	}

	const userNorm = normalizeTitle(userAnswer);
	const userEntry = titleToMemberExt.get(userNorm) || null;

	if (mode === 'split') {
		const correctAmqName = _findAmqName(correctEntry.member, maps);

		if (userEntry) {
			if (userEntry.member.id === correctEntry.member.id) {
				if (correctAmqName) {
					return { resolvedAnswer: correctAmqName, action: 'resolve', reason: 'correct season' };
				}
				return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'correct season, no AMQ name' };
			}
			if (userEntry.component.componentId === correctEntry.component.componentId) {
				return { resolvedAnswer: userAnswer + ' (wrong)', action: 'wrong', reason: `wrong season: user member ${userEntry.member.id}, correct ${correctEntry.member.id}` };
			}
		}

		return { resolvedAnswer: userAnswer, action: 'passthrough', reason: userEntry ? 'different franchise' : 'no franchise match' };
	}

	if (mode === 'merge') {
		if (!userEntry) {
			return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'user answer not in franchise data' };
		}

		const isSeedAnswer = userEntry.member.id === userEntry.component.seedId;
		if (!isSeedAnswer) {
			return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'user did not answer with seed' };
		}

		if (userEntry.component.componentId !== correctEntry.component.componentId) {
			return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'wrong franchise seed (AMQ will reject)' };
		}

		const correctAmqName = _findAmqName(correctEntry.member, maps);
		if (correctAmqName && normalizeTitle(correctAmqName) !== userNorm) {
			return { resolvedAnswer: correctAmqName, action: 'resolve', reason: 'resolved seed to correct season' };
		}

		return {
			resolvedAnswer: userAnswer,
			action: 'passthrough',
			reason: correctAmqName ? 'answer already matches correct AMQ name' : 'no AMQ name found for correct season',
		};
	}

	return { resolvedAnswer: userAnswer, action: 'passthrough', reason: 'unknown mode' };
}

// ---------------------------------------------------------------------------
// Franchise size helpers
// ---------------------------------------------------------------------------

/**
 * Get the franchise size (number of members) for a song by its annSongId.
 * Ensures franchise data is loaded first.
 *
 * @param {number} annSongId
 * @returns {number} Number of members in the franchise, or 1 if not found (standalone)
 */
function getFranchiseSizeForSong(annSongId) {
	loadFranchiseData();
	const entry = annSongIdToMember.get(annSongId);
	if (!entry || !Array.isArray(entry.component.members)) return 1;
	return entry.component.members.length;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
	loadFranchiseData,
	buildAmqNameMaps,
	buildAutocompleteList,
	buildSongResolveMap,
	buildTitleLookup,
	resolveAnswer,
	normalizeTitle,
	normalizeForMatch,
	getFranchiseSizeForSong,
};
