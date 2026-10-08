import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directories = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'scheduler-outcome-test-')); directories.push(dir);
  const input = join(dir, 'input.json'), output = join(dir, 'report');
  writeFileSync(input, JSON.stringify([
    { id: 'secret-id', user_id: 'private-user', quiz_id: 'private-quiz', song_ann_id: 1,
      played_at: '2025-01-01T00:00:00Z', rating: 2, success: true,
      fsrs_before: { state: 2 }, fsrs_after: { state: 2, due: '2025-01-11T00:00:00Z' } }
  ]));
  return { input, output };
}
function run({ input, output }, extra = []) {
  return spawnSync(process.execPath, [resolve('scripts/report-scheduler-outcomes.mjs'),
    '--input', input, '--out', output, '--from', '2025-01-01T00:00:00Z',
    '--to', '2025-02-01T00:00:00Z', '--as-of', '2025-03-01T00:00:00Z', ...extra], { encoding: 'utf8' });
}
it('exports both formats without identities and refuses to replace evidence', () => {
  const paths = fixture();
  const result = run(paths); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  const original = readFileSync(`${paths.output}.json`, 'utf8');
  expect(original).not.toMatch(/secret-id|private-user|private-quiz/);
  expect(JSON.parse(original).summaries.every(row => row.recall === null)).toBe(true);
  expect(readFileSync(`${paths.output}.md`, 'utf8')).toContain('no_followup_in_window');
  expect(run(paths).status).toBe(1);
  expect(readFileSync(`${paths.output}.json`, 'utf8')).toBe(original);
});
it('preserves an existing Markdown file and removes only its own empty reservation', () => {
  const paths = fixture(); writeFileSync(`${paths.output}.md`, 'existing evidence');
  expect(run(paths).status).toBe(1);
  expect(existsSync(`${paths.output}.json`)).toBe(false);
  expect(readFileSync(`${paths.output}.md`, 'utf8')).toBe('existing evidence');
});
it('rejects an invalid observation window before creating output', () => {
  const paths = fixture();
  const result = run(paths, ['--as-of', '2024-01-01T00:00:00Z']);
  expect(result.status).toBe(1); expect(result.stderr).toContain('from < to <= asOf');
  expect(existsSync(`${paths.output}.json`)).toBe(false);
});
