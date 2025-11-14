/**
 * Song Difficulty Filter Definition
 * Filters songs by difficulty rating (easy/medium/hard or custom ranges)
 * 
 * @module filters/definitions/songDifficulty
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { SONG_DIFFICULTY_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult, ValidationContext } from '../../validation/validationFramework.js';
import { validateAllocation, validateValue, validateSum } from '../../validation/commonValidators.js';
import { createValidationContext, getMode, buildEntry } from '../FilterBase.js';
import { analyzeGroup } from '../../mathUtils.js';
import { allocateToTotal } from '../../mathUtils.js';
import { extractSongDifficultyDisplay } from '../../displayUtils.js';

/**
 * Validate song difficulty configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateSongDifficulty(value, context) {
  if (!value) {
    const result = new ValidationResult();
    result.addError('Filter value is required');
    return result;
  }
  const v = value;
  const result = new ValidationResult();
  const validationContext = createValidationContext(value, context);

  // Get total songs for validation - inheritedSongCount is optional for validation
  let totalSongs = 20; // default for validation only
  if (context.inheritedSongCount) {
    if (typeof context.inheritedSongCount === 'object') {
      const max = context.inheritedSongCount.max ?? context.inheritedSongCount.value;
      totalSongs = max !== undefined && max !== null ? Number(max) : 20;
    } else {
      totalSongs = Number(context.inheritedSongCount) || 20;
    }
  }

  if (v.viewMode === 'advanced') {
    // Advanced mode with custom ranges
    if (!v.ranges) {
      result.addError('ranges is required in advanced viewMode');
      return result;
    }
    const ranges = v.ranges;
    if (!v.mode) {
      result.addError('mode is required in advanced viewMode');
      return result;
    }
    const mode = v.mode;

    if (ranges.length === 0) {
      result.addError('No difficulty ranges defined in advanced mode');
    } else {
      if (mode === 'percentage') {
        const totalPercentages = ranges.reduce((sum, range) => {
          if (range.songCount === undefined || range.songCount === null) {
            result.addError('range.songCount is required in advanced mode');
            return sum;
          }
          return sum + Number(range.songCount);
        }, 0);
        if (Math.abs(totalPercentages - 100) > 0.1) {
          result.addError(
            `Percentage total mismatch (current: ${totalPercentages.toFixed(1)}%, must be 100%)`
          );
        }
        for (let i = 0; i < ranges.length; i++) {
          const range = ranges[i];
          if (range.songCount === undefined || range.songCount === null) {
            result.addError(`Range ${i + 1}: songCount is required`);
            continue;
          }
          const p = Number(range.songCount);
          if (p < 0 || p > 100) {
            result.addError(`Range ${i + 1}: Song count percentage must be between 0-100%`);
          }
        }
      } else {
        const totalSongCounts = ranges.reduce(
          (sum, range) => {
            if (range.songCount === undefined || range.songCount === null) {
              result.addError('range.songCount is required in advanced mode');
              return sum;
            }
            return sum + Number(range.songCount);
          },
          0
        );
        if (totalSongCounts !== totalSongs) {
          result.addError(
            `Song counts mismatch (current: ${totalSongCounts}, must equal: ${totalSongs})`
          );
        }
        for (let i = 0; i < ranges.length; i++) {
          const range = ranges[i];
          if (range.songCount === undefined || range.songCount === null) {
            result.addError(`Range ${i + 1}: songCount is required`);
            continue;
          }
          const count = Number(range.songCount);
          if (count < 0) {
            result.addError(`Range ${i + 1}: Song count must be non-negative`);
          }
        }
      }
    }
  } else {
    // Basic mode (easy/medium/hard)
    const mode =
      ['easy', 'medium', 'hard'].some((k) => v[k]?.percentageValue != null) &&
        !['easy', 'medium', 'hard'].some((k) => v[k]?.countValue != null)
        ? 'percentage'
        : 'count';
    let sumStatic = 0,
      sumMin = 0,
      sumMax = 0;
    let hasRandom = false,
      hasStatic = false;
    for (const k of ['easy', 'medium', 'hard']) {
      const cfg = v[k];
      if (!cfg) {
        result.addError(`Difficulty configuration for "${k}" is missing`);
        continue;
      }
      if (!cfg.enabled) continue;
      if (cfg.randomRange) {
        hasRandom = true;
        let min, max;
        if (mode === 'percentage') {
          min = Number(cfg.minPercentage ?? cfg.min ?? 0);
          max = Number(cfg.maxPercentage ?? cfg.max ?? 0);
        } else {
          min = Number(cfg.minCount ?? cfg.min ?? 0);
          max = Number(cfg.maxCount ?? cfg.max ?? 0);
        }

        let maxExceeded;
        if (mode === 'percentage') {
          maxExceeded = max > 100;
        } else {
          maxExceeded = max > totalSongs;
        }

        if (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          min < 0 ||
          maxExceeded ||
          min > max
        ) {
          result.addError(`${k} range invalid`);
        } else {
          sumMin += min;
          sumMax += max;
        }
      } else {
        hasStatic = true;
        let val;
        if (mode === 'percentage') {
          val = Number(cfg.percentageValue);
        } else {
          val = Number(cfg.countValue);
        }

        let valExceeded;
        if (mode === 'percentage') {
          valExceeded = val > 100;
        } else {
          valExceeded = val > totalSongs;
        }

        if (
          !Number.isFinite(val) ||
          val < 0 ||
          valExceeded
        ) {
          result.addError(`${k} value invalid`);
        } else {
          sumStatic += val;
        }
      }
    }
    if (mode === 'percentage') {
      if (!hasRandom) {
        if (sumStatic !== 100) {
          result.addError(`Difficulty % total ${sumStatic}% (must be 100%)`);
        }
      } else if (hasRandom && hasStatic) {
        if (sumMin + sumStatic > 100) {
          result.addError('Difficulty ranges exceed 100%');
        }
      } else if (hasRandom && !hasStatic) {
        if (sumMin > 100 || sumMax < 100) {
          result.addError('Difficulty ranges cannot reach 100%');
        }
      }
    } else {
      // Count mode validation
      if (!hasRandom) {
        if (sumStatic !== totalSongs) {
          result.addError(`Difficulty total ${sumStatic} songs (must be ${totalSongs})`);
        }
      } else if (hasRandom && hasStatic) {
        if (sumMin + sumStatic > totalSongs) {
          result.addError('Difficulty ranges exceed total songs');
        }
      } else if (hasRandom && !hasStatic) {
        if (sumMin > totalSongs || sumMax < totalSongs) {
          result.addError('Difficulty ranges cannot reach total songs');
        }
      }
    }
  }

  return result;
}

/**
 * Display song difficulty configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displaySongDifficulty(value, context) {
  if (!value) {
    return '[ERROR: Filter value is missing]';
  }

  if (value.viewMode === 'basic' && context.inheritedSongCount) {
    // Use actual allocation values when inherited song count is available
    const actualAllocation = extractSongDifficultyDisplay(value, context.inheritedSongCount);
    if (actualAllocation && actualAllocation.difficulties) {
      if (!actualAllocation.mode) {
        return '[ERROR: mode is missing in allocation data]';
      }
      const mode = actualAllocation.mode;
      const unit = mode === 'percentage' ? '%' : '';
      const parts = [];
      for (const [level, alloc] of Object.entries(actualAllocation.difficulties)) {
        const label = level.charAt(0).toUpperCase() + level.slice(1);
        if (alloc.kind === 'range') {
          parts.push(`${label} ${alloc.min}-${alloc.max}${unit}`);
        } else {
          parts.push(`${label} ${alloc.value}${unit}`);
        }
      }
      if (parts.length === 0) {
        return '[ERROR: No difficulties selected]';
      }
      return parts.join(', ');
    }
  } else if (value.viewMode === 'basic') {
    if (!context.inheritedSongCount) {
      return '[ERROR: inheritedSongCount is required in context for display]';
    }
    const difficultyOrder = ['easy', 'medium', 'hard'];
    let mode = value.mode;
    if (!mode) {
      const anyPercent = difficultyOrder.some((t) => value[t]?.percentage !== undefined);
      const anyCount = difficultyOrder.some((t) => value[t]?.count !== undefined);
      if (anyPercent && !anyCount) {
        mode = 'percentage';
      } else {
        mode = 'count';
      }
    }

    const parts = [];
    for (const type of difficultyOrder) {
      const diff = value[type];
      if (!diff?.enabled) continue;

      let partValue;
      if (diff.randomRange) {
        if (mode === 'percentage') {
          const minP = diff.minPercentage ?? diff.min;
          const maxP = diff.maxPercentage ?? diff.max;
          if (minP !== undefined && maxP !== undefined) {
            partValue = `${minP}–${maxP}%`;
          } else if (diff.percentage !== undefined) {
            partValue = `${diff.percentage}%`;
          }
        } else {
          const minC = diff.minCount ?? diff.min;
          const maxC = diff.maxCount ?? diff.max;
          if (minC !== undefined && maxC !== undefined) {
            partValue = `${minC}–${maxC}`;
          } else if (diff.count !== undefined) {
            partValue = `${diff.count}`;
          }
        }
      } else {
        if (mode === 'percentage') {
          if (diff.percentage !== undefined) {
            partValue = `${diff.percentage}%`;
          }
        } else {
          if (diff.count !== undefined) {
            partValue = `${diff.count}`;
          }
        }
      }

      if (partValue !== undefined) {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        let formattedPart;
        if (mode === 'percentage') {
          formattedPart = `${label} ${partValue}`;
        } else {
          formattedPart = `${label}: ${partValue}`;
        }
        parts.push(formattedPart);
      }
    }

    if (parts.length === 0) {
      return '[ERROR: No difficulties selected]';
    }
    return parts.join(', ');
  } else if (value.ranges && value.ranges.length > 0) {
    return `${value.ranges.length} custom range${value.ranges.length > 1 ? 's' : ''}`;
  }

  return '[ERROR: Invalid filter configuration]';
}

/**
 * Extract song difficulty settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractSongDifficulty(value, context) {
  return extractSongDifficultyDisplay(value, context.inheritedSongCount);
}

/**
 * Resolve song difficulty to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {() => number} rng - Random number generator
 * @returns {Object}
 */
function resolveSongDifficulty(node, context, rng) {
  const value = node.data.currentValue;

  if (!context.inheritedSongCount) {
    throw new Error('inheritedSongCount is required in context for song-difficulty resolution');
  }
  const inheritedSongCount = context.inheritedSongCount;

  // Advanced mode with ranges - only use advanced mode if ranges array has content
  if (value.viewMode === 'advanced' && value.ranges && value.ranges.length > 0) {
    if (!value.mode) {
      throw new Error('mode is required in advanced viewMode for song-difficulty');
    }
    const advancedMode = value.mode;
    const ranges = value.ranges.map((range) => {
      if (range.from === undefined || range.from === null) {
        throw new Error('range.from is required in advanced mode ranges');
      }
      if (range.to === undefined || range.to === null) {
        throw new Error('range.to is required in advanced mode ranges');
      }
      if (range.songCount === undefined || range.songCount === null) {
        throw new Error('range.songCount is required in advanced mode ranges');
      }
      return {
        from: range.from,
        to: range.to,
        songCount: range.songCount,
        // Advanced ranges are already static - no flexibility
        songCountRange: { min: range.songCount, max: range.songCount }
      };
    });

    // When mode is 'percentage', convert percentage values to actual counts
    if (advancedMode === 'percentage') {
      const convertedRanges = ranges.map((range) => {
        // Convert percentage to actual count based on inheritedSongCount
        const countValue = Math.round(inheritedSongCount * range.songCount / 100);

        // Convert songCountRange from percentages to counts
        let countValueRange;
        if (range.songCountRange) {
          countValueRange = {
            min: Math.round(inheritedSongCount * range.songCountRange.min / 100),
            max: Math.round(inheritedSongCount * range.songCountRange.max / 100)
          };
        } else {
          countValueRange = { min: countValue, max: countValue };
        }

        return {
          from: range.from,
          to: range.to,
          songCount: countValue,
          songCountRange: countValueRange
        };
      });

      return {
        mode: 'advanced', // Change to advanced mode since we've converted percentages
        viewMode: 'advanced',
        ranges: convertedRanges,
        total: inheritedSongCount
      };
    }

    return {
      mode: 'advanced',
      viewMode: 'advanced',
      ranges,
      total: inheritedSongCount
    };
  }

  // Basic mode - always convert to advanced ranges
  if (!value.mode) {
    throw new Error('mode is required for song-difficulty resolution');
  }
  const mode = value.mode;
  const enabledTypes = ['easy', 'medium', 'hard'].filter((level) => value[level]?.enabled);

  if (enabledTypes.length === 0) {
    return {
      mode,
      viewMode: 'advanced',
      ranges: [],
      total: inheritedSongCount
    };
  }

  const isPercentageMode = mode === 'percentage';
  const targetTotal = isPercentageMode ? 100 : inheritedSongCount;

  const typeEntries = enabledTypes.map((t) => {
    const d = value[t];
    if (!d) {
      throw new Error(`Difficulty configuration for "${t}" is missing`);
    }
    if (!d.enabled) {
      throw new Error(`Difficulty "${t}" must be enabled`);
    }
    if (d.randomRange) {
      let min, max;
      if (isPercentageMode) {
        min = d.minPercentage ?? d.min;
        max = d.maxPercentage ?? d.max;
      } else {
        min = d.minCount ?? d.min;
        max = d.maxCount ?? d.max;
      }
      if (min === undefined || min === null || max === undefined || max === null) {
        throw new Error(`Range min/max values are required for "${t}" difficulty (mode: ${mode})`);
      }
      return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
        label: t,
        kind: 'range',
        min: Number(min),
        max: Number(max)
      });
    }
    // Use percentage/count (old format) or percentageValue/countValue (new format)
    let val;
    if (isPercentageMode) {
      val = d.percentageValue ?? d.percentage;
    } else {
      val = d.countValue ?? d.count;
    }
    if (val === undefined || val === null) {
      throw new Error(`Value is required for "${t}" difficulty (mode: ${mode})`);
    }
    return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
      label: t,
      kind: 'static',
      value: Number(val)
    });
  });

  const allocation = allocateToTotal(typeEntries, targetTotal, rng);

  // Build difficulty map with ranges
  const difficultyRanges = {};
  const difficulties = {};
  typeEntries.forEach((entry) => {
    const allocated = allocation.get(entry.label);
    if (allocated === undefined) {
      throw new Error(`Allocation failed for difficulty "${entry.label}"`);
    }
    difficulties[entry.label] = allocated;
    if (entry.kind === 'range') {
      difficultyRanges[entry.label] = { min: entry.min, max: entry.max };
    } else {
      difficultyRanges[entry.label] = { min: entry.value, max: entry.value };
    }
  });

  // Convert to advanced ranges format
  const difficultyToRange = {
    easy: { from: 60, to: 100 },
    medium: { from: 25, to: 60 },
    hard: { from: 0, to: 25 }
  };

  const ranges = enabledTypes.map((level) => {
    const range = difficultyToRange[level];
    if (!range) {
      throw new Error(`Difficulty range not found for level: ${level}`);
    }
    const songCount = difficulties[level];
    if (songCount === undefined || songCount === null) {
      throw new Error(`Song count is missing for difficulty level: ${level}`);
    }
    const songCountRange = difficultyRanges[level];
    if (!songCountRange) {
      throw new Error(`Song count range is missing for difficulty level: ${level}`);
    }

    // If percentage mode, convert to counts
    if (isPercentageMode) {
      const actualCount = Math.round(inheritedSongCount * songCount / 100);
      const actualRange = {
        min: Math.round(inheritedSongCount * songCountRange.min / 100),
        max: Math.round(inheritedSongCount * songCountRange.max / 100)
      };
      return {
        from: range.from,
        to: range.to,
        songCount: actualCount,
        songCountRange: actualRange
      };
    }

    return {
      from: range.from,
      to: range.to,
      songCount,
      songCountRange
    };
  });

  return {
    mode: 'advanced',
    viewMode: 'advanced',
    ranges,
    total: inheritedSongCount
  };
}

/**
 * Song Difficulty Filter Definition
 */
export const songDifficultyFilter = {
  id: 'song-difficulty',
  metadata: {
    title: 'Song Difficulty',
    icon: '⭐',
    color: '#dc2626',
    description: 'Filter songs by difficulty rating',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: SONG_DIFFICULTY_DEFAULT_SETTINGS,
  formType: 'complex-song-difficulty',
  validate: validateSongDifficulty,
  display: displaySongDifficulty,
  extract: extractSongDifficulty,
  resolve: resolveSongDifficulty
};

// Auto-register the filter
FilterRegistry.register(songDifficultyFilter.id, songDifficultyFilter);

