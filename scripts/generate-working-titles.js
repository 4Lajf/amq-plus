#!/usr/bin/env node

/**
 * Standalone Working Titles Generator
 *
 * Reads the existing masterlist.json and computes all working titles
 * (alternative accepted answers) for every annSongId.
 *
 * Two matching passes:
 *  1. Per-annSongId — collect animeENName, animeJPName, and animeAltName[].
 *  2. Cross-annSongId — songs that share the exact same songName + songArtist
 *     are merged so every annSongId in the group gets the union of titles.
 *
 * Usage:
 *   node scripts/generate-working-titles.js
 *   node scripts/generate-working-titles.js --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTERLIST_PATH = path.join(__dirname, '..', 'src', 'lib', 'server', 'masterlist.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'lib', 'server', 'working-titles.json');

const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(MASTERLIST_PATH)) {
  console.error(`Masterlist not found at ${MASTERLIST_PATH}`);
  process.exit(1);
}

console.log(`Reading masterlist from ${MASTERLIST_PATH}...`);
const masterlist = JSON.parse(fs.readFileSync(MASTERLIST_PATH, 'utf8'));
console.log(`Loaded ${masterlist.length} entries`);

// Pass 1: collect titles per annSongId + build songKey -> annSongId groups
const titlesByAnnSongId = new Map();
const songKeyToAnnSongIds = new Map();

for (const song of masterlist) {
  if (!song.annSongId) continue;

  const id = song.annSongId;
  if (!titlesByAnnSongId.has(id)) {
    titlesByAnnSongId.set(id, new Set());
  }
  const titles = titlesByAnnSongId.get(id);

  if (song.animeENName) titles.add(song.animeENName);
  if (song.animeJPName) titles.add(song.animeJPName);
  if (Array.isArray(song.animeAltName)) {
    for (const alt of song.animeAltName) {
      if (alt) titles.add(alt);
    }
  }

  const artist = song.songArtist || '';
  const name = song.songName || '';
  if (artist && name) {
    const songKey = `${artist}\0${name}`;
    if (!songKeyToAnnSongIds.has(songKey)) {
      songKeyToAnnSongIds.set(songKey, new Set());
    }
    songKeyToAnnSongIds.get(songKey).add(id);
  }
}

// Pass 2: merge titles across annSongIds that share the same track
let crossMergeCount = 0;
for (const [songKey, annSongIds] of songKeyToAnnSongIds) {
  if (annSongIds.size <= 1) continue;
  crossMergeCount++;

  const merged = new Set();
  for (const id of annSongIds) {
    const titles = titlesByAnnSongId.get(id);
    if (titles) {
      for (const t of titles) merged.add(t);
    }
  }

  for (const id of annSongIds) {
    titlesByAnnSongId.set(id, merged);
  }

  // Log the first few merges as examples
  if (crossMergeCount <= 5) {
    const [artist, name] = songKey.split('\0');
    console.log(`  Cross-merge: "${artist} - ${name}" -> ${[...annSongIds].join(', ')} (${merged.size} titles)`);
  }
}

// Build output
const result = {};
let multiTitleCount = 0;
for (const [id, titles] of titlesByAnnSongId) {
  const arr = [...titles];
  result[id] = arr;
  if (arr.length > 1) multiTitleCount++;
}

console.log('');
console.log(`Unique annSongIds:       ${titlesByAnnSongId.size}`);
console.log(`With 2+ working titles:  ${multiTitleCount}`);
console.log(`Cross-id merges:         ${crossMergeCount}`);

if (dryRun) {
  console.log(`\n[DRY RUN] Would write to ${OUTPUT_PATH}`);
} else {
  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(OUTPUT_PATH, json, 'utf8');
  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`\nWritten to ${OUTPUT_PATH} (${sizeKB} KB)`);
}
