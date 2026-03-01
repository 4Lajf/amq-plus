import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EXCLUDED_RELATION_TYPES = new Set(['CHARACTER', 'OTHER', 'SUMMARY']);

const DEFAULTS = {
	componentsPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-components.json'),
	annIdMasterlistPath: path.join(ROOT_DIR, 'github_scripts', 'masterlist.json'),
	reportPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-recluster-report.json'),
	apiUrl: 'https://graphql.anilist.co',
	batchSize: 29,
	delayMs: 3250
};

const ANSI = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m'
};

function parseArgs(argv) {
	const parsed = {
		batchSize: DEFAULTS.batchSize,
		delayMs: DEFAULTS.delayMs
	};

	for (const arg of argv) {
		if (arg.startsWith('--batch-size=')) parsed.batchSize = Number(arg.split('=')[1] || 0);
		else if (arg.startsWith('--delay-ms=')) parsed.delayMs = Number(arg.split('=')[1] || 0);
	}

	if (!Number.isInteger(parsed.batchSize) || parsed.batchSize < 1 || parsed.batchSize > 29) {
		throw new Error('--batch-size must be an integer in range 1..29');
	}
	if (!Number.isInteger(parsed.delayMs) || parsed.delayMs < 0) {
		throw new Error('--delay-ms must be a non-negative integer');
	}

	return parsed;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeAndSortNumeric(values) {
	return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

function normalizeTitleSet(titles) {
	return [...new Set(titles.map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) =>
		a.localeCompare(b)
	);
}

async function readComponents(pathToFile) {
	const raw = await fs.readFile(pathToFile, 'utf8');
	const parsed = JSON.parse(raw);
	return Array.isArray(parsed?.components) ? parsed : { createdAt: new Date().toISOString(), components: [] };
}

/**
 * Build a map of AniList ID -> ANN anime ID from masterlist.json.
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
		console.warn(`[recluster] Could not load annId map from ${masterlistPath}:`, err?.message || err);
		return new Map();
	}
}

function buildMemberIndex(components, anilistToAnnId) {
	const memberById = new Map();
	for (const comp of components) {
		for (const member of Array.isArray(comp.members) ? comp.members : []) {
			const id = Number(member?.id);
			if (!Number.isInteger(id) || id <= 0) continue;
			if (!memberById.has(id)) {
				const annId = member?.annId ?? anilistToAnnId?.get(id);
				const m = {
					id,
					romaji: member?.romaji || null,
					english: member?.english || null,
					synonyms: Array.isArray(member?.synonyms) ? member.synonyms.filter(Boolean) : []
				};
				if (Number.isInteger(annId) && annId > 0) m.annId = annId;
				memberById.set(id, m);
			}
		}
	}
	return memberById;
}

async function fetchRelationBatch(ids, apiUrl) {
	const aliases = ids
		.map(
			(id, index) => `
		media${index}: Media(id: ${id}, type: ANIME) {
			id
			format
			title { romaji english }
			synonyms
			tags { name }
			relations {
				edges {
					relationType
					node {
						id
						type
						title { romaji english }
					}
				}
			}
		}
	`
		)
		.join('\n');

	const query = `query {\n${aliases}\n}`;
	for (let attempt = 1; attempt <= 4; attempt++) {
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ query })
		});

		/** @type {{data?: Record<string, any>, errors?: Array<{message?: string, status?: number}>}} */
		let payload = {};
		try {
			payload = await response.json();
		} catch {
			// keep payload empty
		}

		if (response.status === 429 && attempt < 4) {
			const retryAfterHeader = Number(response.headers.get('retry-after') || 0);
			const backoffMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : attempt * 8000;
			await sleep(backoffMs);
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
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function looksLikeCollaborationTitle(value) {
	const t = normalizeText(value);
	if (!t) return false;

	// Common collab patterns: "A vs B", "A x B", "Crossover", etc.
	if (/\bvs\.?\b/.test(t)) return true;
	if (/\bversus\b/.test(t)) return true;
	if (/\bcrossover\b/.test(t)) return true;
	if (/\bcollab\b/.test(t) || /\bcollaboration\b/.test(t)) return true;

	// Only treat " x " as collab when it's clearly a separator, not part of a word.
	if (/\s[x×]\s/.test(t)) return true;

	return false;
}

function detectCollaborationCandidate(media) {
	/** @type {string[]} */
	const reasons = [];

	const title = media?.title?.romaji || media?.title?.english || '';
	const synonyms = Array.isArray(media?.synonyms) ? media.synonyms : [];
	const tags = Array.isArray(media?.tags) ? media.tags.map((t) => t?.name).filter(Boolean) : [];
	const relEdges = Array.isArray(media?.relations?.edges) ? media.relations.edges : [];
	const format = media?.format || null;

	if (looksLikeCollaborationTitle(title)) reasons.push('title_pattern');
	for (const syn of synonyms) {
		if (looksLikeCollaborationTitle(syn)) {
			reasons.push('synonym_pattern');
			break;
		}
	}
	// AniList sometimes tags the *main TV* as Crossover (e.g. Detective Conan),
	// which would incorrectly split the whole franchise. Only apply this signal
	// to non-TV formats. (TV_SHORT is allowed to still be flagged.)
	if (format !== 'TV' && tags.some((t) => normalizeText(t) === 'crossover')) {
		reasons.push('tag_crossover');
	}

	// Structural signals: collaboration/crossover OVAs/movies often have multiple parents,
	// or a parent franchise plus alternative links to another franchise.
	const parentAnimeIds = new Set(
		relEdges
			.filter((e) => e?.relationType === 'PARENT' && e?.node?.type === 'ANIME')
			.map((e) => Number(e.node.id))
			.filter((id) => Number.isInteger(id) && id > 0)
	);
	const alternativeAnimeIds = new Set(
		relEdges
			.filter((e) => e?.relationType === 'ALTERNATIVE' && e?.node?.type === 'ANIME')
			.map((e) => Number(e.node.id))
			.filter((id) => Number.isInteger(id) && id > 0)
	);
	if (parentAnimeIds.size >= 2) reasons.push('multi_parent');
	if (parentAnimeIds.size >= 1 && alternativeAnimeIds.size >= 1) reasons.push('parent_and_alternative');

	return {
		isCollab: reasons.length > 0,
		reasons,
		title: title || null
	};
}

function connectedComponents(allIds, adjacency) {
	const visited = new Set();
	const components = [];

	for (const seed of allIds) {
		if (visited.has(seed)) continue;
		const queue = [seed];
		let idx = 0;
		const ids = [];
		visited.add(seed);

		while (idx < queue.length) {
			const cur = queue[idx++];
			ids.push(cur);
			for (const nxt of adjacency.get(cur) || []) {
				if (!visited.has(nxt)) {
					visited.add(nxt);
					queue.push(nxt);
				}
			}
		}

		components.push(dedupeAndSortNumeric(ids));
	}

	return components;
}

function neighborGroupsExcludingNode(collabId, neighbors, adjacency) {
	const neighborSet = new Set(neighbors);
	const ungrouped = new Set(neighbors);
	const groups = [];

	for (const start of neighbors) {
		if (!ungrouped.has(start)) continue;
		const queue = [start];
		let idx = 0;
		const group = [];
		ungrouped.delete(start);

		while (idx < queue.length) {
			const cur = queue[idx++];
			group.push(cur);
			for (const nxt of adjacency.get(cur) || []) {
				if (nxt === collabId) continue;
				if (!neighborSet.has(nxt)) continue; // keep it local to neighbor set
				if (ungrouped.has(nxt)) {
					ungrouped.delete(nxt);
					queue.push(nxt);
				}
			}
		}

		groups.push(group.sort((a, b) => a - b));
	}

	groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
	return groups;
}

function applyCollaborationBridgeCuts(adjacency, collabIds, mediaMeta) {
	/** @type {Array<{collabId:number,keptGroup:number[],cutIds:number[],reason:string[],title:string|null}>} */
	const cuts = [];

	for (const collabId of collabIds) {
		const neighbors = [...(adjacency.get(collabId) || [])].filter((id) => id !== collabId);
		if (neighbors.length < 2) continue;

		const groups = neighborGroupsExcludingNode(collabId, neighbors, adjacency);
		if (groups.length < 2) continue; // not a bridge

		const keptGroup = groups[0];
		const keptSet = new Set(keptGroup);
		const cutIds = neighbors.filter((id) => !keptSet.has(id)).sort((a, b) => a - b);

		for (const otherId of cutIds) {
			adjacency.get(collabId)?.delete(otherId);
			adjacency.get(otherId)?.delete(collabId);
		}

		const meta = mediaMeta.get(collabId);
		cuts.push({
			collabId,
			title: meta?.title || null,
			reason: Array.isArray(meta?.reasons) ? meta.reasons : [],
			keptGroup,
			cutIds
		});
	}

	return cuts;
}

function buildOutputComponents(idGroups, memberById) {
	return idGroups.map((ids, index) => {
		const members = ids
			.map((id) => memberById.get(id))
			.filter(Boolean)
			.map((m) => {
				const out = {
					id: m.id,
					romaji: m.romaji || null,
					english: m.english || null,
					synonyms: Array.isArray(m.synonyms) ? [...m.synonyms] : []
				};
				if (Number.isInteger(m.annId) && m.annId > 0) out.annId = m.annId;
				return out;
			});

		const romaji = normalizeTitleSet(members.map((m) => m.romaji));
		const english = normalizeTitleSet(members.map((m) => m.english));
		const synonyms = normalizeTitleSet(members.flatMap((m) => m.synonyms || []));

		return {
			componentId: `c${index + 1}`,
			seedId: ids[0],
			anilistIds: ids,
			titles: { romaji, english, synonyms },
			members
		};
	});
}

function buildSplitReport(oldComponents, newComponents) {
	const idToNewComponent = new Map();
	newComponents.forEach((comp, idx) => {
		for (const id of comp.anilistIds || []) {
			idToNewComponent.set(id, idx);
		}
	});

	const splitRows = [];
	for (const oldComp of oldComponents) {
		const ids = Array.isArray(oldComp?.anilistIds) ? oldComp.anilistIds : [];
		const touched = new Set();
		for (const id of ids) {
			const newIdx = idToNewComponent.get(id);
			if (Number.isInteger(newIdx)) touched.add(newIdx);
		}
		if (touched.size > 1) {
			splitRows.push({
				oldComponentId: oldComp.componentId,
				oldSeedId: oldComp.seedId,
				oldSize: ids.length,
				splitIntoComponents: touched.size,
				newComponentIds: [...touched].map((i) => newComponents[i].componentId)
			});
		}
	}

	splitRows.sort((a, b) => b.oldSize - a.oldSize || b.splitIntoComponents - a.splitIntoComponents);
	return splitRows;
}

function countEdges(adjacency) {
	let edgeCount = 0;
	for (const [, set] of adjacency) {
		edgeCount += set.size;
	}
	return Math.floor(edgeCount / 2);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const config = { ...DEFAULTS, ...args };

	console.log('[recluster] Loading components file...');
	const data = await readComponents(config.componentsPath);
	const currentComponents = data.components;

	const annIdMasterlistPath =
		config.annIdMasterlistPath || path.join(ROOT_DIR, 'github_scripts', 'masterlist.json');
	const anilistToAnnId = await loadAnilistToAnnIdMap(annIdMasterlistPath);
	console.log(`[recluster] Loaded annId map: ${anilistToAnnId.size} AniList IDs with ANN anime IDs`);

	const allIds = dedupeAndSortNumeric(
		currentComponents.flatMap((comp) => (Array.isArray(comp?.anilistIds) ? comp.anilistIds : []))
	);

	console.log(`[recluster] IDs in file: ${allIds.length}`);
	if (allIds.length === 0) {
		console.log('[recluster] No IDs found. Nothing to do.');
		return;
	}

	const memberById = buildMemberIndex(currentComponents, anilistToAnnId);
	const adjacency = new Map(allIds.map((id) => [id, new Set()]));
	const mediaMeta = new Map(); // id -> { title, isCollab, reasons, tagNames }

	console.log(
		`[recluster] Fetching AniList relations in batches of ${config.batchSize} (excluded: ${[
			...EXCLUDED_RELATION_TYPES
		].join(', ')})`
	);

	const runErrors = [];
	let fetchSuccessCount = 0;
	let fetchFailCount = 0;
	let fetchGraphQlErrorCount = 0;
	/** @type {Array<{id:number,title:string|null,reasons:string[]}>} */
	const flaggedCollaborations = [];
	const edgesBefore = countEdges(adjacency);

	for (let i = 0; i < allIds.length; i += config.batchSize) {
		let batch = allIds.slice(i, i + config.batchSize);
		let { ok, status, dataByAlias, errors } = await fetchRelationBatch(batch, config.apiUrl);

		// When batch fails with 400 (or returns no data), retry each ID individually (like harvest)
		if (!ok && batch.length > 1) {
			const errMsg = errors[0]?.message ? ` (${errors[0].message})` : '';
			console.log(
				`[recluster] Batch HTTP ${status}${errMsg}, retrying ${batch.length} IDs one-by-one:`
			);
			const mergedData = {};
			const mergedErrors = Array.isArray(errors) ? [...errors] : [];
			for (let k = 0; k < batch.length; k++) {
				const singleId = batch[k];
				const single = await fetchRelationBatch([singleId], config.apiUrl);
				if (Array.isArray(single.errors) && single.errors.length > 0) {
					mergedErrors.push(...single.errors);
				}
				mergedData[`media${k}`] = single.dataByAlias?.media0 ?? null;
				const titleGuess = memberById.get(singleId)?.romaji || memberById.get(singleId)?.english || '';
				const okSingle = single.ok && single.dataByAlias?.media0?.id === singleId;
				console.log(
					`[recluster]   ${k + 1}/${batch.length} ID ${singleId} -> ${okSingle ? 'ok' : `fail (${single.status})`}${titleGuess ? ` (${titleGuess.substring(0, 35)}${titleGuess.length > 35 ? '...' : ''})` : ''}`
				);
				if (config.delayMs > 0 && k < batch.length - 1) await sleep(config.delayMs);
			}
			dataByAlias = mergedData;
			errors = mergedErrors;
			ok = true; // treat as ok so we process results; individual fails still counted below
		}

		if (!ok) {
			runErrors.push(`Batch ${Math.floor(i / config.batchSize) + 1} HTTP ${status}`);
		}
		if (errors.length > 0) {
			fetchGraphQlErrorCount += errors.length;
			for (const err of errors) {
				runErrors.push(`Batch ${Math.floor(i / config.batchSize) + 1} GraphQL: ${err?.message || 'Unknown error'}`);
			}
		}

		for (let j = 0; j < batch.length; j++) {
			const id = batch[j];
			const media = dataByAlias[`media${j}`];
			const titleGuess = memberById.get(id)?.romaji || memberById.get(id)?.english || '';
			if (!media || media.id !== id) {
				fetchFailCount += 1;
				console.log(
					`${ANSI.red}[recluster] FAIL id=${id}${titleGuess ? ` (${titleGuess})` : ''} status=${status}${ANSI.reset}`
				);
				continue;
			}
			fetchSuccessCount += 1;
			console.log(
				`${ANSI.green}[recluster] OK   id=${id}${titleGuess ? ` (${titleGuess})` : ''}${ANSI.reset}`
			);

			const collab = detectCollaborationCandidate(media);
			const tagNames = Array.isArray(media?.tags) ? media.tags.map((t) => t?.name).filter(Boolean) : [];
			mediaMeta.set(id, {
				title: collab.title || titleGuess || null,
				format: media?.format || null,
				isCollab: collab.isCollab,
				reasons: collab.reasons,
				tags: tagNames
			});
			if (collab.isCollab) {
				flaggedCollaborations.push({
					id,
					title: collab.title || titleGuess || null,
					format: media?.format || null,
					reasons: collab.reasons
				});
			}

			for (const edge of media.relations?.edges || []) {
				if (EXCLUDED_RELATION_TYPES.has(edge?.relationType)) continue;
				const node = edge?.node;
				const relId = Number(node?.id);
				if (!Number.isInteger(relId) || relId <= 0) continue;
				if (node?.type !== 'ANIME') continue;
				if (!adjacency.has(relId)) continue;

				adjacency.get(id).add(relId);
				adjacency.get(relId).add(id);
			}
		}

		const processed = Math.min(i + config.batchSize, allIds.length);
		if (processed % (config.batchSize * 5) === 0 || processed === allIds.length) {
			console.log(`[recluster] Processed ${processed}/${allIds.length} IDs`);
		}
		if (config.delayMs > 0 && processed < allIds.length) {
			await sleep(config.delayMs);
		}
	}

	// Bridge-cut: prevent flagged collaboration entries from merging multiple neighborhoods.
	const collabIds = flaggedCollaborations.map((c) => c.id);
	console.log(`[recluster] Collaboration candidates flagged: ${collabIds.length}`);
	const bridgeCuts = applyCollaborationBridgeCuts(adjacency, collabIds, mediaMeta);
	if (bridgeCuts.length > 0) {
		console.log(`[recluster] Bridge-cuts applied: ${bridgeCuts.length}`);
	}
	const edgesAfter = countEdges(adjacency);

	const groups = connectedComponents(allIds, adjacency);
	const nextComponents = buildOutputComponents(groups, memberById);
	const splitRows = buildSplitReport(currentComponents, nextComponents);

	const report = {
		createdAt: new Date().toISOString(),
		config: {
			batchSize: config.batchSize,
			delayMs: config.delayMs,
			excludedRelationTypes: [...EXCLUDED_RELATION_TYPES]
		},
		oldComponentCount: currentComponents.length,
		newComponentCount: nextComponents.length,
		totalIds: allIds.length,
		edgeCounts: {
			beforeCuts: edgesBefore,
			afterCuts: edgesAfter,
			removedByCuts: Math.max(0, edgesBefore - edgesAfter)
		},
		fetchStats: {
			success: fetchSuccessCount,
			failed: fetchFailCount,
			graphQlErrors: fetchGraphQlErrorCount
		},
		flaggedCollaborations: {
			count: flaggedCollaborations.length,
			samples: flaggedCollaborations.slice(0, 50)
		},
		bridgeCutsApplied: {
			count: bridgeCuts.length,
			samples: bridgeCuts.slice(0, 50)
		},
		errorCount: runErrors.length,
		errors: runErrors,
		topLargestSplits: splitRows.slice(0, 25)
	};

	await fs.writeFile(
		config.componentsPath,
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				componentCount: nextComponents.length,
				components: nextComponents
			},
			null,
			2
		),
		'utf8'
	);
	await fs.writeFile(config.reportPath, JSON.stringify(report, null, 2), 'utf8');

	console.log(
		`[recluster] Done. Components rewritten: ${currentComponents.length} -> ${nextComponents.length}`
	);
	if (runErrors.length > 0) {
		console.log(
			`${ANSI.yellow}[recluster] Completed with ${runErrors.length} encountered errors. See ${config.reportPath}${ANSI.reset}`
		);
	} else {
		console.log('[recluster] Completed without fetch errors.');
	}
	console.log(
		`[recluster] Report written: ${config.reportPath} (topLargestSplits=${report.topLargestSplits.length})`
	);
}

main().catch((error) => {
	console.error('[recluster] Fatal error:', error);
	process.exit(1);
});
