/**
 * W10 — suspend from the rating overlay.
 *
 * R9 shipped suspend on the website; the ask was always to suspend *while
 * playing* (lng, doomchicken, Cherryish, 3shine, TriusHalf over five months).
 * The connector runs on animemusicquiz.com and has no cookie for this origin, so
 * the endpoint has to accept a training token the way R14's song-lists/append
 * does — without weakening the ownership check that was already there.
 *
 * Run: npx vitest run tests/suspendFromConnector.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupToken = vi.fn();
const mayModifyOwnTrainingFor = vi.fn();

vi.mock('$lib/server/training/training-utils.js', () => ({
	lookupToken: (...args) => lookupToken(...args),
	mayModifyOwnTrainingFor: (...args) => mayModifyOwnTrainingFor(...args),
	INVALID_TOKEN_MESSAGE: 'Your training token is no longer valid.'
}));

let supabaseStub;
vi.mock('$lib/server/supabase-admin.js', () => ({
	createSupabaseAdmin: () => supabaseStub
}));

const { POST } = await import('../src/routes/api/training/[quizId]/suspend/+server.js');

/**
 * @param {{ quizOwner: string|null, updated?: number[] }} opts
 */
function makeSupabase({ quizOwner, updated = [1] }) {
	const calls = { updates: [] };

	return {
		calls,
		from(table) {
			if (table === 'quiz_configurations') {
				return {
					select: () => ({
						eq: () => ({
							single: () =>
								Promise.resolve({ data: quizOwner ? { user_id: quizOwner } : null })
						})
					})
				};
			}

			// training_progress
			const builder = {
				update(payload) {
					calls.updates.push(payload);
					return builder;
				},
				eq: () => builder,
				in: () => builder,
				select: () =>
					Promise.resolve({ data: updated.map((id) => ({ song_ann_id: id })), error: null })
			};
			return builder;
		}
	};
}

function request(body) {
	return { json: async () => body };
}

const noSession = { safeGetSession: async () => ({ session: null }) };

describe('W10 suspend via connector token', () => {
	beforeEach(() => {
		lookupToken.mockReset();
		// Authorization is its own unit (see trainingAccess.test.js). Here we pin
		// that the endpoint *consults* it and honours the answer.
		mayModifyOwnTrainingFor.mockReset();
		mayModifyOwnTrainingFor.mockResolvedValue(true);
	});

	it('suspends the song when the token resolves to the quiz owner', async () => {
		lookupToken.mockResolvedValue({ user_id: 'user-1' });
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		const res = await POST({
			params: { quizId: 'quiz-1' },
			request: request({ token: 'tok', songAnnIds: [1234], suspended: true }),
			locals: noSession
		});

		expect(res.status).toBe(200);
		expect(supabaseStub.calls.updates).toHaveLength(1);
		expect(supabaseStub.calls.updates[0].suspended_at).toBeTruthy();
	});

	it('unsuspends by clearing suspended_at', async () => {
		lookupToken.mockResolvedValue({ user_id: 'user-1' });
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		await POST({
			params: { quizId: 'quiz-1' },
			request: request({ token: 'tok', songAnnIds: [1234], suspended: false }),
			locals: noSession
		});

		expect(supabaseStub.calls.updates[0].suspended_at).toBeNull();
	});

	it('rejects a token that does not resolve', async () => {
		lookupToken.mockResolvedValue(null);
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		const res = await POST({
			params: { quizId: 'quiz-1' },
			request: request({ token: 'bad', songAnnIds: [1234], suspended: true }),
			locals: noSession
		});

		expect(res.status).toBe(401);
		expect(supabaseStub.calls.updates).toHaveLength(0);
	});

	it("still refuses a valid token pointed at a stranger's quiz", async () => {
		// The token replaces the cookie, not the access check. A user with no
		// training rows on someone else's quiz stays out.
		lookupToken.mockResolvedValue({ user_id: 'user-2' });
		mayModifyOwnTrainingFor.mockResolvedValue(false);
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		await expect(
			POST({
				params: { quizId: 'quiz-1' },
				request: request({ token: 'tok', songAnnIds: [1234], suspended: true }),
				locals: noSession
			})
		).rejects.toMatchObject({ status: 403 });

		expect(supabaseStub.calls.updates).toHaveLength(0);
	});

	it('lets a shared-quiz trainee suspend their own copy of a song', async () => {
		// The training page already admits anyone with progress on the quiz; the
		// update is scoped to their own user_id, so it cannot reach the owner's
		// schedule. Refusing here was the inconsistency.
		lookupToken.mockResolvedValue({ user_id: 'user-2' });
		mayModifyOwnTrainingFor.mockResolvedValue(true);
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		const res = await POST({
			params: { quizId: 'quiz-1' },
			request: request({ token: 'tok', songAnnIds: [1234], suspended: true }),
			locals: noSession
		});

		expect(res.status).toBe(200);
		expect(supabaseStub.calls.updates).toHaveLength(1);
	});

	it('still rejects an unauthenticated request with no token at all', async () => {
		supabaseStub = makeSupabase({ quizOwner: 'user-1' });

		await expect(
			POST({
				params: { quizId: 'quiz-1' },
				request: request({ songAnnIds: [1234], suspended: true }),
				locals: noSession
			})
		).rejects.toMatchObject({ status: 401 });

		expect(lookupToken).not.toHaveBeenCalled();
	});
});
