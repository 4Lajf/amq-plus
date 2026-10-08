// A lapse on an established Review card is different from a short learning repeat.
export function isDifficultSongCandidate(progress, plays, now = Date.now()) {
	if (!progress || progress.suspended_at || progress.is_active === false) return false;
	const lapses = Number(progress.fsrs_state?.lapses || 0);
	if (lapses < 8) return false;
	const previous = progress.difficult_song_suggestion;
	if (
		previous &&
		(lapses < previous.lapses + 4 || now - Date.parse(previous.decidedAt) < 30 * 86400000)
	)
		return false;
	return plays.some(
		(play) =>
			Number(play.song_ann_id) === Number(progress.song_ann_id) &&
			play.rating === 1 &&
			play.fsrs_before?.state === 2 &&
			Number(play.fsrs_after?.lapses) > Number(play.fsrs_before?.lapses || 0)
	);
}

export async function getDifficultSongs(db, userId, sessionId, quizId) {
	const { data: plays, error } = await db
		.from('training_session_plays')
		.select('song_ann_id,rating,fsrs_before,fsrs_after')
		.eq('user_id', userId)
		.eq('session_id', sessionId)
		.eq('rating', 1);
	if (error) throw error;
	const ids = [...new Set((plays || []).map((p) => p.song_ann_id))];
	if (!ids.length) return [];
	const { data: progress, error: progressError } = await db
		.from('training_progress')
		.select('song_ann_id,fsrs_state,suspended_at,is_active,difficult_song_suggestion')
		.eq('user_id', userId)
		.eq('quiz_id', quizId)
		.in('song_ann_id', ids);
	if (progressError) throw progressError;
	return (progress || [])
		.filter((p) => isDifficultSongCandidate(p, plays || []))
		.map((p) => ({ annSongId: p.song_ann_id, lapses: Number(p.fsrs_state.lapses) }));
}
