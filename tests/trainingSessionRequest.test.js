import { describe, expect, it } from 'vitest';
import { validateSessionStartParams } from '../src/lib/server/training/session-request.js';

describe('training session request validation', () => {
	it('accepts the zero-settings automatic request', () => {
		expect(validateSessionStartParams({})).toBeNull();
		expect(validateSessionStartParams({ mode: 'auto', sessionLength: 20 })).toBeNull();
	});

	it.each([
		[{ sessionLength: '20' }, 'whole number'],
		[{ sessionLength: 2.5 }, 'whole number'],
		[{ sessionLength: Number.NaN }, 'whole number'],
		[{ mode: 'surprise' }, 'auto or manual'],
		[{ dueSongPercentage: Number.POSITIVE_INFINITY }, 'between 0 and 100']
	])('rejects malformed primary controls', (params, message) => {
		expect(validateSessionStartParams(params)).toContain(message);
	});

	it('rejects oversized or fractional manual counts', () => {
		expect(
			validateSessionStartParams({
				mode: 'manual',
				sessionLength: 20,
				dueCount: 12,
				newCount: 9,
				revisionCount: 0
			})
		).toContain('cannot exceed');
		expect(
			validateSessionStartParams({ mode: 'manual', sessionLength: 20, dueCount: 2.5 })
		).toContain('whole numbers');
	});

	it('rejects manual percentages above a complete session', () => {
		expect(
			validateSessionStartParams({
				mode: 'manual',
				dueSongPercentage: 70,
				newSongPercentage: 30,
				revisionSongPercentage: 20
			})
		).toContain('more than 100');
	});

	it('ignores a legacy shelf target', () => {
		expect(
			validateSessionStartParams({ mode: 'manual', sessionLength: 20, shelvedCount: 999 })
		).toBeNull();
	});
});
