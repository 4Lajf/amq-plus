/**
 * W3 / decision B1 — songs with no category metadata.
 *
 * A Trust-JSON import that never went through AnisongDB enrichment carries no
 * `songCategory` (providerUtils defaults it to ''). That used to be looked up
 * as `enabled[group]['']`, which is undefined, so the song was dropped — and
 * ticking "None" could not rescue it, because that column is keyed
 * `noCategory`. B1 normalizes absent/blank/"no category" to `noCategory` so the
 * checkbox that already exists governs them.
 *
 * Run: npx vitest run tests/songCategoriesMissingMetadata.test.js
 */
import { describe, it, expect } from 'vitest';
import {
	__test_applyGlobalFilters as applyGlobalFilters,
	__test_buildBaskets as buildBaskets
} from '../src/lib/server/songFiltering.js';

function song(annSongId, songType, songCategory) {
	const row = { annSongId, songName: `Song ${annSongId}`, songType, HQ: 'x.webm' };
	if (songCategory !== undefined) row.songCategory = songCategory;
	return row;
}

/** Every category enabled except None. */
function enabledWithout(noCategory) {
	const cols = {
		standard: true,
		instrumental: true,
		chanting: true,
		character: true,
		noCategory
	};
	return { openings: { ...cols }, endings: { ...cols }, inserts: { ...cols } };
}

const basicFilter = (enabled) => [
	{ definitionId: 'song-categories', settings: { mode: 'basic', enabled } }
];

describe('W3 basic mode — absent song category', () => {
	it('routes absent, empty and null categories to the None column', () => {
		const songs = [
			song(1, 'Opening 1', 'Standard'),
			song(2, 'Opening 1', ''),
			song(3, 'Opening 1', null),
			song(4, 'Opening 1') // key not present at all
		];

		const kept = applyGlobalFilters(songs, basicFilter(enabledWithout(true)), false);
		expect(kept.songs.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

		const dropped = applyGlobalFilters(songs, basicFilter(enabledWithout(false)), false);
		expect(
			dropped.songs.map((s) => s.annSongId),
			'unticking None must exclude exactly the metadata-less songs'
		).toEqual([1]);
	});

	it('treats the literal "No Category" string the same as an absent one', () => {
		const songs = [song(1, 'Ending 1', 'No Category'), song(2, 'Ending 1', 'no category')];

		const kept = applyGlobalFilters(songs, basicFilter(enabledWithout(true)), false);
		expect(kept.songs).toHaveLength(2);

		const dropped = applyGlobalFilters(songs, basicFilter(enabledWithout(false)), false);
		expect(dropped.songs).toHaveLength(0);
	});

	it('leaves songs that do carry metadata alone', () => {
		const songs = [
			song(1, 'Opening 1', 'Standard'),
			song(2, 'Opening 1', 'Instrumental'),
			song(3, 'Ending 1', 'Chanting'),
			song(4, 'Insert Song', 'Character')
		];

		const enabled = enabledWithout(true);
		enabled.openings.instrumental = false;

		const { songs: filtered } = applyGlobalFilters(songs, basicFilter(enabled), false);
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 3, 4]);
	});

	it("reproduces 3shine's setup: instrumental-only over a metadata-less list", () => {
		// Simple tab, Instrumental ticked, None ticked. Before B1 this returned
		// zero songs no matter what was checked.
		const songs = [song(1, 'Opening 1'), song(2, 'Opening 1'), song(3, 'Opening 1')];

		const enabled = {
			openings: {
				standard: false,
				instrumental: true,
				chanting: false,
				character: false,
				noCategory: true
			},
			endings: {},
			inserts: {}
		};

		const { songs: filtered } = applyGlobalFilters(songs, basicFilter(enabled), false);
		expect(filtered.length, 'metadata-less pool came back empty').toBeGreaterThan(0);
	});
});

describe('W3 advanced mode — absent song category', () => {
	// The builder used to gate on `mode === 'advanced'`, which the resolver never
	// emits — so these baskets were dormant. It now gates on the payload, so
	// `mode: 'count'` (what a saved quiz actually carries) builds baskets.
	const advancedConfig = (mode = 'count', quota = 4) => ({
		numberOfSongs: 10,
		filters: [
			{
				definitionId: 'song-categories',
				settings: {
					mode,
					total: 10,
					categories: {
						openings: { noCategory: quota, standard: quota }
					}
				}
			}
		]
	});

	it('builds baskets for the mode a saved quiz actually carries', () => {
		// Regression guard for the dead gate: 'count' and 'percentage' are what
		// resolveSongCategories emits, and both must produce baskets. In
		// percentage mode the quota is a percentage of `total`, so 40% of 10 is
		// the equivalent of a count of 4.
		expect(buildBaskets(advancedConfig('count', 4), () => 0.5, null, 0).length).toBeGreaterThan(0);
		expect(
			buildBaskets(advancedConfig('percentage', 40), () => 0.5, null, 0).length
		).toBeGreaterThan(0);
		// Basic mode is handled by the global filter and must still build nothing.
		expect(buildBaskets(advancedConfig('basic', 4), () => 0.5, null, 0)).toHaveLength(0);
	});

	it('matches metadata-less songs into the None basket', () => {
		const baskets = buildBaskets(advancedConfig(), () => 0.5, null, 0);
		const noCategoryBasket = baskets.find((b) => b.id.includes('noCategory'));
		expect(noCategoryBasket, 'expected a noCategory basket').toBeTruthy();

		expect(noCategoryBasket.matcher(song(1, 'Opening 1'))).toBe(true);
		expect(noCategoryBasket.matcher(song(2, 'Opening 1', ''))).toBe(true);
		expect(noCategoryBasket.matcher(song(3, 'Opening 1', null))).toBe(true);
		expect(noCategoryBasket.matcher(song(4, 'Opening 1', 'No Category'))).toBe(true);
		expect(noCategoryBasket.matcher(song(5, 'Opening 1', 'Standard'))).toBe(false);
	});

	it('keeps the standard basket matching only real standard songs', () => {
		const baskets = buildBaskets(advancedConfig(), () => 0.5, null, 0);
		const standardBasket = baskets.find((b) => b.id.includes('standard'));
		expect(standardBasket).toBeTruthy();

		expect(standardBasket.matcher(song(1, 'Opening 1', 'Standard'))).toBe(true);
		expect(standardBasket.matcher(song(2, 'Opening 1'))).toBe(false);
		expect(standardBasket.matcher(song(3, 'Opening 1', ''))).toBe(false);
	});
});
