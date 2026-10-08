import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { getDifficultSongs } from '$lib/server/training/difficult-songs.js';

export async function POST({ params, request }) {
	const db = createSupabaseAdmin();
	try {
		const { token, annSongId, choice } = await request.json();
		if (!Number.isInteger(annSongId) || !['pause', 'keep'].includes(choice))
			return json({ error: 'Choose Pause or Keep practicing for a song.' }, { status: 400 });
		const auth = token && (await lookupToken(db, token));
		if (!auth) return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		const { data: session, error } = await db
			.from('training_sessions')
			.select('quiz_id,ended_at')
			.eq('id', params.sessionId)
			.eq('user_id', auth.user_id)
			.single();
		if (error || !session?.ended_at)
			return json({ error: 'Completed session not found.' }, { status: 404 });
		const { data: progress, error: readError } = await db
			.from('training_progress')
			.select('difficult_song_suggestion')
			.eq('user_id', auth.user_id)
			.eq('quiz_id', session.quiz_id)
			.eq('song_ann_id', annSongId)
			.single();
		if (readError) throw readError;
		const prior = progress.difficult_song_suggestion;
		if (prior?.sessionId === params.sessionId) {
			return json({ success: true, choice: prior.choice });
		}
		const candidate = (
			await getDifficultSongs(db, auth.user_id, params.sessionId, session.quiz_id)
		).find((song) => song.annSongId === annSongId);
		if (!candidate) return json({ success: true, noLongerEligible: true });
		const decidedAt = new Date().toISOString();
		const updates = {
			difficult_song_suggestion: {
				sessionId: params.sessionId,
				lapses: candidate.lapses,
				decidedAt,
				choice
			},
			...(choice === 'pause' ? { suspended_at: decidedAt } : {})
		};
		let update = db
			.from('training_progress')
			.update(updates)
			.eq('user_id', auth.user_id)
			.eq('quiz_id', session.quiz_id)
			.eq('song_ann_id', annSongId);
		update = prior
			? update.eq('difficult_song_suggestion', JSON.stringify(prior))
			: update.is('difficult_song_suggestion', null);
		const { data: changed, error: updateError } = await update.select('song_ann_id');
		if (updateError) throw updateError;
		if (!changed?.length)
			return json({ error: 'This suggestion changed. Please retry.' }, { status: 409 });
		return json({ success: true, choice });
	} catch (error) {
		console.error('[DIFFICULT SONGS]', error);
		return json({ error: 'Your choice could not be saved. Please retry.' }, { status: 500 });
	}
}
