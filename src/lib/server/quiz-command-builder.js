/**
 * Shared logic for building AMQ quiz commands with proper range resolution
 * Used by both the play endpoint and training endpoint
 * 
 * @module lib/server/quiz-command-builder
 */

import { makeRng } from './songFiltering.js';
import { generateRandomSeed } from '$lib/utils/mathUtils.js';

/**
 * Build an AMQ quiz command from songs and config
 * Handles range resolution, per-song settings, etc.
 * 
 * @param {Object} options - Build options
 * @param {Array} options.songs - Array of song objects
 * @param {Object} options.simulatedConfig - Simulated quiz configuration
 * @param {string} options.quizName - Name for the quiz
 * @param {string} options.quizDescription - Description for the quiz
 * @param {string} [options.seed] - Seed for RNG (optional, will generate if not provided)
 * @returns {Object} AMQ command object with quizSave structure
 */
export function buildQuizCommand({ songs, simulatedConfig, quizName, quizDescription, seed = null }) {
  // Handle guess time: can be a number (static) or an object with kind 'range' or 'static'
  const guessTimeConfig = simulatedConfig.basicSettings.guessTime;

  // Check for range in multiple possible formats
  const isGuessTimeRange = typeof guessTimeConfig === 'object' && guessTimeConfig !== null && (
    guessTimeConfig.kind === 'range' ||
    guessTimeConfig.type === 'range' ||
    guessTimeConfig.useRange === true
  );

  // Extract min/max from various possible structures
  let guessTimeMin, guessTimeMax;
  if (isGuessTimeRange) {
    guessTimeMin = guessTimeConfig.min ?? guessTimeConfig.value?.min;
    guessTimeMax = guessTimeConfig.max ?? guessTimeConfig.value?.max;
  }

  const defaultGuessTimeValue = typeof guessTimeConfig === 'number'
    ? guessTimeConfig
    : isGuessTimeRange
      ? { kind: 'range', min: guessTimeMin, max: guessTimeMax } // Normalize to consistent format
      : (guessTimeConfig?.value ?? guessTimeConfig?.staticValue);

  // Handle extra guess time: can be a number (static) or an object with kind 'range' or 'static'
  const extraGuessTimeConfig = simulatedConfig.basicSettings.extraGuessTime;

  const isExtraGuessTimeRange = typeof extraGuessTimeConfig === 'object' && extraGuessTimeConfig !== null && (
    extraGuessTimeConfig.kind === 'range' ||
    extraGuessTimeConfig.type === 'range' ||
    extraGuessTimeConfig.useRange === true
  );

  let extraGuessTimeMin, extraGuessTimeMax;
  if (isExtraGuessTimeRange) {
    extraGuessTimeMin = extraGuessTimeConfig.min ?? extraGuessTimeConfig.value?.min;
    extraGuessTimeMax = extraGuessTimeConfig.max ?? extraGuessTimeConfig.value?.max;
  }

  const defaultExtraGuessTimeValue = typeof extraGuessTimeConfig === 'number'
    ? extraGuessTimeConfig
    : isExtraGuessTimeRange
      ? { kind: 'range', min: extraGuessTimeMin, max: extraGuessTimeMax }
      : (extraGuessTimeConfig?.value ?? extraGuessTimeConfig?.staticValue);

  const samplePointConfig = simulatedConfig.basicSettings.samplePoint;

  const isSamplePointRange = typeof samplePointConfig === 'object' && samplePointConfig !== null && (
    samplePointConfig.kind === 'range' ||
    samplePointConfig.type === 'range' ||
    samplePointConfig.useRange === true ||
    samplePointConfig.value?.useRange === true
  );

  // Extract sample point min/max from various possible structures
  let samplePointMin, samplePointMax;
  if (isSamplePointRange) {
    samplePointMin = samplePointConfig.min ?? samplePointConfig.start ?? samplePointConfig.value?.min ?? samplePointConfig.value?.start ?? 0;
    samplePointMax = samplePointConfig.max ?? samplePointConfig.end ?? samplePointConfig.value?.max ?? samplePointConfig.value?.end ?? 100;
  }

  const defaultSamplePoint = isSamplePointRange
    ? { min: samplePointMin, max: samplePointMax }
    : { value: samplePointConfig?.value ?? 20 };

  const playbackSpeed = simulatedConfig.basicSettings.playbackSpeed;
  // Always set duplicates to true for custom quizzes
  const duplicateShows = true;

  // Create RNG for consistent random selection
  // Use seed if available, otherwise generate a new random seed each time
  const rangeSelectionSeed = seed || generateRandomSeed();
  const rangeRng = makeRng(rangeSelectionSeed);

  // Process songs to include per-song custom settings
  const enhancedSongs = songs.map((song, songIndex) => {
    /** @type {any} */
    const enrichedSong = song;
    const block = { annSongId: song.annSongId };

    // Check for custom sample ranges (per-song override)
    if (enrichedSong.sampleRanges && Array.isArray(enrichedSong.sampleRanges) && enrichedSong.sampleRanges.length > 0) {
      // Randomly select a range if multiple ranges exist
      let selectedRange;
      let selectionInfo = '';

      if (enrichedSong.sampleRanges.length === 1) {
        selectedRange = enrichedSong.sampleRanges[0];
        selectionInfo = `single range [${selectedRange.start}s-${selectedRange.end}s]`;
      } else {
        // Use RNG with song-specific seed for consistent selection per song
        const songSeed = `${rangeSelectionSeed}-song-${song.annSongId}-${songIndex}`;
        const songRng = makeRng(songSeed);
        const randomIndex = Math.floor(songRng() * enrichedSong.sampleRanges.length);
        selectedRange = enrichedSong.sampleRanges[randomIndex];
        selectionInfo = `range ${randomIndex + 1}/${enrichedSong.sampleRanges.length} [${selectedRange.start}s-${selectedRange.end}s] from ${enrichedSong.sampleRanges.length} available ranges (seed: ${songSeed})`;
      }

      const songLength = enrichedSong.songLength || 90;

      if (selectedRange.randomStartPosition) {
        // Random start position: resolve to actual starting point from eligible range
        const startPercent = Math.round((selectedRange.start / songLength) * 100);
        const endPercent = Math.round((selectedRange.end / songLength) * 100);
        // Generate random start point within the range using seeded RNG
        const randomStartSeed = `${rangeSelectionSeed}-random-start-${song.annSongId}-${songIndex}`;
        const randomStartRng = makeRng(randomStartSeed);
        const resolvedStartPercent = Math.floor(randomStartRng() * (endPercent - startPercent + 1)) + startPercent;
        block.samplePoint = {
          samplePoint: [resolvedStartPercent, resolvedStartPercent]
        };
        // console.log(`[SAMPLE POINT] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Custom range with random start - ${selectionInfo} -> resolved to ${resolvedStartPercent}% from range [${startPercent}%, ${endPercent}%] (seed: ${randomStartSeed})`);
      } else {
        // Fixed start: slider controls start position, end is song length
        const startPercent = Math.round((selectedRange.start / songLength) * 100);
        block.samplePoint = {
          samplePoint: [startPercent, startPercent]
        };
        // console.log(`[SAMPLE POINT] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Custom range with fixed start - ${selectionInfo} -> [${startPercent}%, ${startPercent}%] (song length: ${songLength}s)`);
      }
    } else if (isSamplePointRange && samplePointMin !== undefined && samplePointMax !== undefined) {
      // Quiz uses random sampling - generate per-song sample point using seeded RNG
      // Use song-specific seed for consistent selection per song
      const songSampleSeed = `${rangeSelectionSeed}-sample-${song.annSongId}-${songIndex}`;
      const songSampleRng = makeRng(songSampleSeed);
      const randomSamplePoint = Math.floor(songSampleRng() * (samplePointMax - samplePointMin + 1)) + samplePointMin;
      block.samplePoint = {
        samplePoint: [randomSamplePoint, randomSamplePoint]
      };
      // console.log(`[SAMPLE POINT] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Quiz-wide random range - selected ${randomSamplePoint}% from range [${samplePointMin}%, ${samplePointMax}%] (seed: ${songSampleSeed})`);
    } else {
      // Default/static sample point
      const defaultValue = simulatedConfig.basicSettings.samplePoint?.value ?? 20;
      // console.log(`[SAMPLE POINT] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Using quiz-wide default - ${defaultValue}%`);
    }

    // Handle guess time - quiz-wide settings (both ranges and static) take priority over per-song defaults
    let finalGuessTime;
    let finalExtraGuessTime;

    // If quiz has a guess time RANGE configured, use it (generates random per-song)
    // This takes priority over per-song static values which are often just defaults
    if (isGuessTimeRange && guessTimeMin !== undefined && guessTimeMax !== undefined) {
      // Quiz uses random guess time range - generate per-song value using seeded RNG
      const guessTimeSeed = `${rangeSelectionSeed}-guess-${song.annSongId}-${songIndex}`;
      const guessTimeRng = makeRng(guessTimeSeed);
      finalGuessTime = Math.floor(guessTimeRng() * (guessTimeMax - guessTimeMin + 1)) + guessTimeMin;
      // console.log(`[GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Quiz-wide random range - selected ${finalGuessTime}s from range [${guessTimeMin}s, ${guessTimeMax}s] (seed: ${guessTimeSeed})`);
    }
    // If quiz has a STATIC guess time configured, apply it to all songs (ignore per-song defaults)
    else if (typeof defaultGuessTimeValue === 'number') {
      // Quiz-wide static guess time - apply to all songs
      finalGuessTime = defaultGuessTimeValue;
      // console.log(`[GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Quiz-wide static value - ${finalGuessTime}s`);
    }
    // Otherwise check for per-song guess time with explicit range (not a default static value)
    else if (enrichedSong.guessTime !== undefined && enrichedSong.guessTime !== null) {
      if (typeof enrichedSong.guessTime === 'object' && enrichedSong.guessTime.useRange) {
        // Per-song random guess time range - generate using seeded RNG
        const guessTimeSeed = `${rangeSelectionSeed}-guess-${song.annSongId}-${songIndex}`;
        const guessTimeRng = makeRng(guessTimeSeed);
        finalGuessTime = Math.floor(guessTimeRng() * (enrichedSong.guessTime.max - enrichedSong.guessTime.min + 1)) + enrichedSong.guessTime.min;
        // console.log(`[GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Per-song random range [${enrichedSong.guessTime.min}-${enrichedSong.guessTime.max}s] -> ${finalGuessTime}s (seed: ${guessTimeSeed})`);
      } else if (typeof enrichedSong.guessTime === 'number') {
        // Per-song static guess time (only used when quiz doesn't have a range)
        finalGuessTime = enrichedSong.guessTime;
        // console.log(`[GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Per-song static value - ${finalGuessTime}s`);
      }
    }

    // Fallback to quiz-wide static value if nothing else matched
    if (finalGuessTime === undefined) {
      finalGuessTime = typeof defaultGuessTimeValue === 'number'
        ? defaultGuessTimeValue
        : (typeof defaultGuessTimeValue === 'object' ? defaultGuessTimeValue?.value : defaultGuessTimeValue);
    }

    // Same logic for extra guess time
    if (isExtraGuessTimeRange && extraGuessTimeMin !== undefined && extraGuessTimeMax !== undefined) {
      // Quiz uses random extra guess time range - generate per-song value using seeded RNG
      const extraGuessTimeSeed = `${rangeSelectionSeed}-extra-guess-${song.annSongId}-${songIndex}`;
      const extraGuessTimeRng = makeRng(extraGuessTimeSeed);
      finalExtraGuessTime = Math.floor(extraGuessTimeRng() * (extraGuessTimeMax - extraGuessTimeMin + 1)) + extraGuessTimeMin;
      // console.log(`[EXTRA GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Quiz-wide random range - selected ${finalExtraGuessTime}s from range [${extraGuessTimeMin}s, ${extraGuessTimeMax}s] (seed: ${extraGuessTimeSeed})`);
    }
    // If quiz has a STATIC extra guess time configured, apply it to all songs (ignore per-song defaults)
    else if (typeof defaultExtraGuessTimeValue === 'number') {
      // Quiz-wide static extra guess time - apply to all songs
      finalExtraGuessTime = defaultExtraGuessTimeValue;
      // console.log(`[EXTRA GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Quiz-wide static value - ${finalExtraGuessTime}s`);
    } else if (enrichedSong.extraGuessTime !== undefined && enrichedSong.extraGuessTime !== null) {
      if (typeof enrichedSong.extraGuessTime === 'object' && enrichedSong.extraGuessTime.useRange) {
        // Per-song random extra guess time range - generate using seeded RNG
        const extraGuessTimeSeed = `${rangeSelectionSeed}-extra-guess-${song.annSongId}-${songIndex}`;
        const extraGuessTimeRng = makeRng(extraGuessTimeSeed);
        finalExtraGuessTime = Math.floor(extraGuessTimeRng() * (enrichedSong.extraGuessTime.max - enrichedSong.extraGuessTime.min + 1)) + enrichedSong.extraGuessTime.min;
        // console.log(`[EXTRA GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Per-song random range [${enrichedSong.extraGuessTime.min}-${enrichedSong.extraGuessTime.max}s] -> ${finalExtraGuessTime}s (seed: ${extraGuessTimeSeed})`);
      } else if (typeof enrichedSong.extraGuessTime === 'number') {
        // Per-song static extra guess time
        finalExtraGuessTime = enrichedSong.extraGuessTime;
        // console.log(`[EXTRA GUESS TIME] Song ${songIndex + 1} (annSongId: ${song.annSongId}): Per-song static value - ${finalExtraGuessTime}s`);
      }
    }

    // Fallback for extra guess time
    if (finalExtraGuessTime === undefined) {
      finalExtraGuessTime = typeof defaultExtraGuessTimeValue === 'number'
        ? defaultExtraGuessTimeValue
        : (typeof defaultExtraGuessTimeValue === 'object' ? defaultExtraGuessTimeValue?.value : defaultExtraGuessTimeValue);
    }

    // Always include guess time in block
    block.guessTime = {
      guessTime: finalGuessTime,
      extraGuessTime: finalExtraGuessTime
    };

    // Handle playback speed (per-song override or quiz-wide)
    const songPlaybackSpeed = enrichedSong.playbackSpeed;
    if (songPlaybackSpeed) {
      if (songPlaybackSpeed.mode === 'random' && songPlaybackSpeed.randomValues && songPlaybackSpeed.randomValues.length > 0) {
        // Per-song random playback speed - select using seeded RNG
        const speedSeed = `${rangeSelectionSeed}-speed-${song.annSongId}-${songIndex}`;
        const speedRng = makeRng(speedSeed);
        const selectedSpeed = songPlaybackSpeed.randomValues[Math.floor(speedRng() * songPlaybackSpeed.randomValues.length)];
        block.playBackSpeed = {
          playBackSpeed: selectedSpeed
        };
      } else if (songPlaybackSpeed.mode === 'static' && songPlaybackSpeed.staticValue !== undefined) {
        // Per-song static playback speed
        block.playBackSpeed = {
          playBackSpeed: songPlaybackSpeed.staticValue
        };
      }
    } else if (typeof playbackSpeed === 'object' && playbackSpeed.mode === 'random' && playbackSpeed.randomValues) {
      // Quiz-wide random playback speed - select per-song using seeded RNG
      const speedSeed = `${rangeSelectionSeed}-speed-${song.annSongId}-${songIndex}`;
      const speedRng = makeRng(speedSeed);
      const selectedSpeed = playbackSpeed.randomValues[Math.floor(speedRng() * playbackSpeed.randomValues.length)];
      block.playBackSpeed = {
        playBackSpeed: selectedSpeed
      };
    }

    return block;
  });

  // Pre-format the quiz data in AMQ custom quiz format (quizSave structure)
  const quizSave = {
    name: quizName,
    description: quizDescription,
    tags: [],
    ruleBlocks: [{
      randomOrder: false,
      songCount: enhancedSongs.length,
      guessTime: {
        // Use sensible defaults for ruleBlock - per-song values will override these anyway
        // Always use default values for the global rule block to ensure AMQ uses the per-song values
        guessTime: 30,
        extraGuessTime: 0
      },
      samplePoint: {
        // Use full range [0, 100] as default - per-song values will override
        samplePoint: [0, 100]
      },
      playBackSpeed: {
        playBackSpeed: typeof playbackSpeed === 'object' && playbackSpeed.mode === 'random' && playbackSpeed.randomValues
          ? playbackSpeed.randomValues[0] // Use first value as default, per-song will override
          : (typeof playbackSpeed === 'object' ? playbackSpeed.staticValue : playbackSpeed)
      },
      blocks: enhancedSongs,
      duplicates: duplicateShows
    }]
  };

  // Return complete AMQ command object with quizId: null
  return {
    command: "save quiz",
    type: "quizCreator",
    data: {
      quizSave: quizSave,
      quizId: null
    }
  };
}

