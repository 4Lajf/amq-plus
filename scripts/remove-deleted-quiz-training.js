/**
 * Remove training data for deleted/restored stub quizzes from the CSV files.
 * These quizzes were stubs created to satisfy FK constraints; user wants them removed.
 *
 * Usage: node scripts/remove-deleted-quiz-training.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DELETED_QUIZ_IDS = new Set([
  '05a811ed-a116-4786-babb-60514acfc3db',
  'cb396c67-8685-4654-9bf1-ee4a2468341e',
  '520a5513-6dfd-42fe-8149-8bc0607db993',
  '0937418c-89af-4f56-8f58-dfd9606a2c14',
  '71234fba-492e-44d8-b176-2b78039552e1',
  'a0ee3d45-9eb7-4c02-9f40-c75841fe6262'
]);

// ── CSV parser ───────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  let headers = null;
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"'; i += 2; continue;
        }
        inQuotes = false; i++; continue;
      }
      currentField += ch; i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { currentRow.push(currentField); currentField = ''; i++; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        currentRow.push(currentField); currentField = '';
        if (!headers) {
          headers = currentRow;
        } else if (currentRow.length > 1 || currentRow[0] !== '') {
          const obj = {};
          for (let j = 0; j < headers.length; j++) obj[headers[j]] = currentRow[j] ?? '';
          rows.push(obj);
        }
        currentRow = [];
        if (ch === '\r') i += 2; else i++;
      } else { currentField += ch; i++; }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (headers && (currentRow.length > 1 || currentRow[0] !== '')) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) obj[headers[j]] = currentRow[j] ?? '';
      rows.push(obj);
    }
  }
  return { headers, rows };
}

function escapeCSVField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCSV(headers, rows) {
  const lines = [headers.map(h => escapeCSVField(h)).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCSVField(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Main ─────────────────────────────────────────────────────────────

const tsPath = resolve(ROOT, 'training_sessions_rows.csv');
const tspPath = resolve(ROOT, 'training_session_plays_rows.csv');
const tpPath = resolve(ROOT, 'training_progress_rows.csv');

console.log('Reading CSVs...');
const ts = parseCSV(readFileSync(tsPath, 'utf8'));
const tsp = parseCSV(readFileSync(tspPath, 'utf8'));
const tp = parseCSV(readFileSync(tpPath, 'utf8'));

// Filter out deleted quiz data
const tsBefore = ts.rows.length;
const tspBefore = tsp.rows.length;
const tpBefore = tp.rows.length;

ts.rows = ts.rows.filter(r => !DELETED_QUIZ_IDS.has(r.quiz_id));
tsp.rows = tsp.rows.filter(r => !DELETED_QUIZ_IDS.has(r.quiz_id));
tp.rows = tp.rows.filter(r => !DELETED_QUIZ_IDS.has(r.quiz_id));

const tsRemoved = tsBefore - ts.rows.length;
const tspRemoved = tspBefore - tsp.rows.length;
const tpRemoved = tpBefore - tp.rows.length;

console.log(`\nRemoved:`);
console.log(`  training_sessions:      ${tsRemoved} rows (${ts.rows.length} remaining)`);
console.log(`  training_session_plays: ${tspRemoved} rows (${tsp.rows.length} remaining)`);
console.log(`  training_progress:      ${tpRemoved} rows (${tp.rows.length} remaining)`);

writeFileSync(tsPath, rowsToCSV(ts.headers, ts.rows), 'utf8');
writeFileSync(tspPath, rowsToCSV(tsp.headers, tsp.rows), 'utf8');
writeFileSync(tpPath, rowsToCSV(tp.headers, tp.rows), 'utf8');

console.log('\nFiles updated.');
