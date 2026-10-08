/**
 * Recover media omitted by saved imports without replacing list metadata or
 * existing playable links. Unknown IDs retain their original handling.
 * @param {Array<any>} songs
 * @param {Map<string, any>} index
 * @returns {Array<any>}
 */
export function resolveMissingSongMedia(songs, index) {
  return songs.map(song => {
    if (song.HQ || song.MQ || song.audio || song.annSongId == null) return song;
    const known = index.get(String(song.annSongId));
    if (!known || !(known.HQ || known.MQ || known.audio)) return song;
    return {
      ...song,
      HQ: known.HQ || null,
      MQ: known.MQ || null,
      audio: known.audio || null
    };
  });
}
