import { expect, it, vi } from 'vitest';

const { createAdmin, lookupToken } = vi.hoisted(() => ({
	createAdmin: vi.fn(),
	lookupToken: vi.fn()
}));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: createAdmin }));
vi.mock('$lib/server/training/training-utils.js', () => ({ lookupToken }));
const { PATCH } = await import('../src/routes/api/quiz-configurations/[id]/stats/+server.js');
const { PATCH: legacyPatch } = await import(
	'../src/routes/api/quiz-configurations/stats/+server.js'
);

it('preserves the signed-out 401 before accessing the database', async () => {
	createAdmin.mockClear();
	await expect(
		PATCH({
			params: { id: 'quiz' },
			request: new Request('http://localhost/test', { method: 'PATCH' }),
			locals: { safeGetSession: async () => ({ session: null, user: null }) }
		})
	).rejects.toMatchObject({ status: 401, body: { message: 'Sign in to like a quiz' } });
	expect(createAdmin).not.toHaveBeenCalled();
});

it('preserves invalid like-state validation as 400', async () => {
	createAdmin.mockReturnValue({});
	await expect(
		PATCH({
			params: { id: 'quiz' },
			request: new Request('http://localhost/test', {
				method: 'PATCH',
				body: JSON.stringify({ likeState: 7 })
			}),
			locals: { safeGetSession: async () => ({ session: {}, user: { id: 'user' } }) }
		})
	).rejects.toMatchObject({ status: 400 });
});

it('rejects a connector like that has no valid training token', async () => {
	lookupToken.mockResolvedValue(null);
	createAdmin.mockReturnValue({});
	await expect(
		PATCH({
			params: { id: 'quiz' },
			request: new Request('http://localhost/test', {
				method: 'PATCH',
				body: JSON.stringify({ likeState: 1, token: 'not-a-token' })
			}),
			locals: { safeGetSession: async () => ({ session: null, user: null }) }
		})
	).rejects.toMatchObject({ status: 401, body: { message: 'Sign in to like a quiz' } });
});

it('treats a valid connector token as the signed-in user', async () => {
	lookupToken.mockResolvedValue({ user_id: 'user-from-token' });
	createAdmin.mockReturnValue({});
	const safeGetSession = vi.fn(async () => {
		throw new Error('cookie session should not be required');
	});
	await expect(
		PATCH({
			params: { id: 'quiz' },
			request: new Request('http://localhost/test', {
				method: 'PATCH',
				body: JSON.stringify({ likeState: -1, token: 'linked-token' })
			}),
			locals: { safeGetSession }
		})
	).rejects.toMatchObject({ status: 400 });
	expect(safeGetSession).not.toHaveBeenCalled();
});

it('keeps the legacy name-based endpoint retired', async () => {
	await expect(legacyPatch()).rejects.toMatchObject({ status: 410 });
});
