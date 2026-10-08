/**
 * patch-member-synonyms.js
 *
 * Re-fetches AniList synonyms for every member in anilist-franchise-components.json
 * and writes the English-alphabet ones back (no length cap).
 *
 * Run once after removing the 10-char synonym limit so existing data gains the
 * full synonym set without requiring a complete re-harvest.
 *
 * Usage:
 *   node scripts/patch-member-synonyms.js [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_PATH = path.resolve(__dirname, '../static/anilist-franchise-components.json');
const ANILIST_API = 'https://graphql.anilist.co';
const BATCH_SIZE = 26;
const RATE_LIMIT_DELAY_MS = 1200;

const isDryRun = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Helpers (mirrors harvest-anilist-franchises.js)
// ---------------------------------------------------------------------------

function hasNonEnglishAlphabetLetters(value) {
	for (const ch of value) {
		if (/\p{L}/u.test(ch) && !/[A-Za-z]/.test(ch)) return true;
	}
	return false;
}

function normalizeApostrophe(str) {
	if (!str || typeof str !== 'string') return str;
	return str.replace(/[\u2018\u2019\u02BC\u2032]/g, "'");
}

function keepSynonymTitle(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return false;
	if (hasNonEnglishAlphabetLetters(normalized)) return false;
	return true;
}

async function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// AniList batch fetch (synonyms only)
// ---------------------------------------------------------------------------

async function fetchSynonymsBatch(ids) {
	const aliases = ids
		.map((id, i) => `media${i}: Media(id: ${id}) { id synonyms }`)
		.join('\n  ');
	const query = `query {\n  ${aliases}\n}`;
	const body = JSON.stringify({ query });

	for (let attempt = 1; attempt <= 3; attempt++) {
		const res = await fetch(ANILIST_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body
		});

		if (res.status === 429) {
			const retryAfter = Number(res.headers.get('retry-after') || 60);
			console.warn(`  Rate limited, waiting ${retryAfter}s…`);
			await sleep(retryAfter * 1000);
			continue;
		}

		const payload = await res.json();
		if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(payload.errors)}`);

		const result = new Map();
		for (const media of Object.values(payload.data || {})) {
			if (!media?.id) continue;
			const syns = (Array.isArray(media.synonyms) ? media.synonyms : [])
				.map(s => normalizeApostrophe(s))
				.filter(keepSynonymTitle);
			result.set(media.id, syns);
		}
		return result;
	}
	throw new Error('Failed after 3 attempts');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log(`Loading ${COMPONENTS_PATH}…`);
	const raw = await fs.readFile(COMPONENTS_PATH, 'utf-8');
	const data = JSON.parse(raw);

	// Collect all unique member IDs
	const allIds = [];
	const idSet = new Set();
	for (const comp of data.components) {
		if (!Array.isArray(comp.members)) continue;
		for (const m of comp.members) {
			if (m.id && !idSet.has(m.id)) {
				idSet.add(m.id);
				allIds.push(m.id);
			}
		}
	}
	console.log(`Found ${allIds.length} unique member IDs across ${data.components.length} components`);

	// Fetch synonyms in batches
	const synonymMap = new Map(); // id → string[]
	let fetched = 0;
	for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
		const batch = allIds.slice(i, i + BATCH_SIZE);
		process.stdout.write(`  Fetching ${i + 1}–${Math.min(i + BATCH_SIZE, allIds.length)} / ${allIds.length}…`);
		const batchResult = await fetchSynonymsBatch(batch);
		for (const [id, syns] of batchResult) synonymMap.set(id, syns);
		fetched += batch.length;
		process.stdout.write(` done (${batchResult.size} returned)\n`);
		if (i + BATCH_SIZE < allIds.length) await sleep(RATE_LIMIT_DELAY_MS);
	}

	// Apply synonyms back to members
	let updatedMembers = 0;
	let addedSynonyms = 0;
	for (const comp of data.components) {
		if (!Array.isArray(comp.members)) continue;
		for (const m of comp.members) {
			const newSyns = synonymMap.get(m.id);
			if (!newSyns) continue;
			const before = JSON.stringify(m.synonyms ?? []);
			const after = JSON.stringify(newSyns);
			if (before !== after) {
				updatedMembers++;
				addedSynonyms += newSyns.length - (m.synonyms?.length ?? 0);
			}
			m.synonyms = newSyns;
		}
	}

	console.log(`\nSummary:`);
	console.log(`  Members with changed synonyms: ${updatedMembers}`);
	console.log(`  Net synonym change: ${addedSynonyms > 0 ? '+' : ''}${addedSynonyms}`);

	if (isDryRun) {
		console.log('\n[dry-run] No file written.');
		return;
	}

	await fs.writeFile(COMPONENTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
	console.log(`\nWritten to ${COMPONENTS_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
