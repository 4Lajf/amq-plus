import { isConnectedToFinalFlow } from '$lib/components/amqplus/editor/utils/validationUtils.js';
import { NODE_CATEGORIES } from '$lib/components/amqplus/editor/utils/nodeDefinitions.js';
import { analyzeGroup } from '$lib/components/amqplus/editor/utils/mathUtils.js';

/** @typedef {import('../../types/types.js').QuizConfigurationData} QuizConfigurationData */
/** @typedef {import('../../types/types.js').QuizMetadata} QuizMetadata */

/**
 * Generates metadata for a quiz configuration
 * @param {QuizConfigurationData} configuration_data
 * @returns {QuizMetadata}
 */
export function generateQuizMetadata(configuration_data) {
  if (!configuration_data || !configuration_data.nodes) {
    return {
      estimatedSongs: { min: 0, max: 0 },
      difficulty: null,
      songTypes: null,
      songSelection: null
    };
  }

  const nodes = configuration_data.nodes || [];
  const edges = configuration_data.edges || [];
  let minSongs = 0;
  let maxSongs = 0;
  let totalSongs = 0;
  let difficultyData = null;
  let songTypesData = null;
  let songSelectionData = null;
  let sourceNodesData = [];
  let guessTimeData = null;

  // Get total songs first
  const numberOfSongsNodes = nodes.filter(node => node.type === 'numberOfSongs');
  if (numberOfSongsNodes.length > 0) {
    const data = numberOfSongsNodes[0].data?.currentValue || numberOfSongsNodes[0].data?.defaultValue || {};
    if (data.useRange) {
      minSongs = data.min || 0;
      maxSongs = data.max || 0;
    } else {
      const count = data.staticValue || 0;
      minSongs = count;
      maxSongs = count;
    }
  } else {
    minSongs = 20;
    maxSongs = 20;
  }

  // Analyze each node
  nodes.forEach((node) => {
    const nodeType = node.type;

    // Estimate song count from numberOfSongs nodes
    if (nodeType === 'numberOfSongs') {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      if (data.useRange) {
        minSongs = Math.max(minSongs, data.min || 0);
        maxSongs = Math.max(maxSongs, data.max || 0);
        totalSongs = Math.max(totalSongs, Math.round((data.min + data.max) / 2));
      } else {
        const count = data.staticValue || 0;
        minSongs = Math.max(minSongs, count);
        maxSongs = Math.max(maxSongs, count);
        totalSongs = Math.max(totalSongs, count);
      }
    }

    // Extract difficulty configuration from song-difficulty nodes
    if (nodeType === 'filter' && node.data?.id === 'song-difficulty') {
      const data = node.data?.currentValue || node.data?.defaultValue || {};

      if (data.viewMode === 'advanced' && data.ranges && data.ranges.length > 0) {
        // Advanced mode with custom ranges
        difficultyData = {
          mode: 'advanced',
          ranges: data.ranges.map(range => ({
            from: range.from,
            to: range.to,
            count: range.songCount || 0
          }))
        };
      } else {
        // Basic mode with easy/medium/hard
        const easy = data.easy || {};
        const medium = data.medium || {};
        const hard = data.hard || {};
        const mode = data.mode || 'percentage';

        const buildDifficultyLevel = (level) => {
          const result = {
            enabled: level.enabled,
            count: level.countValue || level.count,
            percentage: level.percentageValue || level.percentage,
            random: level.randomRange,
            minPercentage: level.minPercentage,
            maxPercentage: level.maxPercentage
          };

          // Add count ranges if randomRange is enabled
          if (level.randomRange) {
            if (level.minCount !== undefined && level.minCount !== null) {
              result.minCount = level.minCount;
            }
            if (level.maxCount !== undefined && level.maxCount !== null) {
              result.maxCount = level.maxCount;
            }
          }

          return result;
        };

        difficultyData = {
          mode: 'basic',
          levels: {
            easy: buildDifficultyLevel(easy),
            medium: buildDifficultyLevel(medium),
            hard: buildDifficultyLevel(hard)
          }
        };
      }
    }

    // Extract song types and selection from songs-and-types nodes
    if (nodeType === 'filter' && node.data?.id === 'songs-and-types') {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      const mode = data.mode || 'percentage';
      const isPercentageMode = mode === 'percentage';
      const targetTotal = isPercentageMode ? 100 : maxSongs;

      const songTypes = data.songTypes || {};
      const songSelection = data.songSelection || {};

      // Calculate actual allocations
      const { allocatedTypes, allocatedSelection } = calculateActualAllocations(data, maxSongs);

      // Extract song types with proper count/percentage handling
      const buildSongType = (type, allocatedInfo) => {
        if (!type) return {};

        const result = {
          enabled: type.enabled,
          random: type.random,
          percentage: type.percentage,
          percentageMin: type.percentageMin,
          percentageMax: type.percentageMax,
        };

        // Use allocated values - either range or static
        if (allocatedInfo && allocatedInfo.kind === 'range') {
          // For ranges, set minCount and maxCount to the allocated range
          result.count = allocatedInfo.min; // Use min as the primary count value
          result.minCount = allocatedInfo.min;
          result.maxCount = allocatedInfo.max;
        } else if (allocatedInfo && allocatedInfo.kind === 'static') {
          // For static values, just set count
          result.count = allocatedInfo.value;
          result.minCount = undefined;
          result.maxCount = undefined;
        } else {
          // Fallback to raw values if allocation info is missing
          result.count = type.count;
          result.minCount = type.random ? (type.min !== undefined ? type.min : type.countMin) : undefined;
          result.maxCount = type.random ? (type.max !== undefined ? type.max : type.countMax) : undefined;
        }

        return result;
      };

      songTypesData = {
        openings: buildSongType(songTypes.openings, allocatedTypes.openings),
        endings: buildSongType(songTypes.endings, allocatedTypes.endings),
        inserts: buildSongType(songTypes.inserts, allocatedTypes.inserts)
      };

      // Extract song selection with allocated values
      const buildSongSelection = (selection, allocatedInfo) => {
        if (!selection) return {};

        const result = {
          enabled: selection.enabled,
          random: selection.random,
          percentage: selection.percentage,
          percentageMin: selection.percentageMin,
          percentageMax: selection.percentageMax,
        };

        // Use allocated values - either range or static
        if (allocatedInfo && allocatedInfo.kind === 'range') {
          // For ranges, set minCount and maxCount to the allocated range
          result.count = allocatedInfo.min; // Use min as the primary count value
          result.minCount = allocatedInfo.min;
          result.maxCount = allocatedInfo.max;
        } else if (allocatedInfo && allocatedInfo.kind === 'static') {
          // For static values, just set count
          result.count = allocatedInfo.value;
          result.minCount = undefined;
          result.maxCount = undefined;
        } else {
          // Fallback to raw values if allocation info is missing
          result.count = selection.count;
          result.minCount = selection.random ? (selection.countMin !== undefined ? selection.countMin : selection.min) : undefined;
          result.maxCount = selection.random ? (selection.countMax !== undefined ? selection.countMax : selection.max) : undefined;
        }

        return result;
      };

      songSelectionData = {
        random: songSelection.random ? buildSongSelection(songSelection.random, allocatedSelection.random) : {},
        watched: songSelection.watched ? buildSongSelection(songSelection.watched, allocatedSelection.watched) : {}
      };
    }

    // Extract Song List node information (only if connected to final flow)
    if ((nodeType === 'songList' || node.data?.id === 'song-list') &&
      isConnectedToFinalFlow(node.id, edges, nodes)) {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      const mode = data.mode || 'masterlist';

      const sourceNodeInfo = {
        type: 'songList',
        mode: mode,
        useEntirePool: data.useEntirePool || false
      };

      if (mode === 'user-lists' && data.userListImport) {
        const statuses = [];
        if (data.userListImport.selectedLists?.completed) statuses.push('Completed');
        if (data.userListImport.selectedLists?.watching) statuses.push('Watching');
        if (data.userListImport.selectedLists?.planning) statuses.push('Planning');
        if (data.userListImport.selectedLists?.on_hold) statuses.push('On Hold');
        if (data.userListImport.selectedLists?.dropped) statuses.push('Dropped');

        sourceNodeInfo.userList = {
          username: data.userListImport.username || '',
          platform: data.userListImport.platform || 'anilist',
          lists: statuses
        };
      } else if (mode === 'saved-lists' && data.selectedListId) {
        sourceNodeInfo.savedList = {
          id: data.selectedListId,
          name: data.selectedListName || data.selectedListId
        };
      } else if (mode === 'provider' && data.providerImport) {
        sourceNodeInfo.provider = {
          type: data.providerImport.providerType || 'amq-export'
        };
      }

      if (data.songPercentage) {
        sourceNodeInfo.percentage = data.songPercentage.random ?
          `${data.songPercentage.min}-${data.songPercentage.max}%` :
          `${data.songPercentage.value}%`;
      }

      sourceNodesData.push(sourceNodeInfo);
    }

    // Extract Batch User List node information (only if connected to final flow)
    if ((nodeType === 'batchUserList' || node.data?.id === 'batch-user-list') &&
      isConnectedToFinalFlow(node.id, edges, nodes)) {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      const userEntries = data.userEntries || [];

      if (userEntries.length > 0) {
        const sourceNodeInfo = {
          type: 'batchUserList',
          useEntirePool: data.useEntirePool || false,
          playerCount: userEntries.length,
          players: userEntries.map((entry, idx) => {
            const statuses = [];
            if (entry.selectedLists?.completed) statuses.push('Completed');
            if (entry.selectedLists?.watching) statuses.push('Watching');
            if (entry.selectedLists?.planning) statuses.push('Planning');
            if (entry.selectedLists?.on_hold) statuses.push('On Hold');
            if (entry.selectedLists?.dropped) statuses.push('Dropped');

            return {
              username: entry.username || `User ${idx + 1}`,
              platform: entry.platform || 'anilist',
              lists: statuses,
              percentage: entry.songPercentage ?
                (entry.songPercentage.random ?
                  `${entry.songPercentage.min}-${entry.songPercentage.max}%` :
                  `${entry.songPercentage.value}%`) :
                null
            };
          })
        };

        // Add node-level percentage if set
        if (data.songPercentage) {
          sourceNodeInfo.percentage = data.songPercentage.random ?
            `${data.songPercentage.min}-${data.songPercentage.max}%` :
            `${data.songPercentage.value}%`;
        }

        // Add song selection mode if set
        if (data.songSelectionMode) {
          sourceNodeInfo.songSelectionMode = data.songSelectionMode;
        }

        sourceNodesData.push(sourceNodeInfo);
      } else {
        const sourceNodeInfo = {
          type: 'batchUserList',
          useEntirePool: data.useEntirePool || false,
          playerCount: 0,
          players: []
        };

        // Add node-level percentage if set
        if (data.songPercentage) {
          sourceNodeInfo.percentage = data.songPercentage.random ?
            `${data.songPercentage.min}-${data.songPercentage.max}%` :
            `${data.songPercentage.value}%`;
        }

        sourceNodesData.push(sourceNodeInfo);
      }
    }

    // Extract Live Node information (only if connected to final flow)
    if ((nodeType === 'liveNode' || (node.data?.id === 'live-node')) &&
      isConnectedToFinalFlow(node.id, edges, nodes)) {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      const userEntries = data.userEntries || [];

      if (userEntries.length > 0) {
        const sourceNodeInfo = {
          type: 'liveNode',
          hasLiveNode: true,
          useEntirePool: data.useEntirePool || false,
          playerCount: userEntries.length,
          players: userEntries.map((entry, idx) => {
            const statuses = [];
            if (entry.selectedLists?.completed) statuses.push('Completed');
            if (entry.selectedLists?.watching) statuses.push('Watching');
            if (entry.selectedLists?.planning) statuses.push('Planning');
            if (entry.selectedLists?.on_hold) statuses.push('On Hold');
            if (entry.selectedLists?.dropped) statuses.push('Dropped');

            return {
              username: entry.username || `Player ${idx + 1}`,
              platform: entry.platform || 'anilist',
              lists: statuses,
              percentage: entry.songPercentage ?
                (entry.songPercentage.random ?
                  `${entry.songPercentage.min}-${entry.songPercentage.max}%` :
                  `${entry.songPercentage.value}%`) :
                null
            };
          })
        };

        if (data.songPercentage) {
          sourceNodeInfo.percentage = data.songPercentage.random ?
            `${data.songPercentage.min}-${data.songPercentage.max}%` :
            `${data.songPercentage.value}%`;
        }

        // Add song selection mode if set
        if (data.songSelectionMode) {
          sourceNodeInfo.songSelectionMode = data.songSelectionMode;
        }

        sourceNodesData.push(sourceNodeInfo);
      } else {
        // Live Node exists but no players configured yet
        const sourceNodeInfo = {
          type: 'liveNode',
          hasLiveNode: true,
          useEntirePool: data.useEntirePool || false,
          playerCount: 0,
          players: []
        };

        if (data.songPercentage) {
          sourceNodeInfo.percentage = data.songPercentage.random ?
            `${data.songPercentage.min}-${data.songPercentage.max}%` :
            `${data.songPercentage.value}%`;
        }

        // Add song selection mode if set
        if (data.songSelectionMode) {
          sourceNodeInfo.songSelectionMode = data.songSelectionMode;
        }

        sourceNodesData.push(sourceNodeInfo);
      }
    }

    // Extract Basic Settings for guess time
    if (nodeType === 'basicSettings') {
      const data = node.data?.currentValue || node.data?.defaultValue || {};
      const guessTime = data.guessTime || {};
      const extraGuessTime = data.extraGuessTime || {};

      guessTimeData = {
        guessTime: {
          useRange: guessTime.useRange || false,
          staticValue: guessTime.staticValue,
          min: guessTime.min,
          max: guessTime.max
        },
        extraGuessTime: {
          useRange: extraGuessTime.useRange || false,
          staticValue: extraGuessTime.staticValue,
          min: extraGuessTime.min,
          max: extraGuessTime.max
        }
      };
    }
  });

  return {
    estimatedSongs: {
      min: minSongs || 0,
      max: maxSongs || 0
    },
    difficulty: difficultyData,
    songTypes: songTypesData,
    songSelection: songSelectionData,
    sourceNodes: sourceNodesData.length > 0 ? sourceNodesData : null,
    guessTime: guessTimeData
  };
}


/**
 * Calculates actual allocation values for songs-and-types node.
 * @param {object} data - The node's currentValue data.
 * @param {number} totalSongs - The total number of songs.
 * @returns {{allocatedTypes: {openings: number, endings: number, inserts: number}, allocatedSelection: {random: number, watched: number}}}
 */
function calculateActualAllocations(data, totalSongs) {
  const mode = data.mode || 'percentage';
  const isPercentageMode = mode === 'percentage';
  const targetTotal = isPercentageMode ? 100 : totalSongs;

  const songTypes = data.songTypes || {};
  const songSelection = data.songSelection || {};

  const enabledTypes = ['openings', 'endings', 'inserts'].filter((t) => songTypes[t]?.enabled);

  // Build entries for song types
  const typeEntries = enabledTypes.map((t) => {
    const cfg = songTypes[t] || {};
    if (isPercentageMode) {
      if (cfg.random)
        return {
          label: t,
          kind: 'range',
          min: Number(cfg.percentageMin ?? cfg.min ?? 0),
          max: Number(cfg.percentageMax ?? cfg.max ?? 0)
        };
      return { label: t, kind: 'static', value: Number(cfg.percentage ?? 0) };
    }
    // count mode
    if (cfg.random)
      return {
        label: t,
        kind: 'range',
        min: Number(cfg.countMin ?? cfg.min ?? 0),
        max: Number(cfg.countMax ?? cfg.max ?? 0)
      };
    return { label: t, kind: 'static', value: Number(cfg.count ?? 0) };
  });

  // Build entries for selection
  const randomCfg = songSelection.random || {};
  const watchedCfg = songSelection.watched || {};
  const selEntries = [
    randomCfg.random
      ? {
        label: 'random',
        kind: 'range',
        min: isPercentageMode
          ? Number(randomCfg.percentageMin ?? 0)
          : Number(randomCfg.countMin ?? 0),
        max: isPercentageMode
          ? Number(randomCfg.percentageMax ?? 100)
          : Number(randomCfg.countMax ?? targetTotal)
      }
      : {
        label: 'random',
        kind: 'static',
        value: isPercentageMode
          ? Number(randomCfg.percentage ?? 0)
          : Number(randomCfg.count ?? 0)
      },
    watchedCfg.random
      ? {
        label: 'watched',
        kind: 'range',
        min: isPercentageMode
          ? Number(watchedCfg.percentageMin ?? 0)
          : Number(watchedCfg.countMin ?? 0),
        max: isPercentageMode
          ? Number(watchedCfg.percentageMax ?? 100)
          : Number(watchedCfg.countMax ?? targetTotal)
      }
      : {
        label: 'watched',
        kind: 'static',
        value: isPercentageMode
          ? Number(watchedCfg.percentage ?? (isPercentageMode ? 100 : targetTotal))
          : Number(watchedCfg.count ?? targetTotal)
      }
  ];

  const typeAnalysis = analyzeGroup(typeEntries, targetTotal);
  const selAnalysis = analyzeGroup(selEntries, targetTotal);

  // Store both single values and ranges for types
  const allocatedTypes = { openings: null, endings: null, inserts: null };
  enabledTypes.forEach((t) => {
    const info = typeAnalysis.refined.get(t);
    const cfg = songTypes[t] || {};
    if (info) {
      if (info.type === 'range' && cfg.random && info.min < info.max) {
        // Store range information
        allocatedTypes[t] = { kind: 'range', min: info.min, max: info.max };
      } else {
        // Store single value
        const value = info.type === 'range' ? info.min : info.value;
        allocatedTypes[t] = { kind: 'static', value: value };
      }
    }
  });

  // Store both single values and ranges for selection
  const allocatedSelection = { random: null, watched: null };
  const randomInfo = selAnalysis.refined.get('random');
  if (randomInfo) {
    if (randomInfo.type === 'range' && randomCfg.random && randomInfo.min < randomInfo.max) {
      allocatedSelection.random = { kind: 'range', min: randomInfo.min, max: randomInfo.max };
    } else {
      const value = randomInfo.type === 'range' ? randomInfo.min : randomInfo.value;
      allocatedSelection.random = { kind: 'static', value: value };
    }
  }
  const watchedInfo = selAnalysis.refined.get('watched');
  if (watchedInfo) {
    if (watchedInfo.type === 'range' && watchedCfg.random && watchedInfo.min < watchedInfo.max) {
      allocatedSelection.watched = { kind: 'range', min: watchedInfo.min, max: watchedInfo.max };
    } else {
      const value = watchedInfo.type === 'range' ? watchedInfo.min : watchedInfo.value;
      allocatedSelection.watched = { kind: 'static', value: value };
    }
  }

  return { allocatedTypes, allocatedSelection };
}

