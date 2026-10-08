/**
 * Backfill blank songCategory / animeType from our masterlist by annSongId.
 *
 * Run: npx vitest run tests/fillMissingSongMetadata.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const index = new Map([
	[
		'101',
		{ annSongId: 101, songCategory: 'Standard', animeType: 'TV', songName: 'Known' }
	],
	[
		'102',
		{ annSongId: 102, songCategory: 'Instrumental', animeType: 'Movie', songName: 'Known2' }
	]
]);

vi.mock('../src/lib/server/masterlist.js', () => ({
	getMasterlist: vi.fn(async () => [...index.values()]),
	getMasterlistIndex: vi.fn(async () => index),
	getSongByAnnSongId: vi.fn(async (id) => index.get(String(id)))
}));

const {
	__test_fillMissingSongMetadataFromMasterlist: fill,
	__test_isBlankSongMeta: isBlank
} = await import('../src/lib/server/songFiltering.js');

describe('isBlankSongMeta', () => {
	it('treats absent, empty and No Category as blank', () => {
		expect(isBlank(undefined)).toBe(true);
		expect(isBlank(null)).toBe(true);
		expect(isBlank('')).toBe(true);
		expect(isBlank('  ')).toBe(true);
		expect(isBlank('No Category')).toBe(true);
		expect(isBlank('Standard')).toBe(false);
		expect(isBlank('TV')).toBe(false);
	});
});

describe('fillMissingSongMetadataFromMasterlist', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('fills blank category and type from the masterlist', async () => {
		const { songs, filled } = await fill(
			[
				{ annSongId: 101, songName: 'Thin', songCategory: '', animeType: '' },
				{ annSongId: 102, songName: 'Partial', songCategory: 'Character' } // type missing
			],
			index
		);

		expect(filled).toBe(2);
		expect(songs[0].songCategory).toBe('Standard');
		expect(songs[0].animeType).toBe('TV');
		expect(songs[1].songCategory).toBe('Character');
		expect(songs[1].animeType).toBe('Movie');
	});

	it('leaves songs we do not know alone (true Unspecified holes)', async () => {
		const { songs, filled } = await fill(
			[{ annSongId: 99999, songName: 'Unknown upload', songCategory: '', animeType: '' }],
			index
		);

		expect(filled).toBe(0);
		expect(songs[0].songCategory).toBe('');
		expect(songs[0].animeType).toBe('');
	});

	it('does not overwrite fields that are already set', async () => {
		const { songs, filled } = await fill(
			[{ annSongId: 101, songCategory: 'Chanting', animeType: 'OVA' }],
			index
		);

		expect(filled).toBe(0);
		expect(songs[0].songCategory).toBe('Chanting');
		expect(songs[0].animeType).toBe('OVA');
	});
});
