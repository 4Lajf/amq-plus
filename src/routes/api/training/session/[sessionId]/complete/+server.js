/**
 * POST /api/training/session/[sessionId]/complete
 * Mark training session as completed
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { getDifficultSongs } from '$lib/server/training/difficult-songs.js';

// @ts-ignore
export async function POST({ params, request }) {
	const supabaseAdmin = createSupabaseAdmin();

	try {
		const { sessionId } = params;
		const { token } = await request.json();

		if (!token) {
			return json({ error: 'Token required' }, { status: 400 });
		}

		// Verify token
		const validToken = await lookupToken(supabaseAdmin, token);

		if (!validToken) {
			return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		}

		const userId = validToken.user_id;

		// Fetch and update session
		const { data: session, error: fetchError } = await supabaseAdmin
			.from('training_sessions')
			.select('*')
			.eq('id', sessionId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !session) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		// Mark as complete
		const { error: updateError } = await supabaseAdmin
			.from('training_sessions')
			.update({ ended_at: session.ended_at || new Date().toISOString() })
			.eq('id', sessionId);

		if (updateError) {
			console.error('Error completing session:', updateError);
			return json({ error: 'Failed to complete session' }, { status: 500 });
		}

		// Calculate session duration
		const startTime = new Date(session.started_at);
		const endTime = session.ended_at ? new Date(session.ended_at) : new Date();
		const difficultSongs = await getDifficultSongs(
			supabaseAdmin,
			userId,
			sessionId,
			session.quiz_id
		);
		const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

		// Return session summary
		return json({
			success: true,
			difficultSongs,
			summary: {
				totalSongs: session.total_songs,
				correctSongs: session.correct_songs,
				incorrectSongs: session.incorrect_songs,
				accuracy:
					session.correct_songs + session.incorrect_songs > 0
						? Math.round(
								(session.correct_songs / (session.correct_songs + session.incorrect_songs)) * 100
							)
						: 0,
				durationMinutes,
				completedAt: endTime.toISOString()
			}
		});
	} catch (error) {
		console.error('Error completing session:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
