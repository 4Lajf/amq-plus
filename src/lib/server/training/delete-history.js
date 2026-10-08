import { error } from '@sveltejs/kit';
import { fetchAllPages } from '../utils/supabasePaging.js';
import { trainingScheduler } from './fsrs-service.js';
import { rebuildHistory, HistoryReplayError } from './history-replay.js';
import { REPLAY_VERSION, REPLAY_FINGERPRINT } from './replay-config.js';

function databaseError(failure) {
  if (!failure) return;
  if (failure.code === 'PT409' || failure.code === 'PT404')
    throw error(Number(failure.code.slice(2)), { message: failure.message });
  if (['PGRST202', '42P01', '42883'].includes(failure.code))
    throw error(503, { message: 'History deletion is unavailable until the checkpoint update is installed. Nothing was deleted.' });
  throw error(500, { message: 'Could not rebuild history. Nothing was deleted.' });
}

export async function deleteTrainingHistory(admin, userId, sessionId, playId = null) {
  const identity = { p_user_id: userId, p_session_id: sessionId, p_play_id: playId };
  for (let attempt = 0; attempt < 3; attempt++) {
    const prepared = await admin.rpc('prepare_training_history_deletion', identity);
    databaseError(prepared.error);
    const plan = prepared.data;
    if (!plan?.quizId || !Array.isArray(plan.requestIds) || !Array.isArray(plan.playIds) || typeof plan.revision !== 'string')
      throw error(500, { message: 'Invalid history snapshot. Nothing was deleted.' });
    const journal = await fetchAllPages(() => admin.from('training_history_journal').select('*')
      .eq('user_id', userId).eq('quiz_id', plan.quizId).order('id', { ascending: true }));
    databaseError(journal.error);
    // Check before computing too: a page may have crossed a concurrent merge.
    const fresh = await admin.rpc('prepare_training_history_deletion', identity);
    databaseError(fresh.error);
    if (fresh.data?.revision !== plan.revision) continue;
    let changes;
    try {
      changes = rebuildHistory(journal.data, plan.requestIds,
        (state, rating, options) => trainingScheduler.updateCardState(state, rating, options),
        { version: REPLAY_VERSION, fingerprint: REPLAY_FINGERPRINT });
    } catch (failure) {
      if (failure instanceof HistoryReplayError) throw error(409, { message: failure.message });
      throw error(500, { message: 'Progress rebuilding failed. Nothing was deleted.' });
    }
    const committed = await admin.rpc('commit_training_history_deletion', { ...identity,
      p_expected_revision: plan.revision, p_expected_play_ids: plan.playIds, p_changes: changes });
    databaseError(committed.error);
    if (committed.data?.status === 'stale') continue;
    if (committed.data?.status !== 'deleted') throw error(500, { message: 'History deletion was not confirmed.' });
    return committed.data;
  }
  throw error(409, { message: 'Training kept changing during rebuilding. Nothing was deleted; retry when training has finished.' });
}
