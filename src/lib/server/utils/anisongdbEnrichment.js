/**
 * AnisongDB fetching and enrichment utilities
 * Handles fetching songs from AnisongDB and enriching them with sourceAnime data
 * 
 * @module lib/server/utils/anisongdbEnrichment
 */

/**
 * Fetch songs from AnisongDB and enrich with sourceAnime data
 * @param {number[]} malIds - Array of MyAnimeList IDs
 * @param {Array} animeList - Array of anime objects with metadata
 * @param {Function} fetchSongsFn - Function to fetch songs from AnisongDB (defaults to using fetchSongsFromAnisongDB)
 * @returns {Promise<Array>} Array of enriched song objects with sourceAnime attached
 */
export async function fetchAndEnrichSongs(malIds, animeList, fetchSongsFn) {
  if (!malIds || malIds.length === 0) {
    return [];
  }

  // Fetch songs from AnisongDB
  const fetchedSongs = await fetchSongsFn(malIds);

  // Enrich songs with sourceAnime data
  const enrichedSongs = fetchedSongs.map((song) => {
    const songMalId = song.malId || song.linked_ids?.myanimelist;
    const sourceAnime = animeList.find((a) => a.malId === songMalId);

    if (!sourceAnime) {
      console.warn(
        '[SONG ENRICHMENT] Could not find sourceAnime for song:',
        song.songName,
        'MAL ID:',
        songMalId
      );
    }

    return { ...song, sourceAnime, source: 'list' };
  });

  return enrichedSongs;
}

