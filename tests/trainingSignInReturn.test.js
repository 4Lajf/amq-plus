import { expect, it, vi } from 'vitest';

const { createAdmin } = vi.hoisted(() => ({ createAdmin: vi.fn() }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: createAdmin }));
const { load: overview } = await import('../src/routes/training/+page.server.js');
const { load: detail } = await import('../src/routes/training/[quizId]/+page.server.js');

it.each([
	['/training', overview],
	['/training/eb90a823-11a7-4c58-8b50-c62f5438a914?stage=review', detail]
])('preserves the signed-out Training destination %s', async (path, load) => {
	createAdmin.mockClear();
	await expect(
		load({
			url: new URL(path, 'http://localhost:5173'),
			params: { quizId: 'eb90a823-11a7-4c58-8b50-c62f5438a914' },
			locals: { safeGetSession: async () => ({ session: null, user: null }) }
		})
	).rejects.toMatchObject({ status: 303, location: `/auth?next=${encodeURIComponent(path)}` });
	expect(createAdmin).not.toHaveBeenCalled();
});
