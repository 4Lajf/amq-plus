/**
 * W13 — resolving imported songs that arrive without an annSongId.
 *
 * The hazard N6 identified is the whole design constraint: name lookup that
 * takes the first match can silently pick the wrong anime, and a wrong
 * annSongId is worse than a skipped song because it trains the user on the
 * wrong answer and corrupts that card's history. So the resolver must never
 * decide between candidates.
 *
 * Run: npx vitest run tests/songNameResolver.test.js
 */
import { describe, it, expect } from 'vitest';
import { resolveSongsByName, matchKey, normalizeForMatch } from '../src/lib/server/song-name-resolver.js';

const candidate = (annSongId, songName, songArtist, animeENName) => ({
	annSongId,
	songName,
	songArtist,
	animeENName,
	songType: 'Opening 1'
});

describe('W13 name resolution', () => {
	it('resolves a song that matches exactly one candidate', () => {
		const pool = [
			candidate(101, 'Cruel Angel Thesis', 'Yoko Takahashi', 'Evangelion'),
			candidate(102, 'Tank!', 'Seatbelts', 'Cowboy Bebop')
		];

		const { outcomes, counts } = resolveSongsByName(
			[{ songName: 'cruel angel thesis', songArtist: 'Yoko  Takahashi' }],
			pool
		);

		expect(counts.resolved).toBe(1);
		expect(outcomes[0].status).toBe('resolved');
		expect(outcomes[0].annSongId).toBe(101);
	});

	it('refuses to pick when several different songs match', () => {
		// The N6 hazard, made concrete: the same title and artist under two
		// different anime entries with different ids.
		const pool = [
			candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist'),
			candidate(202, 'Again', 'YUI', 'Some Other Show')
		];

		const { outcomes, counts } = resolveSongsByName(
			[{ songName: 'Again', songArtist: 'YUI' }],
			pool
		);

		expect(counts.ambiguous).toBe(1);
		expect(counts.resolved).toBe(0);
		expect(outcomes[0].status).toBe('ambiguous');
		expect(outcomes[0].annSongId, 'must not guess an id').toBeNull();
		expect(outcomes[0].candidates.map((c) => c.annSongId).sort()).toEqual([201, 202]);
	});

	it('still resolves one recording listed under several anime entries', () => {
		// Same annSongId in both rows - that is N8's duplicate problem, not an
		// ambiguity, so it must not be treated as one.
		const pool = [
			candidate(301, 'Kaikai Kitan', 'Eve', 'Jujutsu Kaisen'),
			candidate(301, 'Kaikai Kitan', 'Eve', 'Jujutsu Kaisen (Dub)')
		];

		const { outcomes, counts } = resolveSongsByName(
			[{ songName: 'Kaikai Kitan', songArtist: 'Eve' }],
			pool
		);

		expect(counts.resolved).toBe(1);
		expect(outcomes[0].annSongId).toBe(301);
	});

	it('reports songs nothing matches instead of dropping them', () => {
		const { outcomes, counts } = resolveSongsByName(
			[{ songName: 'Unknown Song', songArtist: 'Nobody' }],
			[candidate(401, 'Something Else', 'Someone', 'Anime')]
		);

		expect(counts.unresolved).toBe(1);
		expect(outcomes[0].status).toBe('unresolved');
		expect(outcomes[0].reason).toMatch(/no song in the database/i);
	});

	it('leaves songs that already carry an annSongId alone', () => {
		const { outcomes, counts } = resolveSongsByName(
			[{ annSongId: 999, songName: 'Tank!', songArtist: 'Seatbelts' }],
			[candidate(102, 'Tank!', 'Seatbelts', 'Cowboy Bebop')]
		);

		expect(counts.alreadyIdentified).toBe(1);
		expect(counts.resolved).toBe(0);
		// No outcome row: nothing to confirm, nothing to skip.
		expect(outcomes).toHaveLength(0);
	});

	it('will not match on title alone', () => {
		// Titles collide constantly across anime; artist is part of the key so a
		// title-only row cannot resolve to a confident wrong answer.
		const { outcomes, counts } = resolveSongsByName(
			[{ songName: 'Again' }],
			[candidate(201, 'Again', 'YUI', 'Fullmetal Alchemist')]
		);

		expect(counts.unresolved).toBe(1);
		expect(outcomes[0].reason).toMatch(/name and artist/i);
	});

	it('normalizes punctuation and spacing the way providers differ on it', () => {
		expect(normalizeForMatch("Don't  Say   “Lazy”")).toBe("don't say lazy");
		expect(matchKey({ songName: 'A B', songArtist: 'C' })).toBe('a b|c');
		expect(matchKey({ songName: 'A B' })).toBeNull();
	});
});
