import { expect, it } from 'vitest';
import { formatPlaybackTime } from '../src/lib/utils/playback-time.js';

it.each([
	[10.1, '0:10.1'],
	[15.1, '0:15.1'],
	[45.1, '0:45.1'],
	[59.96, '1:00.0'],
	[93.71, '1:33.7'],
	[600.1, '10:00.1'],
	[-1, '0:00.0'],
	[NaN, '0:00.0'],
	[Infinity, '0:00.0']
])('formats playback time %s as %s', (seconds, expected) => {
	expect(formatPlaybackTime(seconds)).toBe(expected);
});
