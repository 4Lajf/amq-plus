import { expect, it, vi } from 'vitest';
import { QuizSourceError, QuizSourceLoadError } from '../src/lib/server/quiz-source-error.js';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('$lib/server/songFiltering.js', () => ({ generateQuizSongs: generate }));
vi.mock('$lib/utils/simulation.js', () => ({ simulateQuizFromRoutes: () => ({ basicSettings: {} }) }));
vi.mock('$lib/server/supabase-admin.js', () => ({
	createSupabaseAdmin: () => {
		const query = {
			from: () => query, select: () => query, eq: () => query,
			single: async () => ({ data: { id: 'quiz', is_public: true, configuration_data: { routes: [] } } })
		};
		return query;
	}
}));
const { GET } = await import('../src/routes/play/[quizId]/+server.js');
const request = () => GET({ params: { quizId: 'play-token' }, url: new URL('http://localhost/play/play-token?format=full'), locals: {}, fetch });

it('puts repairable source errors in the visible message', async () => {
	const message = 'The quiz source "Deleted practice" no longer exists. Remove it from this quiz.';
	generate.mockRejectedValueOnce(new QuizSourceError(message));
	const response = await request();
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({ success: false, errorType: 'configuration_error', userMessage: message });
});

it('keeps unexpected backend errors as server failures', async () => {
	generate.mockRejectedValueOnce(new Error('network failure'));
	const response = await request();
	expect(response.status).toBe(500);
	expect((await response.json()).errorType).toBe('api_error');
});

it.each([502, 422])('shows a nested source failure with its status %s', async status => {
	generate.mockRejectedValueOnce(new QuizSourceLoadError('Nested source could not load', status));
	const response = await request();
	expect(response.status).toBe(status);
	expect((await response.json()).userMessage).toBe('Nested source could not load');
});
