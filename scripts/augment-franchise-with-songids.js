/**
 * Augments anilist-franchise-components.json by adding annSongIds and
 * pre-computed AMQ-accepted names (amqName) to each component member.
 *
 * Data flow:
 *   masterlist.json  (annSongId + annId + linked_ids.anilist + animeENName/animeJPName)
 *       => Map<annId, Set<annSongId>>  +  Map<anilistId, Set<annSongId>>
 *       => Map<anilistId, {en, jp}>    (AMQ-accepted anime names)
 *   franchise-components.json  (members with id=anilistId, optional annId)
 *       => enrich member.annSongIds = [...]
 *       => enrich member.amqName = { en, jp }
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULTS = {
	masterlistPath: path.join(ROOT_DIR, 'src', 'lib', 'server', 'masterlist.json'),
	componentsPath: path.join(ROOT_DIR, 'static', 'anilist-franchise-components.json')
};

function parseArgs(argv) {
	const parsed = {
		masterlistPath: DEFAULTS.masterlistPath,
		componentsPath: DEFAULTS.componentsPath,
		dryRun: false
	};

	for (const arg of argv) {
		if (arg === '--dry-run') parsed.dryRun = true;
		else if (arg.startsWith('--masterlist=')) parsed.masterlistPath = arg.split('=')[1];
		else if (arg.startsWith('--components=')) parsed.componentsPath = arg.split('=')[1];
	}

	return parsed;
}

async function main() {
	const config = parseArgs(process.argv.slice(2));

	console.log('Reading masterlist:', config.masterlistPath);
	const masterlistRaw = await fs.readFile(config.masterlistPath, 'utf8');
	const masterlist = JSON.parse(masterlistRaw);

	if (!Array.isArray(masterlist)) {
		throw new Error('Expected masterlist to be an array');
	}

	// Build Map<annId, Set<annSongId>>, Map<anilistId, Set<annSongId>>,
	// and Map<anilistId, {en, jp}> for AMQ-accepted anime names.
	const annIdToSongIds = new Map();
	const anilistIdToSongIds = new Map();
	const anilistIdToAmqNames = new Map();
	const annIdToAmqNames = new Map();
	let masterlistEntries = 0;

	for (const entry of masterlist) {
		masterlistEntries++;
		const annId = entry?.annId;
		const annSongId = entry?.annSongId;
		const anilistId = entry?.linked_ids?.anilist;

		if (!Number.isInteger(annSongId) || annSongId <= 0) continue;

		if (Number.isInteger(annId) && annId > 0) {
			if (!annIdToSongIds.has(annId)) annIdToSongIds.set(annId, new Set());
			annIdToSongIds.get(annId).add(annSongId);

			if (!annIdToAmqNames.has(annId) && (entry.animeENName || entry.animeJPName)) {
				annIdToAmqNames.set(annId, {
					en: entry.animeENName || null,
					jp: entry.animeJPName || null,
				});
			}
		}

		if (Number.isInteger(anilistId) && anilistId > 0) {
			if (!anilistIdToSongIds.has(anilistId)) anilistIdToSongIds.set(anilistId, new Set());
			anilistIdToSongIds.get(anilistId).add(annSongId);

			if (!anilistIdToAmqNames.has(anilistId) && (entry.animeENName || entry.animeJPName)) {
				anilistIdToAmqNames.set(anilistId, {
					en: entry.animeENName || null,
					jp: entry.animeJPName || null,
				});
			}
		}
	}

	// Phase 2: Rescue orphan annSongIds (entries with anilist: null) by matching
	// against songs that have proper mapping via song fingerprint (name+artist+type).
	// This handles duplicate masterlist entries where the same song exists under both
	// a proper annId (with anilist mapping) and a synthetic annId (without).
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

	console.log(`Masterlist: ${masterlistEntries} entries`);
	console.log(`Unique annIds with songs: ${annIdToSongIds.size}`);
	console.log(`Unique anilistIds with songs: ${anilistIdToSongIds.size}`);
	console.log(`Orphan annSongIds rescued via fingerprint: ${orphanMatched} (ambiguous/skipped: ${orphanAmbiguous})`);

	console.log('Reading franchise components:', config.componentsPath);
	const componentsRaw = await fs.readFile(config.componentsPath, 'utf8');
	const data = JSON.parse(componentsRaw);

	const components = data?.components;
	if (!Array.isArray(components)) {
		throw new Error('Expected data.components to be an array');
	}

	let membersTotal = 0;
	let enrichedByAnnId = 0;
	let enrichedByAnilistId = 0;
	let totalSongIdsAdded = 0;
	let amqNamesAdded = 0;

	for (const comp of components) {
		if (!Array.isArray(comp.members)) continue;

		for (const member of comp.members) {
			membersTotal++;

			// Remove stale data from previous runs
			delete member.annSongIds;
			delete member.amqName;

			// Try anilistId first (more granular — correctly separates split-cour entries
			// that AniList tracks separately but AnisongDB/ANN merges under one annId),
			// then fall back to annId.
			let songIds = null;
			let matchedBy = null;

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

			// AMQ names: prefer anilistId lookup, fall back to annId
			let amqNames = null;
			if (Number.isInteger(member.id) && member.id > 0) {
				amqNames = anilistIdToAmqNames.get(member.id);
			}
			if (!amqNames && Number.isInteger(member.annId) && member.annId > 0) {
				amqNames = annIdToAmqNames.get(member.annId);
			}
			if (amqNames) {
				member.amqName = { en: amqNames.en, jp: amqNames.jp };
				amqNamesAdded++;
			}
		}
	}

	const totalEnriched = enrichedByAnnId + enrichedByAnilistId;
	console.log(`\nComponents: ${components.length}`);
	console.log(`Members total: ${membersTotal}`);
	console.log(`Members enriched: ${totalEnriched} (${enrichedByAnnId} by annId, ${enrichedByAnilistId} by anilistId)`);
	console.log(`Total annSongIds added: ${totalSongIdsAdded}`);
	console.log(`Members without songs: ${membersTotal - totalEnriched}`);
	console.log(`AMQ names added: ${amqNamesAdded}`);

	if (config.dryRun) {
		console.log('\n[DRY RUN] No file written.');
		return;
	}

	data.updatedAt = new Date().toISOString();
	await fs.writeFile(config.componentsPath, JSON.stringify(data, null, 2), 'utf8');
	console.log(`\nWritten to ${config.componentsPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
