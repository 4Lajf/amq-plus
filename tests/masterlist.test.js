import { describe, it, expect, beforeAll } from 'vitest';
import {
	getMasterlist,
	getMasterlistIndex,
	getSongByAnnSongId,
	resetMasterlistCache
} from '../src/lib/server/masterlist.js';

/**
 * The masterlist is large (~38k entries / ~150 MB locally), so these tests:
 * - bump the per-test timeout past a cold JSON parse
 * - load once in beforeAll and assert identity with `===` inside expect()
 *   (a failing toBe() on two 38k-element arrays makes vitest build a diff)
 */
describe('masterlist accessor', () => {
	/** @type {Array<Object>} */
	let songs;
	/** @type {Map<string, Object>} */
	let index;

	beforeAll(async () => {
		resetMasterlistCache();
		songs = await getMasterlist();
		index = await getMasterlistIndex();
	}, 180_000);

	it(
		'loads an array',
		() => {
			expect(Array.isArray(songs)).toBe(true);
			expect(songs.length).toBeGreaterThan(0);
		},
		180_000
	);

	it(
		'returns the same instance on repeat calls rather than re-parsing',
		async () => {
			const again = await getMasterlist();
			expect(again === songs).toBe(true);
		},
		30_000
	);

	it(
		'shares one load between concurrent callers',
		async () => {
			const [a, b, c] = await Promise.all([getMasterlist(), getMasterlist(), getMasterlist()]);
			expect(a === songs && b === songs && c === songs).toBe(true);
		},
		30_000
	);

	it(
		'indexes by annSongId as a string',
		() => {
			const sample = songs.find((s) => s.annSongId !== null && s.annSongId !== undefined);

			expect(sample).toBeDefined();
			expect(index.get(String(sample.annSongId))).toBeDefined();
			expect(index.size).toBeGreaterThan(0);
			expect(index.size).toBeLessThanOrEqual(songs.length);
		},
		30_000
	);

	it(
		'caches the index across calls',
		async () => {
			const again = await getMasterlistIndex();
			expect(again === index).toBe(true);
		},
		30_000
	);

	it(
		'shares one index build between concurrent callers',
		async () => {
			resetMasterlistCache();
			const [a, b, c] = await Promise.all([
				getMasterlistIndex(),
				getMasterlistIndex(),
				getMasterlistIndex()
			]);
			expect(a === b && b === c).toBe(true);
			expect(a.size).toBe(index.size);
			// Leave the module warm for the remaining lookups.
			songs = await getMasterlist();
			index = a;
		},
		180_000
	);

	it(
		'looks a song up by either a numeric or string id',
		async () => {
			const sample = songs.find((s) => Number.isFinite(Number(s.annSongId)));

			const viaNumber = await getSongByAnnSongId(Number(sample.annSongId));
			const viaString = await getSongByAnnSongId(String(sample.annSongId));

			expect(viaNumber).toBeDefined();
			expect(viaNumber === viaString).toBe(true);
		},
		30_000
	);

	it(
		'returns undefined for an unknown or absent id',
		async () => {
			expect(await getSongByAnnSongId(999999999)).toBeUndefined();
			expect(await getSongByAnnSongId(null)).toBeUndefined();
			expect(await getSongByAnnSongId(undefined)).toBeUndefined();
		},
		30_000
	);

	it(
		'skips entries without an annSongId',
		() => {
			expect(index.has('null')).toBe(false);
			expect(index.has('undefined')).toBe(false);
		},
		30_000
	);

	it(
		'builds a fresh index after a cache reset',
		async () => {
			const before = await getMasterlistIndex();
			resetMasterlistCache();
			const after = await getMasterlistIndex();

			// The underlying import stays memoised by the module registry, so the
			// array is the same object - but the derived index is rebuilt.
			expect(after === before).toBe(false);
			expect(after.size).toBe(before.size);
		},
		180_000
	);
});
