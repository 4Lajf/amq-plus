import { describe, it, expect } from 'vitest';
import { __test_applyGlobalFilters as applyGlobalFilters } from '../src/lib/server/songFiltering.js';

function song({ annSongId, sourceId, bypass = false, genres = null, tags = null, hasAnime = true }) {
	const row = {
		annSongId,
		_sourceId: sourceId,
		_bypassFilters: bypass,
		HQ: 'x.webm'
	};
	if (hasAnime) {
		row.sourceAnime = {
			genres: genres || [],
			tags: (tags || []).map((name) => ({ name, rank: 80 }))
		};
	}
	return row;
}

describe('N7 useEntirePool is per-source', () => {
	it('keeps bypass-source songs while filtering the other source', () => {
		const songs = [
			song({ annSongId: 1, sourceId: 'bypass-src', bypass: true, hasAnime: false }),
			song({ annSongId: 2, sourceId: 'bypass-src', bypass: true, genres: ['Action'] }),
			song({ annSongId: 3, sourceId: 'normal-src', genres: ['Action'] }),
			song({ annSongId: 4, sourceId: 'normal-src', genres: ['Comedy'] }),
			song({ annSongId: 5, sourceId: 'normal-src', hasAnime: false })
		];

		const { songs: filtered, filterStatistics } = applyGlobalFilters(
			songs,
			[
				{
					definitionId: 'genres',
					settings: { included: ['Action'], excluded: [], optional: [] }
				}
			],
			false
		);

		const ids = filtered.map((s) => s.annSongId).sort((a, b) => a - b);
		// Bypass source keeps everything (1, 2). Normal source keeps Action (3)
		// and the no-metadata import (5) — missing metadata is kept, not dropped.
		// Comedy (4) is excluded by the rule.
		expect(ids).toEqual([1, 2, 3, 5]);

		const genreStat = filterStatistics.find((s) => s.name === 'Genres');
		expect(genreStat).toBeTruthy();
		// Stats are counted only over the songs that went through the filter
		// (non-bypass). before=3 (3,4,5), after=2 (3,5), one missing-metadata kept.
		expect(genreStat.before).toBe(3);
		expect(genreStat.after).toBe(2);
		expect(genreStat.details.missingMetadataKept).toBe(1);
	});

	it('still filters every source when no list bypasses', () => {
		const songs = [
			song({ annSongId: 1, sourceId: 'a', genres: ['Action'] }),
			song({ annSongId: 2, sourceId: 'b', genres: ['Comedy'] })
		];

		const { songs: filtered } = applyGlobalFilters(
			songs,
			[
				{
					definitionId: 'genres',
					settings: { included: ['Action'], excluded: [], optional: [] }
				}
			],
			false
		);

		expect(filtered.map((s) => s.annSongId)).toEqual([1]);
	});
});

describe('N7 missing genre/tag metadata', () => {
	it('keeps songs with no sourceAnime and reports them in filter stats', () => {
		const songs = [
			song({ annSongId: 1, sourceId: 'a', genres: ['Action'] }),
			song({ annSongId: 2, sourceId: 'a', hasAnime: false }),
			song({ annSongId: 3, sourceId: 'a', genres: [] }) // has anime, empty genres → fails include
		];

		const { songs: filtered, filterStatistics } = applyGlobalFilters(
			songs,
			[
				{
					definitionId: 'genres',
					settings: { included: ['Action'], excluded: [], optional: [] }
				}
			],
			false
		);

		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 2]);
		expect(filterStatistics[0].details.missingMetadataKept).toBe(1);
	});

	it('keeps no-metadata songs through tag include filters too', () => {
		const songs = [
			song({ annSongId: 1, sourceId: 'a', tags: ['School'] }),
			song({ annSongId: 2, sourceId: 'a', hasAnime: false })
		];

		const { songs: filtered, filterStatistics } = applyGlobalFilters(
			songs,
			[
				{
					definitionId: 'tags',
					settings: { included: ['School'], excluded: [], optional: [] }
				}
			],
			false
		);

		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 2]);
		expect(filterStatistics[0].details.missingMetadataKept).toBe(1);
	});
});
