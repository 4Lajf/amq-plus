import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { release145 } from '../src/lib/releases/release-1.4.5.js';

/**
 * Render the Discord-ready Markdown announcement for a structured release.
 *
 * @param {typeof release145} release
 * @returns {string}
 */
export function renderReleaseAnnouncement(release) {
	const lines = [
		`# ${release.announcementTitle}`,
		'',
		release.announcementIntro,
		'',
		`**Update your connector before playing.** ${release.connectorInstructions} <${release.connectorUrl}>.`,
		''
	];

	for (const section of release.sections) {
		lines.push(
			section.announcementLead
				? (section.announcementHeading ?? section.heading)
				: `## ${section.heading}`,
			''
		);

		for (const releaseItem of section.items) {
			lines.push(`• ${releaseItem.text}`);
			if (releaseItem.credit) lines.push(releaseItem.credit);
			lines.push('');
		}
	}

	return `${lines.join('\n').trimEnd()}\n`;
}

const outputUrl = new URL('../docs/CHANGELOG-ANNOUNCEMENT.md', import.meta.url);
const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedUrl === import.meta.url) {
	await writeFile(outputUrl, renderReleaseAnnouncement(release145), 'utf8');
	console.log(`Updated ${fileURLToPath(outputUrl)}`);
}
