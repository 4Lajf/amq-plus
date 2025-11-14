/**
 * Quick fix utilities for quiz creation nodes
 * Contains reusable quick fix logic used across different node dialogs
 * This ensures consistent behavior when auto-correcting validation issues
 */


/**
 * Quick fix logic for handling random ranges vs static values
 * Used by songs-and-types and song-difficulty nodes
 * @param {Array} enabledItems - Array of enabled items
 * @param {number} totalValue - Total value to distribute
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {(item: any) => boolean} isRandom - Function to check if item uses random ranges
 * @param {(item: any, value: number) => void} setStaticValue - Function to set static value
 * @param {(item: any, min: number, max: number) => void} setRandomRange - Function to set random range (min, max)
 * @returns {void}
 */
export function handleRandomVsStatic(enabledItems, totalValue, mode, isRandom, setStaticValue, setRandomRange) {
  if (enabledItems.length === 0) return;

  const hasRandomRanges = enabledItems.some(item => isRandom(item));
  const allRandomRanges = hasRandomRanges && enabledItems.every(item => isRandom(item));

  if (allRandomRanges) {
    // All random ranges - distribute evenly
    const baseMin = Math.floor((totalValue * 0.1) / enabledItems.length);
    const baseMax = Math.floor(totalValue / enabledItems.length);
    const remainder = totalValue % enabledItems.length;

    enabledItems.forEach((item, index) => {
      const min = baseMin;
      const max = baseMax + (index < remainder ? 1 : 0);
      setRandomRange(item, min, max);
    });
  } else if (hasRandomRanges && !allRandomRanges) {
    // Mixed random and static - set static values to 0 and let random ranges fill
    const staticItems = enabledItems.filter(item => !isRandom(item));
    const randomItems = enabledItems.filter(item => isRandom(item));

    // Set static items to 0
    staticItems.forEach(item => {
      setStaticValue(item, 0);
    });

    // Distribute remaining space to random ranges
    const remaining = totalValue;
    if (randomItems.length > 0) {
      const baseMin = Math.floor((remaining * 0.1) / randomItems.length);
      const baseMax = Math.floor(remaining / randomItems.length);
      const remainder = remaining % randomItems.length;

      randomItems.forEach((item, index) => {
        const min = baseMin;
        const max = baseMax + (index < remainder ? 1 : 0);
        setRandomRange(item, min, max);
      });
    }
  } else {
    // All static values - distribute equally
    const baseValue = Math.floor(totalValue / enabledItems.length);
    const remainder = totalValue % enabledItems.length;

    enabledItems.forEach((item, index) => {
      const value = baseValue + (index < remainder ? 1 : 0);
      setStaticValue(item, value);
    });
  }
}

/**
 * Quick fix logic for song difficulty nodes
 * Handles basic mode (easy/medium/hard) and advanced mode (ranges)
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @returns {void}
 */
export function quickFixSongDifficulty(editedValue, mode, totalSongs) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;

  if (editedValue.viewMode !== 'advanced') {
    // Basic mode - handle easy/medium/hard
    const enabledTypes = ['easy', 'medium', 'hard'].filter(type => editedValue[type]?.enabled);

    if (enabledTypes.length === 0) return;

    const hasRandomRanges = enabledTypes.some(type => editedValue[type].randomRange);
    const allRandomRanges = enabledTypes.every(type => editedValue[type].randomRange);

    if (allRandomRanges) {
      // All types use random ranges - distribute ranges evenly
      const rangePerType = Math.floor(maxValue / enabledTypes.length);
      const remainder = maxValue % enabledTypes.length;

      enabledTypes.forEach((type, index) => {
        const baseRange = rangePerType + (index < remainder ? 1 : 0);
        const minVal = Math.max(0, Math.floor(baseRange * 0.7)); // 70% of range as minimum
        const maxVal = baseRange;

        if (mode === 'percentage') {
          editedValue[type].minPercentage = minVal;
          editedValue[type].maxPercentage = maxVal;
        } else {
          editedValue[type].minCount = minVal;
          editedValue[type].maxCount = maxVal;
        }
      });
    } else if (hasRandomRanges) {
      // Mixed ranges - convert all to static values for simplicity
      enabledTypes.forEach((type) => {
        editedValue[type].randomRange = false;
      });

      // Then distribute static values equally
      const equalShare = Math.floor(maxValue / enabledTypes.length);
      const remainder = maxValue % enabledTypes.length;

      enabledTypes.forEach((type, index) => {
        const value = equalShare + (index < remainder ? 1 : 0);
        if (mode === 'percentage') {
          editedValue[type].percentageValue = value;
        } else {
          editedValue[type].countValue = value;
        }
      });
    } else {
      // All static values - distribute equally
      const equalShare = Math.floor(maxValue / enabledTypes.length);
      const remainder = maxValue % enabledTypes.length;

      enabledTypes.forEach((type, index) => {
        const value = equalShare + (index < remainder ? 1 : 0);
        if (mode === 'percentage') {
          editedValue[type].percentageValue = value;
        } else {
          editedValue[type].countValue = value;
        }
      });
    }
  } else {
    // Advanced mode - handle ranges
    if (!editedValue.ranges) {
      editedValue.ranges = [
        { from: 0, to: 30, songCount: 0, useAdvanced: false },
        { from: 31, to: 70, songCount: 0, useAdvanced: false },
        { from: 71, to: 100, songCount: 0, useAdvanced: false }
      ];
    }

    // Distribute equally among ranges
    const baseValue = Math.floor(maxValue / editedValue.ranges.length);
    const remainder = maxValue % editedValue.ranges.length;

    editedValue.ranges.forEach((range, index) => {
      range.songCount = baseValue + (index < remainder ? 1 : 0);
    });
  }
}

/**
 * Quick fix logic for songs-and-types nodes
 * Handles song types and song selection with random vs static logic
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @returns {void}
 */
export function quickFixSongsAndTypes(editedValue, mode, totalSongs) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;

  // Handle song types
  const enabledTypes = Object.keys(editedValue.songTypes || {}).filter(type => editedValue.songTypes[type].enabled);

  if (enabledTypes.length > 0) {
    const hasRandomRanges = enabledTypes.some(type => editedValue.songTypes[type].random);
    const allRandomRanges = hasRandomRanges && enabledTypes.every(type => editedValue.songTypes[type].random);

    if (allRandomRanges) {
      // All random ranges - distribute evenly
      const baseMin = Math.floor((maxValue * 0.1) / enabledTypes.length);
      const baseMax = Math.floor(maxValue / enabledTypes.length);
      const remainder = maxValue % enabledTypes.length;

      enabledTypes.forEach((type, index) => {
        if (mode === 'percentage') {
          editedValue.songTypes[type].percentageMin = baseMin;
          editedValue.songTypes[type].percentageMax = baseMax + (index < remainder ? 1 : 0);
        } else {
          editedValue.songTypes[type].countMin = baseMin;
          editedValue.songTypes[type].countMax = baseMax + (index < remainder ? 1 : 0);
        }
      });
    } else if (hasRandomRanges && !allRandomRanges) {
      // Mixed random and static - set static values to 0 and let random ranges fill
      const staticTypes = enabledTypes.filter(type => !editedValue.songTypes[type].random);
      const randomTypes = enabledTypes.filter(type => editedValue.songTypes[type].random);

      // Set static types to 0
      const targetProp = mode === 'percentage' ? 'percentage' : 'count';
      staticTypes.forEach(type => {
        editedValue.songTypes[type][targetProp] = 0;
      });

      // Distribute remaining space to random ranges
      const remaining = maxValue;
      if (randomTypes.length > 0) {
        const baseMin = Math.floor((remaining * 0.1) / randomTypes.length);
        const baseMax = Math.floor(remaining / randomTypes.length);
        const remainder = remaining % randomTypes.length;

        randomTypes.forEach((type, index) => {
          if (mode === 'percentage') {
            editedValue.songTypes[type].percentageMin = baseMin;
            editedValue.songTypes[type].percentageMax = baseMax + (index < remainder ? 1 : 0);
          } else {
            editedValue.songTypes[type].countMin = baseMin;
            editedValue.songTypes[type].countMax = baseMax + (index < remainder ? 1 : 0);
          }
        });
      }
    } else {
      // All static values - distribute equally
      const baseValue = Math.floor(maxValue / enabledTypes.length);
      const remainder = maxValue % enabledTypes.length;
      const targetProp = mode === 'percentage' ? 'percentage' : 'count';

      enabledTypes.forEach((type, index) => {
        const value = baseValue + (index < remainder ? 1 : 0);
        editedValue.songTypes[type][targetProp] = value;
      });
    }
  }

  // Handle song selection
  if (editedValue.songSelection) {
    const r = editedValue.songSelection.random;
    const w = editedValue.songSelection.watched;
    if (r && w) {
      const hasRandomRanges = r.random || w.random;
      const allRandomRanges = r.random && w.random;

      if (allRandomRanges) {
        // Both random - distribute evenly
        const baseMin = Math.floor((maxValue * 0.1) / 2);
        const baseMax = Math.floor(maxValue / 2);
        const remainder = maxValue % 2;

        if (mode === 'percentage') {
          r.percentageMin = baseMin;
          r.percentageMax = baseMax + (0 < remainder ? 1 : 0);
          w.percentageMin = baseMin;
          w.percentageMax = baseMax + (1 < remainder ? 1 : 0);
        } else {
          r.countMin = baseMin;
          r.countMax = baseMax + (0 < remainder ? 1 : 0);
          w.countMin = baseMin;
          w.countMax = baseMax + (1 < remainder ? 1 : 0);
        }
      } else if (hasRandomRanges) {
        // Mixed - set static to 0, distribute to random
        const staticTotal = (r.random ? 0 : (r[mode] || 0)) + (w.random ? 0 : (w[mode] || 0));
        const remaining = maxValue - staticTotal;

        if (r.random) {
          const baseMin = Math.floor((remaining * 0.1) / 2);
          const baseMax = Math.floor(remaining / 2);
          if (mode === 'percentage') {
            r.percentageMin = baseMin;
            r.percentageMax = baseMax;
          } else {
            r.countMin = baseMin;
            r.countMax = baseMax;
          }
        } else {
          r[mode] = 0;
        }

        if (w.random) {
          const baseMin = Math.floor((remaining * 0.1) / 2);
          const baseMax = Math.floor(remaining / 2);
          if (mode === 'percentage') {
            w.percentageMin = baseMin;
            w.percentageMax = baseMax;
          } else {
            w.countMin = baseMin;
            w.countMax = baseMax;
          }
        } else {
          w[mode] = 0;
        }
      } else {
        // Both static - distribute equally
        const baseValue = Math.floor(maxValue / 2);
        const remainder = maxValue % 2;
        const targetProp = mode === 'percentage' ? 'percentage' : 'count';

        r[targetProp] = baseValue + (0 < remainder ? 1 : 0);
        w[targetProp] = baseValue + (1 < remainder ? 1 : 0);
      }
    }
  }
}

/**
 * Quick fix logic for anime-type nodes
 * Handles advanced mode with static and random entries
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @returns {void}
 */
export function quickFixAnimeType(editedValue, mode, totalSongs) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;
  const animeTypeKeys = ['tv', 'movie', 'ova', 'ona', 'special'];

  // Collect entries
  const staticEntries = [];
  const randomEntries = [];
  for (const type of animeTypeKeys) {
    const entry = editedValue.advanced?.[type];
    if (!entry?.enabled) continue;
    if (entry.random) randomEntries.push(entry);
    else staticEntries.push(entry);
  }

  if (randomEntries.length === 0) {
    // All static: redistribute equally
    if (staticEntries.length > 0) {
      const equal = Math.floor(maxValue / staticEntries.length);
      const remainder = maxValue % staticEntries.length;
      staticEntries.forEach((entry, idx) => {
        const newValue = equal + (idx < remainder ? 1 : 0);
        entry.value = newValue;
        if (mode === 'percentage') {
          entry.percentageValue = Math.round((newValue / maxValue) * 100);
        } else {
          entry.countValue = newValue;
        }
      });
    }
  } else {
    if (staticEntries.length > 0) {
      // Mixed: scale down static proportionally, set random to zero range
      let staticTotal = staticEntries.reduce((s, e) => s + Number(e.value || 0), 0);
      let remaining = maxValue - staticTotal;

      if (remaining < 0) {
        // Too many in static; scale down proportionally
        if (staticTotal > 0) {
          const scale = maxValue / staticTotal;
          let scaled = staticEntries.map((e) =>
            Math.max(0, Math.floor(Number(e.value || 0) * scale))
          );
          let newTotal = scaled.reduce((s, v) => s + v, 0);
          let diff = maxValue - newTotal;
          for (let i = 0; diff > 0 && i < scaled.length; i++) {
            scaled[i]++;
            diff--;
            i = i === scaled.length - 1 && diff > 0 ? -1 : i;
          }
          staticEntries.forEach((e, idx) => {
            const newValue = scaled[idx];
            e.value = newValue;
            if (mode === 'percentage') {
              e.percentageValue = Math.round((newValue / maxValue) * 100);
            } else {
              e.countValue = newValue;
            }
          });
        }
      }

      // Set randoms to zero range
      randomEntries.forEach((e) => {
        e.min = 0;
        e.max = 0;
        if (mode === 'percentage') {
          e.percentageMin = 0;
          e.percentageMax = 0;
        } else {
          e.countMin = 0;
          e.countMax = 0;
        }
      });
    } else {
      // All random: distribute ranges evenly
      const baseMin = Math.floor((maxValue * 0.1) / randomEntries.length);
      const baseMax = Math.floor(maxValue / randomEntries.length);
      const remainder = maxValue % randomEntries.length;

      randomEntries.forEach((entry, index) => {
        const min = baseMin;
        const max = baseMax + (index < remainder ? 1 : 0);
        entry.min = min;
        entry.max = max;
        if (mode === 'percentage') {
          entry.percentageMin = min;
          entry.percentageMax = max;
        } else {
          entry.countMin = min;
          entry.countMax = max;
        }
      });
    }
  }
}

/**
 * Quick fix logic for song-categories nodes
 * Handles advanced mode with groups and categories
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @returns {void}
 */
export function quickFixSongCategories(editedValue, mode, totalSongs) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;
  const groups = ['openings', 'endings', 'inserts'];
  const categoryKeys = ['standard', 'instrumental', 'chanting', 'character'];

  // Collect entries
  const staticEntries = [];
  const randomEntries = [];
  for (const g of groups) {
    for (const c of categoryKeys) {
      const entry = editedValue.advanced?.[g]?.[c];
      if (!entry?.enabled) continue;
      if (entry.random) randomEntries.push(entry);
      else staticEntries.push(entry);
    }
  }

  if (randomEntries.length === 0) {
    // All static: redistribute equally
    if (staticEntries.length > 0) {
      const equal = Math.floor(maxValue / staticEntries.length);
      const remainder = maxValue % staticEntries.length;
      staticEntries.forEach((entry, idx) => {
        const newValue = equal + (idx < remainder ? 1 : 0);
        entry.value = newValue;
        if (mode === 'percentage') {
          entry.percentageValue = Math.round((newValue / maxValue) * 100);
        } else {
          entry.countValue = newValue;
        }
      });
    }
  } else {
    if (staticEntries.length > 0) {
      // Mixed: scale down static proportionally, set random to zero range
      let staticTotal = staticEntries.reduce((s, e) => s + Number(e.value || 0), 0);
      let remaining = maxValue - staticTotal;

      if (remaining < 0) {
        // Too many in static; scale down proportionally
        if (staticTotal > 0) {
          const scale = maxValue / staticTotal;
          let scaled = staticEntries.map((e) =>
            Math.max(0, Math.floor(Number(e.value || 0) * scale))
          );
          let newTotal = scaled.reduce((s, v) => s + v, 0);
          let diff = maxValue - newTotal;
          for (let i = 0; diff > 0 && i < scaled.length; i++) {
            scaled[i]++;
            diff--;
            i = i === scaled.length - 1 && diff > 0 ? -1 : i;
          }
          staticEntries.forEach((e, idx) => {
            const newValue = scaled[idx];
            e.value = newValue;
            if (mode === 'percentage') {
              e.percentageValue = Math.round((newValue / maxValue) * 100);
            } else {
              e.countValue = newValue;
            }
          });
        }
      }

      // Set randoms to zero range
      randomEntries.forEach((e) => {
        e.min = 0;
        e.max = 0;
        if (mode === 'percentage') {
          e.percentageMin = 0;
          e.percentageMax = 0;
        } else {
          e.countMin = 0;
          e.countMax = 0;
        }
      });
    } else {
      // All random: distribute ranges evenly
      const baseMin = Math.floor((maxValue * 0.1) / randomEntries.length);
      const baseMax = Math.floor(maxValue / randomEntries.length);
      const remainder = maxValue % randomEntries.length;

      randomEntries.forEach((entry, index) => {
        const min = baseMin;
        const max = baseMax + (index < remainder ? 1 : 0);
        entry.min = min;
        entry.max = max;
        if (mode === 'percentage') {
          entry.percentageMin = min;
          entry.percentageMax = max;
        } else {
          entry.countMin = min;
          entry.countMax = max;
        }
      });
    }
  }
}

/**
 * Quick fix logic for genres/tags nodes
 * Handles advanced mode with enabled entries
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @returns {void}
 */
export function quickFixGenresTags(editedValue, mode, totalSongs) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;
  const entries = editedValue.advanced || {};
  const enabledEntries = Object.keys(entries).filter(
    key => entries[key] && entries[key].enabled !== false
  );

  if (enabledEntries.length > 0) {
    const equalValue = Math.floor(maxValue / enabledEntries.length);
    const remainder = maxValue % enabledEntries.length;

    enabledEntries.forEach((key, index) => {
      const value = equalValue + (index < remainder ? 1 : 0);
      const entry = entries[key];

      if (mode === 'percentage') {
        entry.percentageValue = value;
      } else {
        entry.countValue = value;
      }
    });
  }
}

/**
 * Quick fix logic for score nodes (player-score/anime-score)
 * Handles score ranges from min to max
 * @param {Object} editedValue - Current node value
 * @param {string} mode - Current mode ('percentage' or 'count')
 * @param {number} totalSongs - Total songs for count mode
 * @param {number} minScore - Minimum score value
 * @param {number} maxScore - Maximum score value
 * @returns {void}
 */
export function quickFixScore(editedValue, mode, totalSongs, minScore, maxScore) {
  const maxValue = mode === 'percentage' ? 100 : totalSongs;
  const scoreRange = maxScore - minScore + 1;

  const equalValue = Math.floor(maxValue / scoreRange);
  const remainder = maxValue % scoreRange;

  for (let score = minScore; score <= maxScore; score++) {
    const value = equalValue + (score === maxScore ? remainder : 0);

    if (mode === 'percentage') {
      editedValue.percentages[score] = value;
    } else {
      editedValue.counts[score] = value;
    }
  }
}
