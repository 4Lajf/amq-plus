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
 * 
 * @param {Object} options - Build options
 * @param {Array} options.songs - Array of song objects
 * @param {Object} options.simulatedConfig - Simulated quiz configuration
 * @param {string} options.quizName - Name for the quiz
 * @param {string} options.quizDescription - Description for the quiz
 * @returns {Object} AMQ command object with quizSave structure
 */
export function buildQuizCommand({ songs, simulatedConfig, quizName, quizDescription }) {
  const bs = simulatedConfig.basicSettings;
  // Presentation RNG only (guess time / sample point ranges) — not a song-draw seed.
  const rng = makeRng(generateRandomSeed());

  const resolveGuessTime = (config, fallback = 20) => {
    if (typeof config === 'number') return config;
    if (config?.kind === 'range' || config?.type === 'range' || config?.useRange === true) {
      const min = config.min ?? config.value?.min ?? fallback;
      const max = config.max ?? config.value?.max ?? min;
      return Math.floor(rng() * (max - min + 1)) + min;
    }
    return config?.value?.staticValue ?? config?.staticValue ?? config?.value ?? fallback;
  };

  // Two input shapes reach this: the display value produced by
  // simulateQuizFromRoutes ({ kind: 'range', min, max } | { kind: 'static', value })
  // and the raw stored setting ({ value: { useRange, start, end, staticValue } }).
  // Returns { isRange, min, max } so callers can pick AMQ's encoding.
  const resolveSamplePoint = (config) => {
    const value = config?.value ?? config;
    const isRange =
      config?.kind === 'range' || config?.type === 'range' || value?.useRange === true || config?.useRange === true;

    if (isRange) {
      return {
        isRange: true,
        min: Number(value?.start ?? value?.min ?? config?.min ?? config?.start ?? 0),
        max: Number(value?.end ?? value?.max ?? config?.max ?? config?.end ?? 100)
      };
    }

    const point = Number(value?.staticValue ?? config?.staticValue ?? config?.value ?? 20);
    return { isRange: false, min: point, max: point };
  };

  // AMQ encodes a fixed sample point as a bare number and a randomised one as
  // [start, end]. The old builder always emitted [min, max], so a fixed sample
  // point went out as [20, 20] - an encoding AMQ does not treat as fixed.
  const toAmqSamplePoint = ({ isRange, min, max }) => (isRange ? [min, max] : min);

  const resolvePlaybackSpeed = (config) => {
    if (typeof config === 'number') return config;
    const value = config?.value ?? config;
    if (value?.mode === 'random' && value.randomValues?.length) {
      return value.randomValues[Math.floor(rng() * value.randomValues.length)];
    }
    return value?.staticValue ?? config?.staticValue ?? 1;
  };

  const samplePoint = resolveSamplePoint(bs.samplePoint);
  const amqSamplePoint = toAmqSamplePoint(samplePoint);

  // AMQ's community quiz updates added required fields to every song block -
  // omitting them makes AMQ reject the quiz as malformed.
  //   connectUp  - older update; keeps the block unlinked from the previous one
  //   locked     - 2026-08 update; locks the block's position among non-rule
  //                blocks. false is the unlocked default AMQ stamps on its own
  //                saves.
  //
  // samplePoint is stamped per block too. A captured AMQ save confirms per-block
  // samplePoint is an *override* - blocks without one are legal and coexist with
  // blocks that have one - so this is belt-and-braces rather than a fix in
  // itself. It costs nothing and removes any dependence on whatever AMQ does
  // for a block that omits it.
  const blocks = songs.map((song) => ({
    connectUp: false,
    locked: false,
    samplePoint: { samplePoint: amqSamplePoint },
    annSongId: song.annSongId
  }));

  return {
    command: 'save quiz',
    type: 'quizCreator',
    data: {
      quizSave: {
        // AMQ's quiz creator accepts at most 30 UTF-16 code units, including AMQ+.
        // Avoid leaving half an emoji at the truncation boundary.
        name: quizName.slice(0, 30).replace(/[\uD800-\uDBFF]$/, ''),
        description: quizDescription,
        tags: [],
        ruleBlocks: [{
          randomOrder: false,
          songCount: blocks.length,
          guessTime: {
            guessTime: resolveGuessTime(bs.guessTime),
            extraGuessTime: resolveGuessTime(bs.extraGuessTime, 0)
          },
          // Kept for backwards compatibility - the connector and older AMQ
          // builds still read the rule-block value. Always a [min, max] pair
          // here, which is the shape those readers expect.
          samplePoint: {
            samplePoint: [samplePoint.min, samplePoint.max]
          },
          playBackSpeed: {
            playBackSpeed: resolvePlaybackSpeed(bs.playbackSpeed)
          },
          blocks,
          duplicates: bs.duplicateShows !== false,
          guessModes: {
            song: true,
            tinyVideo: false,
            blurVideo: false
          }
        }],
        // Same update requires this at the quizSave root, not just per rule block.
        // With a single rule block it has no effect on ordering; the per-block
        // `randomOrder: false` above is what keeps the playlist in the order the
        // scheduler chose.
        // Match the creator's write payload. AMQ adds version and matchSongCount
        // to its response; sending a stale version can silently reject the save.
        ruleBlockRandomOrder: true
      },
      quizId: null
    }
  };
}
