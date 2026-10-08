/**
 * W11 / W15  Eone pool resolver, pointed two ways.
 *
 * W11 materialises a resolved pool into a saved song list; W15 consumes one as
 * a source for another quiz. The spec is explicit that there must be exactly
 * one resolver, and that it returns the ELIGIBLE POOL rather than the drawn
 * selection  Ethree people wrote scrapers because they wanted every match, not
 * a sample of 20.
 *
 * Run: npx vitest run tests/poolResolver.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const savedLists = new Map();
const quizzes = new Map();

vi.mock('$lib/server/song-list-loader.js', () => ({
	loadSavedSongList: async (id) => {
		if (savedLists.get(id) instanceof Error) throw savedLists.get(id);
		return { songs: savedLists.get(id) || [], name: String(id) };
	}
}));

vi.mock('$lib/server/masterlist.js', () => ({
	getMasterlist: async () => [],
	getMasterlistIndex: async () => new Map()
}));

vi.mock('$lib/server/supabase-admin.js', () => ({
	createSupabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				eq: (_col, value) => ({
					maybeSingle: async () => ({
						data: quizzes.get(value) || null,
						error: null
					}),
					single: async () => ({ data: quizzes.get(value) || null })
				})
			})
		})
	})
}));

const { resolveEligiblePool } = await import('../src/lib/server/songFiltering.js');

function song(annSongId, songType, genres = ['Action']) {
	return {
		annSongId,
		songName: `Song ${annSongId}`,
		songType,
		HQ: 'x.webm',
		sourceAnime: { genres, tags: [] }
	};
}

/** A config whose only source is a saved list. */
function configFor(listId, filters = []) {
	return {
		numberOfSongs: 5,
		filters,
		songLists: [{ mode: 'saved-lists', selectedListId: listId, nodeId: `node-${listId}` }],
		negativeSongLists: []
	};
}

describe('W11 eligible pool', () => {
	beforeEach(() => {
		savedLists.clear();
		quizzes.clear();
	});

	it('returns every match, not a numberOfSongs-sized draw', async () => {
		savedLists.set('list-a', [
			song(1, 'Opening 1'),
			song(2, 'Opening 2'),
			song(3, 'Ending 1'),
			song(4, 'Ending 2'),
			song(5, 'Opening 3'),
			song(6, 'Opening 4'),
			song(7, 'Opening 5')
		]);

		const { songs } = await resolveEligiblePool(configFor('list-a'), fetch);

		// numberOfSongs is 5; the pool is 7. A draw would have capped it.
		expect(songs).toHaveLength(7);
	});

	it('applies the filters rather than returning the raw source', async () => {
		savedLists.set('list-b', [
			song(1, 'Opening 1', ['Action']),
			song(2, 'Opening 2', ['Comedy']),
			song(3, 'Opening 3', ['Action'])
		]);

		const { songs, sourceSongCount } = await resolveEligiblePool(
			configFor('list-b', [
				{ definitionId: 'genres', settings: { included: ['Action'], excluded: [], optional: [] } }
			]),
			fetch
		);

		expect(sourceSongCount).toBe(3);
		expect(songs.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([1, 3]);
	});

	it('honours negative sources', async () => {
		savedLists.set('list-c', [song(1, 'Opening 1'), song(2, 'Opening 2')]);
		savedLists.set('list-block', [song(2, 'Opening 2')]);

		const config = configFor('list-c');
		config.negativeSongLists = [
			{ mode: 'saved-lists', selectedListId: 'list-block', nodeId: 'neg-1' }
		];

		const { songs } = await resolveEligiblePool(config, fetch);
		expect(songs.map((s) => s.annSongId)).toEqual([1]);
	});
});

describe('W15 quiz as a source', () => {
	beforeEach(() => {
		savedLists.clear();
		quizzes.clear();
	});

	it('resolves the referenced quiz live', async () => {
		savedLists.set('inner-list', [song(11, 'Opening 1'), song(12, 'Ending 1')]);
		quizzes.set('quiz-inner', {
			id: 'quiz-inner',
			name: 'Inner',
			configuration_data: {
				routes: [
					{
						id: 'r1',
						name: 'route',
						numberOfSongs: 5,
						sources: [
							{ sourceType: 'song-list', mode: 'saved-lists', selectedListId: 'inner-list' }
						],
						filters: []
					}
				]
			}
		});

		const outer = {
			numberOfSongs: 5,
			filters: [],
			songLists: [
				{ mode: 'quiz', selectedQuizId: 'quiz-inner', selectedQuizName: 'Inner', nodeId: 'q1' }
			],
			negativeSongLists: []
		};

		const { songs } = await resolveEligiblePool(outer, fetch);
		expect(songs.map((s) => s.annSongId).sort((a, b) => a - b)).toEqual([11, 12]);
	});

	it('fails by name when the referenced quiz is gone', async () => {
		const outer = {
			numberOfSongs: 5,
			filters: [],
			songLists: [
				{ mode: 'quiz', selectedQuizId: 'missing', selectedQuizName: 'Deleted Quiz', nodeId: 'q1' }
			],
			negativeSongLists: []
		};

		// Failing the generation beats silently resolving to zero songs.
		await expect(resolveEligiblePool(outer, fetch)).rejects.toThrow(/no longer exists/i);
	});

	it('rejects a partial nested pool when one child list cannot load', async () => {
		savedLists.set('healthy', [song(11, 'Opening 1')]);
		savedLists.set('broken', new Error('Upstream unavailable'));
		quizzes.set('partial', { id: 'partial', name: 'Partial child', configuration_data: { routes: [{
			id: 'r1', numberOfSongs: 5, filters: [], sources: ['healthy', 'broken'].map(selectedListId => ({
				sourceType: 'song-list', mode: 'saved-lists', selectedListId
			}))
		}] } });
		await expect(resolveEligiblePool({ numberOfSongs: 5, filters: [], negativeSongLists: [],
			songLists: [{ mode: 'quiz', selectedQuizId: 'partial', nodeId: 'q1' }]
		}, fetch)).rejects.toThrow(/complete quiz source "Partial child".*Upstream unavailable/);
	});

	it('refuses a quiz that sources itself instead of hanging the job', async () => {
		quizzes.set('quiz-loop', {
			id: 'quiz-loop',
			name: 'Loop',
			configuration_data: {
				routes: [
					{
						id: 'r1',
						name: 'route',
						numberOfSongs: 5,
						sources: [
							{ sourceType: 'song-list', mode: 'quiz', selectedQuizId: 'quiz-loop' }
						],
						filters: []
					}
				]
			}
		});

		const outer = {
			numberOfSongs: 5,
			filters: [],
			songLists: [
				{ mode: 'quiz', selectedQuizId: 'quiz-loop', selectedQuizName: 'Loop', nodeId: 'q1' }
			],
			negativeSongLists: []
		};

		// Generation runs as a background job now, so an unbounded cycle is a job
		// that never completes - worse than a timeout, not better.
		await expect(resolveEligiblePool(outer, fetch)).rejects.toThrow(/loop|nested/i);
	});

	it('requires a quiz to point at', async () => {
		const outer = {
			numberOfSongs: 5,
			filters: [],
			songLists: [{ mode: 'quiz', nodeId: 'q1' }],
			negativeSongLists: []
		};

		await expect(resolveEligiblePool(outer, fetch)).rejects.toThrow(/needs a quiz/i);
	});
});
