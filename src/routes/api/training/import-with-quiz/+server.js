/**
 * POST /api/training/import-with-quiz
 * Import training data from localStorage and create a new quiz for it
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { importFromLocalStorage, verifyToken } from '$lib/server/training/training-utils.js';

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

    // Create a new quiz with default configuration
    const defaultQuizConfig = {
      numberOfSongs: 20,
      guessTime: 20,
      extraGuessTime: 0,
      samplePoint: {
        randomEnabled: true,
        standardValue: 0,
        randomValue: [0, 100]
      },
      advancedOn: false,
      lootingTime: 3,
      filters: {
        songSelection: {
          standardValue: 3,
          advancedValue: {
            watched: { randomEnabled: false, standardValue: 0, randomValue: [0, 100] },
            unwatched: { randomEnabled: false, standardValue: 0, randomValue: [0, 100] },
            random: { randomEnabled: false, standardValue: 100, randomValue: [0, 100] }
          }
        },
        songType: {
          standardValue: {
            openings: true,
            endings: true,
            inserts: true
          },
          advancedValue: {
            openings: { randomEnabled: false, standardValue: 33, randomValue: [0, 100] },
            endings: { randomEnabled: false, standardValue: 33, randomValue: [0, 100] },
            inserts: { randomEnabled: false, standardValue: 34, randomValue: [0, 100] }
          }
        },
        animeType: {
          tv: true,
          movie: true,
          ova: true,
          ona: true,
          special: true
        },
        songDifficulty: {
          advancedOn: false,
          standardValue: [0, 100],
          advancedValue: []
        },
        songCategory: {
          advancedOn: false,
          standardValue: {
            standard: true,
            chanting: true
          },
          advancedValue: {
            standard: { randomEnabled: false, standardValue: 50, randomValue: [0, 100] },
            chanting: { randomEnabled: false, standardValue: 50, randomValue: [0, 100] }
          }
        },
        vintage: {
          standardValue: {
            seasonOffset: 0,
            yearOffset: 0
          },
          advancedValueList: []
        },
        playerScore: {
          standardValue: [0, 100]
        },
        animeScore: {
          standardValue: [0, 10]
        },
        genres: [],
        tags: []
      },
      quiz_settings: {
        showSelection: 3,
        teamSize: 1
      },
      sourceConfiguration: {
        useSourceMaterial: false,
        sourceIds: []
      }
    };

    // Insert the quiz
    const { data: quizData, error: quizError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: userId,
        name: quizName,
        description: `Imported training data from old script`,
        configuration: defaultQuizConfig,
        is_public: false
      })
      .select()
      .single();

    if (quizError || !quizData) {
      console.error('Error creating quiz:', quizError);
      return json({ error: 'Failed to create quiz' }, { status: 500 });
    }

    // Import data into the new quiz
    const result = await importFromLocalStorage(supabaseAdmin, localStorageData, userId, quizData.id);

    return json({
      success: true,
      quizId: quizData.id,
      quizName: quizData.name,
      ...result
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

