import { describe, it, expect } from 'vitest';
import {
	partitionCacheEntries,
	promoteStaleEntries
} from '../src/lib/server/user-list-cache-freshness.js';

const NOW = Date.parse('2026-08-10T12:00:00Z');
const FRESH = '2026-08-11T12:00:00Z';
const EXPIRED = '2026-08-09T12:00:00Z';

describe('partitionCacheEntries', () => {
	it('treats an expired row as a MISS, not a hit', () => {
		const { fresh, stale, uncached } = partitionCacheEntries(
			[{ status: 'CURRENT', expires_at: EXPIRED, created_at: EXPIRED }],
			['CURRENT'],
			NOW
		);

		// This is the regression: dropping the expires_at filter made an expired
		// row look cached, so the 24h TTL never triggered a refresh again.
		expect(fresh).toEqual({});
		expect(uncached).toEqual(['CURRENT']);
		expect(stale.CURRENT).toBeDefined();
	});

	it('treats a live row as a hit', () => {
		const { fresh, uncached } = partitionCacheEntries(
			[{ status: 'CURRENT', expires_at: FRESH, created_at: EXPIRED }],
			['CURRENT'],
			NOW
		);

		expect(fresh.CURRENT).toBeDefined();
		expect(uncached).toEqual([]);
	});

	it('ignores statuses that were not requested', () => {
		const { fresh, stale, uncached } = partitionCacheEntries(
			[
				{ status: 'COMPLETED', expires_at: FRESH, created_at: FRESH },
				{ status: 'DROPPED', expires_at: EXPIRED, created_at: EXPIRED }
			],
			['CURRENT'],
			NOW
		);

		expect(fresh).toEqual({});
		expect(stale).toEqual({});
		expect(uncached).toEqual(['CURRENT']);
	});

	it('prefers a fresh row over an expired duplicate', () => {
		const { fresh, uncached } = partitionCacheEntries(
			[
				{ status: 'CURRENT', expires_at: EXPIRED, created_at: '2026-08-08T00:00:00Z' },
				{ status: 'CURRENT', expires_at: FRESH, created_at: '2026-08-10T00:00:00Z' }
			],
			['CURRENT'],
			NOW
		);

		expect(fresh.CURRENT.expires_at).toBe(FRESH);
		expect(uncached).toEqual([]);
	});

	it('keeps the newest of several expired duplicates', () => {
		const { stale } = partitionCacheEntries(
			[
				{ status: 'CURRENT', expires_at: EXPIRED, created_at: '2026-08-01T00:00:00Z' },
				{ status: 'CURRENT', expires_at: EXPIRED, created_at: '2026-08-07T00:00:00Z' }
			],
			['CURRENT'],
			NOW
		);

		expect(stale.CURRENT.created_at).toBe('2026-08-07T00:00:00Z');
	});

	it('handles no rows at all', () => {
		expect(partitionCacheEntries(null, ['CURRENT'], NOW)).toEqual({
			fresh: {},
			stale: {},
			uncached: ['CURRENT']
		});
	});
});

describe('promoteStaleEntries', () => {
	it('serves the expired row when the refresh failed', () => {
		const cached = {};
		const stale = { CURRENT: { status: 'CURRENT', expires_at: EXPIRED } };

		const { promoted, stillMissing } = promoteStaleEntries(cached, stale, ['CURRENT']);

		expect(promoted).toEqual(['CURRENT']);
		expect(stillMissing).toEqual([]);
		expect(cached.CURRENT).toBe(stale.CURRENT);
	});

	it('reports statuses with no fallback available', () => {
		const cached = {};
		const { promoted, stillMissing } = promoteStaleEntries(cached, {}, ['CURRENT', 'COMPLETED']);

		expect(promoted).toEqual([]);
		expect(stillMissing).toEqual(['CURRENT', 'COMPLETED']);
		expect(cached).toEqual({});
	});

	it('promotes only what it can', () => {
		const cached = {};
		const stale = { COMPLETED: { status: 'COMPLETED', expires_at: EXPIRED } };

		const { promoted, stillMissing } = promoteStaleEntries(cached, stale, ['CURRENT', 'COMPLETED']);

		expect(promoted).toEqual(['COMPLETED']);
		expect(stillMissing).toEqual(['CURRENT']);
	});
});
