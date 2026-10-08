/**
 * POST /api/training/session/[sessionId]/progress
 * Atomically record one idempotent song rating.
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { findDuplicateSiblings } from '$lib/server/training/duplicate-groups.js';
import { replayOptions } from '$lib/server/training/replay-config.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';
import {
	parseTrainingRatingRequest,
	validateRatingOrder,
	validateRatingTimestamp
} from '$lib/server/training/rating-request.js';
import { getUserTrainingPreferences } from '$lib/server/training/user-preferences.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';

const MAX_STALE_RETRIES = 3;

function commitError(result) {
	switch (result?.status) {
		case 'not_found':
			return { status: 404, message: result.message || 'Session not found' };
		case 'song_not_in_session':
		case 'idempotency_conflict':
			return {
				status: 409,
				message: result.message || 'Rating request conflicts with existing data'
			};
		case 'invalid':
			return { status: 400, message: result.message || 'The rating payload is invalid' };
		default:
			return null;
	}
}

function commitSuccess(result) {
	return {
		success: true,
		nextReview: result.nextReview,
		currentStreak: result.currentStreak,
		duplicatesUpdated: result.duplicatesUpdated || 0,
		idempotentReplay: result.idempotentReplay === true
	};
}

async function replayCommittedRating(supabaseAdmin, userId, sessionId, ratingRequest) {
	const { data: existingCommit, error: lookupError } = await supabaseAdmin
		.from('training_rating_commits')
		.select('request_id')
		.eq('request_id', ratingRequest.requestId)
		.maybeSingle();

	if (lookupError || !existingCommit) {
		return { result: null, error: lookupError };
	}

	// The transaction checks the payload fingerprint and returns the stored
	// response before it considers these placeholder scheduler states.
	const { data: result, error } = await supabaseAdmin.rpc('commit_training_rating_checkpointed', {
		p_user_id: userId,
		p_session_id: sessionId,
		p_request_id: ratingRequest.requestId,
		p_ann_song_id: ratingRequest.annSongId,
		p_rating: ratingRequest.rating,
		p_success: ratingRequest.success,
		p_played_at: ratingRequest.playedAt,
		p_expected_progress_id: null,
		p_expected_updated_at: null,
		p_fsrs_before: {},
		p_fsrs_after: {},
		p_user_answer: ratingRequest.userAnswer,
		p_correct_answer: ratingRequest.correctAnswer,
		p_duplicate_song_ids: [],
		p_replay_options: replayOptions(true)
	});

	return { result, error };
}

// @ts-ignore
export async function POST({ params, request }) {
	const supabaseAdmin = createSupabaseAdmin();

	try {
		const parsed = parseTrainingRatingRequest(await request.json());
		if (parsed.error) return json({ error: parsed.error }, { status: 400 });

		const ratingRequest = parsed.value;
		const validToken = await lookupToken(supabaseAdmin, ratingRequest.token);
		if (!validToken) return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });

		const userId = validToken.user_id;
		const sessionId = params.sessionId;
		const { data: session, error: sessionError } = await supabaseAdmin
			.from('training_sessions')
			.select('id, user_id, quiz_id, started_at, session_data')
			.eq('id', sessionId)
			.eq('user_id', userId)
			.single();

		if (sessionError || !session) {
			console.error('[TRAINING PROGRESS] Session lookup failed:', { sessionId, sessionError });
			return json({ error: 'Session not found', sessionId }, { status: 404 });
		}

		const timestampError = validateRatingTimestamp(ratingRequest.playedAt, session.started_at);
		if (timestampError) return json({ error: timestampError }, { status: 400 });

		const playlistIds = session.session_data?.playlistAnnSongIds;
		if (
			Array.isArray(playlistIds) &&
			playlistIds.length > 0 &&
			!playlistIds.some((id) => Number(id) === ratingRequest.annSongId)
		) {
			return json(
				{
					error: 'Song is not part of this training session playlist',
					annSongId: ratingRequest.annSongId
				},
				{ status: 409 }
			);
		}

		const preferences = await getUserTrainingPreferences(supabaseAdmin, userId, session.quiz_id);
		const scheduleOptions = {
			allowSameDayReviews: preferences.allow_same_day_reviews,
			now: ratingRequest.playedAt
		};

		let duplicateSongIds = [];
		if (session.session_data?.combineDuplicates === true) {
			duplicateSongIds = await findDuplicateSiblings(supabaseAdmin, ratingRequest.annSongId);
		}

		for (let attempt = 0; attempt < MAX_STALE_RETRIES; attempt++) {
			const { data: existingRecords, error: progressError } = await supabaseAdmin
				.from('training_progress')
				.select('id, fsrs_state, updated_at, last_attempt_at')
				.eq('user_id', userId)
				.eq('quiz_id', session.quiz_id)
				.eq('song_ann_id', ratingRequest.annSongId)
				.limit(1);

			if (progressError) {
				console.error('[TRAINING PROGRESS] Could not read progress:', progressError);
				return json({ error: 'Failed to read training progress' }, { status: 500 });
			}

			const existingProgress = existingRecords?.[0] || null;
			const orderError =
				validateRatingOrder(ratingRequest.playedAt, existingProgress?.last_attempt_at) ||
				validateRatingOrder(ratingRequest.playedAt, existingProgress?.fsrs_state?.last_review);
			if (orderError) {
				// A retry can legitimately be older than a later answer. Give the
				// idempotency ledger the chance to replay it before rejecting it.
				const replay = await replayCommittedRating(supabaseAdmin, userId, sessionId, ratingRequest);
				if (replay.error) {
					console.error('[TRAINING PROGRESS] Could not verify an older retry:', replay.error);
					return json({ error: 'Failed to verify the rating request' }, { status: 500 });
				}
				if (replay.result) {
					const replayError = commitError(replay.result);
					if (replayError) {
						return json({ error: replayError.message }, { status: replayError.status });
					}
					if (replay.result.success === true) return json(commitSuccess(replay.result));
				}
				return json({ error: orderError }, { status: 409 });
			}

			const fsrsBefore = existingProgress
				? existingProgress.fsrs_state
				: trainingScheduler.createNewCard(
						String(ratingRequest.annSongId),
						new Date(ratingRequest.playedAt)
					);
			const fsrsAfter = trainingScheduler.updateCardState(
				fsrsBefore,
				ratingRequest.rating,
				scheduleOptions
			);

			const { data: result, error: commitRpcError } = await supabaseAdmin.rpc(
				'commit_training_rating_checkpointed',
				{
					p_user_id: userId,
					p_session_id: sessionId,
					p_request_id: ratingRequest.requestId,
					p_ann_song_id: ratingRequest.annSongId,
					p_rating: ratingRequest.rating,
					p_success: ratingRequest.success,
					p_played_at: ratingRequest.playedAt,
					p_expected_progress_id: existingProgress?.id ?? null,
					p_expected_updated_at: existingProgress?.updated_at ?? null,
					p_fsrs_before: fsrsBefore,
					p_fsrs_after: fsrsAfter,
					p_user_answer: ratingRequest.userAnswer,
					p_correct_answer: ratingRequest.correctAnswer,
					p_duplicate_song_ids: duplicateSongIds,
					p_replay_options: replayOptions(preferences.allow_same_day_reviews)
				}
			);

			if (commitRpcError) {
				console.error('[TRAINING PROGRESS] Atomic commit failed:', commitRpcError);
				return json({ error: 'Failed to save training progress' }, { status: 500 });
			}

			if (result?.status === 'stale') continue;

			const mappedError = commitError(result);
			if (mappedError) {
				return json({ error: mappedError.message }, { status: mappedError.status });
			}

			if (result?.success !== true) {
				console.error('[TRAINING PROGRESS] Unexpected commit response:', result);
				return json({ error: 'Failed to save training progress' }, { status: 500 });
			}

			return json(commitSuccess(result));
		}

		return json(
			{ error: 'Training progress changed repeatedly; please retry this rating' },
			{ status: 503 }
		);
	} catch (error) {
		console.error('[TRAINING PROGRESS] Unexpected error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
