import { json } from '@sveltejs/kit';
// @ts-ignore
import masterlist from '$lib/server/masterlist.json';

/**
 * Enrich AMQ export songs with data from masterlist.json and AniList
 * @param {Request} request
 * @returns {Promise<Response>}
 */
// @ts-ignore
export async function POST({ request }) {
  try {
    const { songs } = await request.json();
    console.log(`[ENRICH API] Received ${songs?.length || 0} songs to enrich`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2fbe1aae-e005-43ec-9225-34585230a3a9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H1',location:'+server.js:enrich-amq-export:entry',message:'enrich-amq-export POST entry',data:{songsIsArray:Array.isArray(songs),songsLen:Array.isArray(songs)?songs.length:null,annSongIdTypeSample:Array.isArray(songs)?songs.slice(0,8).map(s=>typeof s?.annSongId):[],annSongIdSample:Array.isArray(songs)?songs.slice(0,8).map(s=>s?.annSongId):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!Array.isArray(songs)) {
      console.error('[ENRICH API] Error: songs is not an array');
      return json({ error: 'Invalid request: songs must be an array' }, { status: 400 });
    }

    // Create a lookup map by annSongId for fast matching
    const masterlistMap = new Map();
    // @ts-ignore
    if (Array.isArray(masterlist)) {
      masterlist.forEach((song) => {
        if (song.annSongId) {
          masterlistMap.set(song.annSongId, song);
        }
      });
    }
    console.log(`[ENRICH API] Masterlist loaded with ${masterlistMap.size} unique annSongIds`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2fbe1aae-e005-43ec-9225-34585230a3a9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H1',location:'+server.js:enrich-amq-export:masterlistMap',message:'masterlistMap built',data:{masterlistMapSize:masterlistMap.size,hasKeyNumberExample:masterlistMap.has(1),hasKeyStringExample:masterlistMap.has('1')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const anilistIdsFromMasterlist = [
      ...new Set(
        songs
          .map((song) => {
            if (!song.annSongId) return null;
            const masterlistSong = masterlistMap.get(song.annSongId);
            return masterlistSong?.linked_ids?.anilist;
          })
          .filter((id) => id != null)
      )
    ];

    let enrichedCount = 0;
    let missingCount = 0;
    const missingAnnSongIds = [];
    const missingSamples = [];

    // Enrich songs with masterlist data and AniList data
    const enrichedSongs = songs.map((song) => {
      if (!song.annSongId) {
        return song; // Skip songs without annSongId
      }

      const masterlistSong = masterlistMap.get(song.annSongId);
      if (!masterlistSong) {
        missingCount++;
        missingAnnSongIds.push(song.annSongId);
        if (missingSamples.length < 6) {
          const raw = song.annSongId;
          const num = Number(raw);
          const str = String(raw);
          missingSamples.push({
            annSongId: raw,
            annSongIdType: typeof raw,
            hasRaw: masterlistMap.has(raw),
            hasAsNumber: Number.isFinite(num) ? masterlistMap.has(num) : null,
            hasAsString: masterlistMap.has(str)
          });
        }
        return song; // Return original if not found in masterlist
      }

      enrichedCount++;
      // Convert startPoint/sampleEnd to sampleRanges format
      const songLength = masterlistSong.songLength || 90;
      const startPoint = song.startPoint || 0;
      const sampleEnd = song.sampleEnd || 100;

      // Convert percentage to seconds if needed (if > 100, assume it's seconds)
      const startSeconds = startPoint > 100 ? startPoint : (startPoint / 100) * songLength;
      const endSeconds = sampleEnd > 100 ? sampleEnd : (sampleEnd / 100) * songLength;

      const anilistId = masterlistSong.linked_ids?.anilist;

      // Build flattened song object matching masterlist format
      const enrichedSong = {
        // Masterlist fields
        annId: masterlistSong.annId || null,
        annSongId: masterlistSong.annSongId,
        amqSongId: masterlistSong.amqSongId || null,
        animeENName: masterlistSong.animeENName || '',
        animeJPName: masterlistSong.animeJPName || '',
        animeAltName: masterlistSong.animeAltName || null,
        animeVintage: masterlistSong.animeVintage || '',
        linked_ids: masterlistSong.linked_ids || {},
        animeType: masterlistSong.animeType || '',
        animeCategory: masterlistSong.animeCategory || null,
        songType: masterlistSong.songType || '',
        songName: masterlistSong.songName || '',
        songArtist: masterlistSong.songArtist || '',
        songComposer: masterlistSong.songComposer || null,
        songArranger: masterlistSong.songArranger || null,
        songDifficulty: masterlistSong.songDifficulty || 0,
        songCategory: masterlistSong.songCategory || null,
        songLength: masterlistSong.songLength || 90,
        isDub: masterlistSong.isDub || false,
        isRebroadcast: masterlistSong.isRebroadcast || false,
        HQ: masterlistSong.HQ || null,
        MQ: masterlistSong.MQ || null,
        audio: masterlistSong.audio || null,
        artists: masterlistSong.artists || [],
        composers: masterlistSong.composers || [],
        arrangers: masterlistSong.arrangers || [],
        sourceAnime: masterlistSong.sourceAnime || null,
        source: 'global',

        // Quiz-specific settings
        sampleRanges: [
          {
            start: startSeconds,
            end: endSeconds,
            randomStartPosition: true
          }
        ],

        // Playback speed (default to static 1.0 since not in export)
        playbackSpeed: {
          mode: 'static',
          staticValue: 1,
          randomValues: [1]
        }
      };

      // Add guessTime if provided
      if (song.guessTime !== undefined && song.guessTime !== null) {
        enrichedSong.guessTime = song.guessTime;
      }

      // Add extraGuessTime if provided
      if (song.extraGuessTime !== undefined && song.extraGuessTime !== null) {
        enrichedSong.extraGuessTime = song.extraGuessTime;
      }

      if (anilistId) {
        enrichedSong.anilistId = anilistId;
      }

      return enrichedSong;
    });

    console.log(`[ENRICH API] Enrichment complete: ${enrichedCount} enriched, ${missingCount} missing from masterlist`);
    if (missingAnnSongIds.length > 0) {
      console.log(`[ENRICH API] Missing annSongIds:`, missingAnnSongIds);
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2fbe1aae-e005-43ec-9225-34585230a3a9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'pre-fix',hypothesisId:'H2',location:'+server.js:enrich-amq-export:done',message:'enrich-amq-export result summary',data:{inputSongsLen:songs.length,enrichedCount,missingCount,missingSamples},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return json({
      songs: enrichedSongs,
      anilistIds: anilistIdsFromMasterlist
    });
  } catch (error) {
    console.error('Error enriching AMQ export:', error);
    return json({ error: 'Failed to enrich export data' }, { status: 500 });
  }
}

