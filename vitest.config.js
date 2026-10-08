import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		include: ['tests/**/*.test.js'],
		globals: true,

		// Threads, not forks - this is what actually fixes the flake.
		//
		// The long-running symptom (SyntaxError: Unexpected token, X is not a
		// function, TrainingScheduler is not a constructor - always a different
		// file, always green when that file ran alone) is module source arriving
		// truncated over the forks IPC pipe. Vite transforms in the parent and ships
		// the result to each worker, and on the fork pipe that payload sometimes
		// lands short.
		//
		// Capping workers only made it rarer. It still reproduced at maxWorkers: 3
		// in 2 of 3 runs, on basketRepair.test.js, which passes 5/5 on its own.
		// Threads pass modules over a MessagePort instead: 8 consecutive clean runs,
		// 4 at 3 workers and 4 at 8, zero corruption and zero pool timeouts.
		//
		// Worker count is left at the default. Both 3 and 8 were verified; the only
		// reason to cap it is memory, since threads share one process and the two
		// masterlist suites hold ~500 MB each while they run.
		pool: 'threads',

		// Everything that was parked on 2026-08-12 is back except realQuizDeterminism,
		// which is held out for a different reason than the flake: it pulls ten
		// hardcoded production quiz UUIDs from live Supabase using SUPABASE_SECRET_KEY
		// and regenerates each ten times. It needs network and secrets, it breaks
		// whenever one of those rows is edited, and it runs 219 s - longer than the
		// other 39 files put together. Run it deliberately: npm run test:integration
		exclude: [
			...configDefaults.exclude,
			'tests/realQuizDeterminism.test.js',
			'tests/starterTemplates.integration.test.js'
		]
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
			'$env/static/public': path.resolve(__dirname, './tests/mocks/env-public.js'),
			'$env/static/private': path.resolve(__dirname, './tests/mocks/env-private.js')
		}
	}
});
