import { describe, it, expect } from 'vitest';
import {
	LENGTH_TOLERANCE_SECONDS,
	normalizeText,
	songTypeFamily,
	buildDuplicateGroups,
	dedupeByGroup,
	readSongFields
} from '../src/lib/server/training/duplicate-groups.js';

function song({
	annSongId,
	songName,
	songArtist,
	songType = 'Opening 1',
	songLength = 90,
	audio = null
}) {
	return {
		annSongId,
		songName,
		songArtist,
		songType,
		songLength,
		audio: audio ?? `https://cdn.example/${annSongId}.mp3`
	};
}

describe('duplicate grouping helpers', () => {
	it('normalizes text by casefolding and collapsing whitespace', () => {
		expect(normalizeText('  CHA-LA  HEAD-CHA-LA ')).toBe('cha-la head-cha-la');
		expect(normalizeText(null)).toBe('');
	});

	it('collapses numbered types into a family', () => {
		expect(songTypeFamily('Opening 1')).toBe('opening');
		expect(songTypeFamily('Ending 3')).toBe('ending');
		expect(songTypeFamily('Insert Song')).toBe('insert');
		expect(songTypeFamily('')).toBe('');
	});

	it('reads fields from either a flat song or a payload-shaped songs row', () => {
		const flat = readSongFields(song({ annSongId: 1, songName: 'A', songArtist: 'B' }));
		expect(flat).toMatchObject({
			annSongId: 1,
			name: 'a',
			artist: 'b',
			family: 'opening',
			length: 90
		});

		const wrapped = readSongFields({
			ann_song_id: 2,
			song_name: 'A',
			song_artist: 'B',
			payload: { songType: 'Ending 2', songLength: 88, audio: 'https://x/file.mp3' }
		});
		expect(wrapped).toMatchObject({
			annSongId: 2,
			family: 'ending',
			length: 88,
			audio: 'file.mp3'
		});
	});
});

describe('buildDuplicateGroups', () => {
	it('groups same name+artist+type within length tolerance', () => {
		const groups = buildDuplicateGroups([
			song({ annSongId: 1, songName: 'Anpanman', songArtist: 'Dream', songLength: 69.3 }),
			song({ annSongId: 2, songName: 'Anpanman', songArtist: 'Dream', songLength: 70.1 }),
			song({ annSongId: 3, songName: 'Other', songArtist: 'Dream', songLength: 69.3 })
		]);

		expect(groups.get(1)).toBe(groups.get(2));
		expect(groups.get(1)).not.toBe(groups.get(3));
	});

	it('does not group Opening with Ending even when audio-adjacent by name', () => {
		const groups = buildDuplicateGroups([
			song({
				annSongId: 1,
				songName: 'Theme',
				songArtist: 'Band',
				songType: 'Opening 1',
				songLength: 90
			}),
			song({
				annSongId: 2,
				songName: 'Theme',
				songArtist: 'Band',
				songType: 'Ending 1',
				songLength: 90
			})
		]);

		expect(groups.get(1)).not.toBe(groups.get(2));
	});

	it('keeps cuts apart when length differs by more than the tolerance', () => {
		const groups = buildDuplicateGroups([
			song({ annSongId: 1, songName: 'Cut', songArtist: 'X', songLength: 60 }),
			song({
				annSongId: 2,
				songName: 'Cut',
				songArtist: 'X',
				songLength: 60 + LENGTH_TOLERANCE_SECONDS + 1
			})
		]);

		expect(groups.get(1)).not.toBe(groups.get(2));
	});

	it('unites songs that share an identical audio file even when length disagrees', () => {
		const groups = buildDuplicateGroups([
			song({
				annSongId: 1,
				songName: 'SameFile',
				songArtist: 'X',
				songLength: 60,
				audio: 'https://cdn/a/98ief3.mp3'
			}),
			song({
				annSongId: 2,
				songName: 'SameFile',
				songArtist: 'X',
				songLength: 80,
				audio: 'https://other-host/b/98ief3.mp3'
			})
		]);

		expect(groups.get(1)).toBe(groups.get(2));
	});

	it('leaves songs with missing length alone unless audio already united them', () => {
		const groups = buildDuplicateGroups([
			song({ annSongId: 1, songName: 'NoLen', songArtist: 'X', songLength: null }),
			song({ annSongId: 2, songName: 'NoLen', songArtist: 'X', songLength: null })
		]);

		expect(groups.get(1)).not.toBe(groups.get(2));
	});
});

describe('dedupeByGroup', () => {
	it('keeps the first song per group and preserves priority order across pools', () => {
		const songs = [
			song({ annSongId: 1, songName: 'Dup', songArtist: 'A', songLength: 90 }),
			song({ annSongId: 2, songName: 'Dup', songArtist: 'A', songLength: 91 }),
			song({ annSongId: 3, songName: 'Solo', songArtist: 'B', songLength: 80 })
		];
		const groups = buildDuplicateGroups(songs);

		const due = [{ song_ann_id: 2 }, { song_ann_id: 3 }];
		const neu = [songs[0]]; // annSongId 1 shares a group with 2

		const seen = new Set();
		const keptDue = dedupeByGroup(due, groups, (r) => r.song_ann_id, seen);
		const keptNew = dedupeByGroup(neu, groups, (s) => s.annSongId, seen);

		expect(keptDue.map((r) => r.song_ann_id)).toEqual([2, 3]);
		// 1 was dropped because group already taken by the due copy
		expect(keptNew).toEqual([]);
	});

	it('passes through untouched when groups are absent', () => {
		const items = [{ song_ann_id: 1 }, { song_ann_id: 2 }];
		expect(dedupeByGroup(items, null, (r) => r.song_ann_id)).toEqual(items);
		expect(dedupeByGroup(items, new Map(), (r) => r.song_ann_id)).toEqual(items);
	});
});
