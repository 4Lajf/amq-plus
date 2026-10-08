import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MASTERLIST_PATH = path.join(__dirname, '../src/lib/server/masterlist.json');
const OUTPUT_PATH = path.join(__dirname, '../no-category-songs.json');

async function extract() {
  console.log(`Reading: ${MASTERLIST_PATH}`);

  if (!fs.existsSync(MASTERLIST_PATH)) {
    console.error('File not found!');
    return;
  }

  try {
    const data = fs.readFileSync(MASTERLIST_PATH, 'utf8');
    const masterlist = JSON.parse(data);
    
    console.log(`Filtering ${masterlist.length} entries...`);
    const noCategorySongs = masterlist
      .filter(song => song.songCategory === 'No Category')
      .map(song => ({
        animeENName: song.animeENName,
        animeJPName: song.animeJPName,
        animeVintage: song.animeVintage,
        songType: song.songType,
        songName: song.songName,
        songArtist: song.songArtist,
        songCategory: song.songCategory,
        animeType: song.animeType,
        animeCategory: song.animeCategory,
        songDifficulty: song.songDifficulty,
        songLength: song.songLength,
        isDub: song.isDub,
        isRebroadcast: song.isRebroadcast
      }));
    
    console.log(`Found ${noCategorySongs.length} entries with "No Category"`);
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(noCategorySongs, null, 2));
    console.log(`Successfully extracted to: ${OUTPUT_PATH}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

extract();

