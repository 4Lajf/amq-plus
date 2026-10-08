import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ owners: new Map(), merge: vi.fn(), generate: vi.fn() }));
vi.mock('$lib/server/supabase-admin.js', () => ({
	createSupabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				eq: (_key, id) => ({
					single: async () => ({
						data: mocks.owners.has(id) ? { id, user_id: mocks.owners.get(id) } : null
					})
				})
			})
		})
	})
}));
vi.mock('$lib/server/training/training-utils.js', () => ({ mergeProgress: mocks.merge }));
vi.mock('$lib/server/songFiltering.js', () => ({ generateQuizSongs: mocks.generate }));
const { POST: merge } = await import('../src/routes/api/training/[quizId]/merge/+server.js');
const { POST: refresh } = await import(
	'../src/routes/api/training/[quizId]/refresh-pool/+server.js'
);
const locals = { safeGetSession: async () => ({ session: { user: { id: 'learner' } } }) };
beforeEach(() => {
	vi.clearAllMocks();
	mocks.owners.clear();
});

it.each([
	['another owner', 'learner'],
	['learner', 'another owner'],
	[null, 'learner'],
	['learner', null]
])('rejects merge before writing when target/source owners are %s / %s', async (target, source) => {
	if (target) mocks.owners.set('target', target);
	if (source) mocks.owners.set('source', source);
	const response = await merge({
		params: { quizId: 'target' },
		locals,
		request: new Request('http://localhost/merge', {
			method: 'POST',
			body: JSON.stringify({ sourceQuizId: 'source' })
		})
	});
	expect(response.status).toBe(403);
	expect(mocks.merge).not.toHaveBeenCalled();
});

it.each(['another owner', null])(
	'rejects refresh before generation when owner is %s',
	async (owner) => {
		if (owner) mocks.owners.set('target', owner);
		await expect(refresh({ params: { quizId: 'target' }, locals, fetch })).rejects.toMatchObject({
			status: 403
		});
		expect(mocks.generate).not.toHaveBeenCalled();
	}
);

it('passes the authenticated owner to merge only when both quizzes belong to them', async () => {
	mocks.owners.set('target', 'learner');
	mocks.owners.set('source', 'learner');
	mocks.merge.mockResolvedValueOnce({ merged: 1, added: 2 });
	const response = await merge({
		params: { quizId: 'target' },
		locals,
		request: new Request('http://localhost/merge', {
			method: 'POST',
			body: JSON.stringify({ sourceQuizId: 'source' })
		})
	});
	expect(response.status).toBe(200);
	expect(mocks.merge).toHaveBeenCalledWith(expect.anything(), 'target', 'source', 'learner');
});
