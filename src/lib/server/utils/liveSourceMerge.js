/**
 * Live source merging
 *
 * A "live" source takes its roster from the AMQ lobby at play time rather than
 * from the saved quiz. It used to be its own source type ('live-node'); it was
 * folded into 'batch-user-list' with mode: 'live' (see
 * BATCH_USER_LIST_DEFAULT_SETTINGS) and the old type is now legacy - only quizzes
 * saved before the merge still carry it.
 *
 * Both shapes have to be recognised. Matching only the retired type means the
 * lobby roster is dropped and generation falls back to the placeholder entries
 * the quiz was saved with - in live mode that is a single blank username, so the
 * pool comes out empty.
 *
 * @module lib/server/utils/liveSourceMerge
 */

/**
 * Whether a route source draws its users from the lobby at play time.
 * @param {Object} src - Route source
 * @returns {boolean}
 */
export function isLiveSource(src) {
  if (!src) return false;
  return (
    src.sourceType === 'live-node' ||
    (src.sourceType === 'batch-user-list' && src.mode === 'live')
  );
}

/**
 * Apply the lobby roster to every live source in the given routes, in place.
 *
 * The roster replaces `userEntries` rather than merging into it: for a live
 * source the saved entries are placeholders, and the lobby is the only source
 * of truth.
 *
 * @param {Array<Object>} routes - Route array from configuration_data (mutated)
 * @param {Object|null} liveNodeData - { userEntries, useEntirePool, minSharedUsers }
 * @returns {{ merged: number, liveSources: number }} counts for logging
 */
export function mergeLiveNodeData(routes, liveNodeData) {
  const allSources = (routes || []).flatMap((route) => route?.sources || []);
  const liveSources = allSources.filter(isLiveSource);

  if (!liveNodeData || !Array.isArray(liveNodeData.userEntries)) {
    return { merged: 0, liveSources: liveSources.length };
  }

  for (const src of liveSources) {
    src.useEntirePool = liveNodeData.useEntirePool || false;
    src.userEntries = liveNodeData.userEntries;
    src.minSharedUsers = Number(liveNodeData.minSharedUsers) || 0;
  }

  return { merged: liveSources.length, liveSources: liveSources.length };
}
