/**
 * Songs and Types Filter Definition
 * Filters by song type (openings/endings/inserts) and selection mode (random/watched)
 * 
 * @module filters/definitions/songsAndTypes
 */

import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { SONGS_AND_TYPES_DEFAULT_SETTINGS } from '../../defaultNodeSettings.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateAllocation } from '../../validation/commonValidators.js';
import { createValidationContext, getMode, buildEntry } from '../FilterBase.js';
import { allocateToTotal, analyzeGroup } from '../../mathUtils.js';
import { extractSongsAndTypesDisplay } from '../../displayUtils.js';

/**
 * Validate songs and types configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Validation context
 * @returns {ValidationResult}
 */
function validateSongsAndTypes(value, context) {
  const result = new ValidationResult();
  const v = value || {};
  const mode = v.mode || 'count';
  const st = v.songTypes || {};
  const enabledKeys = ['openings', 'endings', 'inserts'].filter((k) => st[k]?.enabled);

  // Get total songs for validation
  let totalSongs = 20; // default
  if (context.inheritedSongCount) {
    if (typeof context.inheritedSongCount === 'object') {
      totalSongs = Number(context.inheritedSongCount.max ?? context.inheritedSongCount.value ?? 20);
    } else {
      totalSongs = Number(context.inheritedSongCount) || 20;
    }
  }

  const maxValue = mode === 'percentage' ? 100 : totalSongs;

  // Validate song types
  let sumStatic = 0;
  let sumMin = 0;
  let sumMax = 0;
  let hasRandom = false;
  let hasStatic = false;

  for (const k of enabledKeys) {
    const cfg = st[k] || {};
    if (cfg.random) {
      hasRandom = true;
      const minC =
        mode === 'percentage'
          ? Number(cfg.percentageMin ?? cfg.min ?? 0)
          : Number(cfg.countMin ?? cfg.min ?? 0);
      const maxC =
        mode === 'percentage'
          ? Number(cfg.percentageMax ?? cfg.max ?? 0)
          : Number(cfg.countMax ?? cfg.max ?? 0);
      if (
        !Number.isFinite(minC) ||
        !Number.isFinite(maxC) ||
        minC < 0 ||
        maxC > maxValue ||
        minC > maxC
      ) {
        result.addError(`${k} range invalid`);
      } else {
        sumMin += minC;
        sumMax += maxC;
      }
    } else {
      hasStatic = true;
      let c;
      if (mode === 'percentage') {
        c = Number(cfg.percentage ?? 0);
      } else {
        c = Number(cfg.count ?? 0);
      }
      if (!Number.isFinite(c) || c < 0 || c > maxValue) {
        result.addError(`${k} value invalid`);
      } else {
        sumStatic += c;
      }
    }
  }

  // Validate totals
  if (!hasRandom) {
    // All static - must sum to maxValue
    if (sumStatic !== maxValue) {
      let unit, maxUnit;
      if (mode === 'percentage') {
        unit = '%';
        maxUnit = '%';
      } else {
        unit = ' songs';
        maxUnit = '';
      }
      result.addError(`Song types total ${sumStatic}${unit} (must be ${maxValue}${maxUnit})`);
    }
  } else if (hasRandom && hasStatic) {
    // Mixed - static + min must not exceed maxValue
    if (sumMin + sumStatic > maxValue) {
      result.addError('Song types ranges exceed total');
    }
  } else if (hasRandom && !hasStatic) {
    // All random - must be able to cover maxValue
    if (sumMin > maxValue || sumMax < maxValue) {
      result.addError('Song types ranges cannot reach total');
    }
  }

  // Song selection validation
  const sel = v.songSelection || {};
  for (const key of ['random', 'watched']) {
    const cfg = sel[key];
    if (!cfg) continue;
    if (cfg.randomRange || cfg.random) {
      const min = Number(cfg.min ?? 0);
      const maxCap =
        typeof context.inheritedSongCount === 'object'
          ? Number(context.inheritedSongCount.max ?? 0)
          : Number(context.inheritedSongCount ?? 0);
      const max = Number(cfg.max ?? maxCap);
      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min < 0 ||
        max > maxCap ||
        min > max
      ) {
        result.addError(`${key} range invalid`);
      }
    } else {
      const val = Number(cfg.value ?? 0);
      const cap =
        typeof context.inheritedSongCount === 'object'
          ? Number(context.inheritedSongCount.max ?? 0)
          : Number(context.inheritedSongCount ?? 0);
      if (!Number.isFinite(val) || val < 0 || val > cap) {
        result.addError(`${key} value invalid`);
      }
    }
  }

  return result;
}

/**
 * Display songs and types configuration
 * @param {Object} value - Filter value
 * @param {Object} context - Display context
 * @returns {string}
 */
function displaySongsAndTypes(value, context) {
	if (!value) return '[ERROR: Missing filter value]';
	if (!value.songTypes) return '[ERROR: Missing songTypes]';
	if (!value.songSelection) return '[ERROR: Missing songSelection]';

	const mode = value.mode || 'percentage';
	const isPercentageMode = mode === 'percentage';
	const unit = isPercentageMode ? '%' : '';
	const st = value.songTypes || {};
	const sel = value.songSelection || {};

	// Get inherited song count from context
	const inheritedSongCount = context.inheritedSongCount;
	if (!inheritedSongCount) {
		return '[ERROR: Missing inheritedSongCount]';
	}

	let targetTotal;
	if (isPercentageMode) {
		targetTotal = 100;
	} else if (typeof inheritedSongCount === 'object') {
		targetTotal = Number(inheritedSongCount.max ?? inheritedSongCount.value ?? 20);
	} else {
		targetTotal = Number(inheritedSongCount) || 20;
	}

	const enabledTypes = ['openings', 'endings', 'inserts'].filter((t) => st[t]?.enabled);
	if (enabledTypes.length === 0) return 'No song types enabled';

	// Build entries for song types
	const typeEntries = enabledTypes.map((t) => {
		const cfg = st[t] || {};
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
	const randomCfg = sel.random || {};
	const watchedCfg = sel.watched || {};
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

	// Analyze allocations
	const typeAnalysis = analyzeGroup(typeEntries, targetTotal);
	const selAnalysis = analyzeGroup(selEntries, targetTotal);

	const parts = [];
	const typeLabels = { openings: 'OP', endings: 'ED', inserts: 'IN' };

	// Format song types
	enabledTypes.forEach((t) => {
		const info = typeAnalysis.refined.get(t);
		if (!info) return;

		const label = typeLabels[t];
		if (info.type === 'range' && info.min < info.max && typeAnalysis.hasRandom) {
			parts.push(`${label} ${info.min}-${info.max}${unit}`);
		} else {
			const value = info.type === 'range' ? info.min : info.value;
			parts.push(`${label} ${value}${unit}`);
		}
	});

	// Format song selection
	const selParts = [];
	const randomInfo = selAnalysis.refined.get('random');
	if (randomInfo) {
		if (randomInfo.type === 'range' && randomInfo.min < randomInfo.max && selAnalysis.hasRandom) {
			selParts.push(`R:${randomInfo.min}-${randomInfo.max}`);
		} else {
			const value = randomInfo.type === 'range' ? randomInfo.min : randomInfo.value;
			selParts.push(`R:${value}`);
		}
	}

	const watchedInfo = selAnalysis.refined.get('watched');
	if (watchedInfo) {
		if (watchedInfo.type === 'range' && watchedInfo.min < watchedInfo.max && selAnalysis.hasRandom) {
			selParts.push(`W:${watchedInfo.min}-${watchedInfo.max}`);
		} else {
			const value = watchedInfo.type === 'range' ? watchedInfo.min : watchedInfo.value;
			selParts.push(`W:${value}`);
		}
	}
	if (selParts.length > 0) {
		parts.push(`(${selParts.join('/')})`);
	}

	return parts.join(', ');
}

/**
 * Extract songs and types settings for export
 * @param {Object} value - Filter value
 * @param {Object} context - Extract context
 * @returns {Object}
 */
function extractSongsAndTypes(value, context) {
  return extractSongsAndTypesDisplay(value, context.inheritedSongCount);
}

/**
 * Resolve songs and types to static values
 * @param {Object} node - Node instance
 * @param {Object} context - Resolution context
 * @param {() => number} rng - Random number generator
 * @returns {Object}
 */
function resolveSongsAndTypes(node, context, rng) {
  const value = node.data.currentValue;

  if (!context.inheritedSongCount) {
    throw new Error('inheritedSongCount is required in context for songs-and-types resolution');
  }
  const inheritedSongCount = context.inheritedSongCount;

  if (!value.mode) {
    throw new Error('mode is required for songs-and-types resolution');
  }
  const mode = value.mode;

  if (!value.songTypes) {
    throw new Error('songTypes is required for songs-and-types resolution');
  }
  const st = value.songTypes;

  // Determine total target
  const targetTotal = mode === 'percentage' ? 100 : inheritedSongCount;

  // Build type entries for allocation
  const enabled = ['openings', 'endings', 'inserts'].filter((k) => st[k]?.enabled ?? false);
  const typeEntries = enabled.map((t) => {
    const cfg = st[t];
    if (!cfg) {
      throw new Error(`Song type configuration for "${t}" is missing`);
    }
    if (!cfg.enabled) {
      throw new Error(`Song type "${t}" must be enabled`);
    }
    if (mode === 'percentage') {
      if (cfg.random) {
        const min = cfg.percentageMin ?? cfg.min;
        const max = cfg.percentageMax ?? cfg.max;
        if (min === undefined || min === null || max === undefined || max === null) {
          throw new Error(`Range min/max values are required for "${t}" song type (mode: percentage)`);
        }
        return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
          label: t,
          kind: 'range',
          min: Number(min),
          max: Number(max)
        });
      }
      const val = cfg.percentage;
      if (val === undefined || val === null) {
        throw new Error(`Percentage value is required for "${t}" song type (mode: percentage)`);
      }
      return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
        label: t,
        kind: 'static',
        value: Number(val)
      });
    } else {
      // count mode
      if (cfg.random) {
        const min = cfg.countMin ?? cfg.min;
        const max = cfg.countMax ?? cfg.max;
        if (min === undefined || min === null || max === undefined || max === null) {
          throw new Error(`Range min/max values are required for "${t}" song type (mode: count)`);
        }
        return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
          label: t,
          kind: 'range',
          min: Number(min),
          max: Number(max)
        });
      }
      const val = cfg.count;
      if (val === undefined || val === null) {
        throw new Error(`Count value is required for "${t}" song type (mode: count)`);
      }
      return /** @type {import('../../mathUtils.js').AllocationEntry} */ ({
        label: t,
        kind: 'static',
        value: Number(val)
      });
    }
  });

  // Allocate song types
  const typeAllocation = allocateToTotal(typeEntries, targetTotal, rng);
  const resolvedTypes = {};
  const typesRanges = {};
  enabled.forEach((t) => {
    const allocated = typeAllocation.get(t);
    if (allocated === undefined) {
      throw new Error(`Allocation failed for song type "${t}"`);
    }
    resolvedTypes[t] = allocated;
    // Extract original ranges for flexibility
    const entry = typeEntries.find(e => e.label === t);
    if (entry) {
      if (entry.kind === 'range') {
        typesRanges[t] = { min: entry.min, max: entry.max };
      } else {
        // Static values have no flexibility
        typesRanges[t] = { min: entry.value, max: entry.value };
      }
    }
  });

  // Song selection allocation (random vs watched)
  if (!value.songSelection) {
    throw new Error('songSelection is required for songs-and-types resolution');
  }
  const sel = value.songSelection;

  if (!sel.random) {
    throw new Error('songSelection.random is required for songs-and-types resolution');
  }
  if (!sel.watched) {
    throw new Error('songSelection.watched is required for songs-and-types resolution');
  }

  /** @type {import('../../mathUtils.js').AllocationEntry[]} */
  const selEntries = [];

  // Build random selection entry
  if (sel.random.random) {
    let min, max;
    if (mode === 'percentage') {
      min = sel.random.percentageMin ?? sel.random.min;
      max = sel.random.percentageMax ?? sel.random.max;
    } else {
      min = sel.random.countMin ?? sel.random.min;
      max = sel.random.countMax ?? sel.random.max;
    }
    if (min === undefined || min === null || max === undefined || max === null) {
      throw new Error(`Range min/max values are required for random selection (mode: ${mode})`);
    }
    selEntries.push({
      label: 'random',
      kind: /** @type {'range'} */ ('range'),
      min: Number(min),
      max: Number(max)
    });
  } else {
    let val;
    if (mode === 'percentage') {
      val = sel.random.percentage ?? sel.random.value;
    } else {
      val = sel.random.count ?? sel.random.value;
    }
    if (val === undefined || val === null) {
      throw new Error(`Value is required for random selection (mode: ${mode})`);
    }
    selEntries.push({
      label: 'random',
      kind: /** @type {'static'} */ ('static'),
      value: Number(val)
    });
  }

  // Build watched selection entry
  if (sel.watched.random) {
    let min, max;
    if (mode === 'percentage') {
      min = sel.watched.percentageMin ?? sel.watched.min;
      max = sel.watched.percentageMax ?? sel.watched.max;
    } else {
      min = sel.watched.countMin ?? sel.watched.min;
      max = sel.watched.countMax ?? sel.watched.max;
    }
    if (min === undefined || min === null || max === undefined || max === null) {
      throw new Error(`Range min/max values are required for watched selection (mode: ${mode})`);
    }
    selEntries.push({
      label: 'watched',
      kind: /** @type {'range'} */ ('range'),
      min: Number(min),
      max: Number(max)
    });
  } else {
    let val;
    if (mode === 'percentage') {
      val = sel.watched.percentage ?? sel.watched.value;
    } else {
      val = sel.watched.count ?? sel.watched.value;
    }
    if (val === undefined || val === null) {
      throw new Error(`Value is required for watched selection (mode: ${mode})`);
    }
    selEntries.push({
      label: 'watched',
      kind: /** @type {'static'} */ ('static'),
      value: Number(val)
    });
  }

  const selAllocation = allocateToTotal(selEntries, targetTotal, rng);
  const resolvedSelection = {
    random: (() => {
      const val = selAllocation.get('random');
      if (val === undefined) {
        throw new Error('Allocation failed for random selection');
      }
      return val;
    })(),
    watched: (() => {
      const val = selAllocation.get('watched');
      if (val === undefined) {
        throw new Error('Allocation failed for watched selection');
      }
      return val;
    })()
  };

  // Extract ranges for flexibility
  const selectionRanges = {};
  selEntries.forEach((entry) => {
    if (entry.kind === 'range') {
      selectionRanges[entry.label] = { min: entry.min, max: entry.max };
    } else {
      selectionRanges[entry.label] = { min: entry.value, max: entry.value };
    }
  });

  // Return resolved settings for server
  // Note: Server expects 'types' and 'typesRanges', not 'songTypes' and 'songTypesRanges'
  return {
    mode,
    total: targetTotal,
    types: resolvedTypes, // Server expects this name
    typesRanges: typesRanges, // Server expects this name
    songSelection: resolvedSelection,
    songSelectionRanges: selectionRanges
  };
}

/**
 * Songs and Types Filter Definition
 */
export const songsAndTypesFilter = {
  id: 'songs-and-types',
  metadata: {
    title: 'Songs & Types',
    icon: '🎵',
    color: '#16a34a',
    description: 'Filter by song type and selection mode',
    category: 'content',
    type: NODE_CATEGORIES.FILTER
  },
  defaultSettings: SONGS_AND_TYPES_DEFAULT_SETTINGS,
  formType: 'complex-songs-and-types',
  validate: validateSongsAndTypes,
  display: displaySongsAndTypes,
  extract: extractSongsAndTypes,
  resolve: resolveSongsAndTypes
};

// Auto-register the filter
FilterRegistry.register(songsAndTypesFilter.id, songsAndTypesFilter);

