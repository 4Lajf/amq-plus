/**
 * W6b — the legacy bcrypt scan runs in parallel chunks.
 *
 * bcrypt releases to libuv's threadpool, so compares genuinely overlap; the scan
 * used to be a sequential `for … await`, ~60-100 ms per row over 222
 * un-backfilled rows. What must not change while making it concurrent: the scan
 * stops once a chunk has matched, the matching row still backfills
 * token_sha256, and a total miss still writes the negative cache.
 *
 * Run: npx vitest run tests/tokenScan.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const compareCalls = [];
let concurrentNow = 0;
let concurrentPeak = 0;

vi.mock('bcrypt', () => ({
	default: {
		compare: async (plain, hash) => {
			compareCalls.push(hash);
			concurrentNow++;
			concurrentPeak = Math.max(concurrentPeak, concurrentNow);
			await new Promise((resolve) => setTimeout(resolve, 5));
			concurrentNow--;
			return hash === `bcrypt:${plain}`;
		},
		hash: async (plain) => `bcrypt:${plain}`
	},
	compare: async (plain, hash) => hash === `bcrypt:${plain}`,
	hash: async (plain) => `bcrypt:${plain}`
}));

const { lookupToken, clearFailedTokenLookups } = await import(
	'../src/lib/server/training/training-utils.js'
);

const TOKEN = 'a'.repeat(64);

/**
 * Supabase stub: the indexed lookup always misses, the legacy query returns the
 * rows under test, and updates are recorded so the backfill can be asserted.
 */
function makeSupabase(legacyRows) {
	const backfilled = [];

	return {
		backfilled,
		from() {
			const builder = {
				_isUpdate: false,
				_update: null,
				select: () => builder,
				is: () => builder,
				eq(column, value) {
					if (builder._isUpdate && column === 'id') {
						backfilled.push({ id: value, ...builder._update });
						return Promise.resolve({ error: null });
					}
					if (column === 'token_sha256') {
						builder._sha256Lookup = true;
					}
					return builder;
				},
				update(payload) {
					builder._isUpdate = true;
					builder._update = payload;
					return builder;
				},
				maybeSingle: () => Promise.resolve({ data: null, error: null }),
				then(resolve) {
					// Awaiting the builder resolves the legacy query.
					return Promise.resolve({ data: legacyRows, error: null }).then(resolve);
				}
			};
			return builder;
		}
	};
}

function row(id, plaintext) {
	return { id, token_hash: `bcrypt:${plaintext}`, token_sha256: null, revoked: false };
}

describe('W6b parallel bcrypt scan', () => {
	beforeEach(() => {
		compareCalls.length = 0;
		concurrentNow = 0;
		concurrentPeak = 0;
		clearFailedTokenLookups();
	});

	it('actually overlaps compares instead of running them one at a time', async () => {
		const rows = Array.from({ length: 12 }, (_, i) => row(i, `miss-${i}`));
		const supabase = makeSupabase(rows);

		await lookupToken(supabase, TOKEN);

		expect(compareCalls).toHaveLength(12);
		expect(concurrentPeak, 'compares ran sequentially').toBeGreaterThan(1);
	});

	it('stops starting new chunks once a chunk has matched', async () => {
		// Match in the first chunk of 4; the remaining 16 rows must never be
		// compared. A chunked implementation that awaits every chunk looks correct
		// and fails exactly here.
		const rows = [
			row(0, 'miss-0'),
			row(1, TOKEN),
			row(2, 'miss-2'),
			row(3, 'miss-3'),
			...Array.from({ length: 16 }, (_, i) => row(4 + i, `miss-${4 + i}`))
		];
		const supabase = makeSupabase(rows);

		const match = await lookupToken(supabase, TOKEN);

		expect(match?.id).toBe(1);
		expect(
			compareCalls.length,
			'kept scanning after a match'
		).toBeLessThanOrEqual(4);
	});

	it('returns the matched row and backfills token_sha256 on it', async () => {
		const rows = [row(0, 'miss-0'), row(1, 'miss-1'), row(2, TOKEN)];
		const supabase = makeSupabase(rows);

		const match = await lookupToken(supabase, TOKEN);

		expect(match?.id).toBe(2);
		expect(match?.token_sha256, 'returned row should carry the new hash').toBeTruthy();
		expect(supabase.backfilled).toHaveLength(1);
		expect(supabase.backfilled[0].id).toBe(2);
		expect(supabase.backfilled[0].token_sha256).toBe(match.token_sha256);
	});

	it('picks the first match in row order, not whichever compare finished first', async () => {
		// Two rows in the same chunk both match. Row order has to decide.
		const rows = [row(0, 'miss-0'), row(1, TOKEN), row(2, TOKEN), row(3, 'miss-3')];
		const supabase = makeSupabase(rows);

		const match = await lookupToken(supabase, TOKEN);
		expect(match?.id).toBe(1);
	});

	it('still writes the negative cache after a total miss', async () => {
		const rows = Array.from({ length: 6 }, (_, i) => row(i, `miss-${i}`));
		const supabase = makeSupabase(rows);

		expect(await lookupToken(supabase, TOKEN)).toBeNull();
		const firstScan = compareCalls.length;
		expect(firstScan).toBe(6);

		// Second attempt with the same token must be served from the negative
		// cache without touching bcrypt again.
		expect(await lookupToken(supabase, TOKEN)).toBeNull();
		expect(compareCalls.length, 'negative cache did not short-circuit').toBe(firstScan);
	});
});
