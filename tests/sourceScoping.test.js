/**
 * W4 — filters scoped with the "+" source selector.
 *
 * The editor persists `source-main-${idx}`; the loader stamps `settings.nodeId`
 * or a positional `source-${i}`. Those vocabularies never intersected, so
 * `targetSourceIds.includes(_sourceId)` matched nothing, the scoped set came out
 * empty and the filter ran over zero songs — attaching a source selector
 * silently *disabled* the filter instead of narrowing it.
 *
 * Run: npx vitest run tests/sourceScoping.test.js
 */
import { describe, it, expect } from 'vitest';
import {
	__test_applyGlobalFilters as applyGlobalFilters,
	__test_buildSourceIdAliases as buildSourceIdAliases
} from '../src/lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '../src/lib/utils/simulation.js';

function song(annSongId, sourceId, genres) {
	return {
		annSongId,
		_sourceId: sourceId,
		HQ: 'x.webm',
		sourceAnime: { genres, tags: [] }
	};
}

const genresFilter = (targetSourceId) => [
	{
		definitionId: 'genres',
		targetSourceId,
		settings: { included: ['Action'], excluded: [], optional: [] }
	}
];

describe('W4 source-scoped filters', () => {
	it.each(['song-list', 'batch-user-list', 'live-node'])('preserves editor IDs through %s simulation', sourceType => {
		const config = simulateQuizFromRoutes([{
			id: 'route', enabled: true, percentage: 100, filters: [], basicSettings: {},
			numberOfSongs: { staticValue: 2, useRange: false },
			sources: [{ id: 'stable-a', sourceType, mode: 'masterlist' }]
		}]);
		expect(config.songLists[0].sourceId).toBe('stable-a');
		const canonical = sourceType === 'song-list' ? 'source-0' : 'source-0-user-1';
		const resolved = buildSourceIdAliases(config.songLists, [{ nodeId: canonical }]);
		expect(resolved.get('stable-a')).toEqual([canonical]);
		const result = applyGlobalFilters([
			song(1, canonical, ['Action']), song(2, canonical, ['Comedy'])
		], genresFilter('stable-a'), false, resolved);
		expect(result.scopingErrors).toEqual([]);
		expect(result.songs.map(x => x.annSongId)).toEqual([1]);
	});

	it('keeps configured empty sources distinct from deleted sources', () => {
		const resolved = buildSourceIdAliases([{ nodeId: 'source-0', sourceId: 'stable-a' }], []);
		expect(resolved.get('stable-a')).toEqual(['source-0']);
		expect(resolved.has('deleted-source')).toBe(false);
	});
	const songs = [
		song(1, 'nodeA', ['Action']),
		song(2, 'nodeA', ['Comedy']),
		song(3, 'nodeB', ['Action']),
		song(4, 'nodeB', ['Comedy'])
	];

	// What buildSourceIdAliases produces for two nodeId-carrying sources.
	const aliases = new Map([
		['nodeA', ['nodeA']],
		['nodeB', ['nodeB']],
		['source-0', ['nodeA']],
		['source-main-0', ['nodeA']],
		['source-main', ['nodeA']],
		['source-1', ['nodeB']],
		['source-main-1', ['nodeB']]
	]);

	it("resolves the editor's source-main-N id onto the loader's nodeId", () => {
		const { songs: filtered, scopingErrors } = applyGlobalFilters(
			songs,
			genresFilter('source-main-0'),
			false,
			aliases
		);

		expect(scopingErrors).toEqual([]);
		// nodeA is filtered to Action only; nodeB is untouched.
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 3, 4]);
	});

	it('still accepts a canonical nodeId directly', () => {
		const { songs: filtered, scopingErrors } = applyGlobalFilters(
			songs,
			genresFilter('nodeB'),
			false,
			aliases
		);

		expect(scopingErrors).toEqual([]);
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
	});

	it('reports an id that belongs to no source instead of voiding the filter silently', () => {
		// This is the shape of the one production quiz that uses the feature:
		// sourceSelector targets "song-list-1", from an editor vocabulary that no
		// longer exists.
		const { songs: filtered, scopingErrors } = applyGlobalFilters(
			songs,
			genresFilter('song-list-1'),
			false,
			aliases
		);

		expect(scopingErrors).toHaveLength(1);
		expect(scopingErrors[0].unresolved).toEqual(['song-list-1']);
		expect(scopingErrors[0].definitionId).toBe('genres');
		expect(scopingErrors[0].message).toMatch(/no longer exist/i);

		// Behaviour is unchanged — the filter still applies to nothing. Failing
		// open would silently over-apply a filter the user scoped deliberately.
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
	});

	it('leaves unscoped filters completely alone', () => {
		const { songs: filtered, scopingErrors } = applyGlobalFilters(
			songs,
			genresFilter(undefined),
			false,
			aliases
		);

		expect(scopingErrors).toEqual([]);
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 3]);
	});

	it('falls back to literal matching when no alias table is supplied', () => {
		// Negative-source loads and unit callers pass no table; behaviour must not
		// change for them.
		const { songs: filtered, scopingErrors } = applyGlobalFilters(
			songs,
			genresFilter('nodeA'),
			false
		);

		expect(scopingErrors).toEqual([]);
		expect(filtered.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 3, 4]);
	});
});
