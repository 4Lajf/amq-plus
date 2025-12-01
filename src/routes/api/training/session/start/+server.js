/**
 * POST /api/training/session/start
 * Start a new training session
 * Computes optimized playlist using FSRS algorithm
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { verifyToken } from '$lib/server/training/training-utils.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';
import { generateQuizSongs } from '$lib/server/songFiltering.js';
import { simulateQuizConfiguration } from '$lib/components/amqplus/editor/utils/simulationUtils.js';
import { buildQuizCommand } from '$lib/server/quiz-command-builder.js';

// @ts-ignore
export async function POST({ request, url }) {
  // Create a fetch wrapper that converts relative URLs to absolute URLs
  // This is needed because server-side fetch requires absolute URLs
  const origin = url.origin;
  const serverFetch = (input, init) => {
    let urlString;
    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof Request) {
      urlString = input.url;
    } else {
      urlString = input.toString();
    }
    const absoluteUrl = urlString.startsWith('http') ? urlString : `${origin}${urlString}`;
    return fetch(absoluteUrl, init);
  };

  const supabaseAdmin = createSupabaseAdmin();

  try {
    const { token, quizId, sessionLength = 20, mode = 'auto', dueSongPercentage = 70, dueCount = null, newCount = null, revisionCount = null } = await request.json();

    console.log('[TRAINING SESSION] ========================================');
    console.log('[TRAINING SESSION] New session request received');
    console.log('[TRAINING SESSION] Quiz ID:', quizId);
    console.log('[TRAINING SESSION] Requested session length:', sessionLength, 'songs');
    console.log('[TRAINING SESSION] Mode:', mode);

    if (mode === 'manual') {
      console.log('[TRAINING SESSION] Manual distribution: due=' + dueCount + ', new=' + newCount + ', revision=' + revisionCount);
    } else {
      console.log('[TRAINING SESSION] Auto distribution: ' + dueSongPercentage + '% due, ' + (100 - dueSongPercentage) + '% new');
    }

    if (!token || !quizId) {
      console.log('[TRAINING SESSION] ❌ Missing required parameters');
      return json({ error: 'Token and quizId required' }, { status: 400 });
    }

    // Validate session length
    if (sessionLength < 1 || sessionLength > 100) {
      console.log('[TRAINING SESSION] ❌ Invalid session length:', sessionLength);
      return json({ error: 'Session length must be between 1 and 100' }, { status: 400 });
    }

    // Validate parameters based on mode
    if (mode === 'auto') {
      if (dueSongPercentage < 0 || dueSongPercentage > 100) {
        console.log('[TRAINING SESSION] ❌ Invalid due song percentage:', dueSongPercentage);
        return json({ error: 'Due song percentage must be between 0 and 100' }, { status: 400 });
      }
    }

    // Verify token
    console.log('[TRAINING SESSION] Verifying authentication token...');
    const { data: tokens } = await supabaseAdmin
      .from('training_tokens')
      .select('*');

    let validToken = null;
    for (const dbToken of tokens || []) {
      const isValid = await verifyToken(token, dbToken.token_hash);
      if (isValid) {
        validToken = dbToken;
        break;
      }
    }

    if (!validToken) {
      console.log('[TRAINING SESSION] ❌ Token validation failed');
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = validToken.user_id;
    console.log('[TRAINING SESSION] ✓ Token validated for user:', userId);

    // Fetch quiz configuration
    console.log('[TRAINING SESSION] Fetching quiz configuration...');
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('*')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      console.log('[TRAINING SESSION] ❌ Quiz not found:', quizId);
      return json({ error: 'Quiz not found' }, { status: 404 });
    }

    console.log('[TRAINING SESSION] ✓ Quiz loaded:', quiz.name);

    // Generate ALL possible songs from quiz configuration respecting all rules
    console.log('[TRAINING SESSION] Simulating quiz configuration...');
    const configData = quiz.configuration_data;
    const simulatedConfig = simulateQuizConfiguration(
      configData.nodes || [],
      configData.edges || [],
      configData.configs || {}
    );

    // Set a high number to get all possible songs that match the quiz rules
    // FSRS will then select up to sessionLength songs from this pool
    // We use a very high number to ensure we get all eligible songs
    simulatedConfig.numberOfSongs = 10000; // High number to get all possible songs

    // Scale watched/random proportionally while keeping the same ratio
    // If quiz uses only watched songs, we only increase watched count
    // If quiz uses only random songs, we only increase random count
    // If quiz uses both, we scale both proportionally
    if (simulatedConfig.songSelection) {
      const originalWatched = simulatedConfig.songSelection.watched || 0;
      const originalRandom = simulatedConfig.songSelection.random || 0;
      const originalTotal = originalWatched + originalRandom;

      if (originalTotal > 0) {
        // Scale up while maintaining the ratio
        const watchedRatio = originalWatched / originalTotal;
        const randomRatio = originalRandom / originalTotal;

        simulatedConfig.songSelection.watched = Math.round(10000 * watchedRatio);
        simulatedConfig.songSelection.random = Math.round(10000 * randomRatio);

        console.log('[TRAINING SESSION] Scaled song selection: watched=' + simulatedConfig.songSelection.watched +
          ', random=' + simulatedConfig.songSelection.random +
          ' (preserving ' + Math.round(watchedRatio * 100) + '/' + Math.round(randomRatio * 100) + ' ratio)');
      }
    }

    console.log('[TRAINING SESSION] Configuration simulated, requesting full song pool (up to 10000 songs)');

    // Flag training mode so song generation uses full pool without limiting to target counts
    simulatedConfig.trainingMode = true;

    // Generate songs using the same logic as regular quiz generation
    // This respects all filters, baskets, percentages, etc.
    // Pass serverFetch to handle relative URLs correctly
    console.log('[TRAINING SESSION] Generating song pool (respecting all quiz rules)...');
    const generationResult = await generateQuizSongs(simulatedConfig, serverFetch);

    if (!generationResult.songs || generationResult.songs.length === 0) {
      console.log('[TRAINING SESSION] ❌ No songs generated matching quiz rules');
      return json({ error: 'No songs found matching quiz rules. Try adjusting filters or check your quiz configuration.' }, { status: 400 });
    }

    // Use all generated songs as the pool - FSRS will select up to sessionLength songs
    const allSongs = generationResult.songs;
    console.log('[TRAINING SESSION] ✓ Song pool generated:', allSongs.length, 'songs available');

    // Fetch existing training progress
    console.log('[TRAINING SESSION] Fetching existing training progress...');
    const { data: progressRecords, error: progressError } = await supabaseAdmin
      .from('training_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId);

    if (progressError) {
      console.error('[TRAINING SESSION] ❌ Error fetching progress:', progressError);
      return json({ error: 'Failed to fetch training progress' }, { status: 500 });
    }

    console.log('[TRAINING SESSION] ✓ Progress loaded:', progressRecords?.length || 0, 'songs with history');

    // Calculate daily due cap and usage
    let remainingDueCapacity = 9999; // Default unlimited

    if (mode === 'auto') {
      // 1. Get latest completed session for daily cap
      const { data: lastSession } = await supabaseAdmin
        .from('training_sessions')
        .select('total_songs, ended_at')
        .eq('user_id', userId)
        .eq('quiz_id', quizId)
        .not('ended_at', 'is', null)
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle to handle no results gracefully

      const dailyDueCap = lastSession ? lastSession.total_songs : 20; // Default to 20 if no last session
      console.log('[TRAINING SESSION] Daily due cap:', dailyDueCap, lastSession ? '(from last session)' : '(default)');

      // 2. Calculate due songs scheduled today
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const { data: todaySessions } = await supabaseAdmin
        .from('training_sessions')
        .select('session_data')
        .eq('user_id', userId)
        .eq('quiz_id', quizId)
        .gte('started_at', todayStart.toISOString())
        .lte('started_at', todayEnd.toISOString());

      let dueScheduledToday = 0;
      todaySessions?.forEach(session => {
        // Safely access nested properties
        const due = session.session_data?.composition?.due || 0;
        dueScheduledToday += due;
      });

      console.log('[TRAINING SESSION] Due scheduled today:', dueScheduledToday);

      remainingDueCapacity = Math.max(0, dailyDueCap - dueScheduledToday);
      console.log('[TRAINING SESSION] Remaining due capacity:', remainingDueCapacity);
    }

    // Compute session playlist using FSRS
    // FSRS will select up to sessionLength songs from allSongs pool using configurable split
    console.log('[TRAINING SESSION] Computing FSRS-optimized playlist...');
    console.log('[TRAINING SESSION] Input: pool size =', allSongs.length, ', max session length =', sessionLength);
    const result = trainingScheduler.computeSessionPlaylist(
      progressRecords || [],
      allSongs,
      sessionLength,
      mode === 'auto'
        ? { mode: 'auto', remainingDueCapacity, maxNewPercentage: 30 }
        : { mode: 'manual', dueSongPercentage }
    );

    const playlist = result.playlist;
    const metadata = result.metadata;

    console.log('[TRAINING SESSION] ✓ Playlist computed:', playlist.length, 'songs selected');
    console.log('[TRAINING SESSION] Requested:', metadata.requested.dueCount, 'due,', metadata.requested.newCount, 'new');
    console.log('[TRAINING SESSION] Actual:', metadata.actual.dueCount, 'due,',
      metadata.actual.newCount, 'new,', metadata.actual.revisionCount, 'revision');

    // Validate that all songs have annSongId (safety check)
    const invalidSongs = playlist.filter(song => !song.annSongId);
    if (invalidSongs.length > 0) {
      console.error('[TRAINING SESSION] ❌ Found', invalidSongs.length, 'songs without annSongId:');
      invalidSongs.forEach(song => {
        console.error('[TRAINING SESSION]   -', song.annSongId || 'unknown');
      });
      return json({
        error: `${invalidSongs.length} songs are missing required data and cannot be played. This usually happens when songs have been removed from the quiz.`,
        invalidCount: invalidSongs.length
      }, { status: 500 });
    }

    // Log warnings if any
    if (metadata.warnings.length > 0) {
      console.log('[TRAINING SESSION] ⚠ Warnings:');
      metadata.warnings.forEach(warning => {
        console.log('[TRAINING SESSION]   -', warning);
      });
    }

    // Create training session record
    console.log('[TRAINING SESSION] Creating session record in database...');
    const sessionData = {
      sessionLength,
      playlistGenerated: new Date().toISOString(),
      mode: mode,
      composition: {
        due: metadata.actual.dueCount,
        new: metadata.actual.newCount,
        revision: metadata.actual.revisionCount
      },
      poolDistribution: {
        available: {
          due: metadata.available.dueCount,
          new: metadata.available.newCount,
          revision: metadata.available.revisionCount,
          total: metadata.available.totalPoolSize
        },
        selected: {
          due: metadata.actual.dueCount,
          new: metadata.actual.newCount,
          revision: metadata.actual.revisionCount
        }
      }
    };

    // Add mode-specific settings
    if (mode === 'manual') {
      sessionData.manualSettings = {
        dueCount,
        newCount,
        revisionCount
      };
    } else {
      sessionData.dueSongPercentage = dueSongPercentage;
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('training_sessions')
      .insert({
        user_id: userId,
        quiz_id: quizId,
        total_songs: playlist.length,
        session_data: sessionData
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('[TRAINING SESSION] ❌ Error creating session:', sessionError);
      return json({ error: 'Failed to create training session' }, { status: 500 });
    }

    console.log('[TRAINING SESSION] ✓ Session created with ID:', session.id);

    // Return session info and playlist
    console.log('[TRAINING SESSION] ✓ Session ready! Returning playlist to client');

    // Build AMQ command object using shared logic (handles ranges, per-song settings, etc.)
    const command = buildQuizCommand({
      songs: playlist,
      simulatedConfig: simulatedConfig,
      quizName: `AMQ+ ${quiz.name}`,
      quizDescription: `Training session with ${playlist.length} songs (${metadata.actual.dueCount} already played, ${metadata.actual.newCount} new)`,
      seed: null // Generate new random seed for each training session
    });

    console.log('[TRAINING SESSION] ========================================');

    // Create playlist metadata for client-side progress tracking
    const playlistMetadata = playlist.map(song => ({
      annSongId: song.annSongId,
      songArtist: song.songArtist,
      songName: song.songName,
      songKey: `${song.songArtist}_${song.songName}` // Proper song key format
    }));

    return json({
      sessionId: session.id,
      quizId,
      quizName: quiz.name,
      command: command,
      playlist: playlistMetadata, // Include playlist metadata for client-side tracking
      totalSongs: playlist.length,
      composition: {
        due: metadata.actual.dueCount,
        new: metadata.actual.newCount,
        revision: metadata.actual.revisionCount,
        duePercentage: metadata.actual.duePercentage,
        newPercentage: metadata.actual.newPercentage,
        revisionPercentage: metadata.actual.revisionPercentage
      },
      warnings: mode === 'auto' ? [] : metadata.warnings, // Hide warnings in auto mode
      available: {
        due: metadata.available.dueCount,
        new: metadata.available.newCount,
        revision: metadata.available.revisionCount,
        totalPoolSize: metadata.available.totalPoolSize
      }
    });
  } catch (error) {
    console.error('[TRAINING SESSION] ❌ Unexpected error:', error);
    console.error('[TRAINING SESSION] Error stack:', error.stack);
    console.log('[TRAINING SESSION] ========================================');
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

