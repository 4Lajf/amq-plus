import { describe, expect, it } from 'vitest';
import { isDifficultSongCandidate } from '../src/lib/server/training/difficult-songs.js';

const now = Date.parse('2026-09-05T12:00:00Z');
const progress = { song_ann_id: 42, is_active: true, fsrs_state: { lapses: 8 } };
const play = {
	song_ann_id: 42,
	rating: 1,
	fsrs_before: { state: 2, lapses: 7 },
	fsrs_after: { lapses: 8 }
};

describe('post-session difficult song eligibility', () => {
	it('suggests a real Review lapse at eight lapses', () => {
		expect(isDifficultSongCandidate(progress, [play], now)).toBe(true);
	});
	it.each([0, 1, 3])('does not count a learning repetition in state %s', (state) => {
		expect(
			isDifficultSongCandidate(progress, [{ ...play, fsrs_before: { state, lapses: 7 } }], now)
		).toBe(false);
	});
	it('requires a new failure in this session, not old lifetime difficulty', () => {
		expect(isDifficultSongCandidate(progress, [], now)).toBe(false);
		expect(isDifficultSongCandidate(progress, [{ ...play, rating: 3 }], now)).toBe(false);
		expect(isDifficultSongCandidate(progress, [{ ...play, fsrs_after: { lapses: 7 } }], now)).toBe(
			false
		);
	});
	it('excludes paused, inactive, and below-threshold cards', () => {
		for (const override of [
			{ suspended_at: '2026-09-01' },
			{ is_active: false },
			{ fsrs_state: { lapses: 7 } }
		]) {
			expect(isDifficultSongCandidate({ ...progress, ...override }, [play], now)).toBe(false);
		}
	});
	it('requires both thirty days and four further lapses after a decision', () => {
		const prior = { lapses: 8, decidedAt: new Date(now - 30 * 86400000).toISOString() };
		const next = { ...progress, fsrs_state: { lapses: 12 }, difficult_song_suggestion: prior };
		expect(isDifficultSongCandidate(next, [play], now)).toBe(true);
		expect(isDifficultSongCandidate({ ...next, fsrs_state: { lapses: 11 } }, [play], now)).toBe(
			false
		);
		expect(isDifficultSongCandidate(next, [play], now - 1)).toBe(false);
	});
});
