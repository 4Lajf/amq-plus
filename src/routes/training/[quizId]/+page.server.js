/**
 * Quiz Training Detail Page - Server Load Function
 * Load quiz details, training stats, progress records, and sessions
 */

import { redirect, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import {
	calculateQuizStatsWithPool,
	deduplicateProgressRecords
} from '$lib/server/training/training-utils.js';
import { getMasterlistIndex, getMasterlistMaxAnnSongId } from '$lib/server/masterlist.js';
import { groupMissingSongs } from '$lib/server/training/missing-songs.js';
import { utcStartOfDay, utcAddDays } from '$lib/utils/day-boundary.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { isPlayableProgressRecord } from '$lib/server/training/progress-filters.js';
import { getUserTrainingPreferences } from '$lib/server/training/user-preferences.js';

// @ts-ignore
export async function load({ params, url, locals: { safeGetSession } }) {
	const { session } = await safeGetSession();

	if (!session) {
		throw redirect(303, `/auth?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const userId = session.user.id;
	const quizId = params.quizId;
	const selectedSessionId = url.searchParams.get('session');

	const supabaseAdmin = createSupabaseAdmin();

	try {
		// Fetch quiz by ID (include user_id for permission check).
		// daily_review_goal ships in a migration the operator applies later — fall
		// back if the column is missing so the page still loads.
		let quiz;
		let quizError;
		{
			const primary = await supabaseAdmin
				.from('quiz_configurations')
				.select(
					'id, user_id, name, description, configuration_data, created_at, daily_review_limit, daily_new_limit, daily_review_goal, combine_duplicates, allow_same_day_reviews'
				)
				.eq('id', quizId)
				.single();
			quiz = primary.data;
			quizError = primary.error;
			if (
				quizError &&
				(quizError.code === '42703' ||
					/daily_review_goal|allow_same_day_reviews/i.test(quizError.message || ''))
			) {
				const fallback = await supabaseAdmin
					.from('quiz_configurations')
					.select(
						'id, user_id, name, description, configuration_data, created_at, daily_review_limit, daily_new_limit, combine_duplicates'
					)
					.eq('id', quizId)
					.single();
				quiz = fallback.data
					? { ...fallback.data, daily_review_goal: 50, allow_same_day_reviews: true }
					: null;
				quizError = fallback.error;
			}
		}

		// A failed query is not a missing quiz. PostgREST answers a select naming a
		// column the database does not have with 42703, and folding that into 404
		// told every user "Quiz not found" the one time the real cause was that the
		// code had shipped ahead of its migration - the least useful message
		// possible for the person who could fix it. PGRST116 is the genuine
		// no-rows-from-.single() case and stays a 404.
		if (quizError && quizError.code !== 'PGRST116') {
			console.error('[Training Detail] Quiz lookup failed:', quizId, quizError);
			throw error(500, {
				message: `Could not load this quiz (${quizError.code || 'unknown error'}). This is a server-side problem, not a missing quiz.`
			});
		}

		if (!quiz) {
			console.error('[Training Detail] Quiz not found by ID:', quizId);
			throw error(404, { message: 'Quiz not found' });
		}

		// Allow access if the user owns the quiz OR has training data for it (shared quizzes)
		if (quiz.user_id !== userId) {
			const { count } = await supabaseAdmin
				.from('training_progress')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', userId)
				.eq('quiz_id', quizId);

			if (!count || count === 0) {
				throw error(403, { message: "You do not have permission to access this quiz's training." });
			}
		}

		const preferences = await getUserTrainingPreferences(supabaseAdmin, userId, quizId, quiz);
		Object.assign(quiz, preferences);

		// Get pool size from the most recent session (any status)
		// This is updated every time a new training session starts
		const { data: latestSession } = await supabaseAdmin
			.from('training_sessions')
			.select('session_data')
			.eq('user_id', userId)
			.eq('quiz_id', quiz.id)
			.order('started_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		// Extract pool size from the most recent session's session_data
		let totalQuizSongs = latestSession?.session_data?.poolDistribution?.available?.total || 0;

		// Fallback: try songList if no session exists yet (v1 legacy format)
		if (totalQuizSongs === 0 && quiz.configuration_data?.songList) {
			try {
				totalQuizSongs = Array.isArray(quiz.configuration_data.songList)
					? quiz.configuration_data.songList.length
					: 0;
			} catch (e) {
				console.warn('[Training Detail] Error counting quiz songs:', e);
			}
		}

		// Fallback: for v2 format, estimate from numberOfSongs in routes
		if (totalQuizSongs === 0 && quiz.configuration_data?.routes) {
			try {
				const routes = quiz.configuration_data.routes;
				for (const route of routes) {
					if (route.enabled !== false && route.numberOfSongs) {
						const nos = route.numberOfSongs;
						totalQuizSongs += nos.useRange
							? Math.round((nos.min + nos.max) / 2)
							: nos.staticValue || 20;
					}
				}
			} catch (e) {
				console.warn('[Training Detail] Error estimating v2 quiz songs:', e);
			}
		}

		// Fetch all training progress for this quiz
		const { data: progress, error: progressError } = await fetchAllPages(() =>
			supabaseAdmin
				.from('training_progress')
				.select('*')
				.eq('user_id', userId)
				.eq('quiz_id', quiz.id)
				.order('last_attempt_at', { ascending: false, nullsFirst: false })
		);

		if (progressError) {
			console.error('[Training Detail] Error fetching progress:', progressError);
			throw error(500, { message: 'Failed to load training progress' });
		}

		// Fetch all sessions (no limit - we paginate client-side)
		const { data: sessions, error: sessionsError } = await supabaseAdmin
			.from('training_sessions')
			.select('*')
			.eq('user_id', userId)
			.eq('quiz_id', quiz.id)
			.order('started_at', { ascending: false });

		if (sessionsError) {
			console.error('[Training Detail] Error fetching sessions:', sessionsError);
		}

		// Format sessions with calculated stats
		const formattedSessions = (sessions || []).map((s) => {
			// If manually finished, duration should be N/A (null)
			const duration = s.session_data?.manuallyFinished
				? null
				: s.ended_at
					? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
					: null;

			const totalAnswered = s.correct_songs + s.incorrect_songs;
			const accuracy = totalAnswered > 0 ? Math.round((s.correct_songs / totalAnswered) * 100) : 0;

			// Extract pool size from session_data
			const poolSize = s.session_data?.poolDistribution?.available?.total || null;

			return {
				id: s.id,
				startedAt: s.started_at,
				endedAt: s.ended_at,
				totalSongs: s.total_songs,
				correctSongs: s.correct_songs,
				incorrectSongs: s.incorrect_songs,
				accuracy,
				duration,
				poolSize,
				composition: s.session_data?.composition || { due: 0, new: 0, revision: 0 },
				isComplete: !!s.ended_at
			};
		});

		// If a session is selected via query param, load its plays
		let selectedSession = null;
		let sessionPlays = [];

		if (selectedSessionId) {
			// Find the session in our list
			const foundSession = formattedSessions.find((s) => s.id === selectedSessionId);

			if (foundSession) {
				selectedSession = foundSession;

				// Fetch plays for this session
				const { data: plays, error: playsError } = await supabaseAdmin
					.from('training_session_plays')
					.select('*')
					.eq('session_id', selectedSessionId)
					.order('played_at', { ascending: true });

				if (playsError) {
					console.error('[Training Detail] Error fetching session plays:', playsError);
				} else {
					sessionPlays = plays || [];
				}
			}
		}

		// Load merge source quizzes (other quizzes that have training data)
		let mergeSources = [];
		const { data: allProgress } = await fetchAllPages(() =>
			supabaseAdmin
				.from('training_progress')
				.select('quiz_id')
				.eq('user_id', userId)
				.order('id', { ascending: true })
		);

		const sourceQuizIds = Array.from(new Set((allProgress || []).map((p) => p.quiz_id))).filter(
			(id) => id && id !== quiz.id
		);

		if (sourceQuizIds.length > 0) {
			const { data: sourceQuizzes } = await supabaseAdmin
				.from('quiz_configurations')
				.select('id, name, description, created_at')
				.eq('user_id', userId)
				.in('id', sourceQuizIds)
				.order('created_at', { ascending: false });
			mergeSources = sourceQuizzes || [];
		}

		// Deduplicate progress records by song_ann_id so duplicate rows
		// (from the pre-fix era) collapse into a single entry for display.
		const dedupedProgress = deduplicateProgressRecords(progress || []);

		// Calculate statistics from progress records using total quiz songs from latest session
		const stats = calculateQuizStatsWithPool(progress || [], totalQuizSongs);

		// Calculate performance over time
		const performanceOverTime = calculatePerformanceOverTime(progress || []);

		// Calculate forecast (songs due in next 7 days)
		const forecast = calculateForecast(progress || []);

		// Build metadata map for songs in progress
		const songMetadata = {};
		const progressSongIds = new Set(
			(progress || [])
				.map((p) =>
					p.song_ann_id !== null && p.song_ann_id !== undefined ? String(p.song_ann_id) : ''
				)
				.filter(Boolean)
		);

		// Look up only the songs this user has progress on, instead of scanning the
		// whole masterlist on every page load.
		if (progressSongIds.size > 0) {
			const masterlistIndex = await getMasterlistIndex();
			for (const annSongId of progressSongIds) {
				const song = masterlistIndex.get(annSongId);
				if (song) {
					songMetadata[annSongId] = {
						title: song.songName,
						artist: song.songArtist,
						anime: song.animeENName || song.animeJPName
					};
				}
			}
		}

		// Some progress records can reference songs that are missing from the database.
		// When that happens the UI falls back to "Song #123" and "Not in song database".
		const missingSongMetadataIds = [];
		for (const id of progressSongIds) {
			if (!songMetadata[id]) {
				missingSongMetadataIds.push(id);
				songMetadata[id] = {
					title: `Song #${id}`,
					artist: 'Not in song database',
					anime: 'Not in song database'
				};
			}
		}

		// Split them by cause so the page can say something true and actionable
		// instead of one alarming line that sent people to Discord with song lists
		// nobody could act on. Of the 96 audited, 88 had never appeared in any
		// masterlist we have shipped - they are AMQ uploads AnisongDB has not
		// ingested yet and will resolve themselves. See missing-songs.js.
		const missingSongGroups = missingSongMetadataIds.length
			? groupMissingSongs(missingSongMetadataIds, await getMasterlistMaxAnnSongId())
			: [];

		// Today's due-play spend for Daily Goal progress (soft UX).
		const dayStart = utcStartOfDay(new Date());
		const dayEnd = utcAddDays(dayStart, 1);
		const { data: todaySessions } = await supabaseAdmin
			.from('training_sessions')
			.select('id, session_data')
			.eq('user_id', userId)
			.eq('quiz_id', quizId)
			.gte('started_at', dayStart.toISOString())
			.lt('started_at', dayEnd.toISOString());
		const todaySessionIds = (todaySessions || []).map((s) => s.id);
		let dueGoalProgress = 0;
		if (todaySessionIds.length > 0) {
			const { data: playsToday } = await supabaseAdmin
				.from('training_session_plays')
				.select('song_ann_id, session_id')
				.eq('user_id', userId)
				.eq('quiz_id', quizId)
				.in('session_id', todaySessionIds);
			// Every due play, including same-day repeats of the same song.
			const { countDailyGoalProgress } = await import(
				'$lib/server/training/sessionStartService.js'
			);
			dueGoalProgress = countDailyGoalProgress(todaySessions || [], playsToday || []);
		}

		return {
			quiz: {
				id: quiz.id,
				name: quiz.name,
				description: quiz.description,
				totalSongs: totalQuizSongs,
				createdAt: quiz.created_at,
				daily_review_limit: quiz.daily_review_limit ?? null,
				daily_new_limit: quiz.daily_new_limit ?? null,
				daily_review_goal: quiz.daily_review_goal === undefined ? 50 : quiz.daily_review_goal,
				combine_duplicates: quiz.combine_duplicates === true,
				allow_same_day_reviews: quiz.allow_same_day_reviews !== false
			},
			isQuizOwner: quiz.user_id === userId,
			stats,
			dueGoalProgress,
			progress: dedupedProgress,
			songMetadata,
			missingSongMetadataIds,
			missingSongGroups,
			performanceOverTime,
			forecast,
			sessions: formattedSessions,
			selectedSession,
			sessionPlays,
			mergeSources
		};
	} catch (err) {
		console.error('[Training Detail] Error loading page:', err);
		// Anything already thrown as an HttpError carries a status and a message
		// chosen on purpose; re-wrapping it would discard the diagnosis. Only
		// genuinely unexpected throws become the generic 500.
		if (typeof err?.status === 'number') {
			throw err;
		}
		throw error(500, { message: 'Failed to load training data' });
	}
}

/**
 * Calculate performance over time (accuracy by date)
 */
function calculatePerformanceOverTime(progressRecords) {
	const performanceByDate = {};

	for (const record of progressRecords) {
		if (!isPlayableProgressRecord(record)) continue;

		for (const attempt of record.history || []) {
			const date = attempt.timestamp.split('T')[0];
			if (!performanceByDate[date]) {
				performanceByDate[date] = {
					date,
					attempts: 0,
					successes: 0
				};
			}
			performanceByDate[date].attempts++;
			if (attempt.success) {
				performanceByDate[date].successes++;
			}
		}
	}

	return Object.values(performanceByDate)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((day) => ({
			date: day.date,
			accuracy: day.attempts > 0 ? Math.round((day.successes / day.attempts) * 100) : 0,
			attempts: day.attempts
		}));
}

/**
 * Calculate forecast (songs due in next 7 days)
 */
function calculateForecast(progressRecords) {
	const now = new Date();
	// Buckets run on the UTC day boundary, same rule as the scheduler.
	const today = utcStartOfDay(now);
	const forecast = [];

	for (let i = 0; i < 7; i++) {
		const checkDate = utcAddDays(today, i);
		const nextDate = utcAddDays(today, i + 1);

		// Format date as ISO 8601 (YYYY-MM-DD)
		const dateStr = checkDate.toISOString().split('T')[0];

		let dueCount = 0;

		for (const record of progressRecords) {
			if (!isPlayableProgressRecord(record)) continue;
			// Use fsrs_state.due instead of next_review_date
			if (!record.fsrs_state?.due) continue;

			const dueDateTime = new Date(record.fsrs_state.due);
			// Normalize to midnight in local timezone for comparison
			const dueDate = utcStartOfDay(dueDateTime);

			// Check if due on this specific day OR earlier (including overdue songs on first day)
			if (dueDate.getTime() === checkDate.getTime() || (i === 0 && dueDate < checkDate)) {
				dueCount++;
			}
		}

		forecast.push({
			date: dateStr,
			due: dueCount
		});
	}

	return forecast;
}
