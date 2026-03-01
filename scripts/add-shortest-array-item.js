/**
 * Adds a `shortestArrayItem` key to each component in anilist-franchise-components.json.
 * The value holds the shortest romaji and shortest english string from the component
 * (titles + members, including synonyms).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULTS = {
	componentsPath: path.join(ROOT_DIR, 'github_scripts', 'anilist-franchise-components.json')
};

/**
 * Collect romaji and english strings separately from a component.
 * @param {object} comp - A franchise component
 * @returns {{ romaji: string[], english: string[] }}
 */
function collectByLang(comp) {
	const romaji = [];
	const english = [];

	function add(s, lang) {
		const t = typeof s === 'string' ? s.trim() : '';
		if (t && lang === 'romaji') romaji.push(t);
		if (t && lang === 'english') english.push(t);
	}

	const titles = comp?.titles;
	if (titles) {
		for (const v of titles.romaji || []) add(v, 'romaji');
		for (const v of titles.english || []) add(v, 'english');
		for (const v of titles.synonyms || []) add(v, 'english'); // synonyms only in english (often abbreviations like "Pokemon")
	}

	const members = comp?.members;
	if (Array.isArray(members)) {
		for (const m of members) {
			if (typeof m?.romaji === 'string') add(m.romaji, 'romaji');
			if (typeof m?.english === 'string') add(m.english, 'english');
			for (const v of m?.synonyms || []) add(v, 'english');
		}
	}

	return { romaji, english };
}

/**
 * Get the shortest romaji and english strings in a component.
 * @param {object} comp - A franchise component
 * @returns {{ romaji: string|null, english: string|null }}
 */
function getShortestArrayItem(comp) {
	const { romaji, english } = collectByLang(comp);
	const shortest = (arr) =>
		arr.length === 0 ? null : arr.reduce((a, b) => (a.length <= b.length ? a : b));
	return {
		romaji: shortest(romaji),
		english: shortest(english)
	};
}

async function main() {
	const componentsPath = process.argv[2] || DEFAULTS.componentsPath;

	console.log('Reading', componentsPath);
	const raw = await fs.readFile(componentsPath, 'utf8');
	const data = JSON.parse(raw);

	const components = data?.components;
	if (!Array.isArray(components)) {
		throw new Error('Expected data.components to be an array');
	}

	let emptyCount = 0;
	for (const comp of components) {
		const shortest = getShortestArrayItem(comp);
		comp.shortestArrayItem = shortest;
		if (!shortest.romaji && !shortest.english) emptyCount++;
	}

	// Preserve top-level metadata
	data.updatedAt = new Date().toISOString();

	await fs.writeFile(componentsPath, JSON.stringify(data, null, 2), 'utf8');

	console.log(`Done. Added shortestArrayItem (romaji + english) to ${components.length} components.`);
	if (emptyCount > 0) {
		console.log(`  (${emptyCount} components had no strings → both null)`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
