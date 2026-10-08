import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TRAINING_PREFERENCES,
	getUserTrainingPreferences
} from '../src/lib/server/training/user-preferences.js';

function supabaseReturning(result) {
	return {
		from() {
			const query = {
				select: () => query,
				eq: () => query,
				maybeSingle: async () => result
			};
			return query;
		}
	};
}

describe('trainee-owned training preferences', () => {
	it('returns the trainee row instead of quiz-owner settings', async () => {
		const preferences = await getUserTrainingPreferences(
			supabaseReturning({
				data: {
					daily_review_limit: 12,
					daily_new_limit: 5,
					daily_review_goal: 15,
					combine_duplicates: true,
					allow_same_day_reviews: false
				},
				error: null
			}),
			'trainee',
			'quiz',
			{ daily_new_limit: 99 }
		);

		expect(preferences).toEqual({
			daily_review_limit: 12,
			daily_new_limit: 5,
			daily_review_goal: 15,
			combine_duplicates: true,
			allow_same_day_reviews: false
		});
	});

	it('uses solid zero-settings defaults for a new shared trainee', async () => {
		const preferences = await getUserTrainingPreferences(
			supabaseReturning({ data: null, error: null }),
			'trainee',
			'quiz'
		);

		expect(preferences).toEqual(DEFAULT_TRAINING_PREFERENCES);
	});

	it('keeps an explicit empty goal off instead of filling the default', async () => {
		const preferences = await getUserTrainingPreferences(
			supabaseReturning({ data: null, error: { code: 'PGRST205' } }),
			'trainee',
			'quiz',
			{ daily_review_goal: null }
		);

		expect(preferences.daily_review_goal).toBeNull();
	});

	it('falls back to the legacy quiz values during a rolling deploy', async () => {
		const preferences = await getUserTrainingPreferences(
			supabaseReturning({ data: null, error: { code: 'PGRST205' } }),
			'trainee',
			'quiz',
			{
				daily_review_limit: 40,
				daily_new_limit: 10,
				daily_review_goal: 25,
				combine_duplicates: true,
				allow_same_day_reviews: false
			}
		);

		expect(preferences.daily_review_limit).toBe(40);
		expect(preferences.daily_new_limit).toBe(10);
		expect(preferences.daily_review_goal).toBe(25);
		expect(preferences.combine_duplicates).toBe(true);
		expect(preferences.allow_same_day_reviews).toBe(false);
	});
});
