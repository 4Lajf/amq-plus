import { analyzeGroup } from '$lib/utils/mathUtils.js';

/** @typedef {import('../../types/types.js').QuizConfigurationData} QuizConfigurationData */
/** @typedef {import('../../types/types.js').QuizMetadata} QuizMetadata */

const EMPTY_META = {
  estimatedSongs: { min: 0, max: 0 },
  difficulty: null,
  songTypes: null,
  songSelection: null
};

/**
 * Generates metadata for a quiz configuration (v2 routes format).
 * Aggregates across all enabled routes.
 * @param {QuizConfigurationData} configuration_data
 * @returns {QuizMetadata}
 */
export function generateQuizMetadata(configuration_data) {
  if (!configuration_data) return { ...EMPTY_META };

  const routes = configuration_data.routes;
  if (!Array.isArray(routes) || routes.length === 0) return { ...EMPTY_META };

  const enabled = routes.filter((r) => r.enabled !== false);
  if (enabled.length === 0) return { ...EMPTY_META };

  let minSongs = 0;
  let maxSongs = 0;
  let difficultyData = null;
  let songTypesData = null;
  let songSelectionData = null;
  let sourceNodesData = [];
  let guessTimeData = null;
  let vintageData = null;

  for (const route of enabled) {
    // ── Number of songs ──────────────────────────────────────────
    const nos = route.numberOfSongs;
    if (nos) {
      if (nos.useRange) {
        minSongs = Math.max(minSongs, nos.min || 0);
        maxSongs = Math.max(maxSongs, nos.max || 0);
      } else {
        const count = nos.staticValue || 0;
        minSongs = Math.max(minSongs, count);
        maxSongs = Math.max(maxSongs, count);
      }
    }

    // ── Basic settings → guess time ─────────────────────────────
    const bs = route.basicSettings;
    if (bs && !guessTimeData) {
      const extractValue = (input) => {
        if (typeof input === 'number') return { useRange: false, staticValue: input };
        if (input?.value) return input.value;
        return input || {};
      };
      const gt = extractValue(bs.guessTime);
      const egt = extractValue(bs.extraGuessTime);
      guessTimeData = {
        guessTime: {
          useRange: gt.useRange || false,
          staticValue: gt.staticValue ?? 20,
          min: gt.min ?? 15,
          max: gt.max ?? 25
        },
        extraGuessTime: {
          useRange: egt.useRange || false,
          staticValue: egt.staticValue ?? 0,
          min: egt.min ?? 5,
          max: egt.max ?? 15
        }
      };
    }

    // ── Filters ─────────────────────────────────────────────────
    for (const f of route.filters || []) {
      if (f.enabled === false) continue;
      const data = f.settings || {};

      // Vintage
      if (f.filterId === 'vintage' && !vintageData) {
        if (data.ranges && data.ranges.length > 0) {
          const mode = data.mode || 'percentage';
          const isPercentageMode = mode === 'percentage';
          const targetTotal = isPercentageMode ? 100 : maxSongs;
          let advancedTotal = 0;

          const ranges = data.ranges.map((range) => {
            let value = 0;
            if (range.useAdvanced) {
              value = isPercentageMode ? (range.percentage || 0) : (range.count || 0);
              advancedTotal += value;
            }
            return {
              from: range.from,
              to: range.to,
              type: range.useAdvanced ? 'advanced' : 'random',
              percentage: range.useAdvanced && isPercentageMode ? value : undefined,
              count: range.useAdvanced && !isPercentageMode ? value : undefined,
              estimatedCount: range.useAdvanced
                ? (isPercentageMode ? Math.round(maxSongs * value / 100) : value)
                : undefined
            };
          });

          const remaining = Math.max(0, targetTotal - advancedTotal);
          const randomRanges = ranges.filter((r) => r.type === 'random');
          if (randomRanges.length > 0 && remaining > 0) {
            const perRange = remaining / randomRanges.length;
            randomRanges.forEach((range) => {
              range.estimatedCount = isPercentageMode
                ? Math.round(maxSongs * perRange / 100) : Math.round(perRange);
              if (isPercentageMode) range.percentage = perRange;
              else range.count = Math.round(perRange);
            });
          }

          vintageData = { mode, ranges };
        }
      }

      // Song difficulty
      if (f.filterId === 'song-difficulty' && !difficultyData) {
        if (data.viewMode === 'advanced' && data.ranges && data.ranges.length > 0) {
          difficultyData = {
            mode: 'advanced',
            ranges: data.ranges.map((range) => ({
              from: range.from, to: range.to, count: range.songCount || 0
            }))
          };
        } else {
          const easy = data.easy || {};
          const medium = data.medium || {};
          const hard = data.hard || {};
          const buildLevel = (level) => {
            const result = {
              enabled: level.enabled,
              count: level.countValue ?? level.count,
              percentage: level.percentageValue ?? level.percentage,
              random: level.randomRange,
              minPercentage: level.minPercentage,
              maxPercentage: level.maxPercentage
            };
            if (level.randomRange) {
              if (level.minCount != null) result.minCount = level.minCount;
              if (level.maxCount != null) result.maxCount = level.maxCount;
            }
            return result;
          };
          difficultyData = {
            mode: 'basic',
            levels: { easy: buildLevel(easy), medium: buildLevel(medium), hard: buildLevel(hard) }
          };
        }
      }

      // Songs and types
      if (f.filterId === 'songs-and-types' && !songTypesData) {
        const { allocatedTypes, allocatedSelection } = calculateActualAllocations(data, maxSongs);
        const songTypes = data.songTypes || {};
        const songSelection = data.songSelection || {};

        const buildSongType = (type, allocInfo) => {
          if (!type) return {};
          const result = {
            enabled: type.enabled, random: type.random,
            percentage: type.percentage, percentageMin: type.percentageMin, percentageMax: type.percentageMax
          };
          if (allocInfo && allocInfo.kind === 'range') {
            result.count = allocInfo.min; result.minCount = allocInfo.min; result.maxCount = allocInfo.max;
          } else if (allocInfo && allocInfo.kind === 'static') {
            result.count = allocInfo.value; result.minCount = undefined; result.maxCount = undefined;
          } else {
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

        const buildSel = (sel, allocInfo) => {
          if (!sel) return {};
          const result = {
            enabled: sel.enabled, random: sel.random,
            percentage: sel.percentage, percentageMin: sel.percentageMin, percentageMax: sel.percentageMax
          };
          if (allocInfo && allocInfo.kind === 'range') {
            result.count = allocInfo.min; result.minCount = allocInfo.min; result.maxCount = allocInfo.max;
          } else if (allocInfo && allocInfo.kind === 'static') {
            result.count = allocInfo.value; result.minCount = undefined; result.maxCount = undefined;
          } else {
            result.count = sel.count;
            result.minCount = sel.random ? (sel.countMin ?? sel.min) : undefined;
            result.maxCount = sel.random ? (sel.countMax ?? sel.max) : undefined;
          }
          return result;
        };

        songSelectionData = {
          random: songSelection.random ? buildSel(songSelection.random, allocatedSelection.random) : {},
          watched: songSelection.watched ? buildSel(songSelection.watched, allocatedSelection.watched) : {}
        };
      }
    }

    // ── Sources ──────────────────────────────────────────────────
    for (const src of route.sources || []) {
      const type = src.sourceType || 'song-list';
      const data = src;

      if (type === 'song-list') {
        const info = { type: 'songList', mode: data.mode || 'masterlist', useEntirePool: data.useEntirePool || false };
        if (data.mode === 'user-lists' && data.userListImport) {
          const statuses = [];
          if (data.userListImport.selectedLists?.completed) statuses.push('Completed');
          if (data.userListImport.selectedLists?.watching) statuses.push('Watching');
          if (data.userListImport.selectedLists?.planning) statuses.push('Planning');
          if (data.userListImport.selectedLists?.on_hold) statuses.push('On Hold');
          if (data.userListImport.selectedLists?.dropped) statuses.push('Dropped');
          info.userList = { username: data.userListImport.username || '', platform: data.userListImport.platform || 'anilist', lists: statuses };
        } else if (data.mode === 'saved-lists' && data.selectedListId) {
          info.savedList = { id: data.selectedListId, name: data.selectedListName || data.selectedListId };
        } else if (data.mode === 'provider' && data.providerImport) {
          info.provider = { type: data.providerImport.providerType || 'amq-export' };
        }
        if (data.songPercentage) {
          info.percentage = data.songPercentage.random
            ? `${data.songPercentage.min}-${data.songPercentage.max}%` : `${data.songPercentage.value}%`;
        }
        sourceNodesData.push(info);
      } else if (type === 'batch-user-list') {
        const entries = data.userEntries || [];
        const info = {
          type: 'batchUserList', useEntirePool: data.useEntirePool || false,
          playerCount: entries.length,
          players: entries.map((e, i) => {
            const s = [];
            if (e.selectedLists?.completed) s.push('Completed');
            if (e.selectedLists?.watching) s.push('Watching');
            if (e.selectedLists?.planning) s.push('Planning');
            if (e.selectedLists?.on_hold) s.push('On Hold');
            if (e.selectedLists?.dropped) s.push('Dropped');
            return {
              username: e.username || `User ${i + 1}`, platform: e.platform || 'anilist', lists: s,
              percentage: e.songPercentage ? (e.songPercentage.random ? `${e.songPercentage.min}-${e.songPercentage.max}%` : `${e.songPercentage.value}%`) : null
            };
          })
        };
        if (data.songPercentage) info.percentage = data.songPercentage.random ? `${data.songPercentage.min}-${data.songPercentage.max}%` : `${data.songPercentage.value}%`;
        if (data.songSelectionMode) info.songSelectionMode = data.songSelectionMode;
        sourceNodesData.push(info);
      } else if (type === 'live-node') {
        const entries = data.userEntries || [];
        const info = {
          type: 'liveNode', hasLiveNode: true, useEntirePool: data.useEntirePool || false,
          playerCount: entries.length,
          players: entries.map((e, i) => {
            const s = [];
            if (e.selectedLists?.completed) s.push('Completed');
            if (e.selectedLists?.watching) s.push('Watching');
            if (e.selectedLists?.planning) s.push('Planning');
            if (e.selectedLists?.on_hold) s.push('On Hold');
            if (e.selectedLists?.dropped) s.push('Dropped');
            return {
              username: e.username || `Player ${i + 1}`, platform: e.platform || 'anilist', lists: s,
              percentage: e.songPercentage ? (e.songPercentage.random ? `${e.songPercentage.min}-${e.songPercentage.max}%` : `${e.songPercentage.value}%`) : null
            };
          })
        };
        if (data.songPercentage) info.percentage = data.songPercentage.random ? `${data.songPercentage.min}-${data.songPercentage.max}%` : `${data.songPercentage.value}%`;
        if (data.songSelectionMode) info.songSelectionMode = data.songSelectionMode;
        sourceNodesData.push(info);
      }
    }
  }

  if (minSongs === 0 && maxSongs === 0) {
    minSongs = 20;
    maxSongs = 20;
  }

  return {
    estimatedSongs: { min: minSongs, max: maxSongs },
    difficulty: difficultyData,
    songTypes: songTypesData,
    songSelection: songSelectionData,
    sourceNodes: sourceNodesData.length > 0 ? sourceNodesData : null,
    guessTime: guessTimeData,
    vintage: vintageData
  };
}


/**
 * Calculates actual allocation values for songs-and-types filter settings.
 */
function calculateActualAllocations(data, totalSongs) {
  const mode = data.mode || 'percentage';
  const isPercentageMode = mode === 'percentage';
  const targetTotal = isPercentageMode ? 100 : totalSongs;

  const songTypes = data.songTypes || {};
  const songSelection = data.songSelection || {};

  const enabledTypes = ['openings', 'endings', 'inserts'].filter((t) => songTypes[t]?.enabled);

  const typeEntries = enabledTypes.map((t) => {
    const cfg = songTypes[t] || {};
    if (isPercentageMode) {
      if (cfg.random)
        return { label: t, kind: 'range', min: Number(cfg.percentageMin ?? cfg.min ?? 0), max: Number(cfg.percentageMax ?? cfg.max ?? 0) };
      return { label: t, kind: 'static', value: Number(cfg.percentage ?? 0) };
    }
    if (cfg.random)
      return { label: t, kind: 'range', min: Number(cfg.countMin ?? cfg.min ?? 0), max: Number(cfg.countMax ?? cfg.max ?? 0) };
    return { label: t, kind: 'static', value: Number(cfg.count ?? 0) };
  });

  const randomCfg = songSelection.random || {};
  const watchedCfg = songSelection.watched || {};
  const selEntries = [
    randomCfg.random
      ? { label: 'random', kind: 'range', min: isPercentageMode ? Number(randomCfg.percentageMin ?? 0) : Number(randomCfg.countMin ?? 0), max: isPercentageMode ? Number(randomCfg.percentageMax ?? 100) : Number(randomCfg.countMax ?? targetTotal) }
      : { label: 'random', kind: 'static', value: isPercentageMode ? Number(randomCfg.percentage ?? 0) : Number(randomCfg.count ?? 0) },
    watchedCfg.random
      ? { label: 'watched', kind: 'range', min: isPercentageMode ? Number(watchedCfg.percentageMin ?? 0) : Number(watchedCfg.countMin ?? 0), max: isPercentageMode ? Number(watchedCfg.percentageMax ?? 100) : Number(watchedCfg.countMax ?? targetTotal) }
      : { label: 'watched', kind: 'static', value: isPercentageMode ? Number(watchedCfg.percentage ?? (isPercentageMode ? 100 : targetTotal)) : Number(watchedCfg.count ?? targetTotal) }
  ];

  const typeAnalysis = analyzeGroup(typeEntries, targetTotal);
  const selAnalysis = analyzeGroup(selEntries, targetTotal);

  const allocatedTypes = { openings: null, endings: null, inserts: null };
  enabledTypes.forEach((t) => {
    const info = typeAnalysis.refined.get(t);
    const cfg = songTypes[t] || {};
    if (info) {
      if (info.type === 'range' && cfg.random && info.min < info.max)
        allocatedTypes[t] = { kind: 'range', min: info.min, max: info.max };
      else
        allocatedTypes[t] = { kind: 'static', value: info.type === 'range' ? info.min : info.value };
    }
  });

  const allocatedSelection = { random: null, watched: null };
  const rInfo = selAnalysis.refined.get('random');
  if (rInfo) {
    if (rInfo.type === 'range' && randomCfg.random && rInfo.min < rInfo.max)
      allocatedSelection.random = { kind: 'range', min: rInfo.min, max: rInfo.max };
    else
      allocatedSelection.random = { kind: 'static', value: rInfo.type === 'range' ? rInfo.min : rInfo.value };
  }
  const wInfo = selAnalysis.refined.get('watched');
  if (wInfo) {
    if (wInfo.type === 'range' && watchedCfg.random && wInfo.min < wInfo.max)
      allocatedSelection.watched = { kind: 'range', min: wInfo.min, max: wInfo.max };
    else
      allocatedSelection.watched = { kind: 'static', value: wInfo.type === 'range' ? wInfo.min : wInfo.value };
  }

  return { allocatedTypes, allocatedSelection };
}
