import { describe, it, expect } from 'vitest';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * These run against tests/mocks/env-*.js, so there is no real project to talk
 * to. They assert the admin client's surface and query-builder behaviour, which
 * is what the server code depends on - no network calls, so nothing here can
 * pass by swallowing a connection failure.
 */
describe('Supabase admin client', () => {
	it('exposes the auth surface the server uses', () => {
		const client = createSupabaseAdmin();

		expect(client.auth).toBeDefined();
		expect(typeof client.auth.signOut).toBe('function');
		expect(typeof client.auth.signInWithPassword).toBe('function');
	});

	it('exposes the storage surface', () => {
		const client = createSupabaseAdmin();

		expect(client.storage).toBeDefined();
		expect(typeof client.storage.from).toBe('function');
	});

	it('builds a query lazily rather than executing on construction', () => {
		const client = createSupabaseAdmin();

		const queryBuilder = client.from('users').select('id, email').eq('id', '123');

		expect(queryBuilder).toBeDefined();
		expect(typeof queryBuilder.then).toBe('function');
	});

	it('chains filters without executing', () => {
		const client = createSupabaseAdmin();

		const builder = client
			.from('training_progress')
			.select('*')
			.eq('user_id', 'abc')
			.eq('quiz_id', 'def')
			.limit(10);

		expect(typeof builder.then).toBe('function');
	});

	it('returns an independent client per call', () => {
		expect(createSupabaseAdmin()).not.toBe(createSupabaseAdmin());
	});
});
