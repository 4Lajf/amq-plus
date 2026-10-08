import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ update: vi.fn(), songs: [], count: 0 }));
vi.mock('$env/static/private', () => ({ PIXELDRAIN_API_KEY: 'test' }));
vi.mock('$lib/server/training/training-utils.js', () => ({
	lookupToken: async () => ({ user_id: 'owner' }),
	INVALID_TOKEN_MESSAGE: 'Invalid'
}));
vi.mock('$lib/server/song-list-loader.js', () => ({
	loadSavedSongList: async () => ({ songs: mock.songs, name: 'Test' })
}));
vi.mock('$lib/server/masterlist.js', () => ({
	getSongByAnnSongId: async (id) => ({ annSongId: id, songName: 'New' }),
	getMasterlistIndex: async () => new Map([['30000', { annSongId: 30000, songName: 'New' }]])
}));
vi.mock('$lib/server/supabase-admin.js', () => ({
	createSupabaseAdmin: () => ({
		from: () => {
			const q = {
				select: () => q,
				eq: () => q,
				maybeSingle: async () => ({
					data: { id: 'list', user_id: 'owner', name: 'Test', song_count: mock.count }
				}),
				update: (values) => {
					mock.update(values);
					return q;
				},
				then: (resolve) => resolve({ error: null })
			};
			return q;
		}
	})
}));
const { POST: bulk } = await import('../src/routes/api/song-lists/[id]/append-bulk/+server.js');
const { POST: single } = await import('../src/routes/api/training/song-lists/append/+server.js');
const run = (kind) =>
	(kind === 'bulk' ? bulk : single)({
		params: { id: 'list' },
		request: new Request('http://localhost/api/test', {
			method: 'POST',
			body: JSON.stringify(
				kind === 'bulk'
					? { annSongIds: [30000] }
					: { token: 'test', listId: 'list', annSongId: 30000 }
			)
		}),
		locals: { safeGetSession: async () => ({ session: {}, user: { id: 'owner' } }) }
	});
beforeEach(() => {
	vi.clearAllMocks();
	mock.songs = [];
	mock.count = 0;
});
afterEach(() => vi.unstubAllGlobals());
it.each(['bulk', 'single'])(
	'%s rejects an actual 20000-song list before writes, even with stale stored count',
	async (kind) => {
		mock.songs = Array.from({ length: 20000 }, (_, i) => ({ annSongId: i + 1 }));
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		let status;
		try {
			status = (await run(kind)).status;
		} catch (e) {
			status = e.status;
		}
		expect(status).toBe(413);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mock.update).not.toHaveBeenCalled();
	}
);
it.each(
	['bulk', 'single'].flatMap((kind) => [503, 'missing', 'wrong'].map((failure) => [kind, failure]))
)('%s rejects unverifiable upload %s without replacing the list', async (kind, failure) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, options) =>
			options.method === 'PUT'
				? new Response('{}')
				: new Response(null, {
						status: failure === 503 ? 503 : 200,
						headers: failure === 'wrong' ? { 'content-length': '1' } : {}
					})
		)
	);
	let failed = false;
	try {
		failed = (await run(kind)).status >= 400;
	} catch {
		failed = true;
	}
	expect(failed).toBe(true);
	expect(mock.update).not.toHaveBeenCalled();
});

it.each(['bulk', 'single'])(
	'%s publishes only a verified complete list and returns the new count',
	async (kind) => {
		mock.songs = [{ annSongId: 1, songName: 'Existing' }];
		let bytes;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, options) => {
				if (options.method === 'PUT') {
					const songs = JSON.parse(options.body);
					expect(songs.map((s) => s.annSongId)).toEqual([1, 30000]);
					bytes = Buffer.byteLength(options.body);
					return new Response('{}');
				}
				return new Response(null, { headers: { 'content-length': String(bytes) } });
			})
		);
		const response = await run(kind);
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.songCount).toBe(2);
		expect(result.added).toBe(kind === 'bulk' ? 1 : true);
		expect(mock.update).toHaveBeenCalledOnce();
		expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ song_count: 2 }));
	}
);
