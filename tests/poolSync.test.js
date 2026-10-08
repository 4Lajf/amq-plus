import { describe, it, expect } from 'vitest';
import { planPoolSync } from '../src/lib/server/training/pool-sync.js';

const NOW = new Date('2026-08-10T12:00:00.000Z');

/**
 * @param {Partial<any>} overrides
 */
function record(overrides = {}) {
	return {
		id: overrides.id ?? 'row-1',
		song_ann_id: overrides.song_ann_id ?? 1001,
		song_key: overrides.song_key ?? null,
		is_active: overrides.is_active ?? true,
		inactivated_at: overrides.inactivated_at ?? null,
		suspended_at: overrides.suspended_at ?? null,
		fsrs_state: overrides.fsrs_state ?? { due: '2026-08-12T00:00:00.000Z', stability: 3 }
	};
}

const song = (annSongId, songName = 'Song', songArtist = 'Artist') => ({
	annSongId,
	songName,
	songArtist
});

describe('planPoolSync', () => {
	it('deactivates a tracked song the pool no longer produces', () => {
		const records = [record({ id: 'a', song_ann_id: 1001 })];

		const plan = planPoolSync(records, [song(2002)], NOW);

		expect(plan.deactivateIds).toEqual(['a']);
		expect(plan.reactivateUpdates).toEqual([]);
		// The caller's scheduler reads these records straight after, so the
		// in-memory copy has to reflect the write.
		expect(records[0].is_active).toBe(false);
		expect(records[0].inactivated_at).toBe(NOW.toISOString());
	});

	it('reactivates a song that came back, shifting its due date by the time it was away', () => {
		const records = [
			record({
				id: 'b',
				song_ann_id: 1001,
				is_active: false,
				inactivated_at: '2026-08-08T12:00:00.000Z',
				fsrs_state: { due: '2026-08-09T00:00:00.000Z', stability: 5 }
			})
		];

		const plan = planPoolSync(records, [song(1001)], NOW);

		expect(plan.deactivateIds).toEqual([]);
		expect(plan.reactivateUpdates).toHaveLength(1);
		// Two days inactive, so a due date two days in the past moves two days on
		// rather than coming back already overdue.
		expect(plan.reactivateUpdates[0].fsrs_state.due).toBe('2026-08-11T00:00:00.000Z');
		expect(records[0].is_active).toBe(true);
		expect(records[0].inactivated_at).toBeNull();
	});

	it('leaves a suspended song alone even when it is still in the pool', () => {
		// The whole reason R9 uses suspended_at rather than is_active: this loop
		// owns is_active and would undo a suspension written there.
		const records = [
			record({
				id: 'c',
				song_ann_id: 1001,
				is_active: false,
				inactivated_at: '2026-08-01T00:00:00.000Z',
				suspended_at: '2026-08-05T00:00:00.000Z'
			})
		];

		const plan = planPoolSync(records, [song(1001)], NOW);

		expect(plan.reactivateUpdates).toEqual([]);
		expect(plan.deactivateIds).toEqual([]);
		expect(records[0].is_active).toBe(false);
	});

	it('leaves a suspended song alone when it has dropped out of the pool too', () => {
		const records = [record({ id: 'd', song_ann_id: 1001, suspended_at: '2026-08-05T00:00:00.000Z' })];

		const plan = planPoolSync(records, [song(2002)], NOW);

		expect(plan.deactivateIds).toEqual([]);
		expect(records[0].is_active).toBe(true);
	});

	it('matches legacy rows by artist_title when they have no ann id', () => {
		const records = [
			record({ id: 'e', song_ann_id: null, song_key: 'Artist_Song', is_active: false, inactivated_at: NOW.toISOString() })
		];

		const plan = planPoolSync(records, [song(4004, 'Song', 'Artist')], NOW);

		expect(plan.reactivateUpdates.map((u) => u.id)).toEqual(['e']);
	});

	it('is a no-op when everything already agrees', () => {
		const records = [
			record({ id: 'f', song_ann_id: 1001, is_active: true }),
			record({ id: 'g', song_ann_id: 2002, is_active: false, inactivated_at: '2026-08-01T00:00:00.000Z' })
		];

		const plan = planPoolSync(records, [song(1001)], NOW);

		expect(plan.reactivateUpdates).toEqual([]);
		expect(plan.deactivateIds).toEqual([]);
	});

	it('treats an empty pool as everything leaving, not as a crash', () => {
		const records = [record({ id: 'h' })];

		const plan = planPoolSync(records, [], NOW);

		expect(plan.deactivateIds).toEqual(['h']);
	});
});
