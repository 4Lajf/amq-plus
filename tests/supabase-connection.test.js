import { describe, it, expect, vi } from 'vitest';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

describe('Supabase Connector Connection', () => {
	it('should create a Supabase admin client successfully', () => {
		const client = createSupabaseAdmin();
		expect(client).toBeDefined();
		expect(client.from).toBeDefined();
		expect(typeof client.from).toBe('function');
	});

	it('should have proper client methods', () => {
		const client = createSupabaseAdmin();
		expect(typeof client.auth).toBe('object');
		expect(typeof client.rpc).toBe('function');
		expect(typeof client.storage).toBe('object');
	});

	// These run against tests/mocks/env-*.js (wired up in vitest.config.js), so
	// they assert the contract the client needs - a URL it can reach and a
	// non-empty key - not the literal production credentials.
	it('should verify environment variables are loaded', () => {
		expect(PUBLIC_SUPABASE_URL).toBeDefined();
		expect(SUPABASE_SECRET_KEY).toBeDefined();
		expect(PUBLIC_SUPABASE_URL).toMatch(/supabase\.co/);
		expect(SUPABASE_SECRET_KEY).toBeTruthy();
	});

	it('should be able to initialize a query (without external call)', async () => {
		const client = createSupabaseAdmin();

		// Initialize a query (doesn't execute immediately)
		const query = client
			.from('information_schema.tables')
			.select('table_name')
			.limit(1);

		expect(query).toBeDefined();
		expect(typeof query.then).toBe('function'); // Should be promise-like
	});

	it('should have a well-formed Supabase project URL', () => {
		// Pinning the project ref here would just assert the mock; what matters is
		// that whatever is configured parses as an https Supabase project origin.
		const url = new URL(PUBLIC_SUPABASE_URL);
		expect(url.protocol).toBe('https:');
		expect(url.hostname).toMatch(/^[a-z0-9-]+\.supabase\.co$/);
		expect(url.pathname).toBe('/');
	});

	it('should throw if SUPABASE_SECRET_KEY is missing', async () => {
		// The key is a static import, so re-mock the module and re-import to
		// exercise the guard rather than asserting the env is present (which is
		// what this test used to do).
		vi.resetModules();
		vi.doMock('$env/static/private', () => ({ SUPABASE_SECRET_KEY: '' }));

		const { createSupabaseAdmin: createWithNoKey } = await import('$lib/server/supabase-admin.js');
		expect(() => createWithNoKey()).toThrow(/SUPABASE_SECRET_KEY is not defined/);

		vi.doUnmock('$env/static/private');
		vi.resetModules();
	});
});
