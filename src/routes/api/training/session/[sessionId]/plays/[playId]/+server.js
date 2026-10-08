/** Delete an attempt and its scheduling effects in one checked transaction. */
import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { deleteTrainingHistory } from '$lib/server/training/delete-history.js';
// @ts-ignore
export async function DELETE({ params, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();
  if (!session) throw error(401, { message: 'Unauthorized' });
  return json(await deleteTrainingHistory(createSupabaseAdmin(), session.user.id, params.sessionId, params.playId));
}
