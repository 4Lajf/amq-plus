/**
 * POST /api/training/import-with-quiz
 * Import training data from localStorage and create a new quiz for it
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { importFromLocalStorage, reconstructSongsFromLocalStorage, verifyToken } from '$lib/server/training/training-utils.js';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * Upload songs to Pixeldrain
 * @param {Array} songs - Array of song objects
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
    body: jsonContent
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Pixeldrain upload error:', errorText);
    throw new Error(`Pixeldrain upload failed: ${response.status} ${response.statusText}`);
  }

  // Construct the public link
  const encodedFilename = encodeURIComponent(filename);
  return `https://pixeldrain.com/api/filesystem/me/song_lists/${encodedFilename}`;
}

/**
 * Create a song list in the database
 * @param {Object} supabase - Supabase admin client
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} name - Song list name
 * @param {string} songsListLink - Link to songs JSON on Pixeldrain
 * @param {number} songCount - Number of songs
 * @returns {Promise<Object>} Created song list record
 */
async function createSongList(supabase, userId, username, name, songsListLink, songCount) {
  const { data, error } = await supabase
    .from('song_lists')
    .insert({
      user_id: userId,
      name,
      description: 'Imported from old training script',
      songs_list_link: songsListLink,
      creator_username: username,
      song_count: songCount,
      is_public: false,
      supports_player_score: false,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create song list: ${error.message}`);
  }

  return data;
}

// @ts-ignore
export async function POST({ request }) {
  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { token, localStorageData, quizName } = await request.json();

    if (!token) {
      return json({ error: 'Token required' }, { status: 401 });
    }

    if (!localStorageData) {
      return json({ error: 'localStorageData required' }, { status: 400 });
    }

    if (!quizName) {
      return json({ error: 'quizName required' }, { status: 400 });
    }

    // Verify token and get user
    let userId;
    try {
      // Find token by trying to verify against all tokens
      const { data: tokens } = await supabaseAdmin
        .from('training_tokens')
        .select('user_id, token_hash');

      let validToken = null;
      for (const t of tokens || []) {
        if (await verifyToken(token, t.token_hash)) {
          validToken = t;
          break;
        }
      }

      if (!validToken) {
        return json({ error: 'Invalid token' }, { status: 401 });
      }

      userId = validToken.user_id;

      // Update last_used_at
      await supabaseAdmin
        .from('training_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', userId);
    } catch (err) {
      console.error('Token verification error:', err);
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    // Reconstruct songs from localStorage
    console.log('[IMPORT] Step 1: Reconstructing songs from localStorage');
    const reconstructedSongs = await reconstructSongsFromLocalStorage(localStorageData);

    if (reconstructedSongs.length === 0) {
      return json({ error: 'No songs could be reconstructed from localStorage' }, { status: 400 });
    }

    // Get user info for creator_username
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData.user) {
      console.error('Error fetching user:', userError);
      return json({ error: 'Failed to fetch user information' }, { status: 500 });
    }
    const username = userData.user.user_metadata?.custom_claims?.global_name || 'Unknown';

    // Upload songs to Pixeldrain
    console.log('[IMPORT] Step 2: Uploading songs to Pixeldrain');
    const sanitizedName = quizName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filename = `imported_${sanitizedName}_${Date.now()}.json`;
    const songsListLink = await uploadToPixeldrain(reconstructedSongs, filename);

    // Create song list in database
    console.log('[IMPORT] Step 3: Creating song list in database');
    const songList = await createSongList(
      supabaseAdmin,
      userId,
      username,
      `${quizName} - Songs`,
      songsListLink,
      reconstructedSongs.length
    );

    // Create minimal quiz configuration with song list source
    console.log('[IMPORT] Step 4: Creating quiz configuration');
    const minimalQuizConfig = {
      nodes: [
        {
          id: 'song-list-1',
          type: 'songList',
          position: { x: 100, y: 100 },
          data: {
            id: 'song-list',
            type: 'source',
            title: 'Song List',
            icon: '📋',
            color: '#10b981',
            instanceId: 'song-list-1',
            currentValue: {
              mode: 'saved-lists',
              savedList: {
                id: songList.id,
                name: songList.name
              },
              useEntirePool: true
            },
            defaultValue: {
              mode: 'saved-lists',
              savedList: null,
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
            color: '#f59e0b',
            instanceId: 'number-of-songs-3',
            currentValue: {
              value: {
                useRange: false,
                staticValue: 20,
                min: 10,
                max: 30
              }
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

    // Insert the quiz (note: configuration_data, not configuration)
    const { data: quizData, error: quizError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: userId,
        name: quizName,
        description: `Imported training data from old script`,
        configuration_data: minimalQuizConfig,
        is_public: false
      })
      .select()
      .single();

    if (quizError || !quizData) {
      console.error('Error creating quiz:', quizError);
      return json({ error: 'Failed to create quiz' }, { status: 500 });
    }

    // Import training progress into the new quiz
    console.log('[IMPORT] Step 5: Importing training progress');
    const result = await importFromLocalStorage(supabaseAdmin, localStorageData, userId, quizData.id);

    return json({
      success: true,
      quizId: quizData.id,
      quizName: quizData.name,
      songListId: songList.id,
      songListName: songList.name,
      reconstructedSongs: reconstructedSongs.length,
      ...result
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

