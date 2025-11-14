/**
 * Play Quiz API endpoint
 * Generates and returns the song list for a quiz configuration
 * 
 * @module play/[quizId]
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateQuizSongs } from '$lib/server/songFiltering.js';
import { simulateQuizConfiguration } from '$lib/components/amqplus/editor/utils/simulationUtils.js';
import {
  ROUTER_CONFIG,
  BASIC_SETTINGS_CONFIG,
  NUMBER_OF_SONGS_CONFIG,
  FILTER_NODE_DEFINITIONS
} from '$lib/components/amqplus/editor/utils/nodeDefinitions.js';
import { buildQuizCommand } from '$lib/server/quiz-command-builder.js';

/**
 * @typedef {Object} RequestParams
 * @property {Object} params - Route parameters
 * @property {string} params.quizId - Quiz configuration ID or share token
 * @property {URL} url - Request URL object
 * @property {Object} locals - SvelteKit locals object
 * @property {typeof fetch} fetch - Fetch function
 */

/**
 * GET /play/[quizId]?seed=[optional]
 * POST /play/[quizId]?seed=[optional]
 * Generates and returns the song list for a quiz configuration
 * POST can include liveNodeData to merge with quiz configuration
 * 
 * @param {RequestParams} params - Request parameters
 * @returns {Promise<Response>} JSON response with song list
 */
// @ts-ignore
export async function GET({ params, url, locals, fetch, request }) {
  return handlePlayRequest({ params, url, locals, fetch, request });
}

// @ts-ignore
export async function POST({ params, url, locals, fetch, request }) {
  return handlePlayRequest({ params, url, locals, fetch, request });
}

/**
 * Handle both GET and POST requests for play route
 */
async function handlePlayRequest({ params, url, locals, fetch, request }) {
  const { quizId } = params;
  const seedParam = url.searchParams.get('seed');
  const format = url.searchParams.get('format'); // 'full' for full objects, otherwise just IDs

  console.log(`[API: Play Quiz] Request for quiz ${quizId}, seed: ${seedParam || 'auto-generate'}, format: ${format || 'ids'}`);

  /**
   * Filter songs to only include UI-displayed properties
   * Used when format='full' to reduce payload size
   */
  const filterSongProperties = (songs) => songs.map(song => ({
    annSongId: song.annSongId,
    animeENName: song.animeENName,
    songName: song.songName,
    songArtist: song['songArtist'],
    songType: song.songType,
    animeType: song.animeType,
    songDifficulty: song.songDifficulty,
    songCategory: song.songCategory
  }));

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Try to fetch quiz by ID first, then by play token
    let quiz;
    let dbError;

    // First try by ID
    const { data: quizById, error: errorById } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, name, description, creator_username, is_public, configuration_data, created_at')
      .eq('id', quizId)
      .single();

    if (!errorById && quizById) {
      quiz = quizById;
    } else {
      // Try by play token
      const { data: quizByToken, error: errorByToken } = await supabaseAdmin
        .from('quiz_configurations')
        .select('id, user_id, name, description, creator_username, is_public, configuration_data, created_at')
        .eq('play_token', quizId)
        .single();

      if (!errorByToken && quizByToken) {
        quiz = quizByToken;
      } else {
        dbError = errorByToken;
      }
    }

    if (dbError || !quiz) {
      console.error('[API: Play Quiz] Quiz not found:', dbError);
      return error(404, { message: 'Quiz not found' });
    }

    // Check permissions: public quizzes accessible to all, private only to owner or via play token
    if (!quiz.is_public) {
      const { session, user } = await locals.safeGetSession();
      if (!session || !user || quiz.user_id !== user.id) {
        // Check if this is a play token access
        const { data: playQuiz } = await supabaseAdmin
          .from('quiz_configurations')
          .select('id')
          .eq('play_token', quizId)
          .single();

        if (!playQuiz) {
          console.error('[API: Play Quiz] Access denied for private quiz');
          return error(403, { message: 'Access denied' });
        }
      }
    }

    // Simulate configuration to get resolved settings
    const configs = {
      ROUTER_CONFIG,
      BASIC_SETTINGS_CONFIG,
      NUMBER_OF_SONGS_CONFIG,
      FILTER_NODE_DEFINITIONS
    };

    console.log('[API: Play Quiz] Simulating and generating songs...');

    // Check for live node data in POST request
    let liveNodeData = null;
    if (request && request.method === 'POST') {
      try {
        const body = await request.json();
        liveNodeData = body.liveNodeData || null;
        if (liveNodeData) {
          console.log('[API: Play Quiz] Received live node data:', JSON.stringify(liveNodeData, null, 2));
          console.log('[API: Play Quiz] Live node data summary:', {
            useEntirePool: liveNodeData.useEntirePool || false,
            userEntriesCount: liveNodeData.userEntries?.length || 0,
            userEntries: liveNodeData.userEntries?.map(e => ({
              username: e.username,
              platform: e.platform,
              selectedLists: e.selectedLists,
              hasPercentage: !!e.songPercentage,
              percentageType: e.songPercentage?.random ? 'random' : 'static',
              percentageValue: e.songPercentage?.random ?
                `${e.songPercentage.min}-${e.songPercentage.max}%` :
                `${e.songPercentage?.value || 0}%`
            })) || []
          });
        }
      } catch (e) {
        console.warn('[API: Play Quiz] Failed to parse POST body for live node data:', e);
      }
    }

    // Merge live node data into quiz configuration if provided
    let configurationData = quiz.configuration_data;
    if (liveNodeData && liveNodeData.userEntries) {
      // Find live node nodes and update them with live data
      const nodes = [...configurationData.nodes];
      const liveNodes = nodes.filter(n => n.data?.id === 'live-node');

      // Only merge if there are actually live nodes in the quiz
      if (liveNodes.length > 0) {
        for (const liveNode of liveNodes) {
          // Update userEntries with live data
          liveNode.data.currentValue = {
            ...liveNode.data.currentValue,
            useEntirePool: liveNodeData.useEntirePool || false,
            userEntries: liveNodeData.userEntries,
            songSelectionMode: liveNodeData.songSelectionMode || 'default'
          };
        }

        configurationData = {
          ...configurationData,
          nodes: nodes
        };

        console.log('[API: Play Quiz] Merged live node data into configuration');
      } else {
        console.log('[API: Play Quiz] Live node data provided but no live nodes found in quiz, ignoring');
      }
    }

    const simulatedConfig = simulateQuizConfiguration(
      configurationData.nodes,
      configurationData.edges,
      configs,
      seedParam
    );

    // Generate songs with retry logic built-in
    const result = await generateQuizSongs(simulatedConfig, fetch, seedParam);

    const { songs, metadata } = result;

    // Check for loading errors
    const hasLoadingErrors = metadata.loadingErrors && metadata.loadingErrors.length > 0;

    // Check if generation had actual errors (no songs AND critical loading failures)
    const hasCriticalError = songs.length === 0 && hasLoadingErrors && metadata.sourceSongCount === 0;

    // Check if generation was unsuccessful (insufficient songs but not a critical error)
    const hasInsufficientSongs = !metadata.success && songs.length > 0;

    // Handle critical errors (actual failures that prevent generation)
    if (hasCriticalError) {
      console.error('[API: Play Quiz] Critical error: failed to load song lists');

      const errorType = 'song_list_error';

      // Format detailed error message with all loading errors
      const errorDetails = [];
      if (metadata.loadingErrors && metadata.loadingErrors.length > 0) {
        errorDetails.push('Failed to load song lists:');
        metadata.loadingErrors.forEach((err, idx) => {
          errorDetails.push(`  ${idx + 1}. ${err.listInfo}: ${err.error}`);
        });
      }
      const userMessage = errorDetails.length > 0
        ? errorDetails.join('\n')
        : 'Failed to load song lists';

      // Return error regardless of format for critical errors
      // Filter songs if format is 'full' to reduce payload size
      const errorSongs = format === 'full' ? filterSongProperties(songs) : songs;
      return json({
        success: false,
        errorType: errorType,
        userMessage: userMessage,
        songs: errorSongs,
        songCount: errorSongs.length,
        technicalDetails: {
          targetCount: metadata.targetCount,
          finalCount: metadata.finalCount,
          sourceSongCount: metadata.sourceSongCount,
          eligibleSongCount: metadata.eligibleSongCount,
          failedBaskets: metadata.failedBaskets,
          basketStatus: metadata.basketStatus,
          filterStatistics: metadata.filterStatistics,
          loadingErrors: metadata.loadingErrors
        }
      }, { status: 422 });
    }

    // Handle insufficient songs: return error only when format is 'full' (for UI)
    // For other formats (AMQ integration), return whatever songs we got
    if (hasInsufficientSongs) {
      console.warn(`[API: Play Quiz] Insufficient songs: ${songs.length}/${metadata.targetCount}`);

      // Determine error type and create user-friendly message
      let errorType = 'insufficient_songs';
      let userMessage = 'Not enough songs matched your filter settings.';

      if (metadata.eligibleSongCount === 0) {
        errorType = 'no_eligible_songs';
        userMessage = 'No songs matched your filter combination. Try relaxing some filters.';
      } else if (metadata.failedBaskets && metadata.failedBaskets.length > 0) {
        errorType = 'basket_distribution_failed';
        userMessage = `Unable to find enough songs for ${metadata.failedBaskets.length} requirement(s). Try adjusting your distribution settings.`;
      } else if (metadata.eligibleSongCount < metadata.targetCount) {
        userMessage = `Only ${metadata.eligibleSongCount} songs available, but ${metadata.targetCount} requested. Try reducing the number of songs or relaxing filters.`;
      }

      // If format is 'full', return error to UI
      if (format === 'full') {
        // Filter songs to only include UI-displayed properties
        const filteredSongs = filterSongProperties(songs);
        return json({
          success: false,
          errorType: errorType,
          userMessage: userMessage,
          songs: filteredSongs, // Include whatever songs were found
          songCount: filteredSongs.length,
          technicalDetails: {
            targetCount: metadata.targetCount,
            finalCount: metadata.finalCount,
            sourceSongCount: metadata.sourceSongCount,
            eligibleSongCount: metadata.eligibleSongCount,
            failedBaskets: metadata.failedBaskets,
            basketStatus: metadata.basketStatus,
            filterStatistics: metadata.filterStatistics,
            loadingErrors: metadata.loadingErrors
          }
        }, { status: 422 });
      }

      // For non-full format, continue and return whatever songs we got
      // (fall through to normal success handling below)
    }

    // Handle case where we got zero songs but it's not a critical error
    // (might be filter mismatch or other non-critical issue)
    if (songs.length === 0 && !hasCriticalError) {
      console.warn('[API: Play Quiz] No songs generated (no critical errors)');

      let errorType = 'no_eligible_songs';
      let userMessage = 'No songs matched your filter combination. Try relaxing some filters.';

      if (format === 'full') {
        // Filter songs to only include UI-displayed properties (empty array in this case)
        const filteredSongs = filterSongProperties(songs);
        return json({
          success: false,
          errorType: errorType,
          userMessage: userMessage,
          songs: filteredSongs,
          songCount: 0,
          technicalDetails: {
            targetCount: metadata.targetCount,
            finalCount: metadata.finalCount,
            sourceSongCount: metadata.sourceSongCount,
            eligibleSongCount: metadata.eligibleSongCount,
            failedBaskets: metadata.failedBaskets,
            basketStatus: metadata.basketStatus,
            filterStatistics: metadata.filterStatistics,
            loadingErrors: metadata.loadingErrors
          }
        }, { status: 422 });
      }

      // For non-full format, return empty quiz result (no songs but no error response)
      // This allows AMQ integration to handle empty quiz gracefully
      // Return empty AMQ command structure
      return json({
        command: {
          command: "save quiz",
          type: "quizCreator",
          data: {
            quizSave: {
              name: "AMQ+ " + quiz.name,
              description: "Imported from AMQ+",
              tags: [],
              ruleBlocks: [{
                randomOrder: false,
                songCount: 0,
                guessTime: {
                  guessTime: typeof simulatedConfig.basicSettings.guessTime === 'number'
                    ? simulatedConfig.basicSettings.guessTime
                    : simulatedConfig.basicSettings.guessTime?.kind === 'range'
                      ? simulatedConfig.basicSettings.guessTime.min // Use min for range in empty quiz
                      : simulatedConfig.basicSettings.guessTime?.value ?? 20,
                  extraGuessTime: typeof simulatedConfig.basicSettings.extraGuessTime === 'number'
                    ? simulatedConfig.basicSettings.extraGuessTime
                    : simulatedConfig.basicSettings.extraGuessTime?.kind === 'range'
                      ? simulatedConfig.basicSettings.extraGuessTime.min // Use min for range in empty quiz
                      : simulatedConfig.basicSettings.extraGuessTime?.value ?? 0
                },
                samplePoint: {
                  samplePoint: [
                    simulatedConfig.basicSettings.samplePoint?.value ?? 20,
                    simulatedConfig.basicSettings.samplePoint?.value ?? 20
                  ]
                },
                playBackSpeed: {
                  playBackSpeed: simulatedConfig.basicSettings.playbackSpeed
                },
                blocks: [],
                duplicates: true // Always true for custom quizzes
              }]
            },
            quizId: null
          }
        }
      });
    }

    // Partial success: we got songs but there were loading errors
    // Handle this after checking insufficient songs, as we want to return songs regardless
    if (hasLoadingErrors && format === 'full') {
      console.warn('[API: Play Quiz] Partial success - generated songs but some lists failed to load');
      // Filter songs to only include UI-displayed properties
      const filteredSongs = filterSongProperties(songs);
      // Return 200 with a warning for full format
      return json({
        success: true,
        songs: filteredSongs,
        songCount: filteredSongs.length,
        warning: `Some song lists failed to load, but ${filteredSongs.length} songs were successfully generated.`,
        loadingErrors: metadata.loadingErrors,
        metadata: metadata
      });
    }
    // For non-full format, continue to normal return (songs will be included below)

    // Update last played timestamp (if column exists)
    try {
      await supabaseAdmin
        .from('quiz_configurations')
        .update({ last_played_at: new Date().toISOString() })
        .eq('id', quiz.id);
    } catch (updateError) {
      // Column might not exist yet, ignore the error
      console.log('[API: Play Quiz] last_played_at column not available, skipping update');
    }

    console.log(`[API: Play Quiz] Successfully generated ${songs.length} songs after ${metadata.attempts} attempt(s)`);

    // Return format based on request parameter
    if (format === 'full') {
      // Return only essential song properties for ExportSimulationModal UI
      // Only include properties actually displayed in the "Save Quiz Selected Songs" generator
      const filteredSongs = filterSongProperties(songs);
      return json({ success: true, songs: filteredSongs, songCount: filteredSongs.length, metadata });
    } else {
      // Build AMQ command using shared logic
      const command = buildQuizCommand({
        songs: songs,
        simulatedConfig: simulatedConfig,
        quizName: "AMQ+ " + quiz.name,
        quizDescription: quiz.description || "Imported from AMQ+",
        seed: seedParam // Use seed from query param if provided
      });

      // Filter songSourceMap to only include annSongIds actually used in the quiz
      // Preserve the order of songs as they appear in the quiz blocks
      const quizSave = command.data.quizSave;
      const orderedAnnSongIds = [];
      quizSave.ruleBlocks.forEach(ruleBlock => {
        if (ruleBlock.blocks && Array.isArray(ruleBlock.blocks)) {
          ruleBlock.blocks.forEach(block => {
            if (block.annSongId) {
              orderedAnnSongIds.push(block.annSongId);
            }
          });
        }
      });

      // Create a map from annSongId to source info for quick lookup
      const sourceMapByAnnSongId = new Map();
      (metadata.songSourceMap || []).forEach(entry => {
        if (entry.annSongId) {
          sourceMapByAnnSongId.set(entry.annSongId, entry);
        }
      });

      // Build filtered songSourceMap in the same order as quiz blocks
      const filteredSongSourceMap = orderedAnnSongIds
        .map(annSongId => sourceMapByAnnSongId.get(annSongId))
        .filter(entry => entry !== undefined); // Remove any missing entries

      console.log(`[API: Play Quiz] Filtered songSourceMap: ${filteredSongSourceMap.length} entries (from ${metadata.songSourceMap?.length || 0} total), ordered by quiz blocks`);

      return json({
        command: command,
        songSourceMap: filteredSongSourceMap
      });
    }
  } catch (err) {
    console.error('[API: Play Quiz] Error generating quiz songs:', err);

    // Return structured error for API/network failures
    return json({
      success: false,
      errorType: 'api_error',
      userMessage: 'An unexpected error occurred while generating songs. Please try again.',
      technicalDetails: {
        error: err.message,
        stack: err.stack
      }
    }, { status: 500 });
  }
}

