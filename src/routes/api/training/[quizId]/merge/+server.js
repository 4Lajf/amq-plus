/**
 * POST /api/training/[quizId]/merge
 * Merge training progress from another quiz
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { mergeProgress } from '$lib/server/training/training-utils.js';

// @ts-ignore
export async function POST({ params, request, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { quizId } = params;
    const { sourceQuizId } = await request.json();

    if (!sourceQuizId) {
      return json({ error: 'sourceQuizId required' }, { status: 400 });
    }

    if (sourceQuizId === quizId) {
      return json({ error: 'Cannot merge quiz with itself' }, { status: 400 });
    }

    // Verify user owns both target and source quizzes before merge
    const { data: targetQuiz } = await supabaseAdmin
      .from('quiz_configurations')
      .select('user_id')
      .eq('id', quizId)
      .single();

    const { data: sourceQuiz } = await supabaseAdmin
      .from('quiz_configurations')
      .select('user_id')
      .eq('id', sourceQuizId)
      .single();

    if (!targetQuiz || targetQuiz.user_id !== userId) {
      return json({ error: 'You do not have permission to merge into this quiz' }, { status: 403 });
    }

    if (!sourceQuiz || sourceQuiz.user_id !== userId) {
      return json({ error: 'You do not have permission to merge from this quiz' }, { status: 403 });
    }

    // Perform merge
    const result = await mergeProgress(supabaseAdmin, quizId, sourceQuizId, userId);

    return json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error merging progress:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

