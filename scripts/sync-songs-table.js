#!/usr/bin/env node
/**
 * Sync public.songs from src/lib/server/masterlist.json.
 *
 * Upserts every masterlist song, then deletes rows the masterlist no longer
 * contains — without the delete the table only ever grows, and the leftovers are
 * songs AnisongDB has dropped, which is exactly the set that lands in a pool and
 * then fails to play.
 *
 * Usage:
 *   node --env-file=.env scripts/sync-songs-table.js
 *   node --env-file=.env scripts/sync-songs-table.js --dry-run   # report the prune, delete nothing
 *   node --env-file=.env scripts/sync-songs-table.js --no-prune  # upsert only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTERLIST_PATH = path.join(__dirname, '..', 'src', 'lib', 'server', 'masterlist.json');

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
	console.error('PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required');
	process.exit(1);
}

const supabase = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false }
});

const songs = JSON.parse(fs.readFileSync(MASTERLIST_PATH, 'utf8'));
if (!Array.isArray(songs)) {
	console.error('masterlist.json is not an array');
	process.exit(1);
}

console.log(`Syncing ${songs.length} songs into public.songs…`);

const rows = songs
	.filter((s) => s?.annSongId != null)
	.map((s) => ({
		ann_song_id: Number(s.annSongId),
		mal_id: Number(s.linked_ids?.myanimelist || s.malId) || null,
		anilist_id: Number(s.linked_ids?.anilist || s.aniListId) || null,
		ann_id: Number(s.annId) || null,
		song_name: s.songName || null,
		song_artist: s.songArtist || null,
		payload: s,
		updated_at: new Date().toISOString()
	}));

// 500 reliably tripped the statement timeout on this table; 250 mostly does not.
const CHUNK = 250;
const MIN_CHUNK = 25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransient = (message = '') =>
	/statement timeout|canceling statement|timeout|schema cache|ECONNRESET|fetch failed|socket hang up|502|503|504/i.test(
		message
	);

/**
 * Upsert a slice, retrying transient failures and halving the batch when the
 * server times out. A 500-row batch can exceed the statement timeout on a cold
 * table; failing the whole run there throws away everything already written.
 */
async function upsertChunk(chunk, attempt = 0) {
	const { error, count } = await supabase.from('songs').upsert(chunk, {
		onConflict: 'ann_song_id',
		count: 'exact'
	});

	if (!error) return count ?? chunk.length;

	if (!isTransient(error.message)) {
		throw new Error(error.message);
	}

	if (chunk.length > MIN_CHUNK) {
		const half = Math.ceil(chunk.length / 2);
		console.warn(`  retrying ${chunk.length} rows as 2×${half} (${error.message})`);
		await sleep(1000);
		return (await upsertChunk(chunk.slice(0, half))) + (await upsertChunk(chunk.slice(half)));
	}

	if (attempt < 4) {
		const delay = 2000 * 2 ** attempt;
		console.warn(`  retrying ${chunk.length} rows in ${delay}ms (${error.message})`);
		await sleep(delay);
		return upsertChunk(chunk, attempt + 1);
	}

	throw new Error(error.message);
}

let upserted = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
	try {
		upserted += await upsertChunk(rows.slice(i, i + CHUNK));
	} catch (err) {
		console.error(`Chunk ${i / CHUNK + 1} failed:`, err.message);
		console.error(`Upserted ${upserted} rows before failing; re-run to resume.`);
		process.exit(1);
	}
	if ((i / CHUNK) % 10 === 0) {
		console.log(`  … ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
	}
}

console.log(`Done. Upserted ${upserted} rows.`);

/* ------------------------------------------------------------------ */
/*  Prune                                                              */
/* ------------------------------------------------------------------ */

const dryRun = process.argv.includes('--dry-run');
const skipPrune = process.argv.includes('--no-prune');

if (skipPrune) {
	console.log('Prune skipped (--no-prune).');
	process.exit(0);
}

/** Every ann_song_id currently in the table, paged so we never ask for 38k rows at once. */
async function fetchAllAnnSongIds() {
	const ids = [];
	const PAGE = 1000;
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await supabase
			.from('songs')
			.select('ann_song_id')
			.order('ann_song_id', { ascending: true })
			.range(from, from + PAGE - 1);
		if (error) throw new Error(error.message);
		if (!data || data.length === 0) break;
		for (const row of data) ids.push(Number(row.ann_song_id));
		if (data.length < PAGE) break;
	}
	return ids;
}

console.log('Checking for rows the masterlist no longer contains…');

let live;
try {
	live = await fetchAllAnnSongIds();
} catch (err) {
	console.error(`Could not read songs for pruning: ${err.message}`);
	console.error('Upsert succeeded; re-run to prune.');
	process.exit(1);
}

const keep = new Set(rows.map((r) => r.ann_song_id));
const stale = live.filter((id) => !keep.has(id));

console.log(`  ${live.length} rows in songs, ${keep.size} in the masterlist, ${stale.length} stale.`);

if (stale.length === 0) {
	console.log('Nothing to prune.');
	process.exit(0);
}

// A truncated or half-written masterlist would otherwise delete most of the
// table. Anything past a few percent is a bad input, not a real prune.
const staleShare = stale.length / Math.max(live.length, 1);
if (staleShare > 0.05) {
	console.error(
		`Refusing to prune: ${(staleShare * 100).toFixed(1)}% of the table is stale, which reads ` +
			'as a bad masterlist rather than songs AnisongDB dropped. Check the masterlist, then ' +
			're-run with --no-prune to skip this step or fix the input.'
	);
	process.exit(1);
}

/**
 * Which of these ids some user has training history on.
 *
 * "Not in the masterlist" is not the same as "gone". The masterlist's universe is
 * one MAL account's anime list, so a song leaves it whenever AnisongDB re-links
 * its anime to a different MAL id, nulls the link, or the anime drops off that
 * list — while the song itself is still perfectly playable. Every one of the 36
 * rows this first found was in that category, and all 36 had user history.
 *
 * So history is the tripwire: a row someone has played is a masterlist coverage
 * hole to fix in ALWAYS_FETCH_ANN_SONG_IDS, not a row to delete.
 */
async function findReferencedIds(ids) {
	const referenced = new Set();
	const CHECK_CHUNK = 200;
	for (let i = 0; i < ids.length; i += CHECK_CHUNK) {
		const chunk = ids.slice(i, i + CHECK_CHUNK);
		const { data, error } = await supabase
			.from('training_progress')
			.select('song_ann_id')
			.in('song_ann_id', chunk);
		if (error) throw new Error(error.message);
		for (const row of data || []) referenced.add(Number(row.song_ann_id));
	}
	return referenced;
}

let referenced;
try {
	referenced = await findReferencedIds(stale);
} catch (err) {
	console.error(`Could not check training history: ${err.message}`);
	console.error('Refusing to prune without it.');
	process.exit(1);
}

const held = stale.filter((id) => referenced.has(id));
const deletable = stale.filter((id) => !referenced.has(id));

if (held.length > 0) {
	console.warn(
		`\n  ${held.length} of them are songs users have played. Keeping those — they are a\n` +
			'  masterlist coverage hole, not dead songs. Add them to ALWAYS_FETCH_ANN_SONG_IDS\n' +
			'  in scripts/update-masterlist.js so the next refresh picks them back up:\n'
	);
	console.warn(`  ${held.join(', ')}\n`);
}

if (deletable.length === 0) {
	console.log('Nothing to prune.');
	process.exit(0);
}

if (dryRun) {
	console.log(`Dry run — would delete ${deletable.length} unreferenced rows:`);
	console.log(`  ${deletable.slice(0, 50).join(', ')}${deletable.length > 50 ? ', …' : ''}`);
	process.exit(0);
}

let deleted = 0;
const DELETE_CHUNK = 100;
for (let i = 0; i < deletable.length; i += DELETE_CHUNK) {
	const chunk = deletable.slice(i, i + DELETE_CHUNK);
	const { error, count } = await supabase
		.from('songs')
		.delete({ count: 'exact' })
		.in('ann_song_id', chunk);
	if (error) {
		console.error(`Delete failed after ${deleted} rows: ${error.message}`);
		process.exit(1);
	}
	deleted += count ?? chunk.length;
}

console.log(`Pruned ${deleted} rows dropped from the masterlist and never played.`);
