import { describe, it, expect } from 'vitest';
import { simulateQuizFromRoutes } from '../src/lib/utils/simulation.js';

/**
 * Build a route with `count` copies of the same filter, all sharing one
 * selectionModifier. The modifier applies per (filterId + sourceSelector) group,
 * which is why the entries have to be duplicates of one filter.
 */
function routeWithFilters(count, selectionModifier) {
	return [
		{
			id: 'route-1',
			enabled: true,
			weight: 1,
			sources: [{ id: 'src-1', type: 'all', enabled: true }],
			filters: Array.from({ length: count }, (_, i) => ({
				id: `f-${i}`,
				filterId: 'vintage',
				enabled: true,
				selectionModifier,
				settings: { mode: 'advanced', advanced: { from: 2000 + i, to: 2001 + i } }
			}))
		}
	];
}

/**
 * How many vintage entries survived the modifier.
 *
 * Survivors are merged into a single filter that records the entry ids it came
 * from in `sourceNodes`; a lone survivor is emitted unmerged.
 */
function resolvedCount(result) {
	const vintage = (result?.filters || []).filter((f) => f.definitionId === 'vintage');
	if (vintage.length === 0) return 0;
	const merged = vintage[0];
	return Array.isArray(merged.sourceNodes) ? merged.sourceNodes.length : 1;
}

describe('franchise-size style selection modifier', () => {
	it('never keeps more than max', () => {
		for (let seed = 0; seed < 40; seed++) {
			const result = simulateQuizFromRoutes(routeWithFilters(6, { minSelection: 1, maxSelection: 3 }));
			expect(resolvedCount(result)).toBeLessThanOrEqual(3);
		}
	});

	it('never keeps fewer than min', () => {
		// The regression: minSelection was stored, rendered and ignored, so a
		// 4..4 window and a 1..4 window behaved identically.
		for (let seed = 0; seed < 40; seed++) {
			const result = simulateQuizFromRoutes(routeWithFilters(6, { minSelection: 4, maxSelection: 5 }));
			const kept = resolvedCount(result);
			expect(kept).toBeGreaterThanOrEqual(4);
			expect(kept).toBeLessThanOrEqual(5);
		}
	});

	it('actually varies within the window rather than pinning to max', () => {
		const seen = new Set();
		for (let i = 0; i < 60; i++) {
			seen.add(resolvedCount(simulateQuizFromRoutes(routeWithFilters(6, { minSelection: 1, maxSelection: 4 }))));
		}
		// Before the fix this set was always exactly {4}.
		expect(seen.size).toBeGreaterThan(1);
	});

	it('keeps every entry when there are fewer than min', () => {
		const result = simulateQuizFromRoutes(routeWithFilters(2, { minSelection: 5, maxSelection: 9 }));
		expect(resolvedCount(result)).toBe(2);
	});

	it('behaves like the old max-only rule when min is absent', () => {
		for (let i = 0; i < 20; i++) {
			expect(resolvedCount(simulateQuizFromRoutes(routeWithFilters(6, { maxSelection: 2 })))).toBe(2);
		}
	});
});
