import { describe, it, expect } from 'vitest';
import {
	classifyMissingSong,
	groupMissingSongs,
	KNOWN_MISSING_ANN_SONG_IDS,
	MISSING_SONG_MESSAGES
} from '../src/lib/server/training/missing-songs.js';

// The masterlist frontier at the time of the R18 audit.
const MAX = 49360;

describe('classifyMissingSong', () => {
	it('treats anything above the masterlist frontier as simply newer', () => {
		// 88 of the 92 unresolved ids in production are this case, and none of them
		// is a problem  EAMQ issued them after our last refresh.
		expect(classifyMissingSong(49839, MAX)).toBe('newer-than-database');
		expect(classifyMissingSong(MAX + 1, MAX)).toBe('newer-than-database');
	});

	it('recognises the four verified AnisongDB holes', () => {
		for (const id of [1544, 11587, 13714, 29660]) {
			expect(classifyMissingSong(id, MAX)).toBe('known-absent');
		}
	});

	it('still flags an unexpected id below the frontier', () => {
		// Not newer, not a known hole  Ethis is the only case worth reporting, and
		// keeping it distinct is the point of an explicit list.
		expect(classifyMissingSong(20000, MAX)).toBe('unknown');
	});

	it('does not classify by frontier when the masterlist is unavailable', () => {
		expect(classifyMissingSong(49839, 0)).toBe('unknown');
	});

	it('handles junk input', () => {
		expect(classifyMissingSong(null, MAX)).toBe('unknown');
		expect(classifyMissingSong('not-a-number', MAX)).toBe('unknown');
	});

	it('exposes exactly the audited id set', () => {
		expect([...KNOWN_MISSING_ANN_SONG_IDS].sort((a, b) => a - b)).toEqual([
			1544, 11587, 13714, 29660
		]);
	});
});

describe('groupMissingSongs', () => {
	it('buckets by cause and drops empty groups', () => {
		const groups = groupMissingSongs([49839, 49409, 1544, 20000], MAX);
		const byKind = Object.fromEntries(groups.map((g) => [g.kind, g.ids]));

		expect(byKind['newer-than-database']).toEqual([49409, 49839]);
		expect(byKind['known-absent']).toEqual([1544]);
		expect(byKind['unknown']).toEqual([20000]);
	});

	it('returns nothing for an empty input', () => {
		expect(groupMissingSongs([], MAX)).toEqual([]);
	});

	it('carries the user-facing copy for each group', () => {
		const [group] = groupMissingSongs([49839], MAX);
		expect(group.message).toBe(MISSING_SONG_MESSAGES['newer-than-database']);
		expect(group.message).toContain('no need to report it');
	});

	it('tells a user with a dead song how to get rid of it', () => {
		const [group] = groupMissingSongs([1544], MAX);
		expect(group.message).toContain('cannot be played');
		expect(group.message).toContain('remove it from your history');
	});
});
