import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/** Relation types to skip when traversing franchise */
const EXCLUDED_RELATION_TYPES = new Set(['CHARACTER', 'SUMMARY', 'OTHER', 'ALTERNATIVE']);

const DEFAULTS = {
	masterlistPath: path.join(ROOT_DIR, 'src', 'lib', 'server', 'masterlist.json'),
	annIdMasterlistPath: path.join(ROOT_DIR, 'github_scripts', 'masterlist.json'),
	outputDir: path.join(ROOT_DIR, 'github_scripts'),
	componentsPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-components.json'),
	metaPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-meta.json'),
	reportPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-harvest-report.json'),
	checkpointPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-checkpoint.json'),
	apiUrl: 'https://graphql.anilist.co',
	batchSize: 29,
	delayMs: 3250,
	checkpointInterval: 20
};

const ANSI = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m'
};

function parseArgs(argv) {
	const parsed = {
		resume: false,
		limit: null,
		debugId: null,
		missingFromComponents: false,
		batchSize: DEFAULTS.batchSize,
		delayMs: DEFAULTS.delayMs,
		checkpointInterval: DEFAULTS.checkpointInterval
	};

	for (const arg of argv) {
		if (arg === '--resume') parsed.resume = true;
		else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.split('=')[1] || 0);
		else if (arg.startsWith('--debug-id=')) parsed.debugId = Number(arg.split('=')[1] || 0);
		else if (arg === '--missing-from-components') parsed.missingFromComponents = true;
		else if (arg.startsWith('--batch-size=')) parsed.batchSize = Number(arg.split('=')[1] || 0);
		else if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1] || 0);
		else if (arg.startsWith('--checkpoint-interval=')) {
			parsed.checkpointInterval = Number(arg.split('=')[1] || 0);
		}
	}

	if (!Number.isInteger(parsed.batchSize) || parsed.batchSize < 1 || parsed.batchSize > 29) {
		throw new Error('--batch-size must be an integer in range 1..29');
	}

	if (!Number.isInteger(parsed.delayMs) || parsed.delayMs < 0) {
		throw new Error('--delay-ms must be a non-negative integer');
	}

	if (!Number.isInteger(parsed.checkpointInterval) || parsed.checkpointInterval < 1) {
		throw new Error('--checkpoint-interval must be a positive integer');
	}

	if (parsed.limit !== null && (!Number.isInteger(parsed.limit) || parsed.limit < 1)) {
		throw new Error('--limit must be a positive integer');
	}

	if (parsed.debugId !== null && (!Number.isInteger(parsed.debugId) || parsed.debugId < 1)) {
		throw new Error('--debug-id must be a positive integer');
	}

	return parsed;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractAniListSeedIds(masterlistPath) {
	const ids = new Set();
	const lineReader = readline.createInterface({
		input: createReadStream(masterlistPath, { encoding: 'utf8' }),
		crlfDelay: Infinity
	});

	const anilistRegex = /"anilist"\s*:\s*(\d+)/g;

	for await (const line of lineReader) {
		let match = anilistRegex.exec(line);
		while (match) {
			const value = Number(match[1]);
			if (Number.isInteger(value) && value > 0) {
				ids.add(value);
			}
			match = anilistRegex.exec(line);
		}
		anilistRegex.lastIndex = 0;
	}

	return [...ids];
}

/**
 * Build a map of AniList ID -> ANN anime ID from masterlist.json.
 * Uses github_scripts/masterlist.json by default (annId + linked_ids.anilist).
 *
 * @param {string} masterlistPath
 * @returns {Promise<Map<number, number>>}
 */
async function loadAnilistToAnnIdMap(masterlistPath) {
	try {
		const raw = await fs.readFile(masterlistPath, 'utf8');
		const arr = JSON.parse(raw);
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
		console.warn(`[harvest] Could not load annId map from ${masterlistPath}:`, err?.message || err);
		return new Map();
	}
}

function dedupeAndSortNumeric(values) {
	return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

function getRomajiTitles(mediaNode) {
	if (!mediaNode) return [];
	const titles = [];
	if (mediaNode.title?.romaji) titles.push(mediaNode.title.romaji);
	return titles;
}

function getEnglishTitles(mediaNode) {
	if (!mediaNode) return [];
	const titles = [];
	if (mediaNode.title?.english) titles.push(mediaNode.title.english);
	return titles;
}

function getSynonymTitles(mediaNode) {
	if (!mediaNode) return [];
	const titles = [];
	if (Array.isArray(mediaNode.synonyms)) {
		for (const synonym of mediaNode.synonyms) {
			if (synonym) titles.push(synonym);
		}
	}
	return titles;
}

function normalizeApostrophe(str) {
	if (str == null || typeof str !== 'string') return str;
	return str.replace(/[\u2018\u2019\u02BC\u2032]/g, "'");
}

function normalizeTitleSet(titles) {
	return [...new Set(titles.map((x) => normalizeApostrophe(String(x || '').trim())).filter(Boolean))].sort(
		(a, b) => a.localeCompare(b)
	);
}

function hasNonEnglishAlphabetLetters(value) {
	for (const ch of value) {
		if (/\p{L}/u.test(ch) && !/[A-Za-z]/.test(ch)) {
			return true;
		}
	}
	return false;
}

function keepSynonymTitle(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return false;

	// Remove non-English-script titles.
	if (hasNonEnglishAlphabetLetters(normalized)) {
		return false;
	}

	// Remove synonyms longer than 10 characters.
	if (normalized.length > 10) {
		return false;
	}

	return true;
}

async function fetchMediaBatch(ids, apiUrl, stats) {
	const aliases = ids
		.map(
			(id, index) => `
		media${index}: Media(id: ${id}) {
			id
			type
			title {
				romaji
				english
				native
			}
			synonyms
			relations {
				edges {
					relationType
					node {
						id
						type
						title {
							romaji
							english
							native
						}
						synonyms
					}
				}
			}
		}
	`
		)
		.join('\n');

	const query = `query {\n${aliases}\n}`;
	const body = JSON.stringify({ query });

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body
			});

			/** @type {{data?: Record<string, any>, errors?: Array<{status?: number, message?: string}>}} */
			const payload = await response.json();

			if (!response.ok) {
				if (response.status === 404 && payload.data) {
					stats.partial404Batches += 1;
				} else if (response.status === 429) {
					stats.rateLimitedBatches += 1;
					if (attempt < 3) {
						const retryAfterHeader = Number(response.headers.get('retry-after') || 0);
						const backoffMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : attempt * 5000;
						await sleep(backoffMs);
						continue;
					}
					stats.failedBatches += 1;
					return { dataByAlias: {}, errors: payload.errors || [] };
				} else {
					if (attempt < 3) {
						await sleep(attempt * 2000);
						continue;
					}
					stats.failedBatches += 1;
					return { dataByAlias: payload.data || {}, errors: payload.errors || [] };
				}
			}

			return { dataByAlias: payload.data || {}, errors: payload.errors || [] };
		} catch (error) {
			if (attempt < 3) {
				await sleep(attempt * 2000);
				continue;
			}
			stats.failedBatches += 1;
			return { dataByAlias: {}, errors: [{ message: String(error?.message || error) }] };
		}
	}

	stats.failedBatches += 1;
	return { dataByAlias: {}, errors: [{ message: 'Unknown fetch failure' }] };
}

async function writeJsonFile(filePath, value) {
	await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readJsonFileIfExists(filePath) {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async function readComponentsIfExists(filePath) {
	const parsed = await readJsonFileIfExists(filePath);
	if (!parsed || !Array.isArray(parsed.components)) return [];
	return parsed.components;
}

/**
 * @param {any} component
 * @param {number} fallbackIndex
 * @param {Map<number, number>} [anilistToAnnId] - Optional map to fill annId when member lacks it (like recluster)
 */
function normalizeComponentStructure(component, fallbackIndex = 0, anilistToAnnId) {
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

	const romaji = normalizeTitleSet(members.map((m) => m.romaji));
	const english = normalizeTitleSet(members.map((m) => m.english));
	const synonyms = normalizeTitleSet(members.flatMap((m) => m.synonyms || []));

	return {
		componentId: component?.componentId || `c${fallbackIndex + 1}`,
		seedId: Number(component?.seedId) || ids[0] || null,
		anilistIds: ids,
		titles: { romaji, english, synonyms },
		members
	};
}

/**
 * @param {any[]} existingComponents
 * @param {any[]} newComponents
 * @param {Map<number, number>} [anilistToAnnId] - Optional map to fill annId when member lacks it
 */
function mergeComponentsDedup(existingComponents, newComponents, anilistToAnnId) {
	const seenIds = new Set();
	const merged = [];

	for (const comp of [...existingComponents, ...newComponents]) {
		const normalized = normalizeComponentStructure(comp, merged.length, anilistToAnnId);
		const keptIds = normalized.anilistIds.filter((id) => !seenIds.has(id));
		if (keptIds.length === 0) continue;
		for (const id of keptIds) seenIds.add(id);

		const keptMembers = normalized.members.filter((m) => keptIds.includes(Number(m.id)));
		const rebuilt = normalizeComponentStructure(
			{
				seedId: normalized.seedId,
				anilistIds: keptIds,
				members: keptMembers
			},
			merged.length,
			anilistToAnnId
		);
		merged.push(rebuilt);
	}

	for (let i = 0; i < merged.length; i++) {
		merged[i].componentId = `c${i + 1}`;
		merged[i].seedId = merged[i].anilistIds[0] || merged[i].seedId || null;
	}

	return merged;
}

function toSerializableActiveComponent(activeComponent) {
	if (!activeComponent) return null;
	return {
		seedId: activeComponent.seedId,
		queue: activeComponent.queue,
		queueIndex: activeComponent.queueIndex,
		memberIds: [...activeComponent.memberIdsSet],
		localVisited: [...activeComponent.localVisitedSet],
		romajiTitles: [...activeComponent.romajiTitlesSet],
		englishTitles: [...activeComponent.englishTitlesSet],
		synonymTitles: [...activeComponent.synonymTitlesSet],
		memberMap: Object.fromEntries(activeComponent.memberMap.entries())
	};
}

function restoreActiveComponent(serialized) {
	if (!serialized) return null;
	const legacyTitles = Array.isArray(serialized.titles) ? serialized.titles : [];
	const legacyRomajiEnglishTitles = Array.isArray(serialized.romajiEnglishTitles)
		? serialized.romajiEnglishTitles
		: [];
	const romajiTitles = Array.isArray(serialized.romajiTitles)
		? serialized.romajiTitles
		: legacyRomajiEnglishTitles.length > 0
			? legacyRomajiEnglishTitles
			: legacyTitles;
	const englishTitles = Array.isArray(serialized.englishTitles)
		? serialized.englishTitles
		: legacyRomajiEnglishTitles.length > 0
			? legacyRomajiEnglishTitles
			: [];
	const synonymTitles = Array.isArray(serialized.synonymTitles) ? serialized.synonymTitles : [];

	return {
		seedId: serialized.seedId,
		queue: Array.isArray(serialized.queue) ? serialized.queue : [],
		queueIndex: Number.isInteger(serialized.queueIndex) ? serialized.queueIndex : 0,
		memberIdsSet: new Set(Array.isArray(serialized.memberIds) ? serialized.memberIds : []),
		localVisitedSet: new Set(Array.isArray(serialized.localVisited) ? serialized.localVisited : []),
		romajiTitlesSet: new Set(romajiTitles),
		englishTitlesSet: new Set(englishTitles),
		synonymTitlesSet: new Set(synonymTitles),
		memberMap: new Map(Object.entries(serialized.memberMap || {}).map(([id, item]) => [Number(id), item]))
	};
}

async function saveCheckpoint(state, config) {
	const checkpoint = {
		version: 1,
		updatedAt: new Date().toISOString(),
		runConfig: {
			batchSize: config.batchSize,
			delayMs: config.delayMs,
			checkpointInterval: config.checkpointInterval,
			limit: config.limit ?? null
		},
		seeds: state.seeds,
		nextSeedIndex: state.nextSeedIndex,
		globalVisited: [...state.globalVisited],
		components: state.components,
		activeComponent: toSerializableActiveComponent(state.activeComponent),
		stats: state.stats
	};

	await writeJsonFile(config.checkpointPath, checkpoint);

	// Also write components file (filtered by masterlist) to avoid losing progress on error.
	if (state.components.length > 0) {
		const anilistToAnnId = config.anilistToAnnId;
		const componentsFiltered = await filterComponentsByMasterlist(
			state.components,
			config.masterlistPath,
			anilistToAnnId
		);
		const componentsToWrite = config.appendMode
			? mergeComponentsDedup(state.baseComponents || [], componentsFiltered, anilistToAnnId)
			: componentsFiltered;
		await writeJsonFile(config.componentsPath, {
			createdAt: checkpoint.updatedAt,
			componentCount: componentsToWrite.length,
			components: componentsToWrite
		});
	}
}

function buildComponentFromActive(activeComponent, componentId) {
	const anilistIds = dedupeAndSortNumeric([...activeComponent.memberIdsSet]);
	const members = anilistIds.map((id) => activeComponent.memberMap.get(id)).filter(Boolean);
	const romaji = normalizeTitleSet([...activeComponent.romajiTitlesSet]);
	const english = normalizeTitleSet([...activeComponent.englishTitlesSet]);
	const synonyms = normalizeTitleSet([...activeComponent.synonymTitlesSet].filter(keepSynonymTitle));

	return {
		componentId,
		seedId: activeComponent.seedId,
		anilistIds,
		titles: {
			romaji,
			english,
			synonyms
		},
		members
	};
}

/**
 * Filter components to only include anilistIds present in masterlist.json.
 * Removes members and rebuilds titles from remaining members only.
 * Drops components that end up with no anilistIds.
 * Enriches members with annId from anilistToAnnId when missing (like recluster).
 *
 * @param {any[]} components
 * @param {string} masterlistPath
 * @param {Map<number, number>} [anilistToAnnId] - Optional map to fill annId when member lacks it
 * @returns {Promise<any[]>}
 */
async function filterComponentsByMasterlist(components, masterlistPath, anilistToAnnId) {
	const masterlistIds = new Set(await extractAniListSeedIds(masterlistPath));
	const filtered = [];

	for (const comp of components) {
		const ids = Array.isArray(comp.anilistIds) ? comp.anilistIds : [];
		const inMasterlist = ids.filter((id) => masterlistIds.has(id));
		if (inMasterlist.length === 0) continue;

		const rawMembers = (Array.isArray(comp.members) ? comp.members : []).filter((m) =>
			masterlistIds.has(Number(m?.id))
		);
		const members = rawMembers.map((m) => {
			const annId = m.annId ?? anilistToAnnId?.get(Number(m?.id));
			const out = { ...m };
			if (Number.isInteger(annId) && annId > 0) out.annId = annId;
			return out;
		});

		const romajiSet = new Set();
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
				romaji: normalizeTitleSet([...romajiSet]),
				english: normalizeTitleSet([...englishSet]),
				synonyms: normalizeTitleSet([...synonymSet])
			},
			members
		});
	}

	return filtered;
}

function validateComponents(components) {
	const seen = new Set();
	let duplicateIds = 0;
	let totalMemberEntries = 0;
	let uniqueMemberCount = 0;

	for (const component of components) {
		const ids = Array.isArray(component.anilistIds) ? component.anilistIds : [];
		totalMemberEntries += ids.length;
		for (const id of ids) {
			if (seen.has(id)) {
				duplicateIds += 1;
			} else {
				seen.add(id);
				uniqueMemberCount += 1;
			}
		}
	}

	return {
		totalMemberEntries,
		uniqueMemberCount,
		duplicateIds
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const config = {
		...DEFAULTS,
		...args,
		appendMode: Boolean(args.missingFromComponents)
	};

	console.log('[harvest] Starting AniList franchise harvest');
	console.log(
		`[harvest] Options: resume=${config.resume}, limit=${config.limit ?? 'none'}, debugId=${config.debugId ?? 'none'}, missingFromComponents=${config.missingFromComponents}, appendMode=${config.appendMode}, batchSize=${config.batchSize}, delayMs=${config.delayMs}, checkpointInterval=${config.checkpointInterval}`
	);

	await fs.mkdir(config.outputDir, { recursive: true });

	const annIdMasterlistPath =
		config.annIdMasterlistPath || path.join(ROOT_DIR, 'github_scripts', 'masterlist.json');
	const anilistToAnnId = await loadAnilistToAnnIdMap(annIdMasterlistPath);
	config.anilistToAnnId = anilistToAnnId;
	console.log(`[harvest] Loaded annId map: ${anilistToAnnId.size} AniList IDs with ANN anime IDs`);

	/** @type {{
	 *  seeds: number[],
	 *  nextSeedIndex: number,
	 *  globalVisited: Set<number>,
	 *  components: any[],
	 *  activeComponent: any | null,
	 *  stats: Record<string, number>
	 * }} */
	let state = {
		seeds: [],
		nextSeedIndex: 0,
		globalVisited: new Set(),
		components: [],
		baseComponents: [],
		activeComponent: null,
		stats: {
			seedCount: 0,
			requestBatches: 0,
			failedBatches: 0,
			partial404Batches: 0,
			rateLimitedBatches: 0,
			missingMediaEntries: 0,
			graphQlErrorItems: 0,
			skippedSeedsAlreadyVisited: 0,
			discoveredRelationIds: 0,
			skippedNonAnimeRelations: 0,
			skippedExcludedRelationTypes: 0,
			fallbackSingleFetchBatches: 0
		}
	};
	const runErrors = [];
	let fetchSuccessCount = 0;
	let fetchFailCount = 0;

	const startTimeMs = Date.now();
	let extractedSeeds = [];
	if (config.missingFromComponents) {
		console.log('[harvest] Missing mode: extracting AniList IDs from masterlist...');
		const requestedIds = dedupeAndSortNumeric(await extractAniListSeedIds(config.masterlistPath));
		state.baseComponents = await readComponentsIfExists(config.componentsPath);
		const existingIds = new Set(
			state.baseComponents.flatMap((comp) => (Array.isArray(comp?.anilistIds) ? comp.anilistIds : []))
		);
		state.seeds = requestedIds.filter((id) => !existingIds.has(id));
		state.globalVisited = new Set(existingIds);
		extractedSeeds = requestedIds;
		console.log(
			`[harvest] Missing mode: masterlist=${requestedIds.length}, alreadyInComponents=${requestedIds.length - state.seeds.length}, toProcess=${state.seeds.length}`
		);
	} else if (config.debugId) {
		state.seeds = [config.debugId];
		extractedSeeds = [config.debugId];
		console.log(`[harvest] Debug mode: running only for AniList ID ${config.debugId}`);
	} else {
		console.log('[harvest] Extracting AniList IDs from masterlist...');
		extractedSeeds = await extractAniListSeedIds(config.masterlistPath);
		const baseSeeds = dedupeAndSortNumeric(extractedSeeds);
		state.seeds = config.limit ? baseSeeds.slice(0, config.limit) : baseSeeds;
		console.log(
			`[harvest] Seeds ready: ${state.seeds.length} (from ${extractedSeeds.length} unique in masterlist${config.limit ? `, limit=${config.limit}` : ''})`
		);
	}
	state.stats.seedCount = state.seeds.length;

	if (config.resume && !config.debugId && !config.missingFromComponents) {
		const checkpoint = await readJsonFileIfExists(config.checkpointPath);
		if (checkpoint) {
			state.seeds = Array.isArray(checkpoint.seeds) ? checkpoint.seeds : state.seeds;
			state.nextSeedIndex = Number.isInteger(checkpoint.nextSeedIndex) ? checkpoint.nextSeedIndex : 0;
			state.globalVisited = new Set(
				Array.isArray(checkpoint.globalVisited) ? checkpoint.globalVisited : []
			);
			state.components = Array.isArray(checkpoint.components) ? checkpoint.components : [];
			state.activeComponent = restoreActiveComponent(checkpoint.activeComponent);
			state.stats = {
				...state.stats,
				...(checkpoint.stats || {})
			};
			console.log(
				`[harvest] Resumed checkpoint: seedIndex=${state.nextSeedIndex}/${state.seeds.length}, components=${state.components.length}, visited=${state.globalVisited.size}`
			);
		} else {
			console.log('[harvest] --resume requested but no checkpoint found, starting fresh');
		}
	}

	let requestsSinceCheckpoint = 0;

	while (state.nextSeedIndex < state.seeds.length || state.activeComponent) {
		if (!state.activeComponent) {
			const seedId = state.seeds[state.nextSeedIndex];
			if (!seedId) break;

			if (state.globalVisited.has(seedId)) {
				state.stats.skippedSeedsAlreadyVisited += 1;
				if (state.stats.skippedSeedsAlreadyVisited <= 3 || state.stats.skippedSeedsAlreadyVisited % 100 === 0) {
					console.log(
						`[harvest] Skipping seed ${seedId} (already visited) | skipped=${state.stats.skippedSeedsAlreadyVisited}`
					);
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
			console.log(
				`[harvest] Component ${state.components.length + 1} | seed=${seedId} | seedIndex=${state.nextSeedIndex + 1}/${state.seeds.length} | elapsed=${elapsed}s`
			);
		}

		const active = state.activeComponent;
		let batchIds = [];
		while (batchIds.length < config.batchSize && active.queueIndex < active.queue.length) {
			const id = active.queue[active.queueIndex++];
			if (!Number.isInteger(id) || id <= 0) continue;
			if (active.localVisitedSet.has(id)) continue;
			if (state.globalVisited.has(id)) continue;
			active.localVisitedSet.add(id);
			batchIds.push(id);
		}

		if (batchIds.length === 0) {
			const component = buildComponentFromActive(active, `c${state.components.length + 1}`);
			for (const id of component.anilistIds) {
				state.globalVisited.add(id);
			}
			state.components.push(component);
			const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
			const firstTitle = component.titles?.romaji?.[0] || component.titles?.english?.[0] || '?';
			console.log(
				`[harvest]   -> done: ${component.anilistIds.length} IDs (${firstTitle.substring(0, 40)}${firstTitle.length > 40 ? '...' : ''}) | total components=${state.components.length} | elapsed=${elapsed}s`
			);
			state.nextSeedIndex += 1;
			state.activeComponent = null;
			await saveCheckpoint(state, config);

			if (state.components.length % 10 === 0 && state.components.length > 0) {
				const pct = Math.round((state.nextSeedIndex / state.seeds.length) * 100);
				console.log(
					`[harvest] --- Progress: ${state.nextSeedIndex}/${state.seeds.length} seeds (${pct}%) | ${state.components.length} components | ${state.globalVisited.size} IDs visited ---`
				);
			}
			continue;
		}

		let { dataByAlias, errors } = await fetchMediaBatch(batchIds, config.apiUrl, state.stats);
		state.stats.requestBatches += 1;
		requestsSinceCheckpoint += 1;
		const queueRemaining = active.queue.length - active.queueIndex;
		if (state.stats.requestBatches % 5 === 1 || queueRemaining <= 0) {
			const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
			console.log(
				`[harvest]   batch #${state.stats.requestBatches} | fetched ${batchIds.length} | queue=${queueRemaining} | members=${active.memberIdsSet.size} | elapsed=${elapsed}s`
			);
		}

		// If an entire mixed batch fails to yield data, retry each ID individually.
		// This prevents one problematic ID from masking valid anime in the same batch.
		if (Object.keys(dataByAlias || {}).length === 0 && batchIds.length > 1) {
			console.log(
				`[harvest]   Batch empty (batch returned no data), retrying ${batchIds.length} IDs one-by-one:`
			);
			const mergedData = {};
			const mergedErrors = Array.isArray(errors) ? [...errors] : [];

			for (let i = 0; i < batchIds.length; i++) {
				const id = batchIds[i];
				const single = await fetchMediaBatch([id], config.apiUrl, state.stats);
				state.stats.requestBatches += 1;
				state.stats.fallbackSingleFetchBatches += 1;
				requestsSinceCheckpoint += 1;
				const media = single.dataByAlias?.media0 ?? null;
				mergedData[`media${i}`] = media;

				const ok = media && media.id === id && media.type === 'ANIME';
				const title = media?.title?.romaji || media?.title?.english || null;
				const status = ok ? `ok (${(title || '?').substring(0, 35)}${(title || '').length > 35 ? '...' : ''})` : 'fail';
				console.log(
					`[harvest]     ${i + 1}/${batchIds.length} ID ${id} -> ${status}`
				);

				if (Array.isArray(single.errors) && single.errors.length > 0) {
					mergedErrors.push(...single.errors);
				}
				if (config.delayMs > 0 && i < batchIds.length - 1) {
					await sleep(config.delayMs);
				}
			}

			const okCount = Object.values(mergedData).filter((m) => m && m.type === 'ANIME').length;
			console.log(
				`[harvest]   Individual retry done: ${okCount}/${batchIds.length} succeeded`
			);

			dataByAlias = mergedData;
			errors = mergedErrors;
		}

		if (Array.isArray(errors) && errors.length > 0) {
			state.stats.graphQlErrorItems += errors.length;
			for (const err of errors) {
				runErrors.push(`Batch ${state.stats.requestBatches}: ${err?.message || 'Unknown GraphQL error'}`);
			}
		}

		for (let i = 0; i < batchIds.length; i++) {
			const expectedId = batchIds[i];
			const media = dataByAlias?.[`media${i}`];
			const mediaId = Number(media?.id);
			const titleGuess = media?.title?.romaji || media?.title?.english || '';

			if (!media || !Number.isInteger(mediaId) || mediaId !== expectedId) {
				state.stats.missingMediaEntries += 1;
				fetchFailCount += 1;
				console.log(
					`${ANSI.red}[harvest] FAIL id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`
				);
				continue;
			}

			if (media.type !== 'ANIME') {
				state.stats.skippedNonAnimeRelations += 1;
				fetchFailCount += 1;
				console.log(
					`${ANSI.red}[harvest] FAIL id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''} type=${media.type}${ANSI.reset}`
				);
				continue;
			}
			fetchSuccessCount += 1;
			console.log(
				`${ANSI.green}[harvest] OK   id=${expectedId}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`
			);

			const annId = anilistToAnnId.get(mediaId);
			const member = {
				id: mediaId,
				romaji: normalizeApostrophe(media.title?.romaji) || null,
				english: normalizeApostrophe(media.title?.english) || null,
				synonyms: (Array.isArray(media.synonyms) ? media.synonyms.filter(Boolean) : [])
					.map((s) => normalizeApostrophe(s))
					.filter(keepSynonymTitle)
			};
			if (Number.isInteger(annId) && annId > 0) member.annId = annId;

			active.memberIdsSet.add(mediaId);
			active.memberMap.set(mediaId, member);
			for (const title of getRomajiTitles(media)) {
				active.romajiTitlesSet.add(title);
			}
			for (const title of getEnglishTitles(media)) {
				active.englishTitlesSet.add(title);
			}
			for (const title of getSynonymTitles(media)) {
				active.synonymTitlesSet.add(title);
			}

			const edges = media.relations?.edges || [];
			for (const edge of edges) {
				const relationType = edge?.relationType;
				if (relationType && EXCLUDED_RELATION_TYPES.has(relationType)) {
					state.stats.skippedExcludedRelationTypes += 1;
					continue;
				}

				const relationNode = edge?.node;
				const relationId = Number(relationNode?.id);
				if (!Number.isInteger(relationId) || relationId <= 0) continue;
				if (relationNode?.type !== 'ANIME') {
					state.stats.skippedNonAnimeRelations += 1;
					continue;
				}

				state.stats.discoveredRelationIds += 1;
				if (!active.localVisitedSet.has(relationId) && !state.globalVisited.has(relationId)) {
					active.queue.push(relationId);
				}

				for (const title of getRomajiTitles(relationNode)) {
					active.romajiTitlesSet.add(title);
				}
				for (const title of getEnglishTitles(relationNode)) {
					active.englishTitlesSet.add(title);
				}
				for (const title of getSynonymTitles(relationNode)) {
					active.synonymTitlesSet.add(title);
				}
			}
		}

		if (requestsSinceCheckpoint >= config.checkpointInterval) {
			await saveCheckpoint(state, config);
			requestsSinceCheckpoint = 0;
			const elapsed = Math.round((Date.now() - startTimeMs) / 1000);
			const activeQueue = state.activeComponent?.queue?.length ?? 0;
			const activeQueueIdx = state.activeComponent?.queueIndex ?? 0;
			console.log(
				`[harvest] [CHECKPOINT] seedIndex=${state.nextSeedIndex}/${state.seeds.length} | components=${state.components.length} | visited=${state.globalVisited.size} | activeQueue=${activeQueue - activeQueueIdx} | elapsed=${elapsed}s`
			);
		}

		const hasMoreWork = state.nextSeedIndex < state.seeds.length || state.activeComponent;
		if (hasMoreWork && config.delayMs > 0) {
			await sleep(config.delayMs);
		}
	}

	console.log('[harvest] Crawl complete. Filtering components by masterlist...');
	const componentsFiltered = await filterComponentsByMasterlist(
		state.components,
		config.masterlistPath,
		config.anilistToAnnId
	);
	const componentsToWrite = config.appendMode
		? mergeComponentsDedup(state.baseComponents || [], componentsFiltered, config.anilistToAnnId)
		: componentsFiltered;
	const droppedByFilter = state.components.length - componentsFiltered.length;
	if (droppedByFilter > 0) {
		console.log(
			`[harvest] Masterlist filter: ${state.components.length} -> ${componentsFiltered.length} components (${droppedByFilter} dropped, IDs not in masterlist)`
		);
	}
	const validation = validateComponents(componentsToWrite);
	const elapsedSeconds = Math.round((Date.now() - startTimeMs) / 1000);
	const meta = {
		createdAt: new Date().toISOString(),
		elapsedSeconds,
		config: {
			limit: config.limit,
			batchSize: config.batchSize,
			delayMs: config.delayMs,
			checkpointInterval: config.checkpointInterval
		},
		seeds: {
			totalExtracted: extractedSeeds.length,
			used: state.seeds.length
		},
		stats: {
			...state.stats,
			components: componentsToWrite.length,
			visitedUniqueIds: state.globalVisited.size,
			fetchSuccess: fetchSuccessCount,
			fetchFail: fetchFailCount,
			errorCount: runErrors.length
		},
		validation
	};
	const report = {
		createdAt: meta.createdAt,
		config: {
			resume: config.resume,
			limit: config.limit,
			debugId: config.debugId,
			missingFromComponents: config.missingFromComponents,
			appendMode: config.appendMode,
			batchSize: config.batchSize,
			delayMs: config.delayMs,
			checkpointInterval: config.checkpointInterval,
			excludedRelationTypes: [...EXCLUDED_RELATION_TYPES]
		},
		oldComponentCount: config.appendMode ? (state.baseComponents || []).length : null,
		newComponentCount: componentsToWrite.length,
		fetchStats: {
			success: fetchSuccessCount,
			failed: fetchFailCount,
			graphQlErrors: state.stats.graphQlErrorItems
		},
		errorCount: runErrors.length,
		errors: runErrors
	};

	await writeJsonFile(config.componentsPath, {
		createdAt: meta.createdAt,
		componentCount: componentsToWrite.length,
		components: componentsToWrite
	});
	await writeJsonFile(config.metaPath, meta);
	await writeJsonFile(config.reportPath, report);
	await saveCheckpoint(state, config);

	console.log('[harvest] Done');
	console.log(
		`[harvest] Output: components=${config.componentsPath}, meta=${config.metaPath}, checkpoint=${config.checkpointPath}`
	);
	const totalElapsed = Math.round((Date.now() - startTimeMs) / 1000);
	console.log(
		`[harvest] Summary: ${componentsToWrite.length} components | ${state.globalVisited.size} IDs visited | ${validation.duplicateIds} duplicates | ${totalElapsed}s total`
	);
	console.log(
		`[harvest] Stats: batches=${state.stats.requestBatches} | failed=${state.stats.failedBatches} | missing=${state.stats.missingMediaEntries} | relations=${state.stats.discoveredRelationIds} | skippedExcludedTypes=${state.stats.skippedExcludedRelationTypes}`
	);
	if (runErrors.length > 0) {
		console.log(
			`${ANSI.yellow}[harvest] Completed with ${runErrors.length} encountered errors. See ${config.reportPath}${ANSI.reset}`
		);
	} else {
		console.log('[harvest] Completed without fetch errors.');
	}
}

main().catch((error) => {
	console.error('[harvest] Fatal error:', error);
	process.exit(1);
});
