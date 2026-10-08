import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'parsed_data.json');
const TARGET_USER_ID = 'd1974131-f523-4f36-b8bd-9c9aff5a5a9a';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const PIXELDRAIN_API_KEY = process.env.PIXELDRAIN_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
  process.exit(1);
}

if (!PIXELDRAIN_API_KEY) {
  console.error('Error: PIXELDRAIN_API_KEY must be set in .env for file storage');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(43200000) })
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Generate a secure token for share/play links
 * @returns {string} URL-safe base64 token (22 characters)
 */
function generateToken() {
  return randomBytes(16).toString('base64url');
}

/**
 * Upload songs array to Pixeldrain
 * @param {Array} songs - Array of song objects from AnisongDB
 * @param {string} filename - Filename for the upload
 * @returns {Promise<string>} Public link to the uploaded file
 */
async function uploadToPixeldrain(songs, filename) {
  const jsonContent = JSON.stringify(songs, null, 2);
  const pixeldrainPath = `/song_lists/${filename}`;
  const uploadUrl = `https://pixeldrain.com/api/filesystem/me${pixeldrainPath}?make_parents=true`;

  const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: jsonContent,
    signal: AbortSignal.timeout(43200000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pixeldrain upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const encodedFilename = encodeURIComponent(filename);
  return `https://pixeldrain.com/api/filesystem/me/song_lists/${encodedFilename}`;
}

async function importData() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('Error: parsed_data.json not found. Run parse_legacy.js first.');
    process.exit(1);
  }

  let jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  let songKeys = Object.keys(jsonData);
  const totalSongs = songKeys.length;

  console.log(`Loaded ${totalSongs} songs from parsed_data.json`);

  const mode = await new Promise(resolve => {
    rl.question('Select mode: [1] Test (first 5 songs), [2] Full import: ', resolve);
  });

  if (mode === '1') {
    console.log('Running in TEST mode (first 5 songs)...');
    songKeys = songKeys.slice(0, 5);
    jsonData = Object.fromEntries(songKeys.map(k => [k, jsonData[k]]));
  } else if (mode !== '2') {
    console.log('Invalid selection. Exiting.');
    process.exit(1);
  }

  const quizName = await new Promise(resolve => {
    rl.question('Enter a name for the new quiz: ', resolve);
  });

  if (!quizName) {
    console.error('Error: Quiz name is required.');
    process.exit(1);
  }

  try {
    // 1. Get user info
    console.log(`Fetching user information for ${TARGET_USER_ID}...`);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(TARGET_USER_ID);
    if (userError || !user) {
      throw new Error(`Failed to fetch user: ${userError?.message || 'User not found'}`);
    }
    const username = user.user_metadata?.custom_claims?.global_name || user.email || 'Unknown';
    console.log(`Importing for user: ${username}`);

    // 2. Reconstruct songs from AnisongDB
    console.log('Step 1: Reconstructing songs from AnisongDB...');
    const reconstructedMap = {};
    let successCount = 0;
    let failedSongs = [];

    for (let i = 0; i < songKeys.length; i++) {
      const songKey = songKeys[i];
      process.stdout.write(`\rReconstructing [${i + 1}/${songKeys.length}] ${songKey.substring(0, 50)}...`);

      try {
        const lastUnderscoreIndex = songKey.lastIndexOf('_');
        if (lastUnderscoreIndex === -1) {
          failedSongs.push(songKey);
          continue;
        }
        const artist = songKey.substring(0, lastUnderscoreIndex);
        const title = songKey.substring(lastUnderscoreIndex + 1);

        // Try exact match first
        let response = await fetch('https://anisongdb.com/api/search_request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            and_logic: true,
            ignore_duplicate: false,
            opening_filter: true,
            ending_filter: true,
            insert_filter: true,
            song_name_search_filter: { search: title, partial_match: false },
            artist_search_filter: { search: artist, partial_match: false, group_granularity: 0, max_other_artist: 99 }
          }),
          signal: AbortSignal.timeout(30000)
        });

        let results = [];
        if (response.ok) {
          results = await response.json();
        }

        // If no results, try partial match
        if (!results || results.length === 0) {
          response = await fetch('https://anisongdb.com/api/search_request', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              and_logic: false,
              ignore_duplicate: false,
              opening_filter: true,
              ending_filter: true,
              insert_filter: true,
              song_name_search_filter: { search: title, partial_match: true },
              artist_search_filter: { search: artist, partial_match: true, group_granularity: 0, max_other_artist: 99 }
            }),
            signal: AbortSignal.timeout(30000)
          });

          if (response.ok) {
            results = await response.json();
          }
        }

        if (results && results.length > 0) {
          reconstructedMap[songKey] = results[0];
          successCount++;
        } else {
          failedSongs.push(songKey);
        }
      } catch (err) {
        console.error(`\nError reconstructing ${songKey}:`, err.message);
        failedSongs.push(songKey);
      }

      // Rate limiting - 1 second between requests
      if (i < songKeys.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n\nReconstruction complete: ${successCount} successful, ${failedSongs.length} failed`);

    const reconstructedSongs = Object.values(reconstructedMap);
    if (reconstructedSongs.length === 0) {
      console.error('Failed to reconstruct any songs. Sample of failed songs:');
      failedSongs.slice(0, 10).forEach(s => console.error(`  - ${s}`));
      throw new Error('No songs could be reconstructed.');
    }

    console.log(`Successfully reconstructed ${reconstructedSongs.length} out of ${songKeys.length} songs.`);
    if (failedSongs.length > 0 && failedSongs.length <= 10) {
      console.log('Failed songs:', failedSongs.join(', '));
    } else if (failedSongs.length > 10) {
      console.log(`Failed songs (showing first 10/${failedSongs.length}):`, failedSongs.slice(0, 10).join(', '));
    }

    // 3. Upload songs to Pixeldrain
    console.log('Step 2: Uploading songs to Pixeldrain...');
    const sanitizedName = quizName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filename = `imported_${sanitizedName}_${Date.now()}.json`;
    const songsListLink = await uploadToPixeldrain(reconstructedSongs, filename);
    console.log(`Songs uploaded successfully to: ${songsListLink}`);

    // 4. Create Song List in database
    console.log('Step 3: Creating song list in database...');
    const { data: songList, error: slError } = await supabaseAdmin
      .from('song_lists')
      .insert({
        user_id: TARGET_USER_ID,
        name: `${quizName} - Songs`,
        description: 'Imported from legacy data',
        songs_list_link: songsListLink,
        creator_username: username,
        song_count: reconstructedSongs.length,
        is_public: false,
        supports_player_score: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (slError) throw new Error(`Failed to create song list: ${slError.message}`);

    // 5. Create Quiz Configuration (matching localStorage import format)
    console.log('Step 4: Creating quiz configuration...');
    const minimalConfig = {
      nodes: [
        {
          id: 'song-list-1',
          type: 'songList',
          position: { x: 100, y: 100 },
          data: {
            id: 'song-list',
            type: 'songList',
            title: 'Song List',
            icon: '📋',
            color: '#3b82f6',
            instanceId: 'song-list-1',
            isSourceNode: true,
            deletable: true,
            currentValue: {
              mode: 'saved-lists',
              selectedListId: songList.id,
              selectedListName: songList.name,
              useEntirePool: true,
              userListImport: {
                platform: 'anilist',
                username: '',
                selectedLists: {
                  completed: true,
                  watching: true,
                  planning: false,
                  on_hold: false,
                  dropped: false
                }
              },
              songPercentage: null
            },
            defaultValue: {
              mode: 'saved-lists',
              selectedListId: null,
              selectedListName: null,
              useEntirePool: false
            }
          }
        },
        {
          id: 'basic-settings-2',
          type: 'basicSettings',
          position: { x: 450, y: 100 },
          data: {
            id: 'basic-settings',
            type: 'basicSettings',
            title: 'Basic Settings',
            icon: '⚙️',
            color: '#6366f1',
            instanceId: 'basic-settings-2',
            deletable: true,
            currentValue: {
              guessTime: {
                type: 'range',
                label: 'Guess Time',
                min: 1,
                max: 60,
                value: {
                  useRange: false,
                  staticValue: 20,
                  min: 15,
                  max: 25
                }
              },
              samplePoint: {
                type: 'complex',
                label: 'Sample Point',
                value: {
                  useRange: true,
                  staticValue: 20,
                  start: 0,
                  end: 100
                }
              },
              playbackSpeed: {
                type: 'complex',
                label: 'Playback Speed',
                value: {
                  mode: 'static',
                  staticValue: 1,
                  randomValues: [1]
                }
              },
              duplicateShows: {
                type: 'boolean',
                label: 'Duplicate Shows',
                value: false
              },
              extraGuessTime: {
                type: 'range',
                label: 'Extra Guess Time',
                min: 0,
                max: 15,
                value: {
                  useRange: false,
                  staticValue: 0,
                  min: 5,
                  max: 15
                }
              }
            }
          }
        },
        {
          id: 'number-of-songs-3',
          type: 'numberOfSongs',
          position: { x: 800, y: 100 },
          data: {
            id: 'number-of-songs',
            type: 'numberOfSongs',
            title: 'Number of Songs',
            icon: '🔢',
            color: '#dc2626',
            instanceId: 'number-of-songs-3',
            deletable: true,
            currentValue: {
              useRange: false,
              staticValue: 20,
              min: 10,
              max: 30
            }
          }
        }
      ],
      edges: [
        {
          id: 'e1',
          source: 'song-list-1',
          target: 'basic-settings-2',
          type: 'default'
        },
        {
          id: 'e2',
          source: 'basic-settings-2',
          target: 'number-of-songs-3',
          type: 'default'
        }
      ]
    };

    // Generate tokens for the quiz
    const shareToken = generateToken();
    const playToken = generateToken();

    const { data: quizData, error: qError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: TARGET_USER_ID,
        creator_username: username,
        name: quizName,
        description: 'Imported from legacy training data',
        configuration_data: minimalConfig,
        is_public: false,
        share_token: shareToken,
        play_token: playToken
      })
      .select()
      .single();

    if (qError) throw new Error(`Failed to create quiz: ${qError.message}`);

    // 6. Import Training Progress
    console.log('Step 5: Importing training progress...');
    const imports = [];
    for (const [songKey, oldData] of Object.entries(jsonData)) {
      const songData = reconstructedMap[songKey];
      if (!songData) continue;

      const efactor = oldData.efactor || 2.5;
      const difficulty = Math.max(0, Math.min(10, (2.5 - efactor) * 5 + 5));
      const interval = oldData.interval || 1;
      const successCount = oldData.successCount || 0;
      const stability = Math.max(0.1, interval * Math.min(1 + (successCount * 0.2), 3));

      // Calculate due date based on last attempt + interval
      let dueDate;
      if (oldData.date) {
        const lastAttempt = new Date(oldData.date);
        dueDate = new Date(lastAttempt.getTime() + (interval * 24 * 60 * 60 * 1000));
      } else {
        dueDate = new Date();
      }

      // Determine FSRS state based on performance
      // State: 0=New, 1=Learning, 2=Review, 3=Relearning
      let state;
      const totalAttempts = successCount + (oldData.failureCount || 0);
      const successRate = totalAttempts > 0 ? successCount / totalAttempts : 0;

      if (successCount === 0) {
        state = 0; // New
      } else if (successCount < 3 || successRate < 0.6) {
        state = 1; // Learning
      } else if (interval >= 21 && successRate >= 0.8) {
        state = 2; // Review (well-established)
      } else {
        state = 1; // Learning
      }

      const fsrsState = {
        state,
        due: dueDate.toISOString(),
        stability,
        difficulty,
        elapsed_days: 0,
        scheduled_days: interval,
        reps: successCount,
        lapses: oldData.failureCount || 0
      };

      imports.push({
        user_id: TARGET_USER_ID,
        quiz_id: quizData.id,
        song_ann_id: songData.annSongId,
        fsrs_state: fsrsState,
        attempt_count: successCount + (oldData.failureCount || 0),
        success_count: successCount,
        failure_count: oldData.failureCount || 0,
        success_streak: oldData.successStreak || 0,
        failure_streak: oldData.failureStreak || 0,
        last_attempt_at: oldData.date ? new Date(oldData.date).toISOString() : null,
        history: []
      });
    }

    if (imports.length > 0) {
      const { error: impError } = await supabaseAdmin
        .from('training_progress')
        .insert(imports);
      if (impError) throw new Error(`Failed to import progress: ${impError.message}`);
    }

    // 7. Create historical training sessions based on legacy data
    console.log('Step 6: Creating historical training sessions...');
    const sessions = [];

    // Group data by date to create sessions
    const sessionsByDate = new Map();
    for (const [songKey, oldData] of Object.entries(jsonData)) {
      if (!oldData.date) continue;

      const dateStr = new Date(oldData.date).toISOString().split('T')[0];
      if (!sessionsByDate.has(dateStr)) {
        sessionsByDate.set(dateStr, {
          songs: [],
          date: new Date(oldData.date)
        });
      }
      sessionsByDate.get(dateStr).songs.push(oldData);
    }

    // Create sessions for each date
    for (const [dateStr, sessionData] of sessionsByDate.entries()) {
      const totalSongs = sessionData.songs.length;
      const songsCorrect = sessionData.songs.reduce((sum, s) => sum + (s.successCount || 0), 0);
      const songsIncorrect = sessionData.songs.reduce((sum, s) => sum + (s.failureCount || 0), 0);
      const totalAttempts = songsCorrect + songsIncorrect;
      const accuracy = totalAttempts > 0 ? parseFloat(((songsCorrect / totalAttempts) * 100).toFixed(2)) : 0;

      sessions.push({
        user_id: TARGET_USER_ID,
        quiz_id: quizData.id,
        started_at: sessionData.date.toISOString(),
        completed_at: new Date(sessionData.date.getTime() + (totalSongs * 30000)).toISOString(), // Estimate 30s per song
        total_songs: totalSongs,
        songs_correct: songsCorrect,
        songs_incorrect: songsIncorrect,
        accuracy: accuracy
      });
    }

    if (sessions.length > 0) {
      // Limit to most recent 50 sessions to avoid overwhelming the database
      const recentSessions = sessions.sort((a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      ).slice(0, 50);

      const { error: sessionError } = await supabaseAdmin
        .from('training_sessions')
        .insert(recentSessions);

      if (sessionError) {
        console.warn(`Warning: Failed to create training sessions: ${sessionError.message}`);
      } else {
        console.log(`Created ${recentSessions.length} historical training sessions.`);
      }
    }

    console.log('\nImport successful!');
    console.log(`Quiz ID: ${quizData.id}`);
    console.log(`Song List ID: ${songList.id}`);
    console.log(`Imported ${imports.length} training progress records.`);
    console.log(`Created ${sessions.length} historical training sessions.`);

  } catch (error) {
    console.error('\nError during import:', error.message);
  } finally {
    rl.close();
  }
}

importData();
