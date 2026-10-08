/**
 * Who may act on a quiz's training data.
 *
 * `/training/[quizId]` admits anyone who has training rows for the quiz, which
 * is how a shared quiz works — but Mark due and Suspend refused anyone who did
 * not *own* it, so the page let you in and then the buttons said no. These
 * actions write only to the caller's own `training_progress` rows, so a trainee
 * doing them for themselves cannot reach the owner's schedule.
 *
 * Per-quiz *settings* stay owner-only and deliberately do not use this helper:
 * they live on one shared `quiz_configurations` row, so a trainee changing them
 * would change them for everybody.
 *
 * Run: npx vitest run tests/trainingAccess.test.js
 */
import { describe, it, expect } from 'vitest';
import { mayModifyOwnTrainingFor } from '../src/lib/server/training/training-utils.js';

/**
 * @param {{ owner: string|null, progressCount?: number }} opts
 */
function makeSupabase({ owner, progressCount = 0 }) {
	const seen = { progressQueried: false, filters: {} };
	return {
		seen,
		from(table) {
			if (table === 'quiz_configurations') {
				return {
					select: () => ({
						eq: () => ({
							single: () => Promise.resolve({ data: owner ? { user_id: owner } : null })
						})
					})
				};
			}
			// training_progress
			seen.progressQueried = true;
			const builder = {
				select: () => builder,
				eq: (col, val) => {
					seen.filters[col] = val;
					return builder;
				},
				then: (resolve) => resolve({ count: progressCount })
			};
			return builder;
		}
	};
}

describe('mayModifyOwnTrainingFor', () => {
	it('allows the quiz owner without touching training_progress', async () => {
		const supabase = makeSupabase({ owner: 'user-1' });

		await expect(mayModifyOwnTrainingFor(supabase, 'user-1', 'quiz-1')).resolves.toBe(true);
		expect(supabase.seen.progressQueried).toBe(false);
	});

	it('allows a non-owner who has training progress on the quiz', async () => {
		const supabase = makeSupabase({ owner: 'user-1', progressCount: 12 });

		await expect(mayModifyOwnTrainingFor(supabase, 'user-2', 'quiz-1')).resolves.toBe(true);
	});

	it('refuses a non-owner with no progress on the quiz', async () => {
		const supabase = makeSupabase({ owner: 'user-1', progressCount: 0 });

		await expect(mayModifyOwnTrainingFor(supabase, 'user-2', 'quiz-1')).resolves.toBe(false);
	});

	it('scopes the progress lookup to the caller, not just the quiz', async () => {
		// Counting rows for the quiz alone would let any stranger in the moment
		// one person trained on it.
		const supabase = makeSupabase({ owner: 'user-1', progressCount: 5 });

		await mayModifyOwnTrainingFor(supabase, 'user-2', 'quiz-1');

		expect(supabase.seen.filters.user_id).toBe('user-2');
		expect(supabase.seen.filters.quiz_id).toBe('quiz-1');
	});

	it('refuses when the quiz does not exist', async () => {
		const supabase = makeSupabase({ owner: null });

		await expect(mayModifyOwnTrainingFor(supabase, 'user-1', 'missing')).resolves.toBe(false);
	});

	it('treats a null count as no access rather than allowing it', async () => {
		const supabase = makeSupabase({ owner: 'user-1', progressCount: null });

		await expect(mayModifyOwnTrainingFor(supabase, 'user-2', 'quiz-1')).resolves.toBe(false);
	});
});
