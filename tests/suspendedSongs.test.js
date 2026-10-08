import { describe, it, expect } from 'vitest';
import {
	isPlayableProgressRecord,
	isSuspendedProgressRecord
} from '../src/lib/server/training/progress-filters.js';
import { trainingScheduler } from '../src/lib/server/training/fsrs-service.js';

const record = (extra = {}) => ({
	song_ann_id: 1234,
	is_active: true,
	suspended_at: null,
	fsrs_state: { due: '2020-01-01T00:00:00Z', state: 2, stability: 5, difficulty: 5 },
	...extra
});

describe('progress filters', () => {
	it('treats a suspended row as unplayable', () => {
		expect(isPlayableProgressRecord(record({ suspended_at: '2026-08-10T00:00:00Z' }))).toBe(false);
		expect(isSuspendedProgressRecord(record({ suspended_at: '2026-08-10T00:00:00Z' }))).toBe(true);
	});

	it('leaves an ordinary row playable', () => {
		expect(isPlayableProgressRecord(record())).toBe(true);
		expect(isSuspendedProgressRecord(record())).toBe(false);
	});

	it('still rejects inactive rows and rows with no song id', () => {
		expect(isPlayableProgressRecord(record({ is_active: false }))).toBe(false);
		expect(isPlayableProgressRecord(record({ song_ann_id: null }))).toBe(false);
	});
});

describe('scheduler selection', () => {
	it('never returns a suspended song as due', () => {
		const due = trainingScheduler.getDueSongs(
			[record({ song_ann_id: 1 }), record({ song_ann_id: 2, suspended_at: '2026-08-10T00:00:00Z' })],
			50
		);

		const ids = due.map((r) => r.song_ann_id);
		expect(ids).toContain(1);
		// The whole point of suspend: is_active is rewritten from pool membership on
		// every session start, so this must key off suspended_at instead.
		expect(ids).not.toContain(2);
	});

	it('never returns a suspended future card as extra practice', () => {
		const upcoming = trainingScheduler.getSongsNeedingRevision([
			record({ song_ann_id: 3, fsrs_state: { due: '2099-01-01T00:00:00Z' } }),
			record({
				song_ann_id: 4,
				fsrs_state: { due: '2099-01-01T00:00:00Z' },
				suspended_at: '2026-08-10T00:00:00Z'
			})
		]);

		const ids = upcoming.map((r) => r.song_ann_id);
		expect(ids).toContain(3);
		expect(ids).not.toContain(4);
	});
});
