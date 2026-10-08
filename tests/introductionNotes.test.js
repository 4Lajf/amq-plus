/**
 * Why a session introduced fewer new songs than the settings asked for.
 *
 * Both mechanisms used to be silent: `backlogThrottle` was computed, returned
 * and tested but read by nobody, and the daily new-song limit had no channel at
 * all in auto mode because the warnings array is dropped there. With
 * `daily_new_limit` defaulting to 20 on every quiz, "why did I only get one new
 * song" needed an answer that reaches the player.
 *
 * The notes ride in the session-start `warnings`, which the connector already
 * prints to chat on every version — including the published 1.4.2.
 *
 * Run: npx vitest run tests/introductionNotes.test.js
 */
import { describe, it, expect } from 'vitest';
import {
	buildIntroductionNotes,
	countDailyGoalProgress
} from '../src/lib/server/training/sessionStartService.js';

describe('buildIntroductionNotes', () => {
	it('says nothing when nothing throttled the introductions', () => {
		expect(buildIntroductionNotes()).toEqual([]);
		expect(
			buildIntroductionNotes({ dailyNewLimit: 20, remainingNewCapacity: 20, newCount: 6 })
		).toEqual([]);
	});

	it('does not claim a reduction when the one-song floor equals the normal share', () => {
		expect(buildIntroductionNotes({
			backlogThrottle: { pressure: 9, fullShare: 1, allowed: 1 }
		})).toEqual([]);
	});

	it('explains the backlog taper with the numbers behind it', () => {
		const [note] = buildIntroductionNotes({
			backlogThrottle: { pressure: 3.2, fullShare: 6, allowed: 1 }
		});

		// The player can see "1 new song"; the note has to account for it.
		expect(note).toContain('3.2');
		expect(note).toContain('1');
		expect(note).toContain('6');
	});

	it('explains an exhausted daily new-song budget, and says when it resets', () => {
		const [note] = buildIntroductionNotes({
			dailyNewLimit: 20,
			remainingNewCapacity: 0,
			newCount: 0
		});

		expect(note).toContain('20');
		expect(note).toMatch(/00:00 UTC/);
	});

	it('says a full unused budget was spent by this session', () => {
		const [note] = buildIntroductionNotes({
			dailyNewLimit: 20,
			remainingNewCapacity: 20,
			newCount: 20
		});

		expect(note).toMatch(/uses all 20/);
		expect(note).toMatch(/00:00 UTC/);
		expect(note).not.toMatch(/left/);
	});

	it('explains a partially spent budget that capped this session', () => {
		const [note] = buildIntroductionNotes({
			dailyNewLimit: 20,
			remainingNewCapacity: 2,
			newCount: 2
		});

		expect(note).toContain('2');
		expect(note).toContain('20');
		expect(note).toMatch(/still allowed/);
	});

	it('stays quiet when the limit is unlimited, however few new songs there were', () => {
		expect(
			buildIntroductionNotes({ dailyNewLimit: null, remainingNewCapacity: 0, newCount: 0 })
		).toEqual([]);
	});

	it('reports both reasons when both applied', () => {
		const notes = buildIntroductionNotes({
			backlogThrottle: { pressure: 4, fullShare: 6, allowed: 1 },
			dailyNewLimit: 20,
			remainingNewCapacity: 0,
			newCount: 0
		});

		expect(notes).toHaveLength(2);
	});
});

describe('countDailyGoalProgress', () => {
	const session = (id, annIds, reasons) => ({
		id,
		session_data: { playlistAnnSongIds: annIds, playlistReasons: reasons }
	});
	const plays = (sessionId, annIds) => annIds.map((a) => ({ session_id: sessionId, song_ann_id: a }));

	it('counts due songs actually played', () => {
		expect(
			countDailyGoalProgress(
				[session('s1', [1, 2, 3], ['due', 'due', 'new'])],
				plays('s1', [1, 2, 3])
			)
		).toBe(2);
	});

	it('counts a re-drilled song once per play, not once per day', () => {
		const sessions = [
			session('s1', [1, 2], ['due', 'due']),
			session('s2', [1, 2], ['due', 'due']),
			session('s3', [1, 2], ['due', 'due'])
		];
		const playsToday = [...plays('s1', [1, 2]), ...plays('s2', [1, 2]), ...plays('s3', [1, 2])];

		expect(countDailyGoalProgress(sessions, playsToday)).toBe(6);
	});

	it('counts two plays of the same song in one session as two', () => {
		expect(
			countDailyGoalProgress(
				[session('s1', [1], ['due'])],
				[...plays('s1', [1]), ...plays('s1', [1])]
			)
		).toBe(2);
	});

	it('ignores new, extra-practice, and legacy shelved reasons', () => {
		expect(
			countDailyGoalProgress(
				[session('s1', [1, 2, 3], ['new', 'revision', 'shelved'])],
				plays('s1', [1, 2, 3])
			)
		).toBe(0);
	});

	it('ignores songs the playlist scheduled but the player never reached', () => {
		expect(
			countDailyGoalProgress([session('s1', [1, 2, 3], ['due', 'due', 'due'])], plays('s1', [1]))
		).toBe(1);
	});

	it('falls back to planned composition for sessions predating playlistReasons', () => {
		const legacy = { id: 's-old', session_data: { composition: { due: 7, new: 3 } } };
		expect(countDailyGoalProgress([legacy], [])).toBe(7);
	});

	it('adds legacy sessions to attributable ones without double counting the new path', () => {
		const legacy = { id: 's-old', session_data: { composition: { due: 4 } } };
		const modern = session('s1', [1, 2], ['due', 'due']);
		expect(countDailyGoalProgress([legacy, modern], plays('s1', [1, 2]))).toBe(6);
	});

	it('survives empty input', () => {
		expect(countDailyGoalProgress([], [])).toBe(0);
		expect(countDailyGoalProgress(null, null)).toBe(0);
	});
});
