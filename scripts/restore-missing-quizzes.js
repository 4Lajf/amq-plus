/**
 * Restore missing quiz configurations and training sessions referenced by
 * training data but absent from the exports (deleted before export).
 *
 * Produces:
 *   - quiz_configurations_rows (1).csv   (updated in-place with 6 stub quizzes)
 *   - training_sessions_rows.csv         (updated in-place with 6 stub sessions)
 *
 * Then run: node scripts/migrate-quiz-format.js
 * to get migration-updates.csv in v2 format ready for upload.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── CSV helpers ─────────────────────────────────────────────────────

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
        if (!headers) { headers = currentRow; }
        else if (currentRow.length > 1 || currentRow[0] !== '') {
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

function rowToCSVLine(row, columns) {
  return columns.map(col => escapeCSVField(row[col] ?? '')).join(',');
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let result = '';
  for (let i = 0; i < 22; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ── Load data ───────────────────────────────────────────────────────

console.log('Loading CSV files...');
const qcPath = path.join(ROOT, 'quiz_configurations_rows (1).csv');
const tpPath = path.join(ROOT, 'training_progress_rows.csv');
const tsPath = path.join(ROOT, 'training_sessions_rows.csv');
const tspPath = path.join(ROOT, 'training_session_plays_rows.csv');

const qcText = fs.readFileSync(qcPath, 'utf8');
const tpText = fs.readFileSync(tpPath, 'utf8');
const tsText = fs.readFileSync(tsPath, 'utf8');
const tspText = fs.readFileSync(tspPath, 'utf8');

const qc = parseCSV(qcText);
const ts = parseCSV(tsText);

console.log(`quiz_configurations: ${qc.rows.length} rows`);
console.log(`training_sessions: ${ts.rows.length} rows`);

// ── Step 1: Find missing quiz IDs ───────────────────────────────────

const existingQuizIds = new Set(qc.rows.map(r => r.id));

// Simple line-based extraction for large files (session_id / quiz_id are early columns, no commas)
function extractColumn(text, colIndex) {
  const values = new Set();
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const val = line.split(',')[colIndex];
    if (val) values.add(val);
  }
  return values;
}

const tpQuizIds = extractColumn(tpText, 2);   // training_progress.quiz_id is col 2
const tsQuizIds = extractColumn(tsText, 2);   // training_sessions.quiz_id is col 2

const missingQuizIds = new Set();
for (const qid of tpQuizIds) { if (!existingQuizIds.has(qid)) missingQuizIds.add(qid); }
for (const qid of tsQuizIds) { if (!existingQuizIds.has(qid)) missingQuizIds.add(qid); }

console.log(`\nMissing quiz IDs: ${missingQuizIds.size}`);
for (const id of missingQuizIds) console.log(`  ${id}`);

// Gather user_id for each missing quiz
const quizOwners = {};
for (const id of missingQuizIds) quizOwners[id] = { userId: null, earliestDate: null };

for (const row of ts.rows) {
  if (missingQuizIds.has(row.quiz_id)) {
    if (!quizOwners[row.quiz_id].userId) quizOwners[row.quiz_id].userId = row.user_id;
    const d = row.started_at;
    if (d && (!quizOwners[row.quiz_id].earliestDate || d < quizOwners[row.quiz_id].earliestDate)) {
      quizOwners[row.quiz_id].earliestDate = d;
    }
  }
}

// Also check training_progress for user_id
const tpLines = tpText.split('\n');
for (let i = 1; i < tpLines.length; i++) {
  const parts = tpLines[i].split(',');
  const quizId = parts[2];
  if (missingQuizIds.has(quizId) && !quizOwners[quizId]?.userId) {
    quizOwners[quizId].userId = parts[1];
  }
}

for (const [id, info] of Object.entries(quizOwners)) {
  console.log(`  ${id} -> user: ${info.userId}, earliest: ${info.earliestDate || 'N/A'}`);
}

// ── Step 2: Create stub v1 quiz configs ─────────────────────────────

function makeStubV1Config() {
  return JSON.stringify({
    edges: [
      { id: 'e0', data: {}, type: 'default', style: { stroke: 'rgba(99,102,241,0.7)', strokeWidth: 2 }, source: 'song-list-1', target: 'basic-settings-2' },
      { id: 'xy-edge__basic-settings-2-number-of-songs-3', source: 'basic-settings-2', target: 'number-of-songs-3' }
    ],
    nodes: [
      {
        id: 'song-list-1', type: 'songList',
        data: {
          id: 'song-list', icon: '📋', type: 'songList', color: '#3b82f6', title: 'Song List',
          unique: false, deletable: true, instanceId: 'song-list-1',
          description: 'Choose base song pool',
          routeBadges: [], isSourceNode: true, userPositioned: false, executionChance: 100, selectionModified: false,
          currentValue: {
            mode: 'masterlist', useEntirePool: false,
            providerImport: { fileData: null, providerType: 'amq-export', processedData: null },
            selectedListId: null, songPercentage: null,
            userListImport: { platform: 'anilist', username: '', selectedLists: { dropped: false, on_hold: false, planning: false, watching: true, completed: true } },
            selectedListName: null
          },
          defaultValue: {
            mode: 'masterlist', useEntirePool: false,
            providerImport: { fileData: null, providerType: 'amq-export', processedData: null },
            selectedListId: null, songPercentage: null,
            userListImport: { platform: 'anilist', username: '', selectedLists: { dropped: false, on_hold: false, planning: false, watching: true, completed: true } },
            selectedListName: null
          }
        },
        position: { x: -450, y: 100 }, measured: { width: 200, height: 118 }, deletable: true
      },
      {
        id: 'basic-settings-2', type: 'basicSettings',
        data: {
          id: 'basic-settings', icon: '⚙️', type: 'basicSettings', color: '#6366f1', title: 'Basic Settings',
          unique: false, deletable: true, instanceId: 'basic-settings-2',
          description: 'Core lobby configuration settings',
          routeBadges: [], userPositioned: false, executionChance: 100, selectionModified: false,
          currentValue: {
            guessTime: { max: 60, min: 1, type: 'range', label: 'Guess Time', value: { max: 25, min: 15, useRange: false, staticValue: 20 } },
            samplePoint: { type: 'complex', label: 'Sample Point', value: { end: 100, start: 0, useRange: true, staticValue: 20 } },
            playbackSpeed: { type: 'complex', label: 'Playback Speed', value: { mode: 'static', staticValue: 1, randomValues: [1] } },
            duplicateShows: { type: 'boolean', label: 'Duplicate Shows', value: true },
            extraGuessTime: { max: 15, min: 0, type: 'range', label: 'Extra Guess Time', value: { max: 15, min: 5, useRange: false, staticValue: 0 } },
            preventSameSongSpam: { type: 'boolean', label: 'Prevent same song spam (room-wide)', value: false }
          },
          defaultValue: {
            guessTime: { max: 60, min: 1, type: 'range', label: 'Guess Time', value: { max: 25, min: 15, useRange: false, staticValue: 20 } },
            samplePoint: { type: 'complex', label: 'Sample Point', value: { end: 100, start: 0, useRange: true, staticValue: 20 } },
            playbackSpeed: { type: 'complex', label: 'Playback Speed', value: { mode: 'static', staticValue: 1, randomValues: [1] } },
            duplicateShows: { type: 'boolean', label: 'Duplicate Shows', value: true },
            extraGuessTime: { max: 15, min: 0, type: 'range', label: 'Extra Guess Time', value: { max: 15, min: 5, useRange: false, staticValue: 0 } },
            preventSameSongSpam: { type: 'boolean', label: 'Prevent same song spam (room-wide)', value: false }
          }
        },
        position: { x: 0, y: 100 }, measured: { width: 400, height: 435 }, deletable: true
      },
      {
        id: 'number-of-songs-3', type: 'numberOfSongs',
        data: {
          id: 'number-of-songs', icon: '🔢', type: 'numberOfSongs', color: '#dc2626', title: 'Number of Songs',
          unique: false, deletable: true, instanceId: 'number-of-songs-3', mustBeLast: false,
          description: 'Determines final song count for the lobby',
          routeBadges: [], userPositioned: false, executionChance: 100, selectionModified: false,
          currentValue: { max: 25, min: 15, useRange: false, staticValue: 20 },
          defaultValue: { max: 25, min: 15, useRange: false, staticValue: 20 }
        },
        position: { x: 700, y: 100 }, measured: { width: 320, height: 326 }, deletable: true
      }
    ],
    metadata: { savedAt: new Date().toISOString(), version: '1.0', restoredStub: true }
  });
}

const stubMetadata = JSON.stringify({
  vintage: null,
  guessTime: { guessTime: { useRange: false, staticValue: 20 }, extraGuessTime: { useRange: false, staticValue: 0 } },
  songTypes: null, difficulty: null,
  sourceNodes: [{ mode: 'masterlist', type: 'songList', useEntirePool: false }],
  songSelection: null, estimatedSongs: { min: 20, max: 20 }
});

const qcColumns = qc.headers;
const newQuizRows = [];

for (const [quizId, info] of Object.entries(quizOwners)) {
  const createdAt = info.earliestDate || '2025-01-01 00:00:00+00';
  const row = {};
  for (const col of qcColumns) row[col] = '';
  
  row.id = quizId;
  row.user_id = info.userId;
  row.name = '[Restored] Deleted Quiz';
  row.description = 'Stub entry restored to preserve training data';
  row.is_public = 'false';
  row.configuration_data = makeStubV1Config();
  row.created_at = createdAt;
  row.updated_at = new Date().toISOString().replace('T', ' ').replace('Z', '+00');
  row.creator_username = 'System';
  row.is_temporary = 'false';
  row.last_played_at = '';
  row.share_token = generateToken();
  row.play_token = generateToken();
  row.allow_remixing = 'false';
  row.quiz_metadata = stubMetadata;
  row.expires_at = '';

  newQuizRows.push(row);
}

// Write updated quiz_configurations CSV
const allQcRows = [...qc.rows, ...newQuizRows];
const qcOutputLines = [qcColumns.map(c => escapeCSVField(c)).join(',')];
for (const row of allQcRows) {
  qcOutputLines.push(rowToCSVLine(row, qcColumns));
}
fs.writeFileSync(qcPath, qcOutputLines.join('\n') + '\n', 'utf8');
console.log(`\nUpdated ${qcPath}`);
console.log(`Total quizzes: ${allQcRows.length} (${qc.rows.length} existing + ${newQuizRows.length} stubs)`);

// ── Step 3: Find missing session IDs in training_session_plays ──────

const existingSessionIds = new Set(ts.rows.map(r => r.id));
const tspSessionIds = extractColumn(tspText, 2); // session_id is col 2

const missingSessionIds = new Set();
for (const sid of tspSessionIds) {
  if (!existingSessionIds.has(sid)) missingSessionIds.add(sid);
}

console.log(`\nMissing session IDs in training_session_plays: ${missingSessionIds.size}`);

if (missingSessionIds.size > 0) {
  // Gather info for each missing session from the plays data
  const sessionInfo = {};
  const tspLines = tspText.split('\n');
  for (let i = 1; i < tspLines.length; i++) {
    const parts = tspLines[i].split(',');
    const sid = parts[2];
    if (missingSessionIds.has(sid)) {
      if (!sessionInfo[sid]) {
        sessionInfo[sid] = {
          userId: parts[1],
          quizId: parts[3],
          playCount: 0,
          correctCount: 0,
          earliestPlay: parts[5],
          latestPlay: parts[5]
        };
      }
      sessionInfo[sid].playCount++;
      if (parts[7] === 'true') sessionInfo[sid].correctCount++;
      if (parts[5] < sessionInfo[sid].earliestPlay) sessionInfo[sid].earliestPlay = parts[5];
      if (parts[5] > sessionInfo[sid].latestPlay) sessionInfo[sid].latestPlay = parts[5];
    }
  }

  for (const [sid, info] of Object.entries(sessionInfo)) {
    console.log(`  ${sid} -> quiz: ${info.quizId}, user: ${info.userId}, plays: ${info.playCount}, correct: ${info.correctCount}`);
  }

  // Create stub training_session rows
  const tsColumns = ts.headers;
  const newSessionRows = [];

  for (const [sid, info] of Object.entries(sessionInfo)) {
    const row = {};
    for (const col of tsColumns) row[col] = '';

    const sessionData = JSON.stringify({
      mode: 'manual',
      scheduled_days: 0,
      restored_stub: true
    });

    row.id = sid;
    row.user_id = info.userId;
    row.quiz_id = info.quizId;
    row.started_at = info.earliestPlay;
    row.ended_at = info.latestPlay;
    row.total_songs = String(info.playCount);
    row.correct_songs = String(info.correctCount);
    row.incorrect_songs = String(info.playCount - info.correctCount);
    row.session_data = sessionData;

    newSessionRows.push(row);
  }

  // Write updated training_sessions CSV
  const allTsRows = [...ts.rows, ...newSessionRows];
  const tsOutputLines = [tsColumns.map(c => escapeCSVField(c)).join(',')];
  for (const row of allTsRows) {
    tsOutputLines.push(rowToCSVLine(row, tsColumns));
  }
  fs.writeFileSync(tsPath, tsOutputLines.join('\n') + '\n', 'utf8');
  console.log(`\nUpdated ${tsPath}`);
  console.log(`Total sessions: ${allTsRows.length} (${ts.rows.length} existing + ${newSessionRows.length} stubs)`);
}

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n=== NEXT STEPS ===');
console.log('1. Run: node scripts/migrate-quiz-format.js');
console.log('   This reads quiz_configurations_rows (1).csv and outputs scripts/migration-updates.csv');
console.log('2. Upload scripts/migration-updates.csv as quiz_configurations');
console.log('3. Upload training_progress_rows.csv');
console.log('4. Upload training_sessions_rows.csv (now includes stub sessions)');
console.log('5. Upload training_session_plays_rows.csv');
