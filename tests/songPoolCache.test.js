import { describe, it, expect, beforeEach } from 'vitest';
import {
	buildResolvedConfigStamp,
	buildSongPoolCacheKey,
	getCachedSongPool,
	setCachedSongPool,
	clearSongPoolCache,
	resetSongPoolCacheForTests
} from '../src/lib/server/training/song-pool-cache.js';

describe('song pool cache', () => {
	beforeEach(() => {
		resetSongPoolCacheForTests();
	});

	it('returns null on miss', () => {
		expect(getCachedSongPool('missing')).toBeNull();
	});

	it('stores and returns a pool', () => {
		setCachedSongPool('k1', [{ annSongId: 1 }]);
		expect(getCachedSongPool('k1')).toEqual([{ annSongId: 1 }]);
	});

	it('builds stable keys from quiz + source stamps', () => {
		const a = buildSongPoolCacheKey('q1', '2026-01-01', [
			{ id: 'l2', updated_at: 't', songs_list_link: 'u' },
			{ id: 'l1', updated_at: 't', songs_list_link: 'u' }
		]);
		const b = buildSongPoolCacheKey('q1', '2026-01-01', [
			{ id: 'l1', updated_at: 't', songs_list_link: 'u' },
			{ id: 'l2', updated_at: 't', songs_list_link: 'u' }
		]);
		expect(a).toBe(b);
	});

	it('changes key when a source list updates', () => {
		const a = buildSongPoolCacheKey('q1', 't0', [{ id: 'l1', updated_at: '1' }]);
		const b = buildSongPoolCacheKey('q1', 't0', [{ id: 'l1', updated_at: '2' }]);
		expect(a).not.toBe(b);
	});

	it('clears all entries', () => {
		setCachedSongPool('k1', []);
		clearSongPoolCache();
		expect(getCachedSongPool('k1')).toBeNull();
	});
});

describe('resolved config stamp', () => {
	const routeA = {
		router: { selectedRouteId: 'route-a' },
		filters: [{ definitionId: 'vintage', instanceId: 'x', settings: { from: 2000 } }],
		songLists: [{ mode: 'saved', listId: 'l1' }],
		negativeSongLists: []
	};

	it('separates two routes of the same quiz', () => {
		const routeB = { ...routeA, router: { selectedRouteId: 'route-b' } };

		const a = buildSongPoolCacheKey('q1', 't0', [], {
			resolvedConfig: buildResolvedConfigStamp(routeA)
		});
		const b = buildSongPoolCacheKey('q1', 't0', [], {
			resolvedConfig: buildResolvedConfigStamp(routeB)
		});

		expect(a).not.toBe(b);
	});

	it('separates two rolls that dropped different filters', () => {
		const withoutVintage = { ...routeA, filters: [] };

		expect(buildResolvedConfigStamp(routeA)).not.toBe(buildResolvedConfigStamp(withoutVintage));
	});

	it('separates different resolved filter settings', () => {
		const otherVintage = {
			...routeA,
			filters: [{ definitionId: 'vintage', instanceId: 'x', settings: { from: 2010 } }]
		};

		expect(buildResolvedConfigStamp(routeA)).not.toBe(buildResolvedConfigStamp(otherVintage));
	});

	it('ignores instanceId so merged/default filters still hit the cache', () => {
		// resolveConflicts builds instanceId as `merged-<id>-${Date.now()}`; if that
		// leaked into the key every request would miss.
		const later = {
			...routeA,
			filters: [{ definitionId: 'vintage', instanceId: 'merged-vintage-999', settings: { from: 2000 } }]
		};

		expect(buildResolvedConfigStamp(routeA)).toBe(buildResolvedConfigStamp(later));
	});

	it('ignores filter order', () => {
		const reordered = {
			...routeA,
			filters: [
				{ definitionId: 'zzz', settings: null },
				{ definitionId: 'vintage', instanceId: 'x', settings: { from: 2000 } }
			]
		};
		const sameOtherOrder = {
			...routeA,
			filters: [
				{ definitionId: 'vintage', instanceId: 'y', settings: { from: 2000 } },
				{ definitionId: 'zzz', settings: null }
			]
		};

		expect(buildResolvedConfigStamp(reordered)).toBe(buildResolvedConfigStamp(sameOtherOrder));
	});

	it('ignores basicSettings, which do not affect which songs match', () => {
		const fastGuess = { ...routeA, basicSettings: { guessTime: { kind: 'static', value: 5 } } };
		const slowGuess = { ...routeA, basicSettings: { guessTime: { kind: 'static', value: 40 } } };

		expect(buildResolvedConfigStamp(fastGuess)).toBe(buildResolvedConfigStamp(slowGuess));
	});
});
