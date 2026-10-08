import { describe, it, expect } from 'vitest';
import { __test_distributeToBaskets as distributeToBaskets } from '../src/lib/server/songFiltering.js';

/** distributeToBaskets ignores rng for membership; stub keeps the call signature. */
const unusedRng = () => 0.5;

function song(annSongId, type = 'Opening') {
	return {
		annSongId,
		songName: `Song ${annSongId}`,
		songType: type,
		HQ: 'x.webm',
		malId: annSongId
	};
}

describe('N11 deterministic max-fill', () => {
	it('returns the same songs and count regardless of input order', () => {
		const eligible = [
			song(30, 'Ending'),
			song(10, 'Opening'),
			song(40, 'Ending'),
			song(20, 'Opening'),
			song(50, 'Opening'),
			song(60, 'Ending')
		];

		const makeBaskets = () => [
			{
				id: 'type-opening',
				min: 2,
				max: 2,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Opening')
			},
			{
				id: 'type-ending',
				min: 2,
				max: 2,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Ending')
			}
		];

		const a = distributeToBaskets(eligible, makeBaskets(), 4, unusedRng, true, 0, 8, null);
		const b = distributeToBaskets(eligible, makeBaskets(), 4, unusedRng, true, 0, 8, null);
		const c = distributeToBaskets(
			[...eligible].reverse(),
			makeBaskets(),
			4,
			unusedRng,
			true,
			0,
			8,
			null
		);

		expect(a.map((s) => s.annSongId)).toEqual([10, 20, 30, 40]);
		expect(b.map((s) => s.annSongId)).toEqual(a.map((s) => s.annSongId));
		expect(c.map((s) => s.annSongId)).toEqual(a.map((s) => s.annSongId));
		expect(a).toHaveLength(4);
	});

	it('fills to the largest count the baskets allow (maxTotal)', () => {
		const eligible = Array.from({ length: 20 }, (_, i) => song(i + 1, i % 2 === 0 ? 'Opening' : 'Ending'));
		const baskets = [
			{
				id: 'type-opening',
				min: 3,
				max: 5,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Opening')
			},
			{
				id: 'type-ending',
				min: 3,
				max: 5,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Ending')
			}
		];

		const selected = distributeToBaskets(eligible, baskets, 10, unusedRng, true, 0, 8, null);
		expect(selected).toHaveLength(10);
		expect(selected.map((s) => s.annSongId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('fills exhaustively when maxTotal exceeds eligible songs', () => {
		const eligible = [
			song(3, 'Opening'),
			song(1, 'Opening'),
			song(2, 'Ending'),
			song(4, 'Ending')
		];
		const baskets = [
			{
				id: 'type-opening',
				min: 0,
				max: 100,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Opening')
			},
			{
				id: 'type-ending',
				min: 0,
				max: 100,
				current: 0,
				matcher: (s) => String(s.songType).startsWith('Ending')
			}
		];

		const selected = distributeToBaskets(eligible, baskets, 100, unusedRng, true, 0, 8, null);
		expect(selected).toHaveLength(4);
		expect(selected.map((s) => s.annSongId)).toEqual([1, 2, 3, 4]);
	});
});
