/**
 * PATCH /api/training/[quizId]/settings
 * Update the signed-in trainee's settings for this quiz.
 *
 * - daily_review_limit: max due songs scheduled per day. NULL = unlimited.
 * - daily_new_limit: max never-practiced songs per day. NULL = unlimited.
 *   (DB default 20 after migration — backlog brake.)
 * - daily_review_goal: soft daily due-review goal for UI. NULL = goal UI off.
 *   Default 50. Never hard-caps playlist fill.
 * - combine_duplicates (N8): one card per recording group. Default false.
 * - allow_same_day_reviews: Learning/short steps may return later today. Default true.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

const MAX_DAILY_LIMIT = 10000;

// @ts-ignore
export async function PATCH({ params, request, locals: { safeGetSession } }) {
	const { session } = await safeGetSession();

	if (!session) {
		throw error(401, { message: 'Unauthorized' });
	}

	const userId = session.user.id;
	const quizId = params.quizId;

	const supabaseAdmin = createSupabaseAdmin();

	const { data: quiz } = await supabaseAdmin
		.from('quiz_configurations')
		.select('user_id')
		.eq('id', quizId)
		.single();

	if (!quiz) {
		throw error(404, { message: 'Quiz not found.' });
	}

	if (quiz.user_id !== userId) {
		const { count } = await supabaseAdmin
			.from('training_progress')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.eq('quiz_id', quizId);
		if (!count) {
			throw error(403, { message: 'Start training this quiz before changing its preferences.' });
		}
	}

	const body = await request.json();

	const hasDailyReviewLimit = Object.prototype.hasOwnProperty.call(body, 'dailyReviewLimit');
	const hasDailyNewLimit = Object.prototype.hasOwnProperty.call(body, 'dailyNewLimit');
	const hasDailyReviewGoal = Object.prototype.hasOwnProperty.call(body, 'dailyReviewGoal');
	const hasCombineDuplicates = Object.prototype.hasOwnProperty.call(body, 'combineDuplicates');
	const hasAllowSameDayReviews = Object.prototype.hasOwnProperty.call(body, 'allowSameDayReviews');

	if (
		!hasDailyReviewLimit &&
		!hasDailyNewLimit &&
		!hasDailyReviewGoal &&
		!hasCombineDuplicates &&
		!hasAllowSameDayReviews
	) {
		throw error(400, {
			message:
				'dailyReviewLimit, dailyNewLimit, dailyReviewGoal, combineDuplicates, or allowSameDayReviews required'
		});
	}

	/** @type {Record<string, any>} */
	const updates = {};
	const messages = [];
	let dailyReviewLimit = null;
	let dailyNewLimit = null;
	let dailyReviewGoal = null;
	let combineDuplicates = null;
	let allowSameDayReviews = null;

	/**
	 * @param {unknown} raw
	 * @param {string} label
	 * @returns {number|null}
	 */
	function parseDailyLimit(raw, label) {
		if (raw === null || raw === '' || raw === undefined) return null;
		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_LIMIT) {
			throw error(400, {
				message: `${label} must be a whole number between 1 and ${MAX_DAILY_LIMIT}, or empty for unlimited.`
			});
		}
		return parsed;
	}

	if (hasDailyReviewLimit) {
		dailyReviewLimit = parseDailyLimit(body.dailyReviewLimit, 'Daily review limit');
		updates.daily_review_limit = dailyReviewLimit;
		messages.push(
			dailyReviewLimit === null
				? 'Daily review limit removed - all due songs are now reachable.'
				: `Daily review limit set to ${dailyReviewLimit} songs per day.`
		);
	}

	if (hasDailyNewLimit) {
		dailyNewLimit = parseDailyLimit(body.dailyNewLimit, 'Daily new limit');
		updates.daily_new_limit = dailyNewLimit;
		messages.push(
			dailyNewLimit === null
				? 'Daily new-song limit removed - introductions are unlimited.'
				: `Daily new-song limit set to ${dailyNewLimit} songs per day.`
		);
	}

	if (hasDailyReviewGoal) {
		dailyReviewGoal = parseDailyLimit(body.dailyReviewGoal, 'Daily review goal');
		updates.daily_review_goal = dailyReviewGoal;
		messages.push(
			dailyReviewGoal === null
				? 'Daily review goal turned off.'
				: `Daily review goal set to ${dailyReviewGoal} songs per day.`
		);
	}

	if (hasCombineDuplicates) {
		if (typeof body.combineDuplicates !== 'boolean') {
			throw error(400, { message: 'combineDuplicates must be true or false.' });
		}
		combineDuplicates = body.combineDuplicates;
		updates.combine_duplicates = combineDuplicates;
		messages.push(
			combineDuplicates
				? 'Duplicate recordings will now be trained as one card. No existing progress was changed.'
				: 'Duplicate recordings are trained separately again.'
		);
	}

	if (hasAllowSameDayReviews) {
		if (typeof body.allowSameDayReviews !== 'boolean') {
			throw error(400, { message: 'allowSameDayReviews must be true or false.' });
		}
		allowSameDayReviews = body.allowSameDayReviews;
		updates.allow_same_day_reviews = allowSameDayReviews;
		messages.push(
			allowSameDayReviews
				? 'Same-day reviews enabled — learning cards can return later today after short intervals.'
				: 'Same-day reviews disabled — cards scheduled later today bump to tomorrow instead.'
		);
	}

	const { error: updateError } = await supabaseAdmin
		.from('user_quiz_training_preferences')
		.upsert({ user_id: userId, quiz_id: quizId, ...updates }, { onConflict: 'user_id,quiz_id' });

	if (updateError) {
		console.error('[Training Settings] Failed to update training settings:', updateError);
		throw error(500, { message: 'Failed to update training settings' });
	}

	return json({
		success: true,
		message: messages.join(' '),
		dailyReviewLimit: hasDailyReviewLimit ? dailyReviewLimit : undefined,
		dailyNewLimit: hasDailyNewLimit ? dailyNewLimit : undefined,
		dailyReviewGoal: hasDailyReviewGoal ? dailyReviewGoal : undefined,
		combineDuplicates: hasCombineDuplicates ? combineDuplicates : undefined,
		allowSameDayReviews: hasAllowSameDayReviews ? allowSameDayReviews : undefined
	});
}
