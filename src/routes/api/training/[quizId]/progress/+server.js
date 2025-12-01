/**
 * Training Progress API
 * GET: Fetch all training progress for a quiz
 * POST: Batch update progress (for offline sync)
 * DELETE: Delete all progress for a quiz
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { verifyToken } from '$lib/server/training/training-utils.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';

// GET: Fetch training progress
// @ts-ignore
export async function GET({ params, url, locals: { safeGetSession } }) {
  const { quizId } = params;
  const token = url.searchParams.get('token');


  const supabaseAdmin = createSupabaseAdmin();

  try {
    let userId;

    // Check if authenticated via session or token
    const { session } = await safeGetSession();

    if (session) {
      userId = session.user.id;
    } else if (token) {
      // Verify connector token
      const { data: tokens } = await supabaseAdmin
        .from('training_tokens')
        .select('*');

      let validToken = null;
      for (const dbToken of tokens || []) {
        const isValid = await verifyToken(token, dbToken.token_hash);
        if (isValid) {
          validToken = dbToken;
          break;
        }
      }

      if (!validToken) {
        return json({ error: 'Invalid token' }, { status: 401 });
      }

      userId = validToken.user_id;
    } else {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch progress
    const { data: progress, error } = await supabase
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .order('last_attempt_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching progress:', error);
      return json({ error: 'Failed to fetch progress' }, { status: 500 });
    }

    return json({ progress: progress || [] });
  } catch (error) {
    console.error('Error in GET progress:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Batch update progress (offline sync)
// @ts-ignore
export async function POST({ params, request }) {

  const supabaseAdmin = createSupabaseAdmin();
  try {
    const { quizId } = params;
    const { token, updates } = await request.json();

    if (!token || !updates || !Array.isArray(updates)) {
      return json({ error: 'Token and updates array required' }, { status: 400 });
    }

    // Verify token
    const { data: tokens } = await supabaseAdmin
      .from('training_tokens')
      .select('*');

    let validToken = null;
    for (const dbToken of tokens || []) {
      const isValid = await verifyToken(token, dbToken.token_hash);
      if (isValid) {
        validToken = dbToken;
        break;
      }
    }

    if (!validToken) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = validToken.user_id;
    let successCount = 0;
    let failCount = 0;

    // Process each update
    for (const update of updates) {
      try {
        const { songKey, rating, timestamp, success } = update;

        // Fetch or create progress
        const { data: existingProgress } = await supabaseAdmin
          .from('training_progress')
          .select('*')
          .eq('user_id', userId)
          .eq('quiz_id', quizId)
          .eq('song_key', songKey)
          .single();

        const isSuccess = success !== undefined ? success : rating >= 3;

        if (existingProgress) {
          // Update existing
          const newFsrsState = trainingScheduler.updateCardState(
            existingProgress.fsrs_state,
            rating
          );

          const historyEntry = {
            timestamp: timestamp || new Date().toISOString(),
            success: isSuccess,
            rating
          };

          await supabaseAdmin
            .from('training_progress')
            .update({
              fsrs_state: newFsrsState,
              attempt_count: existingProgress.attempt_count + 1,
              success_count: existingProgress.success_count + (isSuccess ? 1 : 0),
              failure_count: existingProgress.failure_count + (isSuccess ? 0 : 1),
              success_streak: isSuccess ? existingProgress.success_streak + 1 : 0,
              failure_streak: !isSuccess ? existingProgress.failure_streak + 1 : 0,
              history: [...(existingProgress.history || []), historyEntry],
              last_attempt_at: timestamp || new Date().toISOString()
            })
            .eq('id', existingProgress.id);

          successCount++;
        } else {
          // Create new
          const newCard = trainingScheduler.createNewCard(songKey);
          const fsrsState = trainingScheduler.updateCardState(newCard, rating);

          await supabaseAdmin.from('training_progress').insert({
            user_id: userId,
            quiz_id: quizId,
            song_key: songKey,
            fsrs_state: fsrsState,
            attempt_count: 1,
            success_count: isSuccess ? 1 : 0,
            failure_count: isSuccess ? 0 : 1,
            success_streak: isSuccess ? 1 : 0,
            failure_streak: isSuccess ? 0 : 1,
            history: [
              {
                timestamp: timestamp || new Date().toISOString(),
                success: isSuccess,
                rating
              }
            ],
            last_attempt_at: timestamp || new Date().toISOString()
          });

          successCount++;
        }
      } catch (err) {
        console.error('Error processing update:', err);
        failCount++;
      }
    }

    return json({ success: true, processed: successCount, failed: failCount });
  } catch (error) {
    console.error('Error in batch update:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete all progress for quiz
// @ts-ignore
export async function DELETE({ params, request, locals: { safeGetSession } }) {
  const { session } = await safeGetSession();

  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;


  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { quizId } = params;

    const { error } = await supabaseAdmin
      .from('training_progress')
      .delete()
      .eq('user_id', userId)
      .eq('quiz_id', quizId);

    if (error) {
      console.error('Error deleting progress:', error);
      return json({ error: 'Failed to delete progress' }, { status: 500 });
    }

    return json({ success: true, message: 'All progress deleted' });
  } catch (error) {
    console.error('Error in DELETE progress:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

