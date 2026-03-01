/**
 * POST /api/training/session/[sessionId]/progress
 * Report song completion and update training progress
 * Real-time sync after each song
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { verifyToken } from '$lib/server/training/training-utils.js';
import { trainingScheduler, Rating } from '$lib/server/training/fsrs-service.js';

// @ts-ignore
export async function POST({ params, request }) {

  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { sessionId } = params;
    const { token, songKey, annSongId, rating, success, userAnswer, correctAnswer } = await request.json();

    if (!token || rating === undefined) {
      return json({ error: 'Token and rating required' }, { status: 400 });
    }

    if (success === undefined) {
      return json({ error: 'Success is required' }, { status: 400 });
    }

    // annSongId (numeric) is the primary identifier
    if (!annSongId) {
      return json({ error: 'annSongId is required' }, { status: 400 });
    }

    const songIdentifier = annSongId;
    const songKeyText = songKey || String(annSongId);

    // Validate rating (1-4)
    if (rating < Rating.Again || rating > Rating.Easy) {
      return json({ error: 'Rating must be between 1 (Again) and 4 (Easy)' }, { status: 400 });
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

    // Fetch session to get quiz_id
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('training_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      console.error('[TRAINING PROGRESS] Session not found or error:', { sessionId, userId, sessionError });
      return json({
        error: 'Session not found',
        details: sessionError ? sessionError.message : 'No session found with this ID for this user',
        sessionId
      }, { status: 404 });
    }

    const quizId = session.quiz_id;

    // Fetch or create training progress record by numeric song_ann_id
    const { data: existingProgress } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('song_ann_id', annSongId)
      .single();

    const now = new Date().toISOString();
    const isSuccess = success === true;

    // Capture state before update for history
    const fsrsBefore = existingProgress
      ? existingProgress.fsrs_state
      : trainingScheduler.createNewCard(String(songIdentifier));

    let updatedProgress;
    let fsrsAfter; // To store state after update

    if (existingProgress) {
      // Update existing progress
      const newFsrsState = trainingScheduler.updateCardState(
        existingProgress.fsrs_state,
        rating
      );
      fsrsAfter = newFsrsState;

      // Update streaks
      const newSuccessStreak = isSuccess ? existingProgress.success_streak + 1 : 0;
      const newFailureStreak = !isSuccess ? existingProgress.failure_streak + 1 : 0;

      // Add to history
      const historyEntry = {
        timestamp: now,
        success: isSuccess,
        rating
      };
      const newHistory = [...(existingProgress.history || []), historyEntry];

      updatedProgress = {
        fsrs_state: newFsrsState,
        attempt_count: existingProgress.attempt_count + 1,
        success_count: existingProgress.success_count + (isSuccess ? 1 : 0),
        failure_count: existingProgress.failure_count + (isSuccess ? 0 : 1),
        success_streak: newSuccessStreak,
        failure_streak: newFailureStreak,
        history: newHistory,
        last_attempt_at: now,
        is_active: true, // Reactivate if it was inactive
        inactivated_at: null
      };

      const { error: updateError } = await supabaseAdmin
        .from('training_progress')
        .update(updatedProgress)
        .eq('id', existingProgress.id);

      if (updateError) {
        console.error('Error updating progress:', updateError);
        return json({ error: 'Failed to update progress' }, { status: 500 });
      }
    } else {
      // Create new progress record
      const newFsrsState = trainingScheduler.createNewCard(String(songIdentifier));
      const updatedFsrsState = trainingScheduler.updateCardState(newFsrsState, rating);
      fsrsAfter = updatedFsrsState;

      const historyEntry = {
        timestamp: now,
        success: isSuccess,
        rating
      };

      updatedProgress = {
        user_id: userId,
        quiz_id: quizId,
        song_ann_id: annSongId,
        fsrs_state: updatedFsrsState,
        attempt_count: 1,
        success_count: isSuccess ? 1 : 0,
        failure_count: isSuccess ? 0 : 1,
        success_streak: isSuccess ? 1 : 0,
        failure_streak: isSuccess ? 0 : 1,
        history: [historyEntry],
        last_attempt_at: now,
        is_active: true,
        inactivated_at: null
      };

      const { error: insertError } = await supabaseAdmin
        .from('training_progress')
        .insert(updatedProgress);

      if (insertError) {
        console.error('Error inserting progress:', insertError);
        return json({ error: 'Failed to create progress record' }, { status: 500 });
      }
    }

    // Record individual play in training_session_plays
    try {
      const insertResult = await supabaseAdmin.from('training_session_plays').insert({
        user_id: userId,
        session_id: sessionId,
        quiz_id: quizId,
        song_ann_id: annSongId,
        played_at: now,
        rating,
        success: isSuccess,
        user_answer: userAnswer || null,
        correct_answer: correctAnswer || null,
        fsrs_before: fsrsBefore,
        fsrs_after: fsrsAfter
      });

      if (insertResult.error) {
        console.error('[TRAINING PROGRESS] Error inserting play:', insertResult.error);
      } else {
        console.log('[TRAINING PROGRESS] ✓ Recorded play:', { song_ann_id: annSongId, userAnswer, correctAnswer, success: isSuccess });
      }
    } catch (playError) {
      console.error('[TRAINING PROGRESS] Exception recording play history:', playError);
      // Non-fatal, continue
    }

    // Update session counts
    const updateFields = isSuccess
      ? { correct_songs: session.correct_songs + 1 }
      : { incorrect_songs: session.incorrect_songs + 1 };

    await supabaseAdmin
      .from('training_sessions')
      .update(updateFields)
      .eq('id', sessionId);

    return json({
      success: true,
      nextReview: updatedProgress.fsrs_state?.due,
      currentStreak: isSuccess ? updatedProgress.success_streak : updatedProgress.success_streak
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

