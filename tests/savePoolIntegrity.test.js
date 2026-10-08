import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ resolve: vi.fn(), insert: vi.fn(), complete: vi.fn(), fail: vi.fn() }));
vi.mock('$lib/server/songFiltering.js', () => ({ resolveEligiblePool: mock.resolve }));
vi.mock('$lib/utils/simulation.js', () => ({ simulateQuizFromRoutes: () => ({ numberOfSongs: 20 }) }));
vi.mock('$env/static/private', () => ({ PIXELDRAIN_API_KEY: 'test-key' }));
vi.mock('$lib/server/supabase-admin.js', () => ({ createSupabaseAdmin: () => ({ from: () => ({ insert: mock.insert }) }) }));
vi.mock('$lib/server/training/session-jobs.js', () => ({
	createSessionJob: () => ({ id: 'job' }), getSessionJob: vi.fn(), setSessionJobMessage: vi.fn(),
	completeSessionJob: mock.complete, failSessionJob: mock.fail
}));
const { POST } = await import('../src/routes/api/song-lists/from-filters/+server.js');
const songs = count => Array.from({ length: count }, (_, i) => ({ annSongId: i + 1, songName: `Song ${i}`, HQ: 'test.webm' }));
async function run(fetchFn = fetch) {
	const response = await POST({ request: new Request('http://localhost/api/song-lists/from-filters', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: [{}], name: 'Test pool' })
	}), fetch: fetchFn, locals: { safeGetSession: async () => ({ session: {}, user: { id: 'owner' } }) } });
	expect(response.status).toBe(202);
	await vi.waitFor(() => expect(mock.complete.mock.calls.length + mock.fail.mock.calls.length).toBe(1));
}
beforeEach(() => {
	vi.clearAllMocks();
	mock.insert.mockImplementation(row => ({ select: () => ({ single: async () => ({ data: { id: 'list', ...row } }) }) }));
});
afterEach(() => vi.unstubAllGlobals());

it('uses the request fetch for relative source-cache URLs in the background job', async () => {
	const requestFetch = vi.fn();
	mock.resolve.mockResolvedValue({ songs: [] });
	await run(requestFetch);
	expect(mock.resolve).toHaveBeenCalledWith(expect.anything(), requestFetch);
});

it('refuses 20001 unique songs before uploading or inserting anything', async () => {
	mock.resolve.mockResolvedValue({ songs: songs(20001) });
	const upload = vi.fn(); vi.stubGlobal('fetch', upload);
	await run();
	expect(mock.fail).toHaveBeenCalledWith('job', expect.stringContaining('20001'), 413);
	expect(upload).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});

it.each([0, 2])('refuses an incomplete pool with %s songs and explains its source error', async count => {
	mock.resolve.mockResolvedValue({ songs: songs(count), loadingErrors: [{ error: 'AniList API error: 403 Forbidden' }] });
	const upload = vi.fn(); vi.stubGlobal('fetch', upload);
	await run();
	expect(mock.fail).toHaveBeenCalledWith('job', expect.stringContaining('AniList API error: 403 Forbidden'), 502);
	expect(upload).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});

it('saves all 26 unique pool songs despite a 20-song selection target', async () => {
	const pool = songs(26); mock.resolve.mockResolvedValue({ songs: [...pool, pool[0]] });
	let bytes;
	vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
		if (options.method === 'PUT') { bytes = Buffer.byteLength(options.body); return new Response('{}'); }
		return new Response(null, { headers: { 'content-length': String(bytes) } });
	}));
	await run();
	expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ song_count: 26 }));
	expect(mock.complete).toHaveBeenCalledWith('job', expect.objectContaining({ songCount: 26 }));
});

it('refuses to save when a filter references a missing source', async () => {
	const message = 'Song Categories references a source that no longer exists.';
	mock.resolve.mockResolvedValue({ songs: songs(2), scopingErrors: [{ message }] });
	const upload = vi.fn(); vi.stubGlobal('fetch', upload);
	await run();
	expect(mock.fail).toHaveBeenCalledWith('job', expect.stringContaining(message), 422);
	expect(upload).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});

it.each([503, 'missing-length', 'wrong-length'])('does not publish a list when upload verification fails: %s', async failure => {
	mock.resolve.mockResolvedValue({ songs: songs(26) });
	vi.stubGlobal('fetch', vi.fn(async (_url, options) => options.method === 'PUT'
		? new Response('{}') : new Response(null, { status: failure === 503 ? 503 : 200,
			headers: failure === 'wrong-length' ? { 'content-length': '1' } : {} })));
	await run();
	expect(mock.fail).toHaveBeenCalled();
	expect(mock.insert).not.toHaveBeenCalled();
});
