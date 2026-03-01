import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTERLIST_PATH = path.join(__dirname, '../src/lib/server/masterlist.json');

async function analyze() {
  console.log(`Analyzing: ${MASTERLIST_PATH}`);

  if (!fs.existsSync(MASTERLIST_PATH)) {
    console.error('File not found!');
    return;
  }

  const stats = fs.statSync(MASTERLIST_PATH);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`File size: ${fileSizeInMB} MB`);

  console.log('Reading file and parsing JSON... (this may take a few seconds for large files)');
  const start = Date.now();
  
  try {
    // Using readFileSync for large files can be memory intensive, 
    // but for 150MB it should be fine on most systems.
    const data = fs.readFileSync(MASTERLIST_PATH, 'utf8');
    const masterlist = JSON.parse(data);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Loaded ${masterlist.length} entries in ${duration}s`);

    const songTypes = {};
    const animeCount = new Set();
    const animeSongCounts = {};
    const songCategories = {};
    const vintageCounts = {};
    const noCategorySamples = [];

    for (const song of masterlist) {
      // Count song types
      const type = song.songType || 'Unknown';
      songTypes[type] = (songTypes[type] || 0) + 1;

      // Count unique anime and per-anime song counts
      if (song.annId) {
        animeCount.add(song.annId);
        const animeName = song.animeENName || song.animeJPName || `ID: ${song.annId}`;
        animeSongCounts[animeName] = (animeSongCounts[animeName] || 0) + 1;
      }

      // Count song categories
      const category = song.songCategory || 'Unknown';
      songCategories[category] = (songCategories[category] || 0) + 1;

      // Collect samples for "No Category"
      if (category === 'No Category' && noCategorySamples.length < 3) {
        noCategorySamples.push(song);
      }

      // Count vintages
      const vintage = song.animeVintage || 'Unknown';
      vintageCounts[vintage] = (vintageCounts[vintage] || 0) + 1;
    }

    console.log('\n--- Basic Info ---');
    console.log(`Total Songs: ${masterlist.length}`);
    console.log(`Unique Anime (by annId): ${animeCount.size}`);

    console.log('\n--- Song Types ---');
    Object.entries(songTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`${type.padEnd(20)}: ${count}`);
      });

    console.log('\n--- Song Categories ---');
    Object.entries(songCategories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([cat, count]) => {
        console.log(`${cat.padEnd(20)}: ${count}`);
      });

    console.log('\n--- Top 10 Anime by Song Count ---');
    Object.entries(animeSongCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count]) => {
        console.log(`${name.substring(0, 30).padEnd(30)}: ${count}`);
      });

    console.log('\n--- Top 10 Vintages ---');
    Object.entries(vintageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([v, count]) => {
        console.log(`${v.padEnd(20)}: ${count}`);
      });

    if (noCategorySamples.length > 0) {
      console.log('\n--- Samples of "No Category" entries ---');
      console.log(JSON.stringify(noCategorySamples, null, 2));
    }

    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`\nMemory usage: ~${Math.round(used)} MB`);

  } catch (err) {
    console.error('Error parsing JSON:', err.message);
    console.log('If you are seeing a memory error, try running with: node --max-old-space-size=4096 scripts/analyze-masterlist.js');
  }
}

analyze();

