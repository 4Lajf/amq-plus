/**
 * W5 / decision Q4 — a rewatching entry counts as "watching".
 *
 * AniList's MediaListStatus enum includes REPEATING, which mapped to nothing,
 * so a rewatched anime matched no checkbox and was silently dropped whenever a
 * status filter was active — which is always, since the default is
 * {completed: true, watching: true, ...}. The MAL path deliberately *emits*
 * REPEATING (myanimelist.js:194), so the two providers disagreed about a status
 * one of them produces.
 *
 * Run: npx vitest run tests/repeatingStatus.test.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAniListData } from '../src/lib/utils/anilist.js';

function entry(id, status, title) {
	return {
		id,
		status,
		score: 8,
		progress: 3,
		repeat: status === 'REPEATING' ? 1 : 0,
		startedAt: null,
		completedAt: null,
		media: {
			id,
			idMal: id,
			format: 'TV',
			status: 'FINISHED',
			startDate: { year: 2015 },
			episodes: 12,
			duration: 24,
			title: { romaji: title, english: title },
			genres: [],
			tags: []
		}
	};
}

const collection = {
	lists: [
		{
			entries: [
				entry(1, 'CURRENT', 'Currently Watching'),
				entry(2, 'REPEATING', 'Rewatching'),
				entry(3, 'COMPLETED', 'Finished'),
				entry(4, 'DROPPED', 'Abandoned')
			]
		}
	]
};

function mockAniList() {
	globalThis.fetch = vi.fn(async () =>
		new Response(JSON.stringify({ data: { MediaListCollection: collection } }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

describe('W5 AniList REPEATING', () => {
	const realFetch = globalThis.fetch;

	beforeEach(() => mockAniList());
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it('includes a rewatching entry when "watching" is selected', async () => {
		const list = await fetchAniListData('someone', {
			selectedLists: { watching: true }
		});

		const ids = list.map((a) => a.malId).sort((a, b) => a - b);
		expect(ids, 'the REPEATING entry (2) was dropped').toEqual([1, 2]);
	});

	it('still excludes a rewatching entry when "watching" is not selected', async () => {
		const list = await fetchAniListData('someone', {
			selectedLists: { completed: true }
		});

		expect(list.map((a) => a.malId)).toEqual([3]);
	});

	it('leaves the other statuses mapping exactly as before', async () => {
		const list = await fetchAniListData('someone', {
			selectedLists: { completed: true, dropped: true }
		});

		expect(list.map((a) => a.malId).sort((a, b) => a - b)).toEqual([3, 4]);
	});

	it('preserves the entry status on the returned record', async () => {
		const list = await fetchAniListData('someone', {
			selectedLists: { watching: true }
		});

		const rewatching = list.find((a) => a.malId === 2);
		expect(rewatching.status).toBe('REPEATING');
	});
});

describe('W5 MAL parity', () => {
	it('MAL stamps rewatching entries REPEATING, which AniList now accepts', async () => {
		// Pinning the shape rather than the network: myanimelist.js sets
		// status = 'REPEATING' when listStatus.is_rewatching is true, and MAL
		// returns those rows under its own 'watching' status. Both providers
		// therefore hand a REPEATING record to the same downstream consumers.
		const { default: fs } = await import('fs');
		const source = fs.readFileSync('src/lib/utils/myanimelist.js', 'utf8');
		expect(source).toContain("isRewatching ? 'REPEATING'");
	});
});
