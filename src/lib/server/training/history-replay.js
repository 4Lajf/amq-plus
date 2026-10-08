export class HistoryReplayError extends Error {
  constructor(message) { super(message); this.status = 409; }
}

/** Pure replay of recorded transitions. Checkpoints contain imported counters
 * and history; a duplicate event copies only scheduling state, just as rating does. */
export function rebuildHistory(journal, removedRequests, schedule, supportedOptions) {
  const removed = new Set(removedRequests), states = new Map(), dirty = new Set(), affected = new Set(), found = new Set();
  let previousId = 0n;
  for (const event of journal) {
    const id = BigInt(event.id);
    if (id <= previousId) throw new HistoryReplayError('History order is incomplete or ambiguous. Nothing was deleted.');
    previousId = id;
    const song = event.song_ann_id;
    if (event.kind === 'checkpoint') {
      if (affected.has(song)) throw new HistoryReplayError('A later import, merge or schedule replacement includes this attempt. It cannot be undone independently; nothing was deleted.');
      states.set(song, structuredClone(event.snapshot));
      dirty.delete(song);
      continue;
    }
    if (event.kind !== 'rating') throw new HistoryReplayError('Unknown history event. Nothing was deleted.');
    // Original later snapshots still include this old rating. Recompute them
    // even when this request is deleting a different song or a later attempt.
    if (event.deleted) { dirty.add(song); continue; }
    const payload = event.payload;
    if (!payload || ![1, 2, 3, 4].includes(payload.rating) || typeof payload.success !== 'boolean' ||
        !Number.isFinite(Date.parse(payload.playedAt))) throw new HistoryReplayError('Incomplete rating history. Nothing was deleted.');
    if (!states.get(song)) throw new HistoryReplayError('Missing scheduling checkpoint. Nothing was deleted.');
    if (removed.has(event.request_id)) {
      dirty.add(song); affected.add(song); found.add(event.request_id); continue;
    }
    const state = states.get(song), source = payload.sourceSong;
    if (source === song) {
      if (dirty.has(song)) {
        if (payload.options?.version !== supportedOptions.version || payload.options?.fingerprint !== supportedOptions.fingerprint ||
            typeof payload.options?.allowSameDayReviews !== 'boolean')
          throw new HistoryReplayError('This rating needs a different saved scheduler version. Nothing was deleted.');
        state.fsrs_state = schedule(state.fsrs_state, payload.rating, { ...payload.options, now: payload.playedAt });
      } else state.fsrs_state = structuredClone(payload.after);
      state.attempt_count++;
      state.success_count += Number(payload.success);
      state.failure_count += Number(!payload.success);
      state.success_streak = payload.success ? state.success_streak + 1 : 0;
      state.failure_streak = payload.success ? 0 : state.failure_streak + 1;
      state.last_attempt_at = payload.playedAt;
      state.history ??= [];
      state.history.push({ timestamp: payload.playedAt, success: payload.success,
        rating: payload.rating, requestId: payload.requestId });
    } else {
      // The primary transition is recorded before its duplicate updates.
      if (dirty.has(source)) {
        if (!states.get(source)) throw new HistoryReplayError('Missing duplicate source checkpoint. Nothing was deleted.');
        state.fsrs_state = { ...structuredClone(states.get(source).fsrs_state), songKey: state.fsrs_state?.songKey || String(song) };
        dirty.add(song);
        if (affected.has(source)) affected.add(song);
      } else state.fsrs_state = { ...structuredClone(payload.after), songKey: state.fsrs_state?.songKey || String(song) };
    }
  }
  if ([...removed].some(request => !found.has(request))) throw new HistoryReplayError('An attempt is missing from replay history. Nothing was deleted.');
  return [...affected].sort((a, b) => a - b).map(song => ({ song_ann_id: song, ...states.get(song) }));
}
