export const DEFAULT_TRAINING_PREFERENCES = Object.freeze({
	daily_review_limit: null,
	daily_new_limit: 20,
	daily_review_goal: 50,
	combine_duplicates: false,
	allow_same_day_reviews: true
});

/**
 * Read preferences owned by a trainee. The quiz fallback keeps a rolling deploy
 * compatible until the additive table migration has been applied.
 */
export async function getUserTrainingPreferences(supabaseAdmin, userId, quizId, quizFallback = {}) {
	const { data, error } = await supabaseAdmin
		.from('user_quiz_training_preferences')
		.select(
			'daily_review_limit, daily_new_limit, daily_review_goal, combine_duplicates, allow_same_day_reviews'
		)
		.eq('user_id', userId)
		.eq('quiz_id', quizId)
		.maybeSingle();

	if (!error && data) return { ...DEFAULT_TRAINING_PREFERENCES, ...data };

	return {
		daily_review_limit:
			quizFallback.daily_review_limit ?? DEFAULT_TRAINING_PREFERENCES.daily_review_limit,
		daily_new_limit: quizFallback.daily_new_limit ?? DEFAULT_TRAINING_PREFERENCES.daily_new_limit,
		daily_review_goal:
			quizFallback.daily_review_goal === undefined
				? DEFAULT_TRAINING_PREFERENCES.daily_review_goal
				: quizFallback.daily_review_goal,
		combine_duplicates: quizFallback.combine_duplicates === true,
		allow_same_day_reviews: quizFallback.allow_same_day_reviews !== false
	};
}
