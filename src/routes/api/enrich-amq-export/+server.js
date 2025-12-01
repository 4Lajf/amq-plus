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

    if (!Array.isArray(songs)) {
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

    // Enrich songs with masterlist data and AniList data
    const enrichedSongs = songs.map((song) => {
      if (!song.annSongId) {
        return song; // Skip songs without annSongId
      }

      const masterlistSong = masterlistMap.get(song.annSongId);
      if (!masterlistSong) {
        return song; // Return original if not found in masterlist
      }

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

    return json({
      songs: enrichedSongs,
      anilistIds: anilistIdsFromMasterlist
    });
  } catch (error) {
    console.error('Error enriching AMQ export:', error);
    return json({ error: 'Failed to enrich export data' }, { status: 500 });
  }
}

