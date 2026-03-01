/**
 * Room Settings Quiz API endpoint
 * Creates temporary quizzes from AMQ room settings with 1-hour expiry
 * 
 * @module api/room-settings-quiz
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { generateShareToken } from '$lib/utils/token.js';
import { getCurrentSeason, getCurrentYear } from '$lib/utils/dateUtils.js';

/**
 * Season mapping from AMQ numeric values to season names
 * 0 = Winter, 1 = Spring, 2 = Summer, 3 = Fall
 */
const SEASON_MAP = ['Winter', 'Spring', 'Summer', 'Fall'];

/**
 * Create a v2 filter entry
 */
function makeFilter(id, filterId, settings) {
  return { id, filterId, settings, enabled: true, executionChance: 100, sourceSelector: null, selectionModifier: null };
}

/**
 * Convert AMQ room settings to AMQ+ quiz configuration_data (v2 routes format).
 *
 * @param {Object} roomSettings - The lobby.settings object from AMQ
 * @param {Array} playerLists - Array of player list entries from cachedPlayerLists
 * @returns {Object} AMQ+ configuration_data in v2 routes format
 */
function convertRoomSettingsToConfig(roomSettings, playerLists) {
  const timestamp = Date.now();

  // Number of songs from settings
  const numberOfSongs = roomSettings.numberOfSongs || 20;

  // 1. Live Node - source node containing player lists from the lobby
  const liveNodeCurrentValue = {
    useEntirePool: false,
    userEntries: playerLists.map((entry, idx) => ({
      id: entry.id || `user-${idx}-${timestamp}`,
      platform: entry.platform || 'anilist',
      username: entry.username || '',
      selectedLists: entry.selectedLists || {
        completed: true,
        watching: true,
        planning: false,
        on_hold: false,
        dropped: false
      },
      songPercentage: entry.songPercentage || null
    })),
    songPercentage: null,
    songSelectionMode: 'default'
  };

  // 2. Basic Settings Node
  const guessTime = roomSettings.guessTime || { standardValue: 20, randomOn: false };
  const extraGuessTime = roomSettings.extraGuessTime || { standardValue: 0, randomOn: false };
  const samplePoint = roomSettings.samplePoint || { standardValue: 1, randomOn: true, randomValue: [0, 100] };
  const playbackSpeed = roomSettings.playbackSpeed || { standardValue: 1, randomOn: false };

  const basicSettingsCurrentValue = {
    guessTime: {
      value: guessTime.randomOn
        ? { useRange: true, staticValue: guessTime.standardValue, min: guessTime.randomValue?.[0] || 5, max: guessTime.randomValue?.[1] || 30 }
        : { useRange: false, staticValue: guessTime.standardValue, min: 5, max: 30 },
      label: 'Guess Time',
      type: 'range',
      min: 1,
      max: 60
    },
    extraGuessTime: {
      value: extraGuessTime.randomOn
        ? { useRange: true, staticValue: extraGuessTime.standardValue, min: extraGuessTime.randomValue?.[0] || 0, max: extraGuessTime.randomValue?.[1] || 15 }
        : { useRange: false, staticValue: extraGuessTime.standardValue, min: 0, max: 15 },
      label: 'Extra Guess Time',
      type: 'range',
      min: 0,
      max: 15
    },
    samplePoint: {
      value: samplePoint.randomOn
        ? { useRange: true, start: samplePoint.randomValue?.[0] || 0, end: samplePoint.randomValue?.[1] || 100, staticValue: 20 }
        : { useRange: false, start: 0, end: 100, staticValue: samplePoint.standardValue === 1 ? 0 : (samplePoint.standardValue === 2 ? 50 : 100) },
      label: 'Sample Point',
      type: 'complex'
    },
    playbackSpeed: {
      value: playbackSpeed.randomOn
        ? { mode: 'random', staticValue: 1.0, randomValues: playbackSpeed.randomValue?.map((v, i) => v ? [1, 1.5, 2, 4][i] : null).filter(v => v !== null) || [1.0] }
        : { mode: 'static', staticValue: playbackSpeed.standardValue, randomValues: [1.0] },
      label: 'Playback Speed',
      type: 'complex'
    },
    preventSameSongSpam: {
      value: false,
      label: 'Prevent same song spam (room-wide)',
      type: 'boolean'
    },
    duplicateShows: {
      value: roomSettings.modifiers?.duplicates !== false,
      label: 'Duplicate Shows',
      type: 'boolean'
    }
  };


  // 3. Songs and Types Node
  const songType = roomSettings.songType || { standardValue: { openings: true, endings: true, inserts: false } };
  const songSelection = roomSettings.songSelection || { standardValue: 3 }; // 3 = watched

  // Check which types are enabled
  const openingsEnabled = songType.standardValue?.openings !== false;
  const endingsEnabled = songType.standardValue?.endings !== false;
  const insertsEnabled = songType.standardValue?.inserts === true;

  // Get the actual counts from advancedValue
  const advancedCounts = songType.advancedValue || {};
  const openingsCount = advancedCounts.openings || 0;
  const endingsCount = advancedCounts.endings || 0;
  const insertsCount = advancedCounts.inserts || 0;
  const randomCount = advancedCounts.random || 0;

  // If no advancedValue, fall back to distributing evenly among enabled types
  const hasAdvancedCounts = songType.advancedValue && (openingsCount > 0 || endingsCount > 0 || insertsCount > 0 || randomCount > 0);

  let finalOpeningsCount, finalEndingsCount, finalInsertsCount, finalRandomCount;

  if (hasAdvancedCounts) {
    // Strict counts from AMQ
    finalOpeningsCount = openingsEnabled ? openingsCount : 0;
    finalEndingsCount = endingsEnabled ? endingsCount : 0;
    finalInsertsCount = insertsEnabled ? insertsCount : 0;
    // "Random" in AMQ means "Any of the enabled types"
    // In AMQ+, we can support this by enabling randomness on the types or handling it as a pool
    // Current AMQ+ filter structure splits by type strictly.
    // To support "True Random" (pool of all enabled types), we need to set the types to random mode
    // if randomCount > 0 and strict counts are 0.
    // If we have mixed (some strict + some random), it gets tricky.
    // For now, let's keep the distribution behavior BUT if it's purely random (e.g. 95 random),
    // we should set the node to use percentage ranges instead of fixed counts to allow flexibility.
    finalRandomCount = randomCount;
  } else {
    // No advanced counts - distribute evenly
    const enabledTypes = [openingsEnabled, endingsEnabled, insertsEnabled].filter(Boolean).length;
    const perType = enabledTypes > 0 ? Math.floor(numberOfSongs / enabledTypes) : 0;
    const remainder = enabledTypes > 0 ? numberOfSongs % enabledTypes : 0;

    finalOpeningsCount = openingsEnabled ? perType + remainder : 0;
    finalEndingsCount = endingsEnabled ? perType : 0;
    finalInsertsCount = insertsEnabled ? perType : 0;
    finalRandomCount = 0;
  }

  // Determine if we should use Random Mode (ranges) or Count Mode (strict)
  // If we have a large "random" component, we should allow flexibility
  const useRandomMode = finalRandomCount > 0;

  // Distribute random count to enabled types as min-max ranges if using Random Mode
  // If we have 95 random, we want:
  // Openings: Min 0, Max 95 (if enabled)
  // Endings: Min 0, Max 95 (if enabled)
  // Total song count: 95

  const songsAndTypesCurrentValue = {
    mode: 'count',
    songCount: { value: numberOfSongs, random: false, min: 15, max: 25 },
    songTypes: {
      openings: {
        enabled: openingsEnabled,
        // If type has strict count > 0, it should be FIXED (not random)
        // Only types with 0 strict count participate in random distribution
        count: finalOpeningsCount > 0 ? finalOpeningsCount : (useRandomMode && openingsEnabled ? Math.floor(finalRandomCount / [openingsEnabled, endingsEnabled, insertsEnabled].filter(Boolean).length) : 0),
        percentage: 0,
        random: useRandomMode && openingsEnabled && finalOpeningsCount === 0, // Only random if no strict count
        percentageMin: 0,
        percentageMax: 100,
        countMin: finalOpeningsCount, // Strict minimum
        countMax: finalOpeningsCount > 0 ? finalOpeningsCount : finalRandomCount // If strict > 0, max=min (fixed). Otherwise, can use all random
      },
      endings: {
        enabled: endingsEnabled,
        count: finalEndingsCount > 0 ? finalEndingsCount : (useRandomMode && endingsEnabled ? Math.floor(finalRandomCount / [openingsEnabled, endingsEnabled, insertsEnabled].filter(Boolean).length) : 0),
        percentage: 0,
        random: useRandomMode && endingsEnabled && finalEndingsCount === 0,
        percentageMin: 0,
        percentageMax: 100,
        countMin: finalEndingsCount,
        countMax: finalEndingsCount > 0 ? finalEndingsCount : finalRandomCount
      },
      inserts: {
        enabled: insertsEnabled,
        count: finalInsertsCount > 0 ? finalInsertsCount : (useRandomMode && insertsEnabled ? Math.floor(finalRandomCount / [openingsEnabled, endingsEnabled, insertsEnabled].filter(Boolean).length) : 0),
        percentage: 0,
        random: useRandomMode && insertsEnabled && finalInsertsCount === 0,
        percentageMin: 0,
        percentageMax: 100,
        countMin: finalInsertsCount,
        countMax: finalInsertsCount > 0 ? finalInsertsCount : finalRandomCount
      }
    },
    songSelection: {
      // standardValue: 1 = Random only, 2 = Mix (both), 3 = Watched only
      // advancedValue: { watched: X, unwatched: Y, random: Z }
      // AMQ terms:
      // - watched: From player's list (on list)
      // - unwatched: From entire database, NOT on player's list (loads masterlist)
      // - random: From anywhere (can be on list or not)
      random: {
        enabled: songSelection.advancedValue ?
          (songSelection.advancedValue.random || 0) > 0 :
          (songSelection.standardValue === 1 || songSelection.standardValue === 2),
        count: songSelection.advancedValue ? (songSelection.advancedValue.random || 0) :
          (songSelection.standardValue === 1 ? numberOfSongs :
            songSelection.standardValue === 2 ? Math.floor(numberOfSongs / 2) : 0),
        percentage: songSelection.standardValue === 1 ? 100 :
          songSelection.standardValue === 2 ? 50 : 0,
        random: false,
        percentageMin: 0,
        percentageMax: 100,
        countMin: 0,
        countMax: numberOfSongs
      },
      watched: {
        enabled: songSelection.advancedValue ?
          (songSelection.advancedValue.watched || 0) > 0 :
          (songSelection.standardValue === 2 || songSelection.standardValue === 3),
        count: songSelection.advancedValue ? (songSelection.advancedValue.watched || 0) :
          (songSelection.standardValue === 3 ? numberOfSongs :
            songSelection.standardValue === 2 ? Math.ceil(numberOfSongs / 2) : 0),
        percentage: songSelection.standardValue === 3 ? 100 :
          songSelection.standardValue === 2 ? 50 : 0,
        random: false,
        percentageMin: 0,
        percentageMax: 100,
        countMin: 0,
        countMax: numberOfSongs
      },
      unwatched: {
        enabled: songSelection.advancedValue ?
          (songSelection.advancedValue.unwatched || 0) > 0 : false,
        count: songSelection.advancedValue ? (songSelection.advancedValue.unwatched || 0) : 0,
        percentage: 0,
        random: false,
        percentageMin: 0,
        percentageMax: 100,
        countMin: 0,
        countMax: numberOfSongs
      }
    }
  };


  // 4. Anime Type Node
  const animeType = roomSettings.type || { tv: true, movie: true, ova: true, ona: true, special: true };

  const animeTypeDefaultValue = {
    tv: true, movie: true, ova: true, ona: true, special: true,
    rebroadcast: false, dubbed: false,
    viewMode: 'simple', mode: 'count',
    advanced: {
      tv: { enabled: true, random: false, min: 10, max: 40, percentageValue: 20, percentageMin: 10, percentageMax: 40, countValue: 4, countMin: 2, countMax: 10 },
      movie: { enabled: true, random: false, min: 10, max: 40, percentageValue: 20, percentageMin: 10, percentageMax: 40, countValue: 4, countMin: 2, countMax: 10 },
      ova: { enabled: true, random: false, min: 10, max: 40, percentageValue: 20, percentageMin: 10, percentageMax: 40, countValue: 4, countMin: 2, countMax: 10 },
      ona: { enabled: true, random: false, min: 10, max: 40, percentageValue: 20, percentageMin: 10, percentageMax: 40, countValue: 4, countMin: 2, countMax: 10 },
      special: { enabled: true, random: false, min: 10, max: 40, percentageValue: 20, percentageMin: 10, percentageMax: 40, countValue: 4, countMin: 2, countMax: 10 }
    }
  };

  const animeTypeCurrentValue = {
    tv: animeType.tv !== false,
    movie: animeType.movie !== false,
    ova: animeType.ova !== false,
    ona: animeType.ona !== false,
    special: animeType.special !== false,
    rebroadcast: roomSettings.modifiers?.rebroadcastSongs !== false,
    dubbed: roomSettings.modifiers?.dubSongs !== false,
    viewMode: 'simple',
    mode: 'count',
    advanced: animeTypeDefaultValue.advanced
  };


  // 5. Vintage Node
  const vintage = roomSettings.vintage || { standardValue: { years: [1944, getCurrentYear()], seasons: [0, 3] } };
  const fromYear = vintage.standardValue?.years?.[0] || 1944;
  const toYear = vintage.standardValue?.years?.[1] || getCurrentYear();
  const fromSeason = vintage.standardValue?.seasons?.[0] || 0;
  const toSeason = vintage.standardValue?.seasons?.[1] || 3;

  const vintageCurrentValue = {
    ranges: [{
      from: { season: SEASON_MAP[fromSeason], year: fromYear },
      to: { season: SEASON_MAP[toSeason], year: toYear },
      percentage: 100,
      count: numberOfSongs,
      useAdvanced: false
    }],
    mode: 'percentage'
  };


  // 6. Song Difficulty Node
  const songDifficulty = roomSettings.songDifficulity || { standardValue: { easy: true, medium: true, hard: true }, advancedOn: false };

  let songDifficultyCurrentValue;
  if (songDifficulty.advancedOn && songDifficulty.advancedValue) {
    // AMQ advanced difficulty uses a slider range [minDiff, maxDiff] for difficulty percentage (0-100)
    // Convert to AMQ+ advanced mode format with proper from/to/songCount
    const minDiff = songDifficulty.advancedValue[0] || 0;
    const maxDiff = songDifficulty.advancedValue[1] || 100;
    songDifficultyCurrentValue = {
      viewMode: 'advanced',
      mode: 'percentage',
      // Advanced mode uses ranges array with from/to/songCount
      ranges: [{
        from: minDiff,      // Difficulty percentage range start
        to: maxDiff,        // Difficulty percentage range end
        songCount: 100      // 100% of songs from this range (percentage mode)
      }]
    };
  } else {
    // Standard mode uses basic view with easy/medium/hard categories
    // In AMQ, these are just filters (enable/disable), not quotas
    // We should create a single combined range that includes all enabled difficulties
    const easyEnabled = songDifficulty.standardValue?.easy !== false;  // 60-100%
    const mediumEnabled = songDifficulty.standardValue?.medium !== false;  // 25-60%
    const hardEnabled = songDifficulty.standardValue?.hard !== false;  // 0-25%

    // Build the allowed difficulty ranges as a single combined range
    // The ranges are: hard=0-25%, medium=25-60%, easy=60-100%
    // We create one range that spans all enabled difficulties
    let minDiff = 100;
    let maxDiff = 0;

    if (hardEnabled) {
      minDiff = Math.min(minDiff, 0);
      maxDiff = Math.max(maxDiff, 25);
    }
    if (mediumEnabled) {
      minDiff = Math.min(minDiff, 25);
      maxDiff = Math.max(maxDiff, 60);
    }
    if (easyEnabled) {
      minDiff = Math.min(minDiff, 60);
      maxDiff = Math.max(maxDiff, 100);
    }

    // Handle case where no difficulties are enabled (shouldn't happen, default to all)
    if (minDiff > maxDiff) {
      minDiff = 0;
      maxDiff = 100;
    }

    // Use a single range covering all enabled difficulties - no quotas, just filtering
    songDifficultyCurrentValue = {
      viewMode: 'advanced',
      mode: 'percentage',
      ranges: [{
        from: minDiff,
        to: maxDiff,
        songCount: 100  // 100% from this combined range
      }]
    };
  }


  // 7. Player Score Node
  const playerScore = roomSettings.playerScore || { standardValue: [1, 10], advancedOn: false };
  const playerScoreMin = playerScore.standardValue?.[0] || 1;
  const playerScoreMax = playerScore.standardValue?.[1] || 10;

  let playerScoreCurrentValue;
  if (playerScore.advancedOn && Array.isArray(playerScore.advancedValue)) {
    const disallowed = playerScore.advancedValue
      .map((enabled, idx) => enabled ? null : idx + 1)
      .filter(v => v !== null);
    playerScoreCurrentValue = { min: 1, max: 10, mode: 'range', perScoreMode: 'count', percentages: {}, disallowed };
  } else {
    playerScoreCurrentValue = { min: playerScoreMin, max: playerScoreMax, mode: 'range', perScoreMode: 'count', percentages: {}, disallowed: [] };
  }


  // 8. Anime Score Node
  const animeScore = roomSettings.animeScore || { standardValue: [2, 10], advancedOn: false };
  const animeScoreMin = animeScore.standardValue?.[0] || 2;
  const animeScoreMax = animeScore.standardValue?.[1] || 10;

  let animeScoreCurrentValue;
  if (animeScore.advancedOn && Array.isArray(animeScore.advancedValue)) {
    const disallowed = animeScore.advancedValue
      .map((enabled, idx) => enabled ? null : idx + 2)
      .filter(v => v !== null);
    animeScoreCurrentValue = { min: 2, max: 10, mode: 'range', perScoreMode: 'count', percentages: {}, disallowed };
  } else {
    animeScoreCurrentValue = { min: animeScoreMin, max: animeScoreMax, mode: 'range', perScoreMode: 'count', percentages: {}, disallowed: [] };
  }


  // 9. Song Categories Node
  const openingCats = roomSettings.openingCategories || { standard: true, instrumental: true, chanting: true, character: true, noCategory: true };
  const endingCats = roomSettings.endingCategories || { standard: true, instrumental: true, chanting: true, character: true, noCategory: true };
  const insertCats = roomSettings.insertCategories || { standard: true, instrumental: true, chanting: true, character: true, noCategory: true };

  const songCategoriesCurrentValue = {
    openings: {
      standard: openingCats.standard !== false,
      instrumental: openingCats.instrumental !== false,
      chanting: openingCats.chanting !== false,
      character: openingCats.character !== false,
      noCategory: openingCats.noCategory !== false
    },
    endings: {
      standard: endingCats.standard !== false,
      instrumental: endingCats.instrumental !== false,
      chanting: endingCats.chanting !== false,
      character: endingCats.character !== false,
      noCategory: endingCats.noCategory !== false
    },
    inserts: {
      standard: insertCats.standard !== false,
      instrumental: insertCats.instrumental !== false,
      chanting: insertCats.chanting !== false,
      character: insertCats.character !== false,
      noCategory: insertCats.noCategory !== false
    },
    viewMode: 'simple',
    mode: 'count',
    advanced: {}
  };


  // 10. Genres Node
  // NOTE: Ignoring genres from AMQ room settings as they're too restrictive
  // Users can configure genres manually in the AMQ+ editor if needed
  const genresCurrentValue = {
    viewMode: 'basic',
    mode: 'count',
    included: [],  // Always empty - ignore AMQ genre settings
    excluded: [],
    optional: [],
    advanced: {}
  };


  // 11. Tags Node
  // NOTE: Ignoring tags from AMQ room settings as they're too restrictive
  // Users can configure tags manually in the AMQ+ editor if needed
  const tagsCurrentValue = {
    viewMode: 'basic',
    mode: 'count',
    included: [],  // Always empty - ignore AMQ tag settings
    excluded: [],
    optional: [],
    advanced: {}
  };


  // 12. Number of Songs
  const numberOfSongsCurrentValue = {
    useRange: false,
    staticValue: numberOfSongs,
    min: 15,
    max: 25
  };

  return {
    version: '2.0',
    routes: [{
      id: `route-${timestamp}`,
      name: 'Route 1',
      percentage: 100,
      enabled: true,
      basicSettings: basicSettingsCurrentValue,
      numberOfSongs: numberOfSongsCurrentValue,
      sources: [{
        sourceType: 'batch-user-list',
        mode: 'live',
        ...liveNodeCurrentValue
      }],
      negativeSources: [],
      filters: [
        makeFilter(`filter-${timestamp}-0`, 'songs-and-types',   songsAndTypesCurrentValue),
        makeFilter(`filter-${timestamp}-1`, 'anime-type',        animeTypeCurrentValue),
        makeFilter(`filter-${timestamp}-2`, 'vintage',           vintageCurrentValue),
        makeFilter(`filter-${timestamp}-3`, 'song-difficulty',   songDifficultyCurrentValue),
        makeFilter(`filter-${timestamp}-4`, 'player-score',      playerScoreCurrentValue),
        makeFilter(`filter-${timestamp}-5`, 'anime-score',       animeScoreCurrentValue),
        makeFilter(`filter-${timestamp}-6`, 'song-categories',   songCategoriesCurrentValue),
        makeFilter(`filter-${timestamp}-7`, 'genres',            genresCurrentValue),
        makeFilter(`filter-${timestamp}-8`, 'tags',              tagsCurrentValue)
      ]
    }],
    metadata: {
      version: '2.0',
      savedAt: new Date().toISOString(),
      source: 'room-settings'
    }
  };
}

/**
 * POST /api/room-settings-quiz
 * Creates a temporary quiz from AMQ room settings with 1-hour expiry
 * 
 * @param {Object} params - SvelteKit request parameters
 * @param {Request} params.request - Incoming request with JSON body
 * @returns {Promise<Response>} JSON response with play token and quiz data
 * 
 * Request body:
 * @property {Object} roomSettings - lobby.settings object from AMQ
 * @property {Array} playerLists - cachedPlayerLists array
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const { roomSettings, playerLists } = body;

    // Debug: Log incoming room settings
    console.log('[API: Room Settings Quiz] Received roomSettings:', JSON.stringify(roomSettings, null, 2));
    console.log('[API: Room Settings Quiz] Song selection standardValue:', roomSettings?.songSelection?.standardValue);
    console.log('[API: Room Settings Quiz] Number of songs:', roomSettings?.numberOfSongs);

    // Validate required fields
    if (!roomSettings) {
      return error(400, { message: 'Missing required field: roomSettings' });
    }

    if (!playerLists || !Array.isArray(playerLists)) {
      return error(400, { message: 'Missing required field: playerLists (must be an array)' });
    }

    // Check for unsupported settings
    if (roomSettings.watchedDistribution === 2) {
      return error(400, 'Weighted watched distribution is not supported by AMQ+. Please use Random or Equal distribution.');
    }

    // Convert room settings to AMQ+ configuration format
    const configurationData = convertRoomSettingsToConfig(roomSettings, playerLists);

    // Debug: Log key filter settings for troubleshooting
    const songsAndTypesFilter = configurationData.routes?.[0]?.filters?.find(f => f.filterId === 'songs-and-types');
    if (songsAndTypesFilter) {
      console.log('[API: Room Settings Quiz] Songs & Types filter settings:', JSON.stringify(songsAndTypesFilter.settings, null, 2));
    }

    const supabaseAdmin = createSupabaseAdmin();

    // Generate tokens
    const shareToken = generateShareToken();
    const playToken = generateShareToken();

    // Calculate expiry (1 hour from now)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Create the temporary quiz
    const { data, error: dbError } = await supabaseAdmin
      .from('quiz_configurations')
      .insert({
        user_id: null,
        name: 'Room Settings',
        description: 'Auto-generated quiz from AMQ room settings',
        is_public: false,
        is_temporary: true,
        expires_at: expiresAt,
        configuration_data: configurationData,
        quiz_metadata: {
          source: 'room-settings',
          playerCount: playerLists.length
        },
        creator_username: 'Guest',
        share_token: shareToken,
        play_token: playToken,
        created_at: new Date().toISOString()
      })
      .select('id, play_token, created_at')
      .single();

    if (dbError) {
      console.error('[API: Room Settings Quiz] Database error:', dbError);
      return error(500, { message: dbError.message });
    }

    console.log(`[API: Room Settings Quiz] Created quiz ${data.id} with play token ${data.play_token}, expires at ${expiresAt}`);

    return json({
      success: true,
      quizId: data.id,
      playToken: data.play_token,
      expiresAt: expiresAt,
      message: 'Quiz created successfully. It will expire in 1 hour.'
    });

  } catch (err) {
    console.error('[API: Room Settings Quiz] Error:', err);
    return error(500, { message: 'Failed to create room settings quiz' });
  }
}
