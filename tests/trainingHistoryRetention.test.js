import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	new URL('../supabase/migrations/20260905000002_preserve_training_history.sql', import.meta.url),
	'utf8'
);

describe('training history preservation migration', () => {
	it('does not delete, truncate, or rewrite training records', () => {
		expect(sql).not.toMatch(
			/\b(delete\s+from|truncate\s+(?:table\s+)?|update\s+)(?:public\.)?training_/i
		);
	});

	it('unschedules both cleanup jobs and detects alternate job names by command', () => {
		expect(sql).toContain("'prune-training-session-plays', 'prune-inactive-training-progress'");
		expect(sql).toContain('cron.unschedule(retention_job.jobid)');
		expect(sql).toContain("command ~ 'prune_(training_session_plays|inactive_training_progress)");
		expect(sql).toContain("RAISE EXCEPTION 'Training retention job is still scheduled'");
	});

	it.each(['prune_training_session_plays', 'prune_inactive_training_progress'])(
		'makes %s a restricted no-op',
		(name) => {
			expect(sql).toMatch(
				new RegExp(
					`CREATE OR REPLACE FUNCTION public\\.${name}\\([^;]+AS \\$fn\\$ SELECT 0; \\$fn\\$;`,
					'i'
				)
			);
			expect(sql).toContain(
				`REVOKE ALL ON FUNCTION public.${name}(interval) FROM public, anon, authenticated;`
			);
			expect(sql).toContain(`public.${name}(interval '0 days') <> 0`);
		}
	);
});
