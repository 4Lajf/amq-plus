/**
 * Build a training session playlist + AMQ command.
 * Used by the async session-start job runner (Phase 2.1).
 *
 * @module lib/server/training/sessionStartService
 */

import { planPoolSync, applyPoolSync } from '$lib/server/training/pool-sync.js';
import { getPoolGenerationError } from '$lib/server/training/pool-generation-error.js';
import { QuizSourceError, QuizSourceLoadError } from '$lib/server/quiz-source-error.js';
import { trainingScheduler } from '$lib/server/training/fsrs-service.js';
import { generateQuizSongs } from '$lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '$lib/utils/simulation.js';
import { buildQuizCommand } from '$lib/server/quiz-command-builder.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { setSessionJobMessage } from '$lib/server/training/session-jobs.js';
import { extractSongListIds } from '$lib/server/song-list-utils.js';
import { utcStartOfDay, utcEndOfDay } from '$lib/utils/day-boundary.js';
import { MIN_CONNECTOR_VERSION } from '$lib/server/training/connector-version.js';
import { buildDuplicateGroups } from '$lib/server/training/duplicate-groups.js';
import {
  buildResolvedConfigStamp,
  buildSongPoolCacheKey,
  getCachedSongPool,
  setCachedSongPool
} from '$lib/server/training/song-pool-cache.js';

/**
 * How much of today's due/new budget has actually been spent.
 *
 * This used to sum `session_data.composition` - what each session *planned* to
 * show. Planning is not playing: measured over 30 days and 3,976 sessions, 9.1%
 * of sessions never play a single song (burning 7.2% of the planned new budget
 * on their own), a further 10.6% play under half, and only 82.3% of planned
 * songs are ever played. So the budgets over-counted by roughly a fifth, and
 * opening a session and backing out cost a user the rest of their day.
 *
 * Sessions now persist `playlistReasons` alongside `playlistAnnSongIds`, so each
 * recorded play can be attributed to the bucket that scheduled it. Only `due`
 * and `new` are counted; extra-practice plays do not count against either
 * limit. Historical `shelved` reasons are likewise ignored.
 *
 * Sessions written before `playlistReasons` existed fall back to their planned
 * composition - the old, stricter behaviour - because their plays cannot be
 * attributed. That path empties out on its own within a day.
 *
 * The window is "sessions started today", unchanged: plays belonging to a
 * session started yesterday are not counted, exactly as before.
 *
 * @param {Array<{id: string, session_data: Object}>} todaySessions
 * @param {Array<{song_ann_id: number, session_id: string}>} playsToday
 * @returns {{due: number, new: number, legacyDue: number, legacyNew: number}}
 */
export function countDailyBudgetSpend(todaySessions, playsToday) {
  const playedBySession = new Map();
  for (const play of playsToday || []) {
    if (!play?.session_id || play.song_ann_id == null) continue;
    let songs = playedBySession.get(play.session_id);
    if (!songs) {
      songs = new Set();
      playedBySession.set(play.session_id, songs);
    }
    songs.add(Number(play.song_ann_id));
  }

  const spent = { due: 0, new: 0, legacyDue: 0, legacyNew: 0 };

  for (const session of todaySessions || []) {
    const data = session?.session_data || {};
    const annIds = data.playlistAnnSongIds;
    const reasons = data.playlistReasons;

    const attributable =
      Array.isArray(annIds) && Array.isArray(reasons) && annIds.length === reasons.length;

    if (!attributable) {
      const composition = data.composition || {};
      spent.legacyDue += composition.due || 0;
      spent.legacyNew += composition.new || 0;
      continue;
    }

    // First occurrence wins: a duplicate annSongId in one playlist is already
    // prevented upstream, and guessing between two reasons would be worse.
    const reasonBySong = new Map();
    annIds.forEach((annId, i) => {
      const key = Number(annId);
      if (!reasonBySong.has(key)) reasonBySong.set(key, reasons[i]);
    });

    for (const annId of playedBySession.get(session.id) || []) {
      const reason = reasonBySong.get(annId);
      if (reason === 'due') spent.due += 1;
      else if (reason === 'new') spent.new += 1;
    }
  }

  spent.due += spent.legacyDue;
  spent.new += spent.legacyNew;
  return spent;
}

/**
 * Due reviews actually played today, for the soft Daily Goal.
 *
 * Counts every due play, including the same song coming back later in the day.
 * New and extra-practice plays never move the goal. Historical `shelved`
 * reasons are ignored too.
 *
 * Sessions predating `playlistReasons` cannot attribute their plays, so they
 * fall back to planned composition exactly as the budget does.
 *
 * @param {Array<{id: string, session_data: Object}>} todaySessions
 * @param {Array<{song_ann_id: number, session_id: string}>} playsToday
 * @returns {number}
 */
export function countDailyGoalProgress(todaySessions, playsToday) {
  const playsBySession = new Map();
  for (const play of playsToday || []) {
    if (!play?.session_id || play.song_ann_id == null) continue;
    let songs = playsBySession.get(play.session_id);
    if (!songs) {
      songs = [];
      playsBySession.set(play.session_id, songs);
    }
    songs.push(Number(play.song_ann_id));
  }

  let due = 0;
  let legacyDue = 0;

  for (const session of todaySessions || []) {
    const data = session?.session_data || {};
    const annIds = data.playlistAnnSongIds;
    const reasons = data.playlistReasons;

    const attributable =
      Array.isArray(annIds) && Array.isArray(reasons) && annIds.length === reasons.length;

    if (!attributable) {
      legacyDue += (data.composition || {}).due || 0;
      continue;
    }

    const reasonBySong = new Map();
    annIds.forEach((annId, i) => {
      const key = Number(annId);
      if (!reasonBySong.has(key)) reasonBySong.set(key, reasons[i]);
    });

    for (const annId of playsBySession.get(session.id) || []) {
      if (reasonBySong.get(annId) === 'due') due += 1;
    }
  }

  return due + legacyDue;
}

/**
 * Plain-English reasons a session introduced fewer new songs than its settings
 * asked for.
 *
 * Both mechanisms were silent. `metadata.backlogThrottle` has existed since the
 * taper shipped and nothing ever read it, and the daily new-song limit — now 20
 * by default on every quiz — has no channel at all in auto mode, where the
 * warnings array is dropped. "Why did I only get one new song" had no answer on
 * screen in either case.
 *
 * These go into the session-start response's `warnings`, which the connector
 * already prints to chat on every version, so this needs no connector release.
 *
 * Pure so it can be tested; buildTrainingSession needs Supabase and cannot be.
 *
 * @param {Object} opts
 * @param {{pressure: number, fullShare: number, allowed: number}|null} [opts.backlogThrottle]
 * @param {number|null} [opts.dailyNewLimit] - configured cap, null = unlimited
 * @param {number} [opts.remainingNewCapacity] - budget left when the session was built
 * @param {number} [opts.newCount] - new songs actually selected
 * @returns {string[]}
 */
export function buildIntroductionNotes({
  backlogThrottle = null,
  dailyNewLimit = null,
  remainingNewCapacity = 9999,
  newCount = 0
} = {}) {
  const notes = [];

  if (backlogThrottle && backlogThrottle.allowed < backlogThrottle.fullShare) {
    notes.push(
      `Backlog is about ${backlogThrottle.pressure}× a session, so new songs are tapered to ` +
      `${backlogThrottle.allowed} this time (normally up to ${backlogThrottle.fullShare}). ` +
      `Clear some due songs and introductions speed back up.`
    );
  }

  if (dailyNewLimit !== null) {
    if (remainingNewCapacity <= 0) {
      notes.push(
        `Daily new-song limit reached (${dailyNewLimit} per day). No new songs this session. ` +
        `Resets at 00:00 UTC, or change it in the quiz's training settings.`
      );
    } else if (newCount >= remainingNewCapacity) {
      notes.push(
        remainingNewCapacity === dailyNewLimit
          ? `This session uses all ${dailyNewLimit} new songs allowed today. No more new songs until 00:00 UTC. Change the limit in the quiz's training settings.`
          : `Only ${remainingNewCapacity} new ${remainingNewCapacity === 1 ? 'song was' : 'songs were'} still allowed today, out of ${dailyNewLimit}. This session uses ${remainingNewCapacity === 1 ? 'it' : 'them'}. No more new songs until 00:00 UTC.`
      );
    }
  }

  return notes;
}

/**
 * @param {Object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseAdmin
 * @param {string} opts.userId
 * @param {Object} opts.quiz - quiz_configurations row
 * @param {Object} opts.params - validated start params
 * @param {typeof fetch} opts.serverFetch
 * @param {string} [opts.jobId]
 * `status` is set only when `ok` is false. This is one shape rather than an
 * `ok: true | ok: false` union because the project compiles with
 * `strictNullChecks` off, and discriminant narrowing needs it - the caller would
 * not be able to read `.status` off the failure branch.
 *
 * @returns {Promise<{ ok: boolean, status?: number, body: Object }>}
 */
export async function buildTrainingSession({ supabaseAdmin, userId, quiz, params, serverFetch, jobId = null }) {
  const {
    sessionLength = 20,
    mode = 'auto',
    dueSongPercentage = 70,
    newSongPercentage = 30,
    revisionSongPercentage = 0,
    dueCount = null,
    newCount = null,
    revisionCount = null
  } = params;
  const quizId = quiz.play_token;

  const progress = (message) => {
    if (jobId) setSessionJobMessage(jobId, message);
  };

  try {
    console.log('[TRAINING SESSION] ========================================');
    console.log('[TRAINING SESSION] Building session for quiz:', quizId, 'user:', userId);
    console.log('[TRAINING SESSION] Requested session length:', sessionLength, 'songs');
    console.log('[TRAINING SESSION] Mode:', mode);
    progress('Simulating quiz configuration…');

    // Generate ALL possible songs from quiz configuration respecting all rules
    console.log('[TRAINING SESSION] Simulating quiz configuration...');
    const simulatedConfig = simulateQuizFromRoutes(quiz.configuration_data?.routes || []);

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

    // Pool cache: skip Pixeldrain/filters on repeat starts for the same quiz+sources.
    const sourceListIds = extractSongListIds(quiz.configuration_data);
    let sourceLists = [];
    if (sourceListIds.length > 0) {
      const { data: lists } = await supabaseAdmin
        .from('song_lists')
        .select('id, updated_at, songs_list_link')
        .in('id', sourceListIds);
      sourceLists = lists || [];
    }
    // The resolved config has to be in the key: simulateQuizFromRoutes picks a
    // random route and re-rolls filter execution chances every call, so keying
    // on the quiz alone would pin one roll's pool for the whole TTL and serve
    // route A's songs alongside route B's settings.
    const poolCacheKey = buildSongPoolCacheKey(quiz.id, quiz.updated_at, sourceLists, {
      trainingMode: true,
      resolvedConfig: buildResolvedConfigStamp(simulatedConfig)
    });

    progress('Generating song pool…');
    let allSongs = getCachedSongPool(poolCacheKey);
    if (allSongs) {
      console.log('[TRAINING SESSION] ✓ Song pool cache hit:', allSongs.length, 'songs');
      progress(`Using cached pool (${allSongs.length} songs)…`);
    } else {
      console.log('[TRAINING SESSION] Generating song pool (respecting all quiz rules)...');
      const generationResult = await generateQuizSongs(simulatedConfig, serverFetch);
      const poolError = getPoolGenerationError(generationResult.metadata);
      if (poolError) return { ok: false, status: poolError.status, body: { error: poolError.message } };
      allSongs = generationResult.songs || [];
      if (allSongs.length > 0) {
        setCachedSongPool(poolCacheKey, allSongs);
        console.log('[TRAINING SESSION] ✓ Song pool generated and cached:', allSongs.length, 'songs');
      }
    }

    if (!allSongs || allSongs.length === 0) {
      console.log('[TRAINING SESSION] ❌ No songs generated matching quiz rules');
      return { ok: false, status: 400, body: { error: 'No songs found matching quiz rules. Try adjusting filters or check your quiz configuration.' } };
    }

    // Fetch existing training progress
    progress('Loading training progress…');
    console.log('[TRAINING SESSION] Fetching existing training progress...');
    const { data: progressRecords, error: progressError } = await fetchAllPages(() =>
      supabaseAdmin
        .from('training_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('quiz_id', quiz.id)
        .order('id', { ascending: true })
    );

    if (progressError) {
      console.error('[TRAINING SESSION] ❌ Error fetching progress:', progressError);
      return { ok: false, status: 500, body: { error: 'Failed to fetch training progress' } };
    }

    console.log('[TRAINING SESSION] ✓ Progress loaded:', progressRecords?.length || 0, 'songs with history');

    // Reconcile is_active against the pool we just generated. Same code as the
    // explicit "Refresh song pool" action, so the two cannot drift.
    console.log('[TRAINING SESSION] Syncing is_active status and shifting due dates...');
    const now = new Date();
    const syncPlan = planPoolSync(progressRecords, allSongs, now);
    await applyPoolSync(supabaseAdmin, syncPlan, now, '[TRAINING SESSION]');

    // "Today" is the UTC day, same boundary the scheduler uses.
    const todayStart = utcStartOfDay(now);
    const todayEnd = utcEndOfDay(now);

    // Songs already played today, so extra-practice filler doesn't hand them
    // straight back. Cheap now that (user_id, quiz_id) is indexed.
    let playedTodaySongIds = [];
    // Kept alongside the id list because the daily budgets below attribute each
    // play back to the session that scheduled it.
    let playsToday = [];
    {
      const { data: playRows, error: playsError } = await supabaseAdmin
        .from('training_session_plays')
        .select('song_ann_id, session_id')
        .eq('user_id', userId)
        .eq('quiz_id', quiz.id)
        .gte('played_at', todayStart.toISOString())
        .lte('played_at', todayEnd.toISOString());

      if (playsError) {
        console.warn('[TRAINING SESSION] ⚠ Could not load today\'s plays:', playsError.message);
      } else {
        playsToday = playRows || [];
        playedTodaySongIds = [...new Set(playsToday.map(p => p.song_ann_id).filter(id => id != null))];
        console.log('[TRAINING SESSION] Played today:', playedTodaySongIds.length, 'distinct songs');
      }
    }

    // Daily review + new-card budgets.
    //
    // This used to be `lastSession.total_songs` - i.e. the number of due songs
    // you were allowed to review in a whole day equalled the length of your last
    // session. Play one 50-song session and the rest of the day was capped at 0
    // due songs no matter how big the backlog was, and the empty slots got padded
    // with not-yet-due songs that were then pushed to tomorrow. That is the
    // "I played 2x50 rounds and the due count is identical" report.
    //
    // Now it is an explicit, opt-in per-quiz limit. Null (the default) means
    // unlimited, so every existing backlog becomes reachable immediately.
    //
    // The limit applies in manual mode too. It used to be computed only for
    // auto, which meant the setting silently did nothing the moment a user
    // opened Advanced Settings or pressed Catch Up - the UI promised a cap the
    // scheduler never applied. Default is unlimited, so this changes nothing
    // for anyone who has not set a limit.
    //
    // daily_new_limit is the complementary lever: cap introductions so a backlog
    // can drain. Auto mode also suppresses new reservation when due alone can
    // fill the session (see computeSessionPlaylist).
    //
    // Both budgets are charged for songs actually played, not songs planned -
    // see countDailyBudgetSpend for why and for the legacy-session fallback.
    let remainingDueCapacity = 9999; // Default unlimited
    let remainingNewCapacity = 9999;

    const dailyReviewLimit = quiz.daily_review_limit ?? null;
    const dailyNewLimit = quiz.daily_new_limit ?? null;

    if (dailyReviewLimit === null && dailyNewLimit === null) {
      console.log('[TRAINING SESSION] Daily review/new limits: unlimited');
    } else {
      const { data: todaySessions } = await supabaseAdmin
        .from('training_sessions')
        .select('id, session_data')
        .eq('user_id', userId)
        .eq('quiz_id', quiz.id)
        .gte('started_at', todayStart.toISOString())
        .lte('started_at', todayEnd.toISOString());

      const spent = countDailyBudgetSpend(todaySessions || [], playsToday);

      if (dailyReviewLimit !== null) {
        remainingDueCapacity = Math.max(0, dailyReviewLimit - spent.due);
        console.log('[TRAINING SESSION] Daily review limit:', dailyReviewLimit,
          '| already played today:', spent.due,
          '| from sessions with no per-song reasons:', spent.legacyDue,
          '| remaining:', remainingDueCapacity, '| mode:', mode);
      }
      if (dailyNewLimit !== null) {
        remainingNewCapacity = Math.max(0, dailyNewLimit - spent.new);
        console.log('[TRAINING SESSION] Daily new limit:', dailyNewLimit,
          '| already played today:', spent.new,
          '| from sessions with no per-song reasons:', spent.legacyNew,
          '| remaining:', remainingNewCapacity, '| mode:', mode);
      }
    }

    // Compute session playlist using FSRS
    // FSRS will select up to sessionLength songs from allSongs pool using configurable split
    progress('Building session playlist…');
    console.log('[TRAINING SESSION] Computing FSRS-optimized playlist...');
    console.log('[TRAINING SESSION] Input: pool size =', allSongs.length, ', max session length =', sessionLength);

    // In auto mode, we use the inverse of dueSongPercentage as maxNewPercentage
    const maxNewPercentage = 100 - dueSongPercentage;

    // N8: only build the grouping when the quiz opted in - it is a full pass over
    // the pool, and for every other quiz the answer would go unused.
    let duplicateGroups = null;
    if (quiz.combine_duplicates) {
      duplicateGroups = buildDuplicateGroups(allSongs);
      const groupCount = new Set(duplicateGroups.values()).size;
      console.log('[TRAINING SESSION] Combine duplicates on:', allSongs.length, 'pool songs in',
        groupCount, 'recording group(s)');
    }

    const result = trainingScheduler.computeSessionPlaylist(
      progressRecords || [],
      allSongs,
      sessionLength,
      mode === 'auto'
        ? {
          mode: 'auto',
          remainingDueCapacity,
          remainingNewCapacity,
          maxNewPercentage,
          excludePlayedSongAnnIds: playedTodaySongIds,
          duplicateGroups
        }
        : {
          mode: 'manual',
          remainingDueCapacity,
          remainingNewCapacity,
          dueCount,
          newCount,
          revisionCount,
          dueSongPercentage,
          newSongPercentage,
          revisionSongPercentage,
          excludePlayedSongAnnIds: playedTodaySongIds,
          duplicateGroups
        }
    );

    const playlist = result.playlist;
    const metadata = result.metadata;

    console.log('[TRAINING SESSION] ✓ Playlist computed:', playlist.length, 'songs selected');
    console.log('[TRAINING SESSION] Requested:', metadata.requested.dueCount, 'due,', metadata.requested.newCount, 'new');
    console.log('[TRAINING SESSION] Actual:', metadata.actual.dueCount, 'due,',
      metadata.actual.newCount, 'new,', metadata.actual.revisionCount, 'revision');

    // A non-empty pool can still select nothing: everything due was already
    // played today (excludePlayedSongAnnIds), or nothing is due and new songs
    // are capped at zero. The guard above only catches an empty *pool*, so this
    // case fell through and created a session with total_songs = 0.
    //
    // On the old build that was invisible - total_songs there was the count of
    // songs actually played, so an empty session looked identical to an
    // abandoned one (106 of the 109 zero-song rows in production have zero
    // plays). This build writes total_songs from the playlist at creation, so an
    // empty selection would now persist as a real, unplayable session. Measured:
    // 3 sessions out of ~22k selected nothing from a non-empty pool, most
    // recently 2026-08-09.
    //
    // Refusing is the honest answer - it is also exactly the "clicked Start and
    // nothing happened" report, which deserves a reason rather than a silence.
    if (playlist.length === 0) {
      console.log('[TRAINING SESSION] ❌ Pool has songs but the selection came back empty');
      return { ok: false, status: 400, body: {
        error: 'No songs are ready to play right now. Reviews may be due later, same-day reviews may be off, or the session limits may leave no room for new songs. Try again when more songs are due, or adjust the new/revision limits for this quiz.',
        poolSize: allSongs.length
      } };
    }

    // Validate that all songs have annSongId (safety check)
    const invalidSongs = playlist.filter(song => !song.annSongId);
    if (invalidSongs.length > 0) {
      console.error('[TRAINING SESSION] ❌ Found', invalidSongs.length, 'songs without annSongId:');
      invalidSongs.forEach(song => {
        console.error('[TRAINING SESSION]   -', song.annSongId || 'unknown');
      });
      return { ok: false, status: 500, body: {
        error: `${invalidSongs.length} songs are missing required data and cannot be played. This usually happens when songs have been removed from the quiz.`,
        invalidCount: invalidSongs.length
      } };
    }

    // Log warnings if any
    if (metadata.warnings.length > 0) {
      console.log('[TRAINING SESSION] ⚠ Warnings:');
      metadata.warnings.forEach(warning => {
        console.log('[TRAINING SESSION]   -', warning);
      });
    }

    // Create training session record
    progress('Saving session…');
    console.log('[TRAINING SESSION] Creating session record in database...');
    const sessionData = {
      sessionLength,
      playlistGenerated: new Date().toISOString(),
      mode: mode,
      // Persist the playlist so progress reports can reject shifted/stale
      // annSongIds (index-desync from old connectors silently corrupted FSRS).
      playlistAnnSongIds: playlist.map((song) => Number(song.annSongId)),
      // Parallel to playlistAnnSongIds. Lets the daily due/new budgets charge
      // for songs actually played rather than songs merely planned - see
      // countDailyBudgetSpend.
      playlistReasons: playlist.map((song) => song.selection_reason || null),
      // N8: read back by the progress endpoint so rating a card can keep its
      // duplicate siblings on the same schedule without re-reading the quiz row
      // on every song. Sessions predating this field simply do not propagate.
      combineDuplicates: quiz.combine_duplicates === true,
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
        quiz_id: quiz.id,
        total_songs: playlist.length,
        session_data: sessionData
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('[TRAINING SESSION] ❌ Error creating session:', sessionError);
      return { ok: false, status: 500, body: { error: 'Failed to create training session' } };
    }

    console.log('[TRAINING SESSION] ✓ Session created with ID:', session.id);

    // Return session info and playlist
    console.log('[TRAINING SESSION] ✓ Session ready! Returning playlist to client');

    // Build AMQ command object using shared logic (handles ranges, per-song settings, etc.)
    const command = buildQuizCommand({
      songs: playlist,
      simulatedConfig: simulatedConfig,
      quizName: `AMQ+ ${quiz.name}`,
      quizDescription: `Training session with ${playlist.length} songs (${metadata.actual.dueCount} already played, ${metadata.actual.newCount} new)`
    });

    console.log('[TRAINING SESSION] ========================================');

    // Create playlist metadata for client-side progress tracking.
    //
    // R13: each entry also carries what the four rating buttons would do, so the
    // connector can label them instead of leaving people to infer FSRS from
    // screenshots. Computed here because the card state lives here; the client
    // never has to reimplement the scheduler.
    const progressByAnnId = new Map();
    const progressByKey = new Map();
    for (const record of progressRecords || []) {
      const annId = Number(record.song_ann_id);
      if (Number.isFinite(annId)) progressByAnnId.set(annId, record);
      const key = record.song_key || record.annSongId;
      if (key) progressByKey.set(key, record);
    }

    const playlistMetadata = playlist.map(song => {
      const songKey = `${song.songArtist}_${song.songName}`;
      const record =
        progressByAnnId.get(Number(song.annSongId)) || progressByKey.get(songKey) || null;

      let fsrsPreview = null;
      try {
        // Same policy the rating commit applies, so the labels match what happens.
        fsrsPreview = trainingScheduler.projectRatings(record?.fsrs_state || null, now, {
          allowSameDayReviews: quiz.allow_same_day_reviews !== false
        });
      } catch (previewErr) {
        // A preview is a nicety; never let it cost someone their session.
        console.warn('[TRAINING SESSION] ⚠ Could not project ratings for', songKey, previewErr.message);
      }

      return {
        annSongId: song.annSongId,
        songArtist: song.songArtist,
        songName: song.songName,
        songKey,
        fsrsPreview
      };
    });

    return {
      ok: true,
      body: {
        sessionId: session.id,
        quizId: quiz.id,
        quizName: quiz.name,
        command: command,
        playlist: playlistMetadata,
        totalSongs: playlist.length,
        // Async start + playlist guard require a current connector.
        minConnectorVersion: MIN_CONNECTOR_VERSION,
        composition: {
          due: metadata.actual.dueCount,
          new: metadata.actual.newCount,
          revision: metadata.actual.revisionCount,
          duePercentage: metadata.actual.duePercentage,
          newPercentage: metadata.actual.newPercentage,
          revisionPercentage: metadata.actual.revisionPercentage
        },
        // Auto mode drops the manual-target warnings ("only 3 revision songs
        // available") because they describe targets auto never set. The
        // introduction notes are the exception: they explain a number the
        // player can see and cannot otherwise account for, so they ride along
        // in both modes.
        warnings: [
          ...buildIntroductionNotes({
            backlogThrottle: metadata.backlogThrottle,
            dailyNewLimit,
            remainingNewCapacity,
            newCount: metadata.actual.newCount
          }),
          ...(mode === 'auto' ? [] : metadata.warnings)
        ],
        backlogThrottle: metadata.backlogThrottle ?? null,
        available: {
          due: metadata.available.dueCount,
          new: metadata.available.newCount,
          revision: metadata.available.revisionCount,
          totalPoolSize: metadata.available.totalPoolSize
        }
      }
    };
  } catch (error) {
    if (error instanceof QuizSourceLoadError || error instanceof QuizSourceError) {
      return { ok: false, status: error instanceof QuizSourceLoadError ? error.status : 422,
        body: { error: `Nothing was changed. ${error.message}` } };
    }
    console.error('[TRAINING SESSION] ❌ Unexpected error:', error);
    console.error('[TRAINING SESSION] Error stack:', error.stack);
    console.log('[TRAINING SESSION] ========================================');
    return { ok: false, status: 500, body: { error: error.message || 'Internal server error' } };
  }
}
