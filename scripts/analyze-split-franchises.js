/**
 * Analyzes anilist-franchise-components.json for franchises that have been
 * split into multiple components but are ultimately the same franchise.
 *
 * Usage:
 *   node scripts/analyze-split-franchises.js
 *   node scripts/analyze-split-franchises.js --components=path/to/file.json
 *   node scripts/analyze-split-franchises.js --help
 *
 * Output: Lists franchises with 2+ components, their component IDs, member counts,
 * and sample titles. Use merge-franchise-components.js --preset=<name> to merge.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');

const DEFAULT_COMPONENTS_PATH = path.join(ROOT_DIR, 'static', 'anilist-franchise-components.json');

// ---------------------------------------------------------------------------
// Franchise patterns (name -> regexes to match in romaji/english/synonyms)
// ---------------------------------------------------------------------------

const FRANCHISE_PATTERNS = {
	'Fate':           [/^Fate\//i, /^Fate /i],
	'Precure':        [/Precure/i, /Pre Cure/i, /Pretty Cure/i],
	'Pokemon':        [/Pok[eé]mon/i, /Pocket Monsters/i],
	'Gundam':         [/Gundam/i, /Gundamu/i],
	'Yu-Gi-Oh':       [/Yu.?Gi.?Oh/i, /Yugioh/i],
	'Digimon':        [/Digimon/i, /Dejimon/i],
	// Detective Conan: excluded from presets (c143 is Lupin III vs Conan crossover)
	'Detective Conan': [/Meitantei Conan/i, /Detective Conan/i, /Case Closed/i],
	'JoJo':           [/JoJo no Kimyou/i, /JoJo's Bizarre/i],
	'Fairy Tail':    [/Fairy Tail/i, /FAIRY TAIL/i],
	'Gintama':       [/Gintama/i],
};

function matchFranchise(comp, patterns) {
	const allTitles = [
		...(comp.titles?.romaji || []),
		...(comp.titles?.english || []),
		...(comp.titles?.synonyms || []),
	];
	return patterns.some((p) => allTitles.some((t) => p.test(t)));
}

function parseArgs(argv) {
	let componentsPath = DEFAULT_COMPONENTS_PATH;
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			console.log(`
Analyze Split Franchises

Scans anilist-franchise-components.json for franchises split across multiple
components. Use merge-franchise-components.js --preset=<name> to merge them.

Usage:
  node scripts/analyze-split-franchises.js [options]

Options:
  --components=<path>  Path to components JSON (default: static/anilist-franchise-components.json)
  --help, -h           Show this help
`);
			process.exit(0);
		} else if (arg.startsWith('--components=')) {
			componentsPath = arg.slice('--components='.length);
		}
	}
	return { componentsPath };
}

async function main() {
	const { componentsPath } = parseArgs(process.argv.slice(2));

	console.log(`[analyze] Reading: ${componentsPath}`);
	const raw  = await fs.readFile(componentsPath, 'utf8');
	const data = JSON.parse(raw);

	if (!Array.isArray(data?.components)) {
		throw new Error('Expected data.components to be an array');
	}

	const components = data.components;
	console.log(`[analyze] Loaded ${components.length} components\n`);

	const results = {};

	for (const [name, patterns] of Object.entries(FRANCHISE_PATTERNS)) {
		const matched = components.filter((c) => matchFranchise(c, patterns));
		if (matched.length > 1) {
			results[name] = matched.map((c) => ({
				id:       c.componentId,
				members:  c.members?.length ?? 0,
				title:    (c.titles?.romaji?.[0] || c.titles?.english?.[0] || '?').substring(0, 55),
			}));
		}
	}

	if (Object.keys(results).length === 0) {
		console.log('No split franchises found. All checked franchises are in single components.');
		return;
	}

	console.log('=== SPLIT FRANCHISES (2+ components) ===\n');
	console.log('Merge with: node scripts/merge-franchise-components.js --preset=<name>\n');

	const PRESET_MAP = {
		Fate: 'fate',
		Precure: 'precure',
		Pokemon: 'pokemon',
		Gundam: 'gundam',
		'Yu-Gi-Oh': 'yugioh',
		Digimon: 'digimon',
		'Fairy Tail': 'fairy-tail',
		Gintama: 'gintama',
	};

	for (const [name, arr] of Object.entries(results)) {
		const totalMembers = arr.reduce((s, a) => s + a.members, 0);
		const presetName = PRESET_MAP[name];
		console.log(`${name} (${arr.length} components, ${totalMembers} total members)`);
		if (presetName) {
			console.log(`  → Merge: --preset=${presetName}`);
		}
		for (const a of arr) {
			console.log(`    ${a.id.padEnd(8)} (${String(a.members).padStart(3)} members) ${a.title}`);
		}
		console.log('');
	}
}

main().catch((err) => {
	console.error('[analyze] Fatal:', err.message || err);
	process.exit(1);
});
