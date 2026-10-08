/**
 * Training Page - Server Load Function
 * Load user's token, overview stats, and quizzes
 */

import { redirect } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { utcStartOfDay } from '$lib/utils/day-boundary.js';
import { isPlayableProgressRecord } from '$lib/server/training/progress-filters.js';

// @ts-ignore
export async function load({ url, locals: { safeGetSession } }) {
	const { session } = await safeGetSession();

	if (!session) {
		throw redirect(303, `/auth?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const userId = session.user.id;

	const supabaseAdmin = createSupabaseAdmin();

	try {
		// Fetch user's training token
		const { data: token, error: tokenError } = await supabaseAdmin
			.from('training_tokens')
			.select('id, created_at, last_used_at')
			.eq('user_id', userId)
			.maybeSingle();

		if (tokenError) throw tokenError;

		const hasToken = !!token;
		const connectorStatus = token?.last_used_at ? 'linked' : token ? 'ready' : 'missing';

		// Calculate overview stats directly from database
		// Use fetchAllPages to handle Supabase's 1000 row limit
		const { data: allProgress, error: progressError } = await fetchAllPages(() =>
			supabaseAdmin
				.from('training_progress')
				.select('*')
				.eq('user_id', userId)
				.order('id', { ascending: true })
		);

		if (progressError) {
			console.error('Error fetching training progress:', progressError);
			throw progressError;
		}

		const uniqueQuizzes = new Set((allProgress || []).map((p) => p.quiz_id));
		const totalQuizzes = uniqueQuizzes.size;
		const totalSongs = allProgress?.length || 0;

		let totalAttempts = 0;
		let totalSuccess = 0;

		// For last 10 attempts accuracy calculation
		let last10Success = 0;
		let last10Total = 0;

		for (const record of allProgress || []) {
			totalAttempts += record.attempt_count || 0;
			totalSuccess += record.success_count || 0;

			// Calculate success rate from last 10 attempts only
			const history = record.history || [];
			const last10Attempts = history.slice(-10);
			for (const attempt of last10Attempts) {
				last10Total++;
				if (attempt.success) {
					last10Success++;
				}
			}
		}

		const overallAccuracy = last10Total > 0 ? Math.round((last10Success / last10Total) * 100) : 0;

		const overviewStats = {
			totalQuizzes,
			totalSongs,
			overallAccuracy,
			totalAttempts
		};

		// Owned quizzes show even with no progress so settings (goal, limits,
		// same-day) are reachable before the first session. Shared quizzes still
		// only appear once this user has rows on them.
		const trainedQuizIds = Array.from(uniqueQuizzes);
		const [ownedResult, trainedResult] = await Promise.all([
			supabaseAdmin
				.from('quiz_configurations')
				.select('id, name, description, created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			trainedQuizIds.length > 0
				? supabaseAdmin
						.from('quiz_configurations')
						.select('id, name, description, created_at')
						.in('id', trainedQuizIds)
						.order('created_at', { ascending: false })
				: Promise.resolve({ data: [], error: null })
		]);
		if (ownedResult.error) throw ownedResult.error;
		if (trainedResult.error) throw trainedResult.error;
		const ownedQuizzes = ownedResult.data;
		const trainedQuizzes = trainedResult.data;

		const quizzesById = new Map();
		for (const quiz of ownedQuizzes || []) quizzesById.set(quiz.id, quiz);
		for (const quiz of trainedQuizzes || []) {
			if (!quizzesById.has(quiz.id)) quizzesById.set(quiz.id, quiz);
		}
		const quizzes = Array.from(quizzesById.values()).sort(
			(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		// Fetch training stats for each quiz
		const quizzesWithStats = await Promise.all(
			(quizzes || []).map(async (quiz) => {
				// Filter progress for this specific quiz from already loaded data
				const quizProgress = (allProgress || []).filter((p) => p.quiz_id === quiz.id);

				const playableProgress = quizProgress.filter(isPlayableProgressRecord);

				// Calculate basic stats
				const totalSongs = playableProgress.length;
				let totalAttempts = 0;
				let totalSuccess = 0;
				let dueToday = 0;

				const now = new Date();

				// For last 10 attempts accuracy calculation
				let last10Success = 0;
				let last10Total = 0;

				for (const record of playableProgress) {
					totalAttempts += record.attempt_count || 0;
					totalSuccess += record.success_count || 0;

					// Calculate success rate from last 10 attempts only
					const history = record.history || [];
					const last10Attempts = history.slice(-10);
					for (const attempt of last10Attempts) {
						last10Total++;
						if (attempt.success) {
							last10Success++;
						}
					}

					// Check if due today (use fsrs_state.due)
					// Use calendar day comparison (normalized to midnight) for consistency with forecast
					const dueDateTime = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
					if (dueDateTime) {
						const dueDate = utcStartOfDay(dueDateTime);
						const today = utcStartOfDay(now);
						if (dueDate <= today) {
							dueToday++;
						}
					}
				}

				const accuracy =
					last10Total > 0 ? parseFloat(((last10Success / last10Total) * 100).toFixed(2)) : 0;

				let lastTrained = null;
				if (quizProgress.length > 0) {
					const { data: lastSession } = await supabaseAdmin
						.from('training_sessions')
						.select('ended_at')
						.eq('user_id', userId)
						.eq('quiz_id', quiz.id)
						.not('ended_at', 'is', null)
						.order('ended_at', { ascending: false })
						.limit(1)
						.single();
					lastTrained = lastSession?.ended_at || null;
				}

				return {
					...quiz,
					stats: {
						totalSongs,
						accuracy,
						dueToday,
						lastTrained
					}
				};
			})
		);

		return {
			hasToken,
			connectorStatus,
			overviewStats,
			quizzes: quizzesWithStats,
			loadError: null
		};
	} catch (error) {
		console.error('Error loading training page:', error);
		return {
			hasToken: false,
			connectorStatus: 'unavailable',
			overviewStats: null,
			quizzes: [],
			loadError:
				'Training data is temporarily unavailable. Your quizzes and progress are still saved.'
		};
	}
}
