/**
 * The suites that need network and real credentials, kept out of `npm test`.
 *
 * These suites use production-backed quiz rows and real credentials. The
 * determinism check is slow and changes when its source quizzes are edited;
 * the starter check verifies the homepage presets still generate real songs.
 *
 * Run: npm run test:integration
 */
import { configDefaults } from 'vitest/config';
import base from './vitest.config.js';
import { fileURLToPath } from 'node:url';

export default {
	...base,
	resolve: {
		...base.resolve,
		alias: {
			...base.resolve.alias,
			'$env/static/public': fileURLToPath(new URL('./tests/integration-env.js', import.meta.url)),
			'$env/static/private': fileURLToPath(new URL('./tests/integration-env.js', import.meta.url))
		}
	},
	test: {
		...base.test,
		include: ['tests/realQuizDeterminism.test.js', 'tests/starterTemplates.integration.test.js'],
		// Drop the base config's hold-out - running it is the point of this config.
		exclude: [...configDefaults.exclude]
	}
};
