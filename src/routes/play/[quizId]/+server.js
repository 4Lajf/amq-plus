/**
 * Play Quiz API endpoint
 * Generates and returns the song list for a quiz configuration
 * 
 * @module play/[quizId]
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateQuizSongs } from '$lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '$lib/utils/simulation.js';
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
    animeRomajiName: song.animeRomajiName,
    animeJPName: song.animeJPName,
    songName: song.songName,
    songArtist: song['songArtist'],
    songType: song.songType,
    animeType: song.animeType,
    songDifficulty: song.songDifficulty,
    songCategory: song.songCategory,
    // Include audio fields for preview playback
    audio: song.audio,
    HQ: song.HQ
  }));

  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Fetch quiz by play token only
    const { data: quiz, error: dbError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, name, description, creator_username, is_public, configuration_data, created_at')
      .eq('play_token', quizId)
      .single();

    if (dbError || !quiz) {
      console.error('[API: Play Quiz] Quiz not found by play token:', quizId, dbError);
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

    console.log('[API: Play Quiz] Simulating and generating songs...');

    // Check for live node data and roomId in POST request
    let liveNodeData = null;
    let roomId = null;
    if (request && request.method === 'POST') {
      try {
        const body = await request.json();
        liveNodeData = body.liveNodeData || null;
        roomId = body.roomId || null;
        if (liveNodeData) {
          console.log('[API: Play Quiz] Received live node data:', JSON.stringify(liveNodeData, null, 2));
        }
        if (roomId) {
          console.log(`[API: Play Quiz] Received roomId: ${roomId}`);
        }
      } catch (e) {
        console.warn('[API: Play Quiz] Failed to parse POST body for live node data:', e);
      }
    }

    const routes = quiz.configuration_data?.routes || [];

    // Merge live node data into route sources directly
    if (liveNodeData && liveNodeData.userEntries) {
      let found = false;
      for (const route of routes) {
        for (const src of (route.sources || [])) {
          if (src.sourceType === 'live-node') {
            src.useEntirePool = liveNodeData.useEntirePool || false;
            src.userEntries = liveNodeData.userEntries;
            src.songSelectionMode = liveNodeData.songSelectionMode || 'default';
            found = true;
          }
        }
      }
      if (found) {
        console.log('[API: Play Quiz] Merged live node data into route sources');
      } else {
        console.log('[API: Play Quiz] Live node data provided but no live-node sources found, ignoring');
      }
    }

    const simulatedConfig = simulateQuizFromRoutes(routes, seedParam);

    // Prevent Same Song Spam Logic
    let excludedAnnSongIds = [];
    const preventSameSongSpam = simulatedConfig.basicSettings?.preventSameSongSpam === true;

    if (preventSameSongSpam && roomId) {
      try {
        const { data: historyData, error: historyError } = await supabaseAdmin
          .from('quiz_lobby_song_history')
          .select('"annSongId"')
          .eq('room_id', roomId)
          .order('played_at', { ascending: false })
          .limit(100);

        if (historyError) {
          console.error('[API: Play Quiz] Error fetching song history:', historyError);
        } else if (historyData) {
          excludedAnnSongIds = historyData.map(h => h.annSongId);
          console.log(`[API: Play Quiz] Found ${excludedAnnSongIds.length} recently played songs to exclude (Prevent Same Song Spam enabled)`);
        }
      } catch (err) {
        console.error('[API: Play Quiz] Failed to fetch song history:', err);
      }
    } else if (preventSameSongSpam && !roomId && format !== 'full') {
      console.warn('[API: Play Quiz] Prevent Same Song Spam is enabled but no roomId provided - skipping history check');
    }

    // Generate songs with retry logic built-in
    const result = await generateQuizSongs(simulatedConfig, fetch, seedParam, excludedAnnSongIds);

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
          constraintFeasibleSongCount: metadata.constraintFeasibleSongCount,
          constraintUniqueAnimeCount: metadata.constraintUniqueAnimeCount,
          constraintFeasibleCap: metadata.constraintFeasibleCap,
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
      } else if (typeof metadata.constraintFeasibleCap === 'number' && metadata.constraintFeasibleCap < metadata.targetCount) {
        userMessage = `Only ${metadata.constraintFeasibleCap} songs satisfy all active constraints${metadata.constraintUniqueAnimeCount !== null && metadata.constraintUniqueAnimeCount !== undefined ? ` (unique anime cap: ${metadata.constraintUniqueAnimeCount})` : ''}, but ${metadata.targetCount} were requested.`;
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
            constraintFeasibleSongCount: metadata.constraintFeasibleSongCount,
            constraintUniqueAnimeCount: metadata.constraintUniqueAnimeCount,
            constraintFeasibleCap: metadata.constraintFeasibleCap,
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
            constraintFeasibleSongCount: metadata.constraintFeasibleSongCount,
            constraintUniqueAnimeCount: metadata.constraintUniqueAnimeCount,
            constraintFeasibleCap: metadata.constraintFeasibleCap,
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
      // console.log('[API: Play Quiz] last_played_at column not available, skipping update');
    }

    // console.log(`[API: Play Quiz] Successfully generated ${songs.length} songs after ${metadata.attempts} attempt(s)`);

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

      // Record song history if enabled (only for actual plays, not UI previews)
      // Use orderedAnnSongIds which contains only the songs that made it into the final quiz
      if (preventSameSongSpam && roomId && orderedAnnSongIds.length > 0) {
        // Prepare rows to insert - only use the final selected songs
        const historyRows = orderedAnnSongIds
          .filter(annSongId => annSongId) // Only insert songs with IDs
          .map(annSongId => ({
            quiz_id: quiz.id,
            room_id: roomId,
            "annSongId": String(annSongId),
            played_at: new Date().toISOString()
          }));

        if (historyRows.length > 0) {
          // Fire and forget insert
          supabaseAdmin
            .from('quiz_lobby_song_history')
            .insert(historyRows)
            .then(({ error }) => {
              if (error) console.error('[API: Play Quiz] Error updating song history:', error);
              else console.log(`[API: Play Quiz] Added ${historyRows.length} songs to lobby history`);
            })
            // @ts-ignore
            .catch(err => {
              console.error('[API: Play Quiz] Exception updating song history:', err);
            });
        }
      }

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

      // console.log(`[API: Play Quiz] Filtered songSourceMap: ${filteredSongSourceMap.length} entries (from ${metadata.songSourceMap?.length || 0} total), ordered by quiz blocks`);

      // Build filtered songOverlapMap for duel mode (list of users who know each song)
      const overlapMapByAnnSongId = new Map();
      (metadata.songOverlapMap || []).forEach(entry => {
        if (entry.annSongId) {
          overlapMapByAnnSongId.set(entry.annSongId, entry);
        }
      });

      const filteredSongOverlapMap = orderedAnnSongIds
        .map(annSongId => overlapMapByAnnSongId.get(annSongId))
        .filter(entry => entry !== undefined);

      return json({
        command: command,
        songSourceMap: filteredSongSourceMap,
        songOverlapMap: filteredSongOverlapMap // Array of {annSongId, hasAnimeUsernames} for duel mode
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

