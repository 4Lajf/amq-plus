/** Explicitly forget a song, with history/counters/progress removed atomically. */
import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
// @ts-ignore
export async function DELETE({ params, url, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();
  if (!session) throw error(401, { message: 'Unauthorized' });
  const song = url.searchParams.get('songAnnId'), record = url.searchParams.get('recordId');
  if (!record && (!song || !Number.isInteger(Number(song)) || Number(song) <= 0))
    throw error(400, { message: 'A valid songAnnId or recordId is required' });
  const result = await createSupabaseAdmin().rpc('clear_training_song_history', {
    p_user_id: session.user.id, p_quiz_id: params.quizId, p_song_ann_id: song ? Number(song) : null, p_record_id: record || null
  });
  if (result.error) {
    if (['PT403', 'PT404', 'PT409'].includes(result.error.code))
      throw error(Number(result.error.code.slice(2)), { message: result.error.message });
    throw error(503, { message: 'Song history could not be deleted. Nothing was changed; the checkpoint update may still be pending.' });
  }
  return json(result.data);
}
