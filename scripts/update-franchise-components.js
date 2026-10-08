/**
 * Unified Franchise Components Pipeline
 *
 * Combines the full pipeline into a single script:
 *   Phase 1 - Harvest  : BFS-crawl AniList for franchise relationships
 *   Phase 2 - Recluster: Re-fetch relations for all known IDs and rebuild connected components
 *   Phase 3 - Shortest : Add shortestArrayItem (shortest romaji/english title) to each component
 *   Phase 4 - Copy     : Copy to static/ (no-op when already writing to static)
 *   Phase 5 - Augment  : Enrich each member with annSongIds from masterlist
 *
 * Usage:
 *   node scripts/update-franchise-components.js
 *   node scripts/update-franchise-components.js --missing-only     # Harvest new IDs only (no full re-harvest)
 *   node scripts/update-franchise-components.js --skip-harvest     # Skip harvest phase
 *   node scripts/update-franchise-components.js --skip-recluster   # Skip recluster phase
 *   node scripts/update-franchise-components.js --resume           # Resume harvest from checkpoint
 *   node scripts/update-franchise-components.js --debug-id=21      # Harvest a single AniList ID only
 *   node scripts/update-franchise-components.js --limit=50         # Limit harvest to 50 seeds
 *   node scripts/update-franchise-components.js --dry-run          # Don't write any files
 *   node scripts/update-franchise-components.js --batch-size=15    # AniList GraphQL batch size (default 26, max 29)
 *   node scripts/update-franchise-components.js --delay-ms=3500    # Delay between API requests
 */

import fs from 'fs/promises';
import { existsSync, copyFileSync } from 'fs';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ============================================================================
// PATHS
// ============================================================================

const PATHS = {
	masterlist:       path.join(ROOT_DIR, 'src', 'lib', 'server', 'masterlist.json'),
	annIdMasterlist:  path.join(ROOT_DIR, 'github_scripts', 'masterlist.json'),
	components:       path.join(ROOT_DIR, 'static', 'anilist-franchise-components.json'),
	staticComponents: path.join(ROOT_DIR, 'static', 'anilist-franchise-components.json'),
	harvestMeta:      path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-meta.json'),
	harvestReport:    path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-harvest-report.json'),
	reclusterReport:  path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-recluster-report.json'),
	checkpoint:       path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-checkpoint.json'),
	outputDir:        path.join(ROOT_DIR, 'github_scripts'),
	apiUrl:           'https://graphql.anilist.co',
};

// Relation types excluded by each phase (intentionally different - see comments)
// Harvest excludes ALTERNATIVE during BFS to avoid prematurely merging separate franchises.
// Recluster includes ALTERNATIVE since the ID set is already known and bounded.
const HARVEST_EXCLUDED_RELATIONS  = new Set(['CHARACTER', 'SUMMARY', 'OTHER', 'ALTERNATIVE']);
const RECLUSTER_EXCLUDED_RELATIONS = new Set(['CHARACTER', 'OTHER', 'SUMMARY']);

const DEFAULT_BATCH_SIZE          = 26;
const DEFAULT_DELAY_MS            = 3250;
const DEFAULT_CHECKPOINT_INTERVAL = 20;

const ANSI = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m' };

// ============================================================================
// ARG PARSING
// ============================================================================

function parseArgs(argv) {
	const opts = {
		missingOnly:         false,
		skipHarvest:         false,
		skipRecluster:       false,
		resume:              false,
		debugId:             null,
		limit:               null,
		dryRun:              false,
		batchSize:           DEFAULT_BATCH_SIZE,
		delayMs:             DEFAULT_DELAY_MS,
		checkpointInterval:  DEFAULT_CHECKPOINT_INTERVAL,
		help:                false,
	};

	for (const arg of argv) {
		if (arg === '--missing-only')           opts.missingOnly = true;
		else if (arg === '--skip-harvest')      opts.skipHarvest = true;
		else if (arg === '--skip-recluster')    opts.skipRecluster = true;
		else if (arg === '--resume')            opts.resume = true;
		else if (arg === '--dry-run')           opts.dryRun = true;
		else if (arg === '--help' || arg === '-h') opts.help = true;
		else if (arg.startsWith('--debug-id='))            opts.debugId = Number(arg.split('=')[1]);
		else if (arg.startsWith('--limit='))               opts.limit = Number(arg.split('=')[1]);
		else if (arg.startsWith('--batch-size='))          opts.batchSize = Number(arg.split('=')[1]);
		else if (arg.startsWith('--delay-ms='))            opts.delayMs = Number(arg.split('=')[1]);
		else if (arg.startsWith('--checkpoint-interval=')) opts.checkpointInterval = Number(arg.split('=')[1]);
		else {
			console.error(`[pipeline] Unknown argument: ${arg}`);
			process.exit(1);
		}
	}

	if (!Number.isInteger(opts.batchSize) || opts.batchSize < 1 || opts.batchSize > 29)
		throw new Error('--batch-size must be an integer in range 1..29');
	if (!Number.isInteger(opts.delayMs) || opts.delayMs < 0)
		throw new Error('--delay-ms must be a non-negative integer');
	if (!Number.isInteger(opts.checkpointInterval) || opts.checkpointInterval < 1)
		throw new Error('--checkpoint-interval must be a positive integer');
	if (opts.limit !== null && (!Number.isInteger(opts.limit) || opts.limit < 1))
		throw new Error('--limit must be a positive integer');
	if (opts.debugId !== null && (!Number.isInteger(opts.debugId) || opts.debugId < 1))
		throw new Error('--debug-id must be a positive integer');

	return opts;
}

function printUsage() {
	console.log(`
Unified Franchise Components Pipeline

Usage:
  node scripts/update-franchise-components.js [options]

Options:
  --missing-only       Harvest only new IDs not yet in components (append mode), then recluster
  --skip-harvest       Skip the harvest phase entirely
  --skip-recluster     Skip the recluster phase entirely
  --resume             Resume harvest from the last checkpoint
  --debug-id=N         Run harvest for a single AniList ID only
  --limit=N            Limit harvest to N seeds
  --dry-run            Don't write any files
  --batch-size=N       AniList GraphQL batch size, max 29 (default: ${DEFAULT_BATCH_SIZE})
  --delay-ms=N         Delay between API requests in ms (default: ${DEFAULT_DELAY_MS})
  --checkpoint-interval=N  Harvest checkpoint frequency in batches (default: ${DEFAULT_CHECKPOINT_INTERVAL})
  --help, -h           Show this help
`);
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dedupeAndSortNumeric(values) {
	return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

function normalizeApostrophe(str) {
	if (str == null || typeof str !== 'string') return str;
	return str.replace(/[\u2018\u2019\u02BC\u2032]/g, "'");
}

function normalizeTitleSet(titles) {
	return [...new Set(
		titles.map((x) => normalizeApostrophe(String(x || '').trim())).filter(Boolean)
	)].sort((a, b) => a.localeCompare(b));
}

function hasNonEnglishAlphabetLetters(value) {
	for (const ch of value) {
		if (/\p{L}/u.test(ch) && !/[A-Za-z]/.test(ch)) return true;
	}
	return false;
}

function keepSynonymTitle(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return false;
	// Keep only English-alphabet titles (no Japanese, Arabic, Cyrillic, etc.).
	if (hasNonEnglishAlphabetLetters(normalized)) return false;
	return true;
}

async function writeJsonFile(filePath, value) {
	// Atomic-ish write: Windows can lock the target during antivirus/indexer
	// scans (seen as UNKNOWN/EPERM on anilist-franchise-checkpoint.json).
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.tmp`;
	const payload = JSON.stringify(value, null, 2);
	await fs.writeFile(tmpPath, payload, 'utf8');
	try {
		await fs.rename(tmpPath, filePath);
	} catch (err) {
		// Fall back to overwrite-in-place if rename is blocked.
		await fs.writeFile(filePath, payload, 'utf8');
		await fs.unlink(tmpPath).catch(() => {});
		if (err && err.code !== 'EPERM' && err.code !== 'EEXIST') {
			console.warn(`[franchise] rename fallback for ${filePath}:`, err.message);
		}
	}
}

async function readJsonFileIfExists(filePath) {
	try {
		return JSON.parse(await fs.readFile(filePath, 'utf8'));
	} catch {
		return null;
	}
}

async function readComponentsIfExists(filePath) {
	const parsed = await readJsonFileIfExists(filePath);
	if (!parsed || !Array.isArray(parsed.components)) return [];
	return parsed.components;
}

/** Extract unique AniList IDs by scanning masterlist.json line-by-line (efficient for large files). */
async function extractAniListSeedIds(masterlistPath) {
	const ids = new Set();
	const lineReader = readline.createInterface({
		input: createReadStream(masterlistPath, { encoding: 'utf8' }),
		crlfDelay: Infinity
	});
	const re = /"anilist"\s*:\s*(\d+)/g;
	for await (const line of lineReader) {
		let match = re.exec(line);
		while (match) {
			const value = Number(match[1]);
			if (Number.isInteger(value) && value > 0) ids.add(value);
			match = re.exec(line);
		}
		re.lastIndex = 0;
	}
	return [...ids];
}

/** Build Map<anilistId, annId> from the small github_scripts/masterlist.json. */
async function loadAnilistToAnnIdMap(masterlistPath) {
	try {
		const arr = JSON.parse(await fs.readFile(masterlistPath, 'utf8'));
		if (!Array.isArray(arr)) return new Map();
		const map = new Map();
		for (const entry of arr) {
			const anilistId = entry?.linked_ids?.anilist;
			const annId = entry?.annId;
			if (Number.isInteger(anilistId) && anilistId > 0 && Number.isInteger(annId) && annId > 0) {
				if (!map.has(anilistId)) map.set(anilistId, annId);
			}
		}
		return map;
	} catch (err) {
		console.warn(`[pipeline] Could not load annId map from ${masterlistPath}:`, err?.message || err);
		return new Map();
	}
}

// ============================================================================
// PHASE 1: HARVEST
// ============================================================================

function getRomajiTitles(mediaNode) {
	return mediaNode?.title?.romaji ? [mediaNode.title.romaji] : [];
}
function getEnglishTitles(mediaNode) {
	return mediaNode?.title?.english ? [mediaNode.title.english] : [];
}
function getSynonymTitles(mediaNode) {
	return Array.isArray(mediaNode?.synonyms) ? mediaNode.synonyms.filter(Boolean) : [];
}

async function fetchHarvestBatch(ids, stats) {
	const aliases = ids.map((id, index) => `
		media${index}: Media(id: ${id}) {
			id type
			title { romaji english native }
			synonyms
			relations {
				edges {
					relationType
					node { id type title { romaji english native } synonyms }
				}
			}
		}
	`).join('\n');

	const body = JSON.stringify({ query: `query {\n${aliases}\n}` });

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(PATHS.apiUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body
			});
			const payload = await response.json();

			if (!response.ok) {
				if (response.status === 404 && payload.data) {
					stats.partial404Batches += 1;
				} else if (response.status === 429) {
					stats.rateLimitedBatches += 1;
					if (attempt < 3) {
						const retryAfter = Number(response.headers.get('retry-after') || 0);
						await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 5000);
						continue;
					}
					stats.failedBatches += 1;
					return { dataByAlias: {}, errors: payload.errors || [] };
				} else {
					if (attempt < 3) { await sleep(attempt * 2000); continue; }
					stats.failedBatches += 1;
					return { dataByAlias: payload.data || {}, errors: payload.errors || [] };
				}
			}
			return { dataByAlias: payload.data || {}, errors: payload.errors || [] };
		} catch (err) {
			if (attempt < 3) { await sleep(attempt * 2000); continue; }
			stats.failedBatches += 1;
			return { dataByAlias: {}, errors: [{ message: String(err?.message || err) }] };
		}
	}

	stats.failedBatches += 1;
	return { dataByAlias: {}, errors: [{ message: 'Unknown fetch failure' }] };
}

function normalizeComponentStructure(component, fallbackIndex, anilistToAnnId) {
	const ids = dedupeAndSortNumeric(Array.isArray(component?.anilistIds) ? component.anilistIds : []);
	const memberMap = new Map(
		(Array.isArray(component?.members) ? component.members : [])
			.map((m) => [Number(m?.id), m])
			.filter(([id]) => Number.isInteger(id) && id > 0)
	);
	const members = ids
		.map((id) => memberMap.get(id))
		.filter(Boolean)
		.map((m) => {
			const annId = m.annId ?? anilistToAnnId?.get(Number(m.id));
			const out = {
				id: Number(m.id),
				romaji: m.romaji || null,
				english: m.english || null,
				synonyms: (Array.isArray(m.synonyms) ? m.synonyms : [])
					.map((s) => normalizeApostrophe(s))
					.filter(keepSynonymTitle)
			};
			if (Number.isInteger(annId) && annId > 0) out.annId = annId;
			return out;
		});

	const romaji   = normalizeTitleSet(members.map((m) => m.romaji));
	const english  = normalizeTitleSet(members.map((m) => m.english));
	const synonyms = normalizeTitleSet(members.flatMap((m) => m.synonyms || []));

	return {
		componentId: component?.componentId || `c${fallbackIndex + 1}`,
		seedId:      Number(component?.seedId) || ids[0] || null,
		anilistIds:  ids,
		titles:      { romaji, english, synonyms },
		members
	};
}

/**
 * Merge components, combining any that share IDs (union).
 * When appending new harvest results, components that overlap with existing
 * (e.g. 20678 in both) must be merged into one, not split.
 */
function mergeComponentsDedup(existingComponents, newComponents, anilistToAnnId) {
	const allComponents = [...existingComponents, ...newComponents];
	const parent = new Map();

	function find(id) {
		if (!parent.has(id)) parent.set(id, id);
		if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
		return parent.get(id);
	}
	function union(a, b) {
		parent.set(find(a), find(b));
	}

	const memberById = new Map();
	for (const comp of allComponents) {
		const normalized = normalizeComponentStructure(comp, 0, anilistToAnnId);
		const ids = normalized.anilistIds;
		for (const m of normalized.members) {
			const id = Number(m?.id);
			if (Number.isInteger(id) && id > 0 && !memberById.has(id)) {
				memberById.set(id, m);
			}
		}
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				union(ids[i], ids[j]);
			}
		}
	}

	const rootToIds = new Map();
	for (const id of parent.keys()) {
		const r = find(id);
		if (!rootToIds.has(r)) rootToIds.set(r, []);
		rootToIds.get(r).push(id);
	}

	const merged = [];
	for (const [root, ids] of rootToIds) {
		const idArr = dedupeAndSortNumeric(ids);
		const members = idArr.map((id) => memberById.get(id)).filter(Boolean);
		if (members.length === 0) continue;
		const rebuilt = normalizeComponentStructure(
			{ seedId: idArr[0], anilistIds: idArr, members },
			merged.length,
			anilistToAnnId
		);
		merged.push(rebuilt);
	}

	for (let i = 0; i < merged.length; i++) {
		merged[i].componentId = `c${i + 1}`;
		merged[i].seedId      = merged[i].anilistIds[0] || merged[i].seedId || null;
	}
	return merged;
}

async function filterComponentsByMasterlist(components, masterlistPath, anilistToAnnId) {
	const masterlistIds = new Set(await extractAniListSeedIds(masterlistPath));
	const filtered = [];

	for (const comp of components) {
		const ids        = Array.isArray(comp.anilistIds) ? comp.anilistIds : [];
		const inMasterlist = ids.filter((id) => masterlistIds.has(id));
		if (inMasterlist.length === 0) continue;

		const rawMembers = (Array.isArray(comp.members) ? comp.members : [])
			.filter((m) => masterlistIds.has(Number(m?.id)));
		const members = rawMembers.map((m) => {
			const annId = m.annId ?? anilistToAnnId?.get(Number(m?.id));
			const out   = { ...m };
			if (Number.isInteger(annId) && annId > 0) out.annId = annId;
			return out;
		});

		const romajiSet  = new Set();
		const englishSet = new Set();
		const synonymSet = new Set();
		for (const m of members) {
			if (m.romaji) romajiSet.add(m.romaji);
			if (m.english) englishSet.add(m.english);
			for (const s of Array.isArray(m.synonyms) ? m.synonyms : []) {
				if (keepSynonymTitle(s)) synonymSet.add(s);
			}
		}

		filtered.push({
			...comp,
			anilistIds: dedupeAndSortNumeric(inMasterlist),
			titles: {
				romaji:   normalizeTitleSet([...romajiSet]),
				english:  normalizeTitleSet([...englishSet]),
				synonyms: normalizeTitleSet([...synonymSet])
			},
			members
		});
	}
	return filtered;
}

function validateComponents(components) {
	const seen = new Set();
	let duplicateIds = 0, totalMemberEntries = 0, uniqueMemberCount = 0;
	for (const component of components) {
		const ids = Array.isArray(component.anilistIds) ? component.anilistIds : [];
		totalMemberEntries += ids.length;
		for (const id of ids) {
			if (seen.has(id)) duplicateIds++;
			else { seen.add(id); uniqueMemberCount++; }
		}
	}
	return { totalMemberEntries, uniqueMemberCount, duplicateIds };
}

function buildComponentFromActive(active, componentId) {
	const anilistIds = dedupeAndSortNumeric([...active.memberIdsSet]);
	const members    = anilistIds.map((id) => active.memberMap.get(id)).filter(Boolean);
	const romaji     = normalizeTitleSet([...active.romajiTitlesSet]);
	const english    = normalizeTitleSet([...active.englishTitlesSet]);
	const synonyms   = normalizeTitleSet([...active.synonymTitlesSet].filter(keepSynonymTitle));
	return {
		componentId,
		seedId: active.seedId,
		anilistIds,
		titles: { romaji, english, synonyms },
		members
	};
}

function toSerializableActiveComponent(active) {
	if (!active) return null;
	return {
		seedId:       active.seedId,
		queue:        active.queue,
		queueIndex:   active.queueIndex,
		memberIds:    [...active.memberIdsSet],
		localVisited: [...active.localVisitedSet],
		romajiTitles: [...active.romajiTitlesSet],
		englishTitles:[...active.englishTitlesSet],
		synonymTitles:[...active.synonymTitlesSet],
		memberMap:    Object.fromEntries(active.memberMap.entries())
	};
}

function restoreActiveComponent(serialized) {
	if (!serialized) return null;
	const legacyTitles = Array.isArray(serialized.titles) ? serialized.titles : [];
	const legacyRE     = Array.isArray(serialized.romajiEnglishTitles) ? serialized.romajiEnglishTitles : [];
	const romajiTitles  = Array.isArray(serialized.romajiTitles)  ? serialized.romajiTitles  : (legacyRE.length > 0 ? legacyRE : legacyTitles);
	const englishTitles = Array.isArray(serialized.englishTitles) ? serialized.englishTitles : (legacyRE.length > 0 ? legacyRE : []);
	const synonymTitles = Array.isArray(serialized.synonymTitles) ? serialized.synonymTitles : [];
	return {
		seedId:         serialized.seedId,
		queue:          Array.isArray(serialized.queue) ? serialized.queue : [],
		queueIndex:     Number.isInteger(serialized.queueIndex) ? serialized.queueIndex : 0,
		memberIdsSet:   new Set(Array.isArray(serialized.memberIds) ? serialized.memberIds : []),
		localVisitedSet:new Set(Array.isArray(serialized.localVisited) ? serialized.localVisited : []),
		romajiTitlesSet:new Set(romajiTitles),
		englishTitlesSet:new Set(englishTitles),
		synonymTitlesSet:new Set(synonymTitles),
		memberMap:      new Map(Object.entries(serialized.memberMap || {}).map(([id, item]) => [Number(id), item]))
	};
}

async function saveHarvestCheckpoint(state, opts, anilistToAnnId, baseComponents) {
	const checkpoint = {
		version: 1,
		updatedAt: new Date().toISOString(),
		runConfig: { batchSize: opts.batchSize, delayMs: opts.delayMs, checkpointInterval: opts.checkpointInterval, limit: opts.limit ?? null },
		seeds: state.seeds,
		nextSeedIndex: state.nextSeedIndex,
		globalVisited: [...state.globalVisited],
		components: state.components,
		activeComponent: toSerializableActiveComponent(state.activeComponent),
		stats: state.stats
	};
	if (!opts.dryRun) await writeJsonFile(PATHS.checkpoint, checkpoint);

	if (state.components.length > 0) {
		const filtered = await filterComponentsByMasterlist(state.components, PATHS.masterlist, anilistToAnnId);
		const toWrite  = opts.missingOnly
			? mergeComponentsDedup(baseComponents || [], filtered, anilistToAnnId)
			: filtered;
		if (!opts.dryRun) {
			await writeJsonFile(PATHS.components, {
				createdAt: checkpoint.updatedAt,
				componentCount: toWrite.length,
				components: toWrite
			});
		}
	}
}

async function runHarvest(opts) {
	console.log('[harvest] Starting AniList franchise harvest');
	console.log(`[harvest] Mode: ${opts.debugId ? `debug id=${opts.debugId}` : opts.missingOnly ? 'missing-only (append)' : 'full'}`);
	console.log(`[harvest] Options: resume=${opts.resume}, limit=${opts.limit ?? 'none'}, batchSize=${opts.batchSize}, delayMs=${opts.delayMs}`);

	await fs.mkdir(PATHS.outputDir, { recursive: true });

	const anilistToAnnId = await loadAnilistToAnnIdMap(PATHS.annIdMasterlist);
	console.log(`[harvest] Loaded annId map: ${anilistToAnnId.size} AniList IDs`);

	let state = {
		seeds: [],
		nextSeedIndex: 0,
		globalVisited: new Set(),
		components: [],
		baseComponents: [],
		activeComponent: null,
		stats: {
			seedCount: 0, requestBatches: 0, failedBatches: 0, partial404Batches: 0,
			rateLimitedBatches: 0, missingMediaEntries: 0, graphQlErrorItems: 0,
			skippedSeedsAlreadyVisited: 0, discoveredRelationIds: 0,
			skippedNonAnimeRelations: 0, skippedExcludedRelationTypes: 0, fallbackSingleFetchBatches: 0
		}
	};
	const runErrors = [];
	let fetchSuccessCount = 0;
	let fetchFailCount    = 0;

	let extractedSeeds = [];
	if (opts.missingOnly) {
		console.log('[harvest] Missing mode: extracting AniList IDs from masterlist...');
		const requestedIds  = dedupeAndSortNumeric(await extractAniListSeedIds(PATHS.masterlist));
		state.baseComponents = await readComponentsIfExists(PATHS.components);
		const existingIds   = new Set(
			state.baseComponents.flatMap((c) => Array.isArray(c?.anilistIds) ? c.anilistIds : [])
		);
		state.seeds         = requestedIds.filter((id) => !existingIds.has(id));
		state.globalVisited = new Set(existingIds);
		extractedSeeds      = requestedIds;
		console.log(`[harvest] Missing mode: masterlist=${requestedIds.length}, inComponents=${requestedIds.length - state.seeds.length}, toProcess=${state.seeds.length}`);
	} else if (opts.debugId) {
		state.seeds    = [opts.debugId];
		extractedSeeds = [opts.debugId];
		console.log(`[harvest] Debug mode: running only for AniList ID ${opts.debugId}`);
	} else {
		console.log('[harvest] Extracting AniList IDs from masterlist...');
		extractedSeeds = await extractAniListSeedIds(PATHS.masterlist);
		const baseSeeds = dedupeAndSortNumeric(extractedSeeds);
		state.seeds     = opts.limit ? baseSeeds.slice(0, opts.limit) : baseSeeds;
		console.log(`[harvest] Seeds: ${state.seeds.length} (from ${extractedSeeds.length} unique in masterlist${opts.limit ? `, limit=${opts.limit}` : ''})`);
	}
	state.stats.seedCount = state.seeds.length;

	if (opts.resume && !opts.debugId && !opts.missingOnly) {
		const checkpoint = await readJsonFileIfExists(PATHS.checkpoint);
		if (checkpoint) {
			state.seeds          = Array.isArray(checkpoint.seeds) ? checkpoint.seeds : state.seeds;
			state.nextSeedIndex  = Number.isInteger(checkpoint.nextSeedIndex) ? checkpoint.nextSeedIndex : 0;
			state.globalVisited  = new Set(Array.isArray(checkpoint.globalVisited) ? checkpoint.globalVisited : []);
			state.components     = Array.isArray(checkpoint.components) ? checkpoint.components : [];
			state.activeComponent = restoreActiveComponent(checkpoint.activeComponent);
			state.stats          = { ...state.stats, ...(checkpoint.stats || {}) };
			console.log(`[harvest] Resumed: seedIndex=${state.nextSeedIndex}/${state.seeds.length}, components=${state.components.length}, visited=${state.globalVisited.size}`);
		} else {
			console.log('[harvest] --resume: no checkpoint found, starting fresh');
		}
	}

	const startTimeMs = Date.now();
	let requestsSinceCheckpoint = 0;

	while (state.nextSeedIndex < state.seeds.length || state.activeComponent) {
		if (!state.activeComponent) {
			const seedId = state.seeds[state.nextSeedIndex];
			if (!seedId) break;

			if (state.globalVisited.has(seedId)) {
				state.stats.skippedSeedsAlreadyVisited += 1;
				if (state.stats.skippedSeedsAlreadyVisited <= 3 || state.stats.skippedSeedsAlreadyVisited % 100 === 0) {
					console.log(`[harvest] Skipping seed ${seedId} (already visited)`);
				}
				state.nextSeedIndex += 1;
				continue;
			}

			state.activeComponent = {
				seedId,
				queue: [seedId],
				queueIndex: 0,
				memberIdsSet: new Set(),
				localVisitedSet: new Set(),
				romajiTitlesSet: new Set(),
				englishTitlesSet: new Set(),
				synonymTitlesSet: new Set(),
				memberMap: new Map()
			};
			const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
			console.log(`[harvest] Component ${state.components.length + 1} | seed=${seedId} | seedIndex=${state.nextSeedIndex + 1}/${state.seeds.length} | elapsed=${elapsed}s`);
		}

		const active  = state.activeComponent;
		let batchIds  = [];
		while (batchIds.length < opts.batchSize && active.queueIndex < active.queue.length) {
			const id = active.queue[active.queueIndex++];
			if (!Number.isInteger(id) || id <= 0) continue;
			if (active.localVisitedSet.has(id) || state.globalVisited.has(id)) continue;
			active.localVisitedSet.add(id);
			batchIds.push(id);
		}

		if (batchIds.length === 0) {
			const component = buildComponentFromActive(active, `c${state.components.length + 1}`);
			for (const id of component.anilistIds) state.globalVisited.add(id);
			state.components.push(component);
			const elapsed    = Math.round((Date.now() - startTimeMs) / 1000);
			const firstTitle = component.titles?.romaji?.[0] || component.titles?.english?.[0] || '?';
			console.log(`[harvest]   -> done: ${component.anilistIds.length} IDs (${firstTitle.substring(0, 40)}${firstTitle.length > 40 ? '...' : ''}) | total=${state.components.length} | elapsed=${elapsed}s`);
			state.nextSeedIndex  += 1;
			state.activeComponent = null;
			await saveHarvestCheckpoint(state, opts, anilistToAnnId, state.baseComponents);

			if (state.components.length % 10 === 0) {
				const pct = Math.round((state.nextSeedIndex / state.seeds.length) * 100);
				console.log(`[harvest] --- Progress: ${state.nextSeedIndex}/${state.seeds.length} seeds (${pct}%) | ${state.components.length} components | ${state.globalVisited.size} IDs ---`);
			}
			continue;
		}

		let { dataByAlias, errors } = await fetchHarvestBatch(batchIds, state.stats);
		state.stats.requestBatches += 1;
		requestsSinceCheckpoint    += 1;

		const queueRemaining = active.queue.length - active.queueIndex;
		if (state.stats.requestBatches % 5 === 1 || queueRemaining <= 0) {
			const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
			console.log(`[harvest]   batch #${state.stats.requestBatches} | fetched ${batchIds.length} | queue=${queueRemaining} | members=${active.memberIdsSet.size} | elapsed=${elapsed}s`);
		}

		// If the entire batch returned no data, retry each ID individually.
		if (Object.keys(dataByAlias || {}).length === 0 && batchIds.length > 1) {
			console.log(`[harvest]   Batch empty, retrying ${batchIds.length} IDs individually:`);
			const mergedData   = {};
			const mergedErrors = Array.isArray(errors) ? [...errors] : [];
			for (let i = 0; i < batchIds.length; i++) {
				const id     = batchIds[i];
				const single = await fetchHarvestBatch([id], state.stats);
				state.stats.requestBatches += 1;
				state.stats.fallbackSingleFetchBatches += 1;
				requestsSinceCheckpoint += 1;
				const media  = single.dataByAlias?.media0 ?? null;
				mergedData[`media${i}`] = media;
				const ok     = media && media.id === id && media.type === 'ANIME';
				const title  = media?.title?.romaji || media?.title?.english || null;
				console.log(`[harvest]     ${i + 1}/${batchIds.length} ID ${id} -> ${ok ? `ok (${(title || '?').substring(0, 35)})` : 'fail'}`);
				if (Array.isArray(single.errors) && single.errors.length > 0) mergedErrors.push(...single.errors);
				if (opts.delayMs > 0 && i < batchIds.length - 1) await sleep(opts.delayMs);
			}
			dataByAlias = mergedData;
			errors      = mergedErrors;
		}

		if (Array.isArray(errors) && errors.length > 0) {
			state.stats.graphQlErrorItems += errors.length;
			for (const err of errors) runErrors.push(`Batch ${state.stats.requestBatches}: ${err?.message || 'Unknown'}`);
		}

		for (let i = 0; i < batchIds.length; i++) {
			const expectedId = batchIds[i];
			const media      = dataByAlias?.[`media${i}`];
			const mediaId    = Number(media?.id);
			const titleGuess = media?.title?.romaji || media?.title?.english || '';

			if (!media || !Number.isInteger(mediaId) || mediaId !== expectedId) {
				state.stats.missingMediaEntries += 1;
				fetchFailCount += 1;
				console.log(`${ANSI.red}[harvest] FAIL id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`);
				continue;
			}
			if (media.type !== 'ANIME') {
				state.stats.skippedNonAnimeRelations += 1;
				fetchFailCount += 1;
				console.log(`${ANSI.red}[harvest] FAIL id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''} type=${media.type}${ANSI.reset}`);
				continue;
			}
			fetchSuccessCount += 1;
			console.log(`${ANSI.green}[harvest] OK   id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`);

			const annId  = anilistToAnnId.get(mediaId);
			const member = {
				id:       mediaId,
				romaji:   normalizeApostrophe(media.title?.romaji) || null,
				english:  normalizeApostrophe(media.title?.english) || null,
				synonyms: (Array.isArray(media.synonyms) ? media.synonyms.filter(Boolean) : [])
					.map((s) => normalizeApostrophe(s))
					.filter(keepSynonymTitle)
			};
			if (Number.isInteger(annId) && annId > 0) member.annId = annId;

			active.memberIdsSet.add(mediaId);
			active.memberMap.set(mediaId, member);
			for (const t of getRomajiTitles(media))  active.romajiTitlesSet.add(t);
			for (const t of getEnglishTitles(media))  active.englishTitlesSet.add(t);
			for (const t of getSynonymTitles(media))  active.synonymTitlesSet.add(t);

			for (const edge of media.relations?.edges || []) {
				if (HARVEST_EXCLUDED_RELATIONS.has(edge?.relationType)) {
					state.stats.skippedExcludedRelationTypes += 1;
					continue;
				}
				const node       = edge?.node;
				const relationId = Number(node?.id);
				if (!Number.isInteger(relationId) || relationId <= 0) continue;
				if (node?.type !== 'ANIME') { state.stats.skippedNonAnimeRelations += 1; continue; }

				state.stats.discoveredRelationIds += 1;
				if (!active.localVisitedSet.has(relationId) && !state.globalVisited.has(relationId)) {
					active.queue.push(relationId);
				}
				for (const t of getRomajiTitles(node))  active.romajiTitlesSet.add(t);
				for (const t of getEnglishTitles(node))  active.englishTitlesSet.add(t);
				for (const t of getSynonymTitles(node))  active.synonymTitlesSet.add(t);
			}
		}

		if (requestsSinceCheckpoint >= opts.checkpointInterval) {
			await saveHarvestCheckpoint(state, opts, anilistToAnnId, state.baseComponents);
			requestsSinceCheckpoint = 0;
			const elapsed     = Math.round((Date.now() - startTimeMs) / 1000);
			const activeQueue = state.activeComponent?.queue?.length ?? 0;
			const activeIdx   = state.activeComponent?.queueIndex ?? 0;
			console.log(`[harvest] [CHECKPOINT] seedIndex=${state.nextSeedIndex}/${state.seeds.length} | components=${state.components.length} | activeQueue=${activeQueue - activeIdx} | elapsed=${elapsed}s`);
		}

		if ((state.nextSeedIndex < state.seeds.length || state.activeComponent) && opts.delayMs > 0) {
			await sleep(opts.delayMs);
		}
	}

	console.log('[harvest] Crawl complete. Filtering by masterlist...');
	const filtered = await filterComponentsByMasterlist(state.components, PATHS.masterlist, anilistToAnnId);
	const toWrite  = opts.missingOnly
		? mergeComponentsDedup(state.baseComponents || [], filtered, anilistToAnnId)
		: filtered;
	const dropped  = state.components.length - filtered.length;
	if (dropped > 0) console.log(`[harvest] Masterlist filter: ${state.components.length} -> ${filtered.length} (${dropped} dropped)`);

	const validation  = validateComponents(toWrite);
	const elapsedSecs = Math.round((Date.now() - startTimeMs) / 1000);
	const meta = {
		createdAt: new Date().toISOString(), elapsedSeconds: elapsedSecs,
		config: { limit: opts.limit, batchSize: opts.batchSize, delayMs: opts.delayMs, checkpointInterval: opts.checkpointInterval },
		seeds:   { totalExtracted: extractedSeeds.length, used: state.seeds.length },
		stats:   { ...state.stats, components: toWrite.length, visitedUniqueIds: state.globalVisited.size, fetchSuccess: fetchSuccessCount, fetchFail: fetchFailCount, errorCount: runErrors.length },
		validation
	};
	const report = {
		createdAt: meta.createdAt,
		config: { resume: opts.resume, limit: opts.limit, debugId: opts.debugId, missingOnly: opts.missingOnly, appendMode: opts.missingOnly, batchSize: opts.batchSize, delayMs: opts.delayMs, checkpointInterval: opts.checkpointInterval, excludedRelationTypes: [...HARVEST_EXCLUDED_RELATIONS] },
		oldComponentCount: opts.missingOnly ? (state.baseComponents || []).length : null,
		newComponentCount: toWrite.length,
		fetchStats: { success: fetchSuccessCount, failed: fetchFailCount, graphQlErrors: state.stats.graphQlErrorItems },
		errorCount: runErrors.length, errors: runErrors
	};

	if (!opts.dryRun) {
		await writeJsonFile(PATHS.components, { createdAt: meta.createdAt, componentCount: toWrite.length, components: toWrite });
		await writeJsonFile(PATHS.harvestMeta, meta);
		await writeJsonFile(PATHS.harvestReport, report);
		await saveHarvestCheckpoint(state, opts, anilistToAnnId, state.baseComponents);
	}

	console.log(`[harvest] Done. ${toWrite.length} components | ${state.globalVisited.size} IDs visited | ${validation.duplicateIds} duplicates | ${elapsedSecs}s`);
	if (runErrors.length > 0) console.log(`${ANSI.yellow}[harvest] Completed with ${runErrors.length} errors.${ANSI.reset}`);
	return { componentCount: toWrite.length, errorCount: runErrors.length };
}

// ============================================================================
// PHASE 2: RECLUSTER
// ============================================================================

async function fetchReclusterBatch(ids) {
	const aliases = ids.map((id, index) => `
		media${index}: Media(id: ${id}, type: ANIME) {
			id format
			title { romaji english }
			synonyms
			tags { name }
			relations { edges { relationType node { id type title { romaji english } } } }
		}
	`).join('\n');

	const query = `query {\n${aliases}\n}`;
	for (let attempt = 1; attempt <= 4; attempt++) {
		const response = await fetch(PATHS.apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ query })
		});

		let payload = {};
		try { payload = await response.json(); } catch { /* keep empty */ }

		if (response.status === 429 && attempt < 4) {
			const retryAfter = Number(response.headers.get('retry-after') || 0);
			await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 8000);
			continue;
		}
		return {
			ok: response.ok,
			status: response.status,
			dataByAlias: payload.data || {},
			errors: Array.isArray(payload.errors) ? payload.errors : []
		};
	}
	return { ok: false, status: 429, dataByAlias: {}, errors: [{ message: 'Rate limited' }] };
}

function normalizeText(value) {
	return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function looksLikeCollaborationTitle(value) {
	const t = normalizeText(value);
	if (!t) return false;
	if (/\bvs\.?\b/.test(t) || /\bversus\b/.test(t)) return true;
	if (/\bcrossover\b/.test(t) || /\bcollab\b/.test(t) || /\bcollaboration\b/.test(t)) return true;
	if (/\s[x×]\s/.test(t)) return true;
	return false;
}

function detectCollaborationCandidate(media) {
	const reasons      = [];
	const title        = media?.title?.romaji || media?.title?.english || '';
	const synonyms     = Array.isArray(media?.synonyms) ? media.synonyms : [];
	const tags         = Array.isArray(media?.tags) ? media.tags.map((t) => t?.name).filter(Boolean) : [];
	const relEdges     = Array.isArray(media?.relations?.edges) ? media.relations.edges : [];
	const format       = media?.format || null;

	if (looksLikeCollaborationTitle(title)) reasons.push('title_pattern');
	if (synonyms.some((s) => looksLikeCollaborationTitle(s))) reasons.push('synonym_pattern');
	// Avoid flagging main TV series (e.g. Detective Conan) that have a Crossover tag
	if (format !== 'TV' && tags.some((t) => normalizeText(t) === 'crossover')) reasons.push('tag_crossover');

	const parentIds = new Set(relEdges.filter((e) => e?.relationType === 'PARENT' && e?.node?.type === 'ANIME').map((e) => Number(e.node.id)).filter((id) => Number.isInteger(id) && id > 0));
	const altIds    = new Set(relEdges.filter((e) => e?.relationType === 'ALTERNATIVE' && e?.node?.type === 'ANIME').map((e) => Number(e.node.id)).filter((id) => Number.isInteger(id) && id > 0));
	if (parentIds.size >= 2) reasons.push('multi_parent');
	if (parentIds.size >= 1 && altIds.size >= 1) reasons.push('parent_and_alternative');

	return { isCollab: reasons.length > 0, reasons, title: title || null };
}

function connectedComponents(allIds, adjacency) {
	const visited    = new Set();
	const components = [];
	for (const seed of allIds) {
		if (visited.has(seed)) continue;
		const queue = [seed];
		let idx     = 0;
		const ids   = [];
		visited.add(seed);
		while (idx < queue.length) {
			const cur = queue[idx++];
			ids.push(cur);
			for (const nxt of adjacency.get(cur) || []) {
				if (!visited.has(nxt)) { visited.add(nxt); queue.push(nxt); }
			}
		}
		components.push(dedupeAndSortNumeric(ids));
	}
	return components;
}

function neighborGroupsExcludingNode(collabId, neighbors, adjacency) {
	const neighborSet = new Set(neighbors);
	const ungrouped   = new Set(neighbors);
	const groups      = [];
	for (const start of neighbors) {
		if (!ungrouped.has(start)) continue;
		const queue = [start];
		let idx     = 0;
		const group = [];
		ungrouped.delete(start);
		while (idx < queue.length) {
			const cur = queue[idx++];
			group.push(cur);
			for (const nxt of adjacency.get(cur) || []) {
				if (nxt === collabId || !neighborSet.has(nxt)) continue;
				if (ungrouped.has(nxt)) { ungrouped.delete(nxt); queue.push(nxt); }
			}
		}
		groups.push(group.sort((a, b) => a - b));
	}
	groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
	return groups;
}

function applyCollaborationBridgeCuts(adjacency, collabIds, mediaMeta) {
	const cuts = [];
	for (const collabId of collabIds) {
		const neighbors = [...(adjacency.get(collabId) || [])].filter((id) => id !== collabId);
		if (neighbors.length < 2) continue;
		const groups = neighborGroupsExcludingNode(collabId, neighbors, adjacency);
		if (groups.length < 2) continue;
		const keptSet = new Set(groups[0]);
		const cutIds  = neighbors.filter((id) => !keptSet.has(id)).sort((a, b) => a - b);
		for (const otherId of cutIds) {
			adjacency.get(collabId)?.delete(otherId);
			adjacency.get(otherId)?.delete(collabId);
		}
		const meta = mediaMeta.get(collabId);
		cuts.push({ collabId, title: meta?.title || null, reason: Array.isArray(meta?.reasons) ? meta.reasons : [], keptGroup: groups[0], cutIds });
	}
	return cuts;
}

function buildReclusterOutputComponents(idGroups, memberById) {
	return idGroups
		.map((ids) => ids.filter((id) => memberById.has(id)))
		.filter((ids) => ids.length > 0)
		.map((ids, index) => {
			const members = ids.map((id) => memberById.get(id)).filter(Boolean).map((m) => {
				const out = { id: m.id, romaji: m.romaji || null, english: m.english || null, synonyms: Array.isArray(m.synonyms) ? [...m.synonyms] : [] };
				if (Number.isInteger(m.annId) && m.annId > 0) out.annId = m.annId;
				return out;
			});
			const romaji   = normalizeTitleSet(members.map((m) => m.romaji));
			const english  = normalizeTitleSet(members.map((m) => m.english));
			const synonyms = normalizeTitleSet(members.flatMap((m) => m.synonyms || []));
			return { componentId: `c${index + 1}`, seedId: ids[0], anilistIds: ids, titles: { romaji, english, synonyms }, members };
		});
}

function buildSplitReport(oldComponents, newComponents) {
	const idToNewComp = new Map();
	newComponents.forEach((comp, idx) => { for (const id of comp.anilistIds || []) idToNewComp.set(id, idx); });
	const splitRows = [];
	for (const oldComp of oldComponents) {
		const ids     = Array.isArray(oldComp?.anilistIds) ? oldComp.anilistIds : [];
		const touched = new Set();
		for (const id of ids) { const newIdx = idToNewComp.get(id); if (Number.isInteger(newIdx)) touched.add(newIdx); }
		if (touched.size > 1) {
			splitRows.push({ oldComponentId: oldComp.componentId, oldSeedId: oldComp.seedId, oldSize: ids.length, splitIntoComponents: touched.size, newComponentIds: [...touched].map((i) => newComponents[i].componentId) });
		}
	}
	splitRows.sort((a, b) => b.oldSize - a.oldSize || b.splitIntoComponents - a.splitIntoComponents);
	return splitRows;
}

function countEdges(adjacency) {
	let count = 0;
	for (const [, set] of adjacency) count += set.size;
	return Math.floor(count / 2);
}

async function runRecluster(opts) {
	console.log('[recluster] Loading components file...');
	const raw = await readJsonFileIfExists(PATHS.components);
	const currentComponents = Array.isArray(raw?.components) ? raw.components : [];

	const anilistToAnnId = await loadAnilistToAnnIdMap(PATHS.annIdMasterlist);
	console.log(`[recluster] Loaded annId map: ${anilistToAnnId.size} entries`);

	const allIds = dedupeAndSortNumeric(currentComponents.flatMap((c) => Array.isArray(c?.anilistIds) ? c.anilistIds : []));
	console.log(`[recluster] IDs to process: ${allIds.length}`);
	if (allIds.length === 0) { console.log('[recluster] No IDs found. Skipping.'); return { componentCount: 0, errorCount: 0 }; }

	// Build member index (title/annId lookup)
	const memberById = new Map();
	for (const comp of currentComponents) {
		for (const member of Array.isArray(comp.members) ? comp.members : []) {
			const id = Number(member?.id);
			if (!Number.isInteger(id) || id <= 0 || memberById.has(id)) continue;
			const annId = member?.annId ?? anilistToAnnId?.get(id);
			const m     = { id, romaji: member?.romaji || null, english: member?.english || null, synonyms: Array.isArray(member?.synonyms) ? member.synonyms.filter(Boolean) : [] };
			if (Number.isInteger(annId) && annId > 0) m.annId = annId;
			memberById.set(id, m);
		}
	}

	const adjacency  = new Map(allIds.map((id) => [id, new Set()]));
	const mediaMeta  = new Map();
	const runErrors  = [];
	let fetchSuccessCount = 0, fetchFailCount = 0, fetchGraphQlErrorCount = 0;
	const flaggedCollaborations = [];
	const edgesBefore = countEdges(adjacency);

	console.log(`[recluster] Fetching relations in batches of ${opts.batchSize} (excluded: ${[...RECLUSTER_EXCLUDED_RELATIONS].join(', ')})`);

	for (let i = 0; i < allIds.length; i += opts.batchSize) {
		let batch  = allIds.slice(i, i + opts.batchSize);
		let { ok, status, dataByAlias, errors } = await fetchReclusterBatch(batch);

		if (!ok && batch.length > 1) {
			const errMsg = errors[0]?.message ? ` (${errors[0].message})` : '';
			console.log(`[recluster] Batch HTTP ${status}${errMsg}, retrying individually:`);
			const mergedData   = {};
			const mergedErrors = [...errors];
			for (let k = 0; k < batch.length; k++) {
				const singleId    = batch[k];
				const single      = await fetchReclusterBatch([singleId]);
				const titleGuess  = memberById.get(singleId)?.romaji || memberById.get(singleId)?.english || '';
				const okSingle    = single.ok && single.dataByAlias?.media0?.id === singleId;
				console.log(`[recluster]   ${k + 1}/${batch.length} ID ${singleId} -> ${okSingle ? 'ok' : `fail (${single.status})`}${titleGuess ? ` (${titleGuess.substring(0, 35)})` : ''}`);
				mergedData[`media${k}`] = single.dataByAlias?.media0 ?? null;
				if (Array.isArray(single.errors) && single.errors.length > 0) mergedErrors.push(...single.errors);
				if (opts.delayMs > 0 && k < batch.length - 1) await sleep(opts.delayMs);
			}
			dataByAlias = mergedData; errors = mergedErrors; ok = true;
		}

		if (!ok) runErrors.push(`Batch ${Math.floor(i / opts.batchSize) + 1} HTTP ${status}`);
		if (errors.length > 0) {
			fetchGraphQlErrorCount += errors.length;
			for (const err of errors) runErrors.push(`Batch ${Math.floor(i / opts.batchSize) + 1} GraphQL: ${err?.message || 'Unknown'}`);
		}

		for (let j = 0; j < batch.length; j++) {
			const id         = batch[j];
			const media      = dataByAlias[`media${j}`];
			const titleGuess = memberById.get(id)?.romaji || memberById.get(id)?.english || '';
			if (!media || media.id !== id) {
				fetchFailCount += 1;
				console.log(`${ANSI.red}[recluster] FAIL id=${id}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`);
				continue;
			}
			fetchSuccessCount += 1;
			console.log(`${ANSI.green}[recluster] OK   id=${id}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`);

			const collab   = detectCollaborationCandidate(media);
			const tagNames = Array.isArray(media?.tags) ? media.tags.map((t) => t?.name).filter(Boolean) : [];
			mediaMeta.set(id, { title: collab.title || titleGuess || null, format: media?.format || null, isCollab: collab.isCollab, reasons: collab.reasons, tags: tagNames });
			if (collab.isCollab) flaggedCollaborations.push({ id, title: collab.title || titleGuess || null, format: media?.format || null, reasons: collab.reasons });

			for (const edge of media.relations?.edges || []) {
				if (RECLUSTER_EXCLUDED_RELATIONS.has(edge?.relationType)) continue;
				const node  = edge?.node;
				const relId = Number(node?.id);
				if (!Number.isInteger(relId) || relId <= 0 || node?.type !== 'ANIME') continue;
				// Include bridge IDs (e.g. OVAs with no songs) so they can connect franchises
				if (!adjacency.has(relId)) adjacency.set(relId, new Set());
				adjacency.get(id).add(relId);
				adjacency.get(relId).add(id);
			}
		}

		const processed = Math.min(i + opts.batchSize, allIds.length);
		if (processed % (opts.batchSize * 5) === 0 || processed === allIds.length) {
			console.log(`[recluster] Processed ${processed}/${allIds.length} IDs`);
		}
		if (opts.delayMs > 0 && processed < allIds.length) await sleep(opts.delayMs);
	}

	const collabIds  = flaggedCollaborations.map((c) => c.id);
	console.log(`[recluster] Collaboration candidates flagged: ${collabIds.length}`);
	const bridgeCuts = applyCollaborationBridgeCuts(adjacency, collabIds, mediaMeta);
	if (bridgeCuts.length > 0) console.log(`[recluster] Bridge-cuts applied: ${bridgeCuts.length}`);
	const edgesAfter = countEdges(adjacency);

	// Use all nodes in adjacency (includes bridge IDs) so connectivity is correct
	const allNodes       = [...new Set([...allIds, ...adjacency.keys()])];
	const groups         = connectedComponents(allNodes, adjacency);
	const nextComponents = buildReclusterOutputComponents(groups, memberById);
	const splitRows      = buildSplitReport(currentComponents, nextComponents);

	const report = {
		createdAt: new Date().toISOString(),
		config: { batchSize: opts.batchSize, delayMs: opts.delayMs, excludedRelationTypes: [...RECLUSTER_EXCLUDED_RELATIONS] },
		oldComponentCount: currentComponents.length,
		newComponentCount: nextComponents.length,
		totalIds: allIds.length,
		edgeCounts: { beforeCuts: edgesBefore, afterCuts: edgesAfter, removedByCuts: Math.max(0, edgesBefore - edgesAfter) },
		fetchStats: { success: fetchSuccessCount, failed: fetchFailCount, graphQlErrors: fetchGraphQlErrorCount },
		flaggedCollaborations: { count: flaggedCollaborations.length, samples: flaggedCollaborations.slice(0, 50) },
		bridgeCutsApplied: { count: bridgeCuts.length, samples: bridgeCuts.slice(0, 50) },
		errorCount: runErrors.length, errors: runErrors,
		topLargestSplits: splitRows.slice(0, 25)
	};

	if (!opts.dryRun) {
		await writeJsonFile(PATHS.components, { createdAt: new Date().toISOString(), componentCount: nextComponents.length, components: nextComponents });
		await writeJsonFile(PATHS.reclusterReport, report);
	}

	console.log(`[recluster] Done. Components: ${currentComponents.length} -> ${nextComponents.length}`);
	if (runErrors.length > 0) console.log(`${ANSI.yellow}[recluster] Completed with ${runErrors.length} errors. See report.${ANSI.reset}`);
	console.log(`[recluster] Report written (topLargestSplits=${report.topLargestSplits.length})`);
	return { componentCount: nextComponents.length, errorCount: runErrors.length };
}

// ============================================================================
// PHASE 3: ADD SHORTEST ARRAY ITEMS
// ============================================================================

function collectByLang(comp) {
	const romaji  = [];
	const english = [];

	function add(s, lang) {
		const t = typeof s === 'string' ? s.trim() : '';
		if (t && lang === 'romaji')  romaji.push(t);
		if (t && lang === 'english') english.push(t);
	}

	const titles = comp?.titles;
	if (titles) {
		for (const v of titles.romaji   || []) add(v, 'romaji');
		for (const v of titles.english  || []) add(v, 'english');
		for (const v of titles.synonyms || []) add(v, 'english'); // abbreviations like "Pokemon"
	}
	if (Array.isArray(comp?.members)) {
		for (const m of comp.members) {
			if (typeof m?.romaji  === 'string') add(m.romaji,  'romaji');
			if (typeof m?.english === 'string') add(m.english, 'english');
			for (const v of m?.synonyms || []) add(v, 'english');
		}
	}
	return { romaji, english };
}

function addShortestArrayItems(components) {
	const shortest = (arr) => arr.length === 0 ? null : arr.reduce((a, b) => a.length <= b.length ? a : b);
	let emptyCount = 0;
	for (const comp of components) {
		const { romaji, english } = collectByLang(comp);
		comp.shortestArrayItem = { romaji: shortest(romaji), english: shortest(english) };
		if (!comp.shortestArrayItem.romaji && !comp.shortestArrayItem.english) emptyCount++;
	}
	return emptyCount;
}

async function runAddShortestItems(opts) {
	console.log('[shortest] Reading components file...');
	const data = await readJsonFileIfExists(PATHS.components);
	const components = data?.components;
	if (!Array.isArray(components)) throw new Error('[shortest] Expected data.components to be an array');

	const emptyCount = addShortestArrayItems(components);
	data.updatedAt   = new Date().toISOString();

	if (!opts.dryRun) {
		await writeJsonFile(PATHS.components, data);
	}
	console.log(`[shortest] Done. Added shortestArrayItem to ${components.length} components.`);
	if (emptyCount > 0) console.log(`[shortest] (${emptyCount} components had no strings → both null)`);
	return { componentCount: components.length };
}

// ============================================================================
// PHASE 4: COPY TO STATIC
// ============================================================================

function runCopyToStatic(opts) {
	if (!existsSync(PATHS.components)) {
		throw new Error(`[copy] Source not found: ${PATHS.components}`);
	}
	if (PATHS.components === PATHS.staticComponents) {
		console.log('[copy] Components already in static (no copy needed)');
		return;
	}
	if (!opts.dryRun) {
		copyFileSync(PATHS.components, PATHS.staticComponents);
		console.log(`[copy] Copied to ${PATHS.staticComponents}`);
	} else {
		console.log(`[copy] [DRY RUN] Would copy to ${PATHS.staticComponents}`);
	}
}

// ============================================================================
// PHASE 5: AUGMENT WITH annSongIds
// ============================================================================

async function runAugmentWithSongIds(opts) {
	console.log('[augment] Reading masterlist:', PATHS.masterlist);
	const masterlist = JSON.parse(await fs.readFile(PATHS.masterlist, 'utf8'));
	if (!Array.isArray(masterlist)) throw new Error('[augment] Expected masterlist to be an array');

	const annIdToSongIds     = new Map();
	const anilistIdToSongIds = new Map();

	for (const entry of masterlist) {
		const annId     = entry?.annId;
		const annSongId = entry?.annSongId;
		const anilistId = entry?.linked_ids?.anilist;
		if (!Number.isInteger(annSongId) || annSongId <= 0) continue;
		if (Number.isInteger(annId) && annId > 0) {
			if (!annIdToSongIds.has(annId)) annIdToSongIds.set(annId, new Set());
			annIdToSongIds.get(annId).add(annSongId);
		}
		if (Number.isInteger(anilistId) && anilistId > 0) {
			if (!anilistIdToSongIds.has(anilistId)) anilistIdToSongIds.set(anilistId, new Set());
			anilistIdToSongIds.get(anilistId).add(annSongId);
		}
	}
	// Rescue orphan annSongIds (entries with anilist: null) via song fingerprint matching
	const songFingerprintToAnilist = new Map();
	for (const entry of masterlist) {
		const anilistId = entry?.linked_ids?.anilist;
		if (!Number.isInteger(anilistId) || anilistId <= 0) continue;
		if (!entry.songName || !entry.songArtist) continue;
		const key = `${entry.songName}|${entry.songArtist}|${entry.songType || ''}`;
		if (!songFingerprintToAnilist.has(key)) songFingerprintToAnilist.set(key, new Set());
		songFingerprintToAnilist.get(key).add(anilistId);
	}

	let orphanMatched = 0;
	let orphanAmbiguous = 0;
	for (const entry of masterlist) {
		const anilistId = entry?.linked_ids?.anilist;
		const annSongId = entry?.annSongId;
		if (anilistId !== null && anilistId !== undefined) continue;
		if (!Number.isInteger(annSongId) || annSongId <= 0) continue;
		if (!entry.songName || !entry.songArtist) continue;

		const key = `${entry.songName}|${entry.songArtist}|${entry.songType || ''}`;
		const candidates = songFingerprintToAnilist.get(key);
		if (candidates && candidates.size === 1) {
			const matchedAnilistId = [...candidates][0];
			if (!anilistIdToSongIds.has(matchedAnilistId)) anilistIdToSongIds.set(matchedAnilistId, new Set());
			anilistIdToSongIds.get(matchedAnilistId).add(annSongId);
			orphanMatched++;
		} else if (candidates && candidates.size > 1) {
			orphanAmbiguous++;
		}
	}

	console.log(`[augment] Masterlist: ${masterlist.length} entries, ${annIdToSongIds.size} unique annIds, ${anilistIdToSongIds.size} unique anilistIds`);
	console.log(`[augment] Orphan annSongIds rescued via fingerprint: ${orphanMatched} (ambiguous/skipped: ${orphanAmbiguous})`);

	console.log('[augment] Reading components:', PATHS.staticComponents);
	const raw  = await fs.readFile(PATHS.staticComponents, 'utf8');
	const data = JSON.parse(raw);
	const components = data?.components;
	if (!Array.isArray(components)) throw new Error('[augment] Expected data.components to be an array');

	let membersTotal = 0, enrichedByAnnId = 0, enrichedByAnilistId = 0, totalSongIdsAdded = 0;

	for (const comp of components) {
		if (!Array.isArray(comp.members)) continue;
		for (const member of comp.members) {
			membersTotal++;
			delete member.annSongIds;

			let songIds = null, matchedBy = null;
			if (Number.isInteger(member.id) && member.id > 0) {
				songIds = anilistIdToSongIds.get(member.id);
				if (songIds && songIds.size > 0) matchedBy = 'anilistId';
			}
			if (!matchedBy && Number.isInteger(member.annId) && member.annId > 0) {
				songIds = annIdToSongIds.get(member.annId);
				if (songIds && songIds.size > 0) matchedBy = 'annId';
			}
			if (matchedBy && songIds) {
				member.annSongIds = [...songIds].sort((a, b) => a - b);
				totalSongIdsAdded += member.annSongIds.length;
				if (matchedBy === 'annId') enrichedByAnnId++;
				else enrichedByAnilistId++;
			}
		}
	}

	const totalEnriched = enrichedByAnnId + enrichedByAnilistId;
	console.log(`[augment] Components: ${components.length}`);
	console.log(`[augment] Members total: ${membersTotal}, enriched: ${totalEnriched} (${enrichedByAnnId} by annId, ${enrichedByAnilistId} by anilistId)`);
	console.log(`[augment] Total annSongIds added: ${totalSongIdsAdded}`);
	console.log(`[augment] Members without songs: ${membersTotal - totalEnriched}`);

	if (!opts.dryRun) {
		data.updatedAt = new Date().toISOString();
		await fs.writeFile(PATHS.staticComponents, JSON.stringify(data, null, 2), 'utf8');
		console.log(`[augment] Written to ${PATHS.staticComponents}`);
	} else {
		console.log('[augment] [DRY RUN] No file written.');
	}
	return { membersTotal, totalEnriched };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	if (opts.help) { printUsage(); process.exit(0); }

	console.log('');
	console.log('========================================');
	console.log('  Franchise Components Pipeline');
	console.log('========================================');
	console.log('');
	console.log(`  Harvest:      ${opts.skipHarvest ? 'skip' : opts.missingOnly ? 'missing-only (append)' : 'full'}`);
	console.log(`  Recluster:    ${opts.skipRecluster ? 'skip' : 'yes'}`);
	console.log(`  Shortest:     yes`);
	console.log(`  Copy/Augment: yes`);
	console.log(`  Dry run:      ${opts.dryRun}`);
	console.log(`  Batch size:   ${opts.batchSize}`);
	console.log(`  Delay ms:     ${opts.delayMs}`);
	console.log('');

	const totalStart = Date.now();
	const results    = {};

	// Phase 1: Harvest
	if (!opts.skipHarvest) {
		console.log('--- Phase 1: Harvest ---');
		results.harvest = await runHarvest(opts);
		console.log('');
	} else {
		console.log('--- Phase 1: Harvest [SKIPPED] ---');
		console.log('');
	}

	// Phase 2: Recluster
	if (!opts.skipRecluster) {
		console.log('--- Phase 2: Recluster ---');
		results.recluster = await runRecluster(opts);
		console.log('');
	} else {
		console.log('--- Phase 2: Recluster [SKIPPED] ---');
		console.log('');
	}

	// Phase 3: Shortest array items
	console.log('--- Phase 3: Add Shortest Array Items ---');
	results.shortest = await runAddShortestItems(opts);
	console.log('');

	// Phase 4: Copy to static
	console.log('--- Phase 4: Copy to Static ---');
	runCopyToStatic(opts);
	console.log('');

	// Phase 5: Augment with annSongIds
	console.log('--- Phase 5: Augment with annSongIds ---');
	results.augment = await runAugmentWithSongIds(opts);
	console.log('');

	const totalSecs = ((Date.now() - totalStart) / 1000).toFixed(1);
	console.log('========================================');
	console.log('  Summary');
	console.log('========================================');
	if (results.harvest)   console.log(`  Harvest components:    ${results.harvest.componentCount} (${results.harvest.errorCount} errors)`);
	if (results.recluster) console.log(`  Recluster components:  ${results.recluster.componentCount} (${results.recluster.errorCount} errors)`);
	if (results.shortest)  console.log(`  Final components:      ${results.shortest.componentCount}`);
	if (results.augment)   console.log(`  Members enriched:      ${results.augment.totalEnriched}/${results.augment.membersTotal}`);
	console.log(`  Total time:            ${totalSecs}s`);
	console.log(`  Dry run:               ${opts.dryRun}`);
	console.log('========================================');
	console.log('');

	if (!opts.dryRun) {
		console.log('[pipeline] Done. Franchise components updated successfully.');
	} else {
		console.log('[pipeline] Dry run complete. No files were written.');
	}
}

main().catch((err) => {
	console.error('[pipeline] Fatal error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
