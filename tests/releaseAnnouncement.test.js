import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { renderReleaseAnnouncement } from '../scripts/generate-release-announcement.mjs';
import { release145 } from '../src/lib/releases/release-1.4.5.js';

describe('release announcement', () => {
	it('matches the current structured release exactly', async () => {
		const checkedInAnnouncement = await readFile(
			new URL('../docs/CHANGELOG-ANNOUNCEMENT.md', import.meta.url),
			'utf8'
		);

		expect(checkedInAnnouncement.replaceAll('\r\n', '\n')).toBe(
			renderReleaseAnnouncement(release145)
		);
	});
});
