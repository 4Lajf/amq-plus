/**
 * Merges multiple franchise components into a single one.
 *
 * Usage:
 *   node scripts/merge-franchise-components.js --ids=c329,c2892
 *   node scripts/merge-franchise-components.js --preset=pokemon
 *   node scripts/merge-franchise-components.js --preset=pokemon --dry-run
 *   node scripts/merge-franchise-components.js --components=path/to/file.json --ids=c329,c2892
 *   node scripts/merge-franchise-components.js --help
 *
 * After merging, all componentIds are renumbered (c1, c2, …) and
 * shortestArrayItem is recalculated for the merged component.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');

const DEFAULT_COMPONENTS_PATH = path.join(ROOT_DIR, 'static', 'anilist-franchise-components.json');

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = {
	pokemon: {
		description: 'All Pokémon anime (Pocket Monsters + all seasons/movies)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /pok[eé]mon|pocket monsters/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /pok[eé]mon/i.test(t)) ||
			(comp.titles?.synonyms || []).some((t) => /pok[eé]mon/i.test(t)),
	},
	fate: {
		description: 'All Fate franchise (stay night, Zero, Grand Order, kaleid, etc.)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /^Fate\//i.test(t) || /^Fate /i.test(t)) ||
			(comp.titles?.english || []).some((t) => /^Fate\//i.test(t) || /^Fate /i.test(t)) ||
			(comp.titles?.synonyms || []).some((t) => /Fate/i.test(t)),
	},
	precure: {
		description: 'All Pretty Cure / Precure franchise (all seasons + All Stars)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Precure|Pre Cure|Pretty Cure|プリキュア/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Precure|Pre Cure|Pretty Cure/i.test(t)),
	},
	gundam: {
		description: 'All Gundam franchise (UC, AU, SD, Build, etc.)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Gundam|Gundamu/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Gundam/i.test(t)),
	},
	yugioh: {
		description: 'All Yu-Gi-Oh! franchise (DM, ZEXAL, ARC-V, VRAINS, SEVENS, Go Rush)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Yu.?Gi.?Oh|Yugioh/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Yu-Gi-Oh|Yugioh/i.test(t)),
	},
	digimon: {
		description: 'All Digimon franchise (Adventure, Tamers, Xros Wars, etc.)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Digimon|Dejimon/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Digimon/i.test(t)),
	},
	'fairy-tail': {
		description: 'Fairy Tail franchise (including RAVE crossover)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Fairy Tail|FAIRY TAIL/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Fairy Tail|FAIRY TAIL/i.test(t)),
	},
	gintama: {
		description: 'All Gintama franchise (TV, movies, Ginpachi-sensei)',
		match: (comp) =>
			(comp.titles?.romaji || []).some((t) => /Gintama/i.test(t)) ||
			(comp.titles?.english || []).some((t) => /Gintama/i.test(t)),
	},
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const opts = {
		componentsPath: DEFAULT_COMPONENTS_PATH,
		ids:            [],
		preset:         null,
		presets:        [],  // multiple presets to run in sequence
		dryRun:         false,
		help:           false,
	};

	for (const arg of argv) {
		if (arg === '--dry-run' || arg === '-n') {
			opts.dryRun = true;
		} else if (arg === '--help' || arg === '-h') {
			opts.help = true;
		} else if (arg.startsWith('--components=')) {
			opts.componentsPath = arg.slice('--components='.length);
		} else if (arg.startsWith('--ids=')) {
			opts.ids = arg.slice('--ids='.length).split(',').map((s) => s.trim()).filter(Boolean);
		} else if (arg.startsWith('--preset=')) {
			opts.preset = arg.slice('--preset='.length).trim();
		} else if (arg.startsWith('--presets=')) {
			const val = arg.slice('--presets='.length).trim();
			opts.presets = val.toLowerCase() === 'all'
				? Object.keys(PRESETS)
				: val.split(',').map((s) => s.trim()).filter(Boolean);
		} else {
			console.error(`[merge] Unknown argument: ${arg}`);
			process.exit(1);
		}
	}

	return opts;
}

function printUsage() {
	console.log(`
Merge Franchise Components

Usage:
  node scripts/merge-franchise-components.js [options]

Options:
  --ids=c329,c2892        Comma-separated list of componentIds to merge
  --preset=<name>         Use a named preset to auto-detect components
  --presets=a,b,c         Run multiple presets in sequence (e.g. fate,precure,pokemon)
  --presets=all           Run all available presets
  --components=<path>     Path to components JSON file (default: static/anilist-franchise-components.json)
  --dry-run, -n           Print what would happen without writing any files
  --help, -h              Show this help

Available presets:
${Object.entries(PRESETS).map(([k, v]) => `  ${k.padEnd(16)} ${v.description}`).join('\n')}

Examples:
  node scripts/merge-franchise-components.js --preset=pokemon
  node scripts/merge-franchise-components.js --presets=fate,precure,pokemon
  node scripts/merge-franchise-components.js --ids=c329,c2892 --dry-run
`);
}

// ---------------------------------------------------------------------------
// Title helpers  (mirrors logic in update-franchise-components.js)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// shortestArrayItem  (mirrors logic in update-franchise-components.js)
// ---------------------------------------------------------------------------

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

function computeShortestArrayItem(comp) {
	const shortest = (arr) =>
		arr.length === 0 ? null : arr.reduce((a, b) => (a.length <= b.length ? a : b));
	const { romaji, english } = collectByLang(comp);
	return { romaji: shortest(romaji), english: shortest(english) };
}

// ---------------------------------------------------------------------------
// Core merge logic
// ---------------------------------------------------------------------------

function dedupeAndSortNumeric(values) {
	return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

function mergeComponents(toMerge) {
	if (toMerge.length === 0) throw new Error('Nothing to merge');
	if (toMerge.length === 1) return { ...toMerge[0] };

	// Keep the seedId of the first (primary) component
	const primary = toMerge[0];

	// Merge members — first occurrence of each anilist ID wins
	const memberMap = new Map();
	for (const comp of toMerge) {
		for (const m of comp.members || []) {
			const id = Number(m?.id);
			if (Number.isInteger(id) && id > 0 && !memberMap.has(id)) {
				memberMap.set(id, m);
			}
		}
	}

	const anilistIds = dedupeAndSortNumeric([
		...toMerge.flatMap((c) => c.anilistIds || [])
	]);

	const members = anilistIds.map((id) => memberMap.get(id)).filter(Boolean);

	const romaji   = normalizeTitleSet(members.map((m) => m.romaji).filter(Boolean));
	const english  = normalizeTitleSet(members.map((m) => m.english).filter(Boolean));
	const synonyms = normalizeTitleSet(
		members.flatMap((m) => (m.synonyms || []).filter(keepSynonymTitle))
	);

	const merged = {
		componentId:      primary.componentId,
		seedId:           primary.seedId,
		anilistIds,
		titles:           { romaji, english, synonyms },
		members,
	};
	merged.shortestArrayItem = computeShortestArrayItem(merged);
	return merged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	if (opts.help) {
		printUsage();
		process.exit(0);
	}

	const presetsToRun = opts.presets.length > 0 ? opts.presets : (opts.preset ? [opts.preset] : []);

	if (!opts.ids.length && presetsToRun.length === 0) {
		console.error('[merge] Error: provide --ids=... or --preset=<name> or --presets=a,b,c');
		printUsage();
		process.exit(1);
	}

	for (const p of presetsToRun) {
		if (!(p in PRESETS)) {
			console.error(`[merge] Unknown preset: "${p}". Available: ${Object.keys(PRESETS).join(', ')}`);
			process.exit(1);
		}
	}

	// When using --presets, run each preset in sequence (file is rewritten between runs)
	if (presetsToRun.length > 1) {
		for (let i = 0; i < presetsToRun.length; i++) {
			console.log(`\n${'='.repeat(60)}`);
			console.log(`[merge] Preset ${i + 1}/${presetsToRun.length}: ${presetsToRun[i]}`);
			console.log('='.repeat(60));
			await runOneMerge(opts.componentsPath, presetsToRun[i], null, opts.dryRun);
		}
		console.log('\n[merge] All presets completed.');
		return;
	}

	// Single preset or --ids
	await runOneMerge(
		opts.componentsPath,
		presetsToRun[0] || null,
		opts.ids,
		opts.dryRun
	);
}

async function runOneMerge(componentsPath, presetName, ids, dryRun) {
	const raw  = await fs.readFile(componentsPath, 'utf8');
	const data = JSON.parse(raw);

	if (!Array.isArray(data?.components)) {
		throw new Error('[merge] Expected data.components to be an array');
	}

	const components = data.components;
	console.log(`[merge] Reading: ${componentsPath}`);
	console.log(`[merge] Loaded ${components.length} components`);

	// Identify which components to merge
	let toMergeIds;
	if (presetName) {
		const preset    = PRESETS[presetName];
		let   matched   = components.filter(preset.match);
		// Sort by member count descending so largest component becomes primary (seed)
		matched = matched.sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0));
		toMergeIds      = matched.map((c) => c.componentId);
		console.log(`[merge] Preset "${presetName}" matched ${matched.length} component(s): ${toMergeIds.join(', ')}`);
		if (matched.length === 0) {
			console.log('[merge] Nothing matched. Exiting.');
			return;
		}
		if (matched.length === 1) {
			console.log('[merge] Only one component matched — already merged. Skipping.');
			return;
		}
	} else {
		toMergeIds = ids || [];
	}

	if (toMergeIds.length === 0) {
		console.error('[merge] No components to merge (empty --ids or no preset match).');
		return;
	}

	const toMergeSet  = new Set(toMergeIds);
	const toMerge     = components.filter((c) => toMergeSet.has(c.componentId));
	const notFound    = toMergeIds.filter((id) => !components.some((c) => c.componentId === id));

	if (notFound.length > 0) {
		console.error(`[merge] Component(s) not found: ${notFound.join(', ')}`);
		throw new Error(`Component(s) not found: ${notFound.join(', ')}`);
	}

	console.log(`\n[merge] Merging ${toMerge.length} components:`);
	for (const c of toMerge) {
		const title = c.titles.romaji[0] || c.titles.english[0] || '?';
		console.log(`  ${c.componentId}  (${c.members.length} members, seed=${c.seedId}, "${title.substring(0, 60)}")`);
	}

	// Perform the merge
	const merged = mergeComponents(toMerge);

	console.log(`\n[merge] Result:`);
	console.log(`  Members:          ${merged.members.length} (was: ${toMerge.map((c) => c.members.length).join(' + ')} = ${toMerge.reduce((s, c) => s + c.members.length, 0)})`);
	console.log(`  anilistIds:       ${merged.anilistIds.length}`);
	console.log(`  shortestArrayItem: romaji="${merged.shortestArrayItem?.romaji}" english="${merged.shortestArrayItem?.english}"`);

	// Rebuild the components array: replace first matching component with merged,
	// remove the rest, preserve order of all other components
	const firstMatchIdx = components.findIndex((c) => c.componentId === toMerge[0].componentId);
	const newComponents = [];
	let   mergedInserted = false;

	for (let i = 0; i < components.length; i++) {
		const comp = components[i];
		if (!toMergeSet.has(comp.componentId)) {
			newComponents.push(comp);
			continue;
		}
		if (!mergedInserted) {
			newComponents.push(merged);
			mergedInserted = true;
		}
		// Other matching components are dropped
	}

	// Renumber componentIds  (c1, c2, …)
	for (let i = 0; i < newComponents.length; i++) {
		newComponents[i].componentId = `c${i + 1}`;
	}

	const oldCount = components.length;
	const newCount = newComponents.length;
	console.log(`\n[merge] Component count: ${oldCount} → ${newCount} (removed ${oldCount - newCount})`);

	if (dryRun) {
		console.log('\n[merge] DRY RUN — no files written.');
		return;
	}

	data.components    = newComponents;
	data.componentCount = newComponents.length;
	data.updatedAt     = new Date().toISOString();

	await fs.writeFile(componentsPath, JSON.stringify(data, null, 2), 'utf8');
	console.log(`\n[merge] Written to ${componentsPath}`);
}

main().catch((err) => {
	console.error('[merge] Fatal:', err.message || err);
	process.exit(1);
});
