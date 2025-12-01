/**
 * API endpoint to fetch training statistics for a specific quiz.
 * Used when loading a quiz by URL to display existing training data.
 *
 * @module api/training/quiz/[quizId]/stats
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * POST /api/training/quiz/[quizId]/stats
 * Fetches training statistics for a specific quiz.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.quizId - Quiz configuration ID
 * @param {Object} params.request - Request object
 * @returns {Promise<Response>} Training statistics for the quiz
 */
export async function POST({ params, request }) {
	try {
		const { token } = await request.json();

		if (!token || typeof token !== 'string' || token.length !== 64) {
			return error(400, { message: 'Invalid token format' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Validate token and get user ID
		const { data: tokenData, error: tokenError } = await supabaseAdmin
			.from('training_tokens')
			.select('user_id')
			.eq('token', token)
			.eq('is_active', true)
			.single();

		if (tokenError || !tokenData) {
			console.error('[TRAINING QUIZ STATS] Invalid or inactive token');
			return error(401, { message: 'Invalid or inactive token' });
		}

		const userId = tokenData.user_id;
		const quizId = params.quizId;

		// Check if quiz exists
		const { data: quizData, error: quizError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id, name')
			.eq('id', quizId)
			.single();

		if (quizError || !quizData) {
			console.log('[TRAINING QUIZ STATS] Quiz not found:', quizId);
			return json({
				success: true,
				hasStats: false,
				stats: null
			});
		}

		// Fetch training progress for this quiz
		const { data: progressRecords, error: progressError } = await supabaseAdmin
			.from('training_progress')
			.select('*')
			.eq('user_id', userId)
			.eq('quiz_id', quizId);

		if (progressError) {
			console.error('[TRAINING QUIZ STATS] Error fetching progress:', progressError);
			return error(500, { message: 'Failed to fetch training progress' });
		}

		if (!progressRecords || progressRecords.length === 0) {
			// No training data for this quiz
			return json({
				success: true,
				hasStats: false,
				stats: null
			});
		}

		// Calculate statistics (matching website logic)
		const now = new Date();
		let totalSongs = progressRecords.length;
		let totalAttempts = 0;
		let totalSuccess = 0;
		let dueToday = 0;
		let totalDifficulty = 0;
		let songsWithDifficulty = 0;
		let masteryDistribution = {
			learning: 0,
			review: 0,
			mastered: 0
		};

		// For last 10 attempts accuracy calculation
		let last10Success = 0;
		let last10Total = 0;

		// Debug: Track due songs
		const dueSongsDebug = [];

		for (const record of progressRecords) {
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
			const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
			if (dueDate && dueDate <= now) {
				dueToday++;
				dueSongsDebug.push({
					song_ann_id: record.song_ann_id,
					due: record.fsrs_state.due,
					dueDate: dueDate.toISOString(),
					now: now.toISOString(),
					isDue: true
				});
			} else if (dueDate) {
				dueSongsDebug.push({
					song_ann_id: record.song_ann_id,
					due: record.fsrs_state.due,
					dueDate: dueDate.toISOString(),
					now: now.toISOString(),
					isDue: false
				});
			}

			// Track average difficulty
			if (record.fsrs_state?.difficulty) {
				totalDifficulty += record.fsrs_state.difficulty;
				songsWithDifficulty++;
			}

			// Categorize by FSRS state
			const fsrsState = record.fsrs_state?.state;
			if (fsrsState === undefined || fsrsState === null || fsrsState === 0 || fsrsState === 1) {
				masteryDistribution.learning++;
			} else if (fsrsState === 2) {
				masteryDistribution.review++;
			} else if (fsrsState === 3) {
				masteryDistribution.mastered++;
			} else {
				masteryDistribution.learning++;
			}
		}

		const accuracy = last10Total > 0 ? parseFloat(((last10Success / last10Total) * 100).toFixed(2)) : 0;
		const averageDifficulty = songsWithDifficulty > 0 ? parseFloat((totalDifficulty / songsWithDifficulty).toFixed(1)) : 0;

		// Calculate forecast (songs due in next 7 days)
		// Get today's date at midnight in local timezone
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const forecast = [];

		for (let i = 0; i < 7; i++) {
			const checkDate = new Date(today);
			checkDate.setDate(checkDate.getDate() + i);

			const nextDate = new Date(checkDate);
			nextDate.setDate(nextDate.getDate() + 1);

			// Format date as MM/DD/YYYY for display
			const month = String(checkDate.getMonth() + 1).padStart(2, '0');
			const day = String(checkDate.getDate()).padStart(2, '0');
			const year = checkDate.getFullYear();
			const dateStr = `${month}/${day}/${year}`;

			let dueCount = 0;

			for (const record of progressRecords) {
				// Use fsrs_state.due instead of next_review_date
				if (!record.fsrs_state?.due) continue;

				const dueDateTime = new Date(record.fsrs_state.due);
				// Normalize to midnight in local timezone for comparison
				const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());

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

		const stats = {
			totalSongs,
			totalAttempts,
			totalSuccess,
			accuracy,
			last10Success,
			last10Total,
			dueToday,
			averageDifficulty,
			masteryDistribution,
			forecast
		};

		console.log('[TRAINING QUIZ STATS] ===== FINAL STATS OBJECT =====');
		console.log('[TRAINING QUIZ STATS] Quiz ID:', quizId);
		console.log('[TRAINING QUIZ STATS] Current time:', now.toISOString());
		console.log('[TRAINING QUIZ STATS] totalSongs:', totalSongs);
		console.log('[TRAINING QUIZ STATS] totalAttempts:', totalAttempts);
		console.log('[TRAINING QUIZ STATS] totalSuccess:', totalSuccess);
		console.log('[TRAINING QUIZ STATS] accuracy:', accuracy);
		console.log('[TRAINING QUIZ STATS] last10Success:', last10Success);
		console.log('[TRAINING QUIZ STATS] last10Total:', last10Total);
		console.log('[TRAINING QUIZ STATS] dueToday:', dueToday);
		console.log('[TRAINING QUIZ STATS] averageDifficulty:', averageDifficulty);
		console.log('[TRAINING QUIZ STATS] masteryDistribution:', JSON.stringify(masteryDistribution));
		console.log('[TRAINING QUIZ STATS] forecast length:', forecast.length);
		console.log('[TRAINING QUIZ STATS] ===== DUE SONGS DEBUG =====');
		console.log('[TRAINING QUIZ STATS] Total songs with due dates:', dueSongsDebug.length);
		console.log('[TRAINING QUIZ STATS] Songs marked as due:', dueSongsDebug.filter(s => s.isDue).length);
		console.log('[TRAINING QUIZ STATS] Due songs (first 10):', JSON.stringify(dueSongsDebug.filter(s => s.isDue).slice(0, 10), null, 2));
		console.log('[TRAINING QUIZ STATS] Not due songs (first 5):', JSON.stringify(dueSongsDebug.filter(s => !s.isDue).slice(0, 5), null, 2));
		console.log('[TRAINING QUIZ STATS] ===== END FINAL STATS =====');

		return json({
			success: true,
			hasStats: totalAttempts > 0,
			stats
		});
	} catch (err) {
		console.error('[TRAINING QUIZ STATS] Error:', err);
		return error(500, { message: 'Internal server error' });
	}
}

