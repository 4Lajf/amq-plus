/**
 * GET /api/training/[quizId]/sessions
 * Get historical training sessions for a quiz
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

// @ts-ignore
export async function GET({ params, url, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  
  
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { quizId } = params;

    // Pagination
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Fetch sessions
    const { data: sessions, error: sessionsError, count } = await supabaseAdmin
      .from('training_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    // Calculate stats for each session
    const sessionsWithStats = (sessions || []).map((s) => {
      const duration = s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;

      const totalAnswered = s.correct_songs + s.incorrect_songs;
      const accuracy =
        totalAnswered > 0 ? Math.round((s.correct_songs / totalAnswered) * 100) : 0;

      return {
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        totalSongs: s.total_songs,
        correctSongs: s.correct_songs,
        incorrectSongs: s.incorrect_songs,
        accuracy,
        durationMinutes: duration,
        isComplete: !!s.ended_at
      };
    });

    return json({
      sessions: sessionsWithStats,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

