/**
 * Q2 — Anime Type and songs with no `animeType`.
 *
 * Same defect class as W3/B1, one filter over: `providerUtils` defaults
 * `animeType` to `''` and never validates it, so an import that skipped
 * AnisongDB enrichment produced songs that matched no checkbox and were dropped
 * with no way to get them back. Unlike Song Categories there was no column to
 * normalize into, which is why this was left as a product decision rather than
 * fixed alongside B1.
 *
 * Measured before building, because the decision was "only implement this where
 * songs actually satisfy the condition":
 *
 *   masterlist (~38k rows) -> 32 with no animeType, 4 with no songCategory,
 *   0 with no songType.
 *
 * Hence Anime Type gets the bucket and Songs & Types deliberately does not -
 * `songType` is a required import field, rejected at validation if absent
 * (providerUtils.js:493, :651), so that bucket would be provably empty.
 *
 * Run: npx vitest run tests/animeTypeUnspecified.test.js
 */
import { describe, it, expect } from 'vitest';
import { animeTypeFilter } from '../src/lib/filters/definitions/animeType.js';
import { __test_applyGlobalFilters, __test_buildBaskets } from '../src/lib/server/songFiltering.js';

const song = (annSongId, animeType) => ({
	annSongId,
	animeType,
	songName: `Song ${annSongId}`,
	songArtist: 'Artist',
	songType: 'Opening 1'
});

const resolve = (value) => animeTypeFilter.resolve({ data: { currentValue: value } }, {}, () => 0.5);

/** The filter-list shape applyGlobalFilters/buildBaskets actually take. */
const basicFilter = (enabled) => [{ definitionId: 'anime-type', settings: { mode: 'basic', enabled } }];

describe('Q2 — Anime Type "Unspecified"', () => {
	it('summarizes active advanced allocations instead of stale simple choices', () => {
		const value = { viewMode: 'advanced', mode: 'count', tv: true, movie: false,
			advanced: { tv: { enabled: true, countValue: 16 }, movie: { enabled: true, countValue: 4 } } };
		expect(animeTypeFilter.display(value)).toBe('TV 16, MOVIE 4');
		expect(animeTypeFilter.display({ ...value, mode: 'percentage', advanced: {
			unspecified: { enabled: true, random: true, percentageMin: 0, percentageMax: 100 },
			tv: { enabled: false, percentageValue: 50 }
		} })).toBe('UNSPECIFIED 0-100%');
		expect(animeTypeFilter.display({ ...value, advanced: {} })).toBe('No anime types selected');
	});

	it('leaves the bucket out unless it is explicitly ticked', () => {
		// ~700 saved sources predate this key. Strict `=== true` is what keeps
		// them from silently widening the day this ships.
		const resolved = resolve({ tv: true, movie: true });
		expect(resolved.enabled).toContain('tv');
		expect(resolved.enabled).not.toContain('unspecified');

		const optedIn = resolve({ tv: true, unspecified: true });
		expect(optedIn.enabled).toContain('unspecified');
	});

	it('drops songs with no animeType when Unspecified is off', () => {
		// The pre-existing behaviour, kept deliberately: the fix is about making
		// those songs reachable, not about including them by default.
		const songs = [song(1, 'TV'), song(2, ''), song(3, null), song(4, undefined)];
		const { songs: filtered } = __test_applyGlobalFilters(songs, basicFilter(['tv']), false);

		expect(filtered.map((s) => s.annSongId)).toEqual([1]);
	});

	it('keeps them when Unspecified is on — absent, blank and null all count', () => {
		const songs = [song(1, 'TV'), song(2, ''), song(3, null), song(4, undefined)];
		const { songs: filtered } = __test_applyGlobalFilters(songs, basicFilter(['unspecified']), false);

		expect(filtered.map((s) => s.annSongId)).toEqual([2, 3, 4]);
	});

	it('does not treat a real type as unspecified', () => {
		const songs = [song(1, 'TV'), song(2, 'Movie'), song(3, '')];
		const { songs: filtered } = __test_applyGlobalFilters(
			songs,
			basicFilter(['movie', 'unspecified']),
			false
		);

		expect(filtered.map((s) => s.annSongId)).toEqual([2, 3]);
	});

	it('the advanced quota path agrees with the global filter', () => {
		// The two paths normalize through the same helper on purpose - if they
		// drift, an advanced quota silently means something different from the
		// checkbox with the same label.
		const baskets = __test_buildBaskets(
			{
				numberOfSongs: 2,
				filters: [
					{
						definitionId: 'anime-type',
						settings: { mode: 'count', types: { unspecified: 2 }, total: 2 }
					}
				]
			},
			() => 0.5,
			null,
			0
		);

		const bucket = baskets.find((b) => b.id.startsWith('animeType-unspecified'));
		expect(bucket, 'an Unspecified quota builds a basket').toBeTruthy();
		expect(bucket.matcher(song(1, ''))).toBe(true);
		expect(bucket.matcher(song(2, null))).toBe(true);
		expect(bucket.matcher(song(3, 'TV'))).toBe(false);
	});
});
