/**
 * W13 step 3 — applying the user's answer to the resolution report.
 *
 * The resolver refuses to guess (see `songNameResolver.test.js`). This is the
 * other half of that guarantee: the code that actually writes an `annSongId`
 * onto a song must not reintroduce a guess by defaulting, by trusting a
 * decision the report never offered, or by quietly dropping what was skipped.
 *
 * Run: npx vitest run tests/songIdResolution.test.js
 */
import { describe, it, expect } from 'vitest';
import { resolveSongsByName } from '../src/lib/server/song-name-resolver.js';
import {
	applyResolutions,
	defaultDecisions,
	describeOutcome
} from '../src/lib/utils/songIdResolution.js';

const candidate = (annSongId, songName, songArtist, animeENName) => ({
	annSongId,
	songName,
	songArtist,
	animeENName,
	songType: 'Opening 1'
});

/** The shape the endpoint hands the dialog. */
function report(songs, pool) {
	const { outcomes, counts } = resolveSongsByName(songs, pool);
	return { outcomes, counts };
}

describe('W13 decision application', () => {
	it('points an outcome back at its song even when earlier rows had ids', () => {
		// Rows that already carry an id produce no outcome, so outcome order does
		// not track song order. Without the index the dialog would apply a
		// decision to the wrong song - the exact failure the feature exists to
		// prevent.
		const songs = [
			{ annSongId: 999, songName: 'Tank!', songArtist: 'Seatbelts' },
			{ songName: 'Cruel Angel Thesis', songArtist: 'Yoko Takahashi' }
		];
		const { outcomes } = report(songs, [
			candidate(101, 'Cruel Angel Thesis', 'Yoko Takahashi', 'Evangelion')
		]);

		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].index).toBe(1);

		const result = applyResolutions(songs, outcomes, defaultDecisions(outcomes));
		expect(result.songs[0].annSongId, 'the already-identified song is untouched').toBe(999);
		expect(result.songs[0].annSongIdSource).toBeUndefined();
		expect(result.songs[1].annSongId).toBe(101);
	});

	it('defaults unique matches to accepted and ambiguous ones to skip', () => {
		const songs = [
			{ songName: 'Tank!', songArtist: 'Seatbelts' },
			{ songName: 'Again', songArtist: 'YUI' }
		];
		const { outcomes } = report(songs, [
			candidate(102, 'Tank!', 'Seatbelts', 'Cowboy Bebop'),
			candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist'),
			candidate(202, 'Again', 'YUI', 'Some Other Show')
		]);

		const decisions = defaultDecisions(outcomes);
		expect(decisions[0]).toBe(102);
		expect(decisions[1], 'an ambiguous row must not start on a candidate').toBeNull();

		const result = applyResolutions(songs, outcomes, decisions);
		expect(result.applied).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.songs[1].annSongId).toBeUndefined();
	});

	it('marks provenance on rows identified by name', () => {
		const songs = [{ songName: 'Tank!', songArtist: 'Seatbelts' }];
		const { outcomes } = report(songs, [candidate(102, 'Tank!', 'Seatbelts', 'Cowboy Bebop')]);

		const result = applyResolutions(songs, outcomes, defaultDecisions(outcomes));
		expect(result.songs[0].annSongIdSource).toBe('name-match');
	});

	it('applies an ambiguous row only once the user picks a candidate', () => {
		const songs = [{ songName: 'Again', songArtist: 'YUI' }];
		const { outcomes } = report(songs, [
			candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist'),
			candidate(202, 'Again', 'YUI', 'Some Other Show')
		]);

		const result = applyResolutions(songs, outcomes, { 0: 202 });
		expect(result.applied).toBe(1);
		expect(result.songs[0].annSongId).toBe(202);
		expect(result.songs[0].annSongIdSource).toBe('name-match');
	});

	it('refuses an id the report never offered for that song', () => {
		// The report is the only authority on what a row may become. A decision
		// naming anything else is a bug or a tampered payload, and writing it would
		// be exactly the confidently-wrong id this whole feature avoids.
		const songs = [{ songName: 'Again', songArtist: 'YUI' }];
		const { outcomes } = report(songs, [
			candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist'),
			candidate(202, 'Again', 'YUI', 'Some Other Show')
		]);

		const result = applyResolutions(songs, outcomes, { 0: 5555 });
		expect(result.applied).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.songs[0].annSongId).toBeUndefined();
	});

	it('keeps skipped and unmatched songs instead of dropping them', () => {
		// They store with song_ann_id = null exactly as today and stay unplayable.
		// Dropping them would lose data the user imported without being asked.
		const songs = [
			{ songName: 'Unknown Song', songArtist: 'Nobody' },
			{ songName: 'Again', songArtist: 'YUI' }
		];
		const { outcomes } = report(songs, [
			candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist'),
			candidate(202, 'Again', 'YUI', 'Some Other Show')
		]);

		const result = applyResolutions(songs, outcomes, defaultDecisions(outcomes));
		expect(result.songs).toHaveLength(2);
		expect(result.applied).toBe(0);
		expect(result.skipped).toBe(2);
	});

	it('does not mutate the songs it was given', () => {
		const songs = [{ songName: 'Tank!', songArtist: 'Seatbelts' }];
		const { outcomes } = report(songs, [candidate(102, 'Tank!', 'Seatbelts', 'Cowboy Bebop')]);

		applyResolutions(songs, outcomes, defaultDecisions(outcomes));
		expect(songs[0].annSongId, 'input array must be left alone').toBeUndefined();
	});

	it('says what will happen before the click, skipped count included', () => {
		expect(describeOutcome({ applied: 3, skipped: 2 })).toMatch(/3 songs will be identified/);
		expect(describeOutcome({ applied: 3, skipped: 2 })).toMatch(/2 will be added without an ID/);
		expect(describeOutcome({ applied: 1, skipped: 0 })).toBe('1 song will be identified');
		expect(describeOutcome({ applied: 0, skipped: 0 })).toBe('Nothing will be identified');
	});
});
