/**
 * W1 — deterministic swap repair for interlocking basket minimums.
 *
 * The N11 determinism rewrite removed the seeded-shuffle retry loop that had
 * been acting as the constraint solver, so a greedy walk now hits the same
 * deadlock every time. These pin the replacement: repair must satisfy the
 * minimums, must not break a basket to fix another one, must stay deterministic,
 * and must report a deficit it genuinely cannot close instead of quietly
 * returning a short pool.
 *
 * Run: npx vitest run tests/basketRepair.test.js
 */
import { describe, it, expect } from 'vitest';
import {
	__test_distributeToBaskets as distributeToBaskets,
	__test_performAggressiveSwap as performAggressiveSwap
} from '../src/lib/server/songFiltering.js';

/** distributeToBaskets ignores rng for membership; stub keeps the call signature. */
const unusedRng = () => 0.5;

// No malId: anime identity falls back to animeENName, so tests can put two
// songs under one anime the way the duplicate-show rule sees it.
function song(annSongId, songType, songDifficulty, animeENName) {
	return {
		annSongId,
		songName: `Song ${annSongId}`,
		songType,
		songDifficulty,
		animeENName: animeENName || `Anime ${annSongId}`
	};
}

function basket(id, min, max, matcher) {
	return { id, type: 'range', min, max, current: 0, matcher };
}

const isOpening = (s) => String(s.songType || '').startsWith('Opening');
const isEnding = (s) => String(s.songType || '').startsWith('Ending');
const isHard = (s) => s.songDifficulty >= 0 && s.songDifficulty < 25;
const isEasy = (s) => s.songDifficulty >= 60 && s.songDifficulty <= 100;

describe('W1 basket min-quota repair', () => {
	it('treats numeric and string anime IDs as the same show during selection', () => {
		const eligible = [
			{ ...song(1, 'Ending 1', 70), malId: 42 },
			{ ...song(2, 'Ending 2', 80), linked_ids: { myanimelist: '42' } },
			{ ...song(3, 'Ending 1', 90), malId: 43 }
		];
		const baskets = [basket('songType-endings-all', 2, 2, isEnding)];
		const selected = distributeToBaskets(eligible, baskets, 2, unusedRng, false);
		expect(selected.map(s => s.annSongId)).toEqual([1, 3]);
		expect(baskets[0].current).toBe(2);
	});

	it('does not break another basket to satisfy the one it is repairing', () => {
		// The candidate that most obviously fills the openings deficit (id 4) can
		// only enter by evicting a song the 0-25 basket needs. A repair that
		// checks only the basket it is fixing takes that swap and leaves 0-25 at
		// 1/2; the correct one reaches past it to id 5, which is both an opening
		// and 0-25, so the eviction nets out.
		const eligible = [
			song(1, 'Ending 1', 10),
			song(2, 'Ending 2', 20),
			song(3, 'Opening 1', 70),
			song(4, 'Opening 2', 80),
			song(5, 'Opening 3', 15)
		];

		const baskets = [
			basket('songType-openings-all', 2, 3, isOpening),
			basket('songType-endings-all', 1, 3, isEnding),
			basket('difficulty-0-25-all', 2, 3, isHard),
			basket('difficulty-60-100-all', 0, 3, isEasy)
		];

		const selected = distributeToBaskets(eligible, baskets, 3, unusedRng, true, 0, 8, null);

		expect(selected).toHaveLength(3);
		for (const b of baskets) {
			expect(b.current, `${b.id} left below its minimum`).toBeGreaterThanOrEqual(b.min);
		}
		// Specifically: the 0-25 basket must not have been raided.
		expect(selected.filter(isHard)).toHaveLength(2);
		expect(selected.filter(isOpening)).toHaveLength(2);
	});

	it('reports the deficit when a minimum is genuinely unsatisfiable', () => {
		// Nothing in the pool is an opening, so `min 2 openings` cannot be met by
		// any selection. The pool should still fill with what does exist, and the
		// unmet minimum must remain visible on the basket rather than being
		// silently swallowed.
		const eligible = [
			song(1, 'Ending 1', 10),
			song(2, 'Ending 2', 20),
			song(3, 'Ending 3', 30),
			song(4, 'Ending 4', 40)
		];

		const baskets = [
			basket('songType-openings-all', 2, 4, isOpening),
			basket('songType-endings-all', 2, 4, isEnding)
		];

		const selected = distributeToBaskets(eligible, baskets, 4, unusedRng, true, 0, 8, null);

		expect(selected).toHaveLength(4);

		const openings = baskets.find((b) => b.id === 'songType-openings-all');
		const endings = baskets.find((b) => b.id === 'songType-endings-all');

		expect(endings.current).toBeGreaterThanOrEqual(endings.min);
		expect(openings.current).toBe(0);
		expect(
			openings.current,
			'an unsatisfiable minimum must stay reported, not be quietly zeroed'
		).toBeLessThan(openings.min);
	});

	it('repairs interlocking minimums deterministically, whatever the input order', () => {
		// Four baskets over eight songs with maxTotal 4: satisfying every minimum
		// needs exactly one song from each corner. Membership must not depend on
		// the order the pool arrived in.
		const eligible = [
			song(10, 'Ending 1', 10),
			song(20, 'Ending 2', 80),
			song(30, 'Ending 3', 5),
			song(40, 'Ending 4', 70),
			song(50, 'Opening 1', 12),
			song(60, 'Opening 2', 65),
			song(70, 'Opening 3', 20),
			song(80, 'Opening 4', 90)
		];

		const makeBaskets = () => [
			basket('songType-openings-all', 2, 4, isOpening),
			basket('songType-endings-all', 2, 4, isEnding),
			basket('difficulty-0-25-all', 2, 4, isHard),
			basket('difficulty-60-100-all', 2, 4, isEasy)
		];

		const forward = distributeToBaskets(eligible, makeBaskets(), 4, unusedRng, true, 0, 8, null);
		const again = distributeToBaskets(eligible, makeBaskets(), 4, unusedRng, true, 0, 8, null);
		const reversed = distributeToBaskets(
			[...eligible].reverse(),
			makeBaskets(),
			4,
			unusedRng,
			true,
			0,
			8,
			null
		);

		const ids = (songs) => songs.map((s) => s.annSongId).sort((a, b) => a - b);

		expect(forward).toHaveLength(4);
		expect(ids(again)).toEqual(ids(forward));
		expect(ids(reversed)).toEqual(ids(forward));

		expect(forward.filter(isOpening).length).toBeGreaterThanOrEqual(2);
		expect(forward.filter(isEnding).length).toBeGreaterThanOrEqual(2);
		expect(forward.filter(isHard).length).toBeGreaterThanOrEqual(2);
		expect(forward.filter(isEasy).length).toBeGreaterThanOrEqual(2);
	});

	it.each(['names', 'numeric IDs'])('keeps unique-anime selections unique while repairing (%s)', (identity) => {
		// Duplicate shows off. Greedy fills three endings and leaves the openings
		// basket empty. The first opening in stable order (id 4) is from Gamma,
		// which is already on the board via id 3 — and id 3 cannot be the one it
		// displaces, because that would drop the 60-100 basket under its min. A
		// repair that skips the duplicate check takes that swap and lands two
		// Gamma songs in the pool; the correct one reaches past it to id 5.
		const eligible = [
			song(1, 'Ending 1', 10, 'Alpha'),
			song(2, 'Ending 2', 12, 'Beta'),
			song(3, 'Ending 3', 70, 'Gamma'),
			song(4, 'Opening 1', 15, 'Gamma'),
			song(5, 'Opening 2', 16, 'Delta')
		];
		if (identity === 'numeric IDs') {
			const ids = { Alpha: 41, Beta: 42, Gamma: 43, Delta: 44 };
			eligible.forEach(s => { s.malId = ids[s.animeENName]; });
		}

		const baskets = [
			basket('songType-openings-all', 1, 3, isOpening),
			basket('songType-endings-all', 1, 3, isEnding),
			basket('difficulty-0-25-all', 2, 3, isHard),
			basket('difficulty-60-100-all', 1, 3, isEasy)
		];

		const selected = distributeToBaskets(eligible, baskets, 3, unusedRng, false, 0, 8, null);

		expect(selected).toHaveLength(3);

		const animeNames = selected.map((s) => s.animeENName);
		expect(new Set(animeNames).size, 'duplicate anime slipped in via repair').toBe(
			animeNames.length
		);
		for (const b of baskets) {
			expect(b.current, `${b.id} left below its minimum`).toBeGreaterThanOrEqual(b.min);
		}
	});
});

describe('tier-quality swap keeps basket counters honest', () => {
	it('improves overlap after quota repair introduces a single-user song', () => {
		const eligible = [
			song(1, 'Opening 1', 10),
			song(2, 'Ending 1', 80),
			song(3, 'Opening 1', 80),
			song(4, 'Ending 3', 10),
			song(5, 'Opening 2', 10)
		];
		const sources = eligible.flatMap(s => s.annSongId === 1
			? [{ ...s, _sourceId: 'user-a' }]
			: [{ ...s, _sourceId: 'user-a' }, { ...s, _sourceId: 'user-b' }]);
		const baskets = [
			basket('songType-openings-all', 1, 3, isOpening),
			basket('songType-endings-all', 2, 3, isEnding),
			basket('difficulty-0-25-all', 2, 3, isHard),
			basket('difficulty-60-100-all', 0, 3, isEasy)
		];
		const selected = distributeToBaskets(eligible, baskets, 3, unusedRng, false, 2, 8, sources);
		expect(selected).toHaveLength(3);
		expect(selected.some(s => s.annSongId === 1)).toBe(false);
		expect(selected.some(s => s.annSongId === 5)).toBe(true);
		expect(new Set(selected.map(s => s.animeENName)).size).toBe(3);
		for (const b of baskets) {
			expect(b.current).toBe(selected.filter(b.matcher).length);
			expect(b.current).toBeGreaterThanOrEqual(b.min);
			expect(b.current).toBeLessThanOrEqual(b.max);
		}
	});

	it('upgrades overlap through the full distribution path without breaking quotas', () => {
		const eligible = [
			{ ...song(1, 'Ending 1', 80), malId: 41 },
			{ ...song(2, 'Ending 2', 70), malId: 42 },
			{ ...song(3, 'Ending 3', 10), malId: 43 },
			{ ...song(4, 'Opening 1', 15), malId: 44 }
		];
		const sources = eligible.flatMap(s => s.annSongId <= 2
			? [{ ...s, _sourceId: 'user-a' }, { ...s, _sourceId: 'user-b' }]
			: [{ ...s, _sourceId: 'user-a' }]);
		const baskets = [
			basket('songType-openings-all', 1, 3, isOpening),
			basket('songType-endings-all', 1, 3, isEnding),
			basket('difficulty-0-25-all', 1, 3, isHard),
			basket('difficulty-60-100-all', 1, 3, isEasy)
		];
		// The second shared ending fills no remaining minimum initially. Two
		// single-user songs then meet hard/opening minima, leaving room to
		// exchange the hard ending while retaining the hard opening.
		const selected = distributeToBaskets(eligible, baskets, 3, unusedRng, false, 2, 8, sources);
		expect(selected.map(s => s.annSongId).sort()).toEqual([1, 2, 4]);
		for (const b of baskets) {
			expect(b.current).toBe(selected.filter(b.matcher).length);
			expect(b.current).toBeGreaterThanOrEqual(b.min);
			expect(b.current).toBeLessThanOrEqual(b.max);
		}
	});

	// performAggressiveSwap trades a song few listed users share for one more of
	// them share. It updated selectedSongs and the anime tracking but never
	// basket.current, and only checked that the two songs shared the same
	// *songList* baskets — so any other basket they differed in drifted away
	// from the actual selection. Everything downstream reads current: the basket
	// status the UI shows, allBasketsHaveSpace on later adds, and W1's repair.
	function tierSong(annSongId, songType, songDifficulty, animeENName) {
		return {
			annSongId,
			songName: `Song ${annSongId}`,
			songType,
			songDifficulty,
			animeENName: animeENName || `Anime ${annSongId}`
		};
	}

	it('moves current for every basket the swapped songs differ in', () => {
		// Out: an easy ending. In: a hard ending from a 2-user tier. They share
		// the endings basket but differ on difficulty, which is exactly the case
		// the old songList-only check waved through.
		const outgoing = tierSong(1, 'Ending 1', 80, 'Alpha');
		const incoming = tierSong(2, 'Ending 2', 10, 'Beta');

		const baskets = [
			basket('songType-endings-all', 0, 4, isEnding),
			basket('difficulty-0-25-all', 0, 4, isHard),
			basket('difficulty-60-100-all', 0, 4, isEasy)
		];

		// State as if `outgoing` is the only selected song.
		baskets[0].current = 1; // endings
		baskets[2].current = 1; // 60-100

		const selectedSongs = [outgoing];
		const selectedIds = new Set([outgoing.annSongId]);

		const orderedGroups = [
			{ count: 2, songs: [incoming] },
			{ count: 1, songs: [outgoing] }
		];

		const { swapsMade } = performAggressiveSwap(
			selectedSongs,
			selectedIds,
			orderedGroups[0],
			orderedGroups,
			baskets,
			true,
			new Map([['Alpha', 1]]),
			new Set(['Alpha']),
			unusedRng,
			5
		);

		expect(swapsMade).toBe(1);
		expect(selectedSongs[0].annSongId).toBe(2);

		const byId = Object.fromEntries(baskets.map((b) => [b.id, b.current]));
		expect(byId['songType-endings-all'], 'shared basket must net out').toBe(1);
		expect(byId['difficulty-60-100-all'], 'outgoing difficulty not decremented').toBe(0);
		expect(byId['difficulty-0-25-all'], 'incoming difficulty not incremented').toBe(1);

		// The invariant that matters: every counter equals the real occupancy.
		for (const b of baskets) {
			const actual = selectedSongs.filter((s) => b.matcher(s)).length;
			expect(b.current, `${b.id} disagrees with the selection`).toBe(actual);
		}
	});

	it('refuses a swap that would drop a basket below its minimum', () => {
		// The 60-100 basket sits exactly at its min, so trading its only member
		// away is illegal — something the old absolute space check never asked.
		const outgoing = tierSong(1, 'Ending 1', 80, 'Alpha');
		const incoming = tierSong(2, 'Ending 2', 10, 'Beta');

		const baskets = [
			basket('songType-endings-all', 0, 4, isEnding),
			basket('difficulty-0-25-all', 0, 4, isHard),
			basket('difficulty-60-100-all', 1, 4, isEasy)
		];
		baskets[0].current = 1;
		baskets[2].current = 1;

		const selectedSongs = [outgoing];
		const selectedIds = new Set([outgoing.annSongId]);
		const orderedGroups = [
			{ count: 2, songs: [incoming] },
			{ count: 1, songs: [outgoing] }
		];

		const { swapsMade } = performAggressiveSwap(
			selectedSongs,
			selectedIds,
			orderedGroups[0],
			orderedGroups,
			baskets,
			true,
			new Map([['Alpha', 1]]),
			new Set(['Alpha']),
			unusedRng,
			5
		);

		expect(swapsMade).toBe(0);
		expect(selectedSongs[0].annSongId).toBe(1);
		expect(baskets[2].current).toBe(1);
	});
});
