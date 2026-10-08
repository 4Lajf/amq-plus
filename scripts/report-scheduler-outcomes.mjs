// Read-only: SELECTs only. Credentials never enter the report or console output.
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { readSchedulerOutcomeSource } from '../src/lib/server/training/scheduler-outcome-source.js';
import { buildSchedulerOutcomeReport, renderSchedulerOutcomeMarkdown } from '../src/lib/server/training/scheduler-outcomes.js';

const { values } = parseArgs({ options: {
  from: { type: 'string' }, to: { type: 'string' }, 'as-of': { type: 'string' },
  input: { type: 'string' }, out: { type: 'string' }, user: { type: 'string' }, quiz: { type: 'string' },
  help: { type: 'boolean' }
} });

if (values.help) {
  console.log(`Read-only scheduler outcome report
node --env-file=.env scripts/report-scheduler-outcomes.mjs --from UTC --to UTC --as-of UTC --out PATH_PREFIX [--user UUID] [--quiz UUID]
node scripts/report-scheduler-outcomes.mjs --input snapshot.json --from UTC --to UTC --as-of UTC --out PATH_PREFIX

Use ISO UTC timestamps (ending Z). Anchors are [from,to), observations [from,as-of).
Writes aggregate PATH_PREFIX.json and PATH_PREFIX.md; refuses existing files.
File input: an array of play rows, or {"plays":[...]}. See docs/SCHEDULER-OUTCOMES.md.
Live reads use PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. No writes or scheduler changes.`);
} else {
  try {
    for (const name of ['from', 'to', 'as-of']) {
      if (!values[name]?.endsWith('Z') || !Number.isFinite(Date.parse(values[name])))
        throw new Error(`--${name} must be an ISO UTC timestamp ending Z.`);
    }
    if (!values.out) throw new Error('--out PATH_PREFIX is required.');
    const window = { from: values.from, to: values.to, asOf: values['as-of'] };
    buildSchedulerOutcomeReport([], window); // Validate before any network request.
    if (Date.parse(window.asOf) > Date.now()) throw new Error('--as-of cannot be in the future.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const name of ['user', 'quiz']) if (values[name] && !uuid.test(values[name]))
      throw new Error(`--${name} must be a UUID.`);
    const capturedAt = new Date().toISOString();
    let plays;
    if (values.input) {
      const input = JSON.parse(await readFile(values.input, 'utf8'));
      plays = Array.isArray(input) ? input : input.plays;
      if (!Array.isArray(plays)) throw new Error('Input must be play rows or an object with a plays array.');
      plays = plays.filter(row => (!values.user || row.user_id === values.user) && (!values.quiz || row.quiz_id === values.quiz));
    } else {
      if (!process.env.PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
        throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.');
      const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } });
      plays = await readSchedulerOutcomeSource(db, { ...window, capturedAt, user: values.user, quiz: values.quiz,
        onProgress: (table, count) => { if (count <= 1000 || count % 10000 === 0) console.error(`Read ${count} ${table} rows...`); } });
    }
    const report = buildSchedulerOutcomeReport(plays, window);
    report.source = { kind: values.input ? 'file' : 'live_select', capturedAt,
      scope: { userRestricted: Boolean(values.user), quizRestricted: Boolean(values.quiz) },
      sha256: createHash('sha256').update(JSON.stringify(plays)).digest('hex'),
      consistency: values.input ? 'Fixed input file; retain it privately to reproduce the report.'
        : 'Paginated read, not a transaction snapshot. Concurrent edits or deletions can change retained history or ledger membership during the read. Use a quiescent window or an exported snapshot for release comparisons.' };
    const output = resolve(values.out);
    await mkdir(dirname(output), { recursive: true });
    // Reserve both paths before writing so repeated invocations never overwrite evidence.
    const json = await open(`${output}.json`, 'wx');
    let markdown;
    try {
      markdown = await open(`${output}.md`, 'wx');
    } catch (error) {
      await json.close();
      await unlink(`${output}.json`); // Only the empty file this invocation just created.
      throw error;
    }
    try {
      await json.writeFile(`${JSON.stringify(report, null, 2)}\n`);
      await markdown.writeFile(renderSchedulerOutcomeMarkdown(report));
    } finally { await json.close(); await markdown?.close(); }
    console.log(JSON.stringify({ files: [`${output}.json`, `${output}.md`],
      plays: report.coverage.plays, anchorPlays: report.coverage.anchorPlays,
      cohorts: report.cohorts.length, emptyMetrics: report.emptyMetrics }));
  } catch (error) {
    console.error(`Scheduler report: ${error.message}`);
    process.exitCode = 1;
  }
}
