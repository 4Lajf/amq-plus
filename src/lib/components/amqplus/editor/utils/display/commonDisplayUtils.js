/**
 * Common display patterns for AMQ+ filter nodes
 * Provides reusable utilities for mode detection, allocation formatting, and range display
 * 
 * @module commonDisplayUtils
 */

import { DisplayFormatter, formatValue, formatAllocation, formatCount } from './displayFramework.js';

/**
 * Detect mode from value properties
 * @param {Object} value - Filter value
 * @param {string[]} fields - Fields to check for mode indicators
 * @returns {'percentage' | 'count'}
 */
export function detectMode(value, fields) {
  // Check explicit mode first
  if (value.mode) {
    return value.mode;
  }

  // Try to infer from fields
  let hasPercentage = false;
  let hasCount = false;

  for (const field of fields) {
    const fieldValue = value[field];
    if (fieldValue && typeof fieldValue === 'object') {
      if (fieldValue.percentage !== undefined || fieldValue.percentageValue !== undefined) {
        hasPercentage = true;
      }
      if (fieldValue.count !== undefined || fieldValue.countValue !== undefined) {
        hasCount = true;
      }
    }
  }

  // Prefer count if both are present or neither
  return hasPercentage && !hasCount ? 'percentage' : 'count';
}

/**
 * Normalize inheritedSongCount to a consistent format
 * @param {number | {min: number, max: number} | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} inheritedSongCount
 * @returns {{kind: 'range' | 'static', min?: number, max?: number, value?: number}}
 */
export function normalizeInheritedSongCount(inheritedSongCount) {
  if (!inheritedSongCount) {
    return { kind: 'static', value: 20 };
  }

  if (typeof inheritedSongCount === 'number') {
    return { kind: 'static', value: inheritedSongCount };
  }

  if ('kind' in inheritedSongCount && inheritedSongCount.kind) {
    // Already normalized
    return /** @type {{ kind: 'range' | 'static'; min?: number; max?: number; value?: number }} */ (inheritedSongCount);
  }

  // Legacy format {min, max}
  if ('min' in inheritedSongCount && 'max' in inheritedSongCount) {
    return {
      kind: 'range',
      min: inheritedSongCount.min,
      max: inheritedSongCount.max
    };
  }

  // Fallback
  return { kind: 'static', value: 20 };
}

/**
 * Get target total based on mode and inherited song count
 * @param {'percentage' | 'count'} mode
 * @param {number | {min: number, max: number} | {kind: 'range' | 'static', min?: number, max?: number, value?: number}} inheritedSongCount
 * @returns {number}
 */
export function getTargetTotal(mode, inheritedSongCount) {
  if (mode === 'percentage') {
    return 100;
  }

  if (!inheritedSongCount) {
    throw new Error('inheritedSongCount is required for count mode');
  }

  const normalized = normalizeInheritedSongCount(inheritedSongCount);
  if (normalized.kind === 'range') {
    if (normalized.max === undefined || normalized.max === null) {
      throw new Error('inheritedSongCount.max is required for range type in count mode');
    }
    return normalized.max;
  }
  if (normalized.value === undefined || normalized.value === null) {
    throw new Error('inheritedSongCount.value is required for static type in count mode');
  }
  return normalized.value;
}

/**
 * Format enabled types display
 * @param {Object} value - Filter value
 * @param {string[]} typeFields - Type field names
 * @param {Object} options
 * @param {'percentage' | 'count'} options.mode - Display mode
 * @param {number} options.targetTotal - Target total
 * @param {Object.<string, string>} [options.labelMap] - Custom label mapping
 * @returns {string}
 */
export function formatEnabledTypes(value, typeFields, { mode, targetTotal, labelMap = {} }) {
  if (!value) {
    throw new Error('value is required for formatEnabledTypes');
  }
  if (!mode) {
    throw new Error('mode is required for formatEnabledTypes');
  }
  if (targetTotal === undefined || targetTotal === null) {
    throw new Error('targetTotal is required for formatEnabledTypes');
  }

  const enabledTypes = typeFields.filter((field) => value[field]?.enabled);

  if (enabledTypes.length === 0) {
    return '[ERROR: No types enabled]';
  }

  const unit = mode === 'percentage' ? '%' : '';
  const items = [];

  for (const field of enabledTypes) {
    const typeValue = value[field];
    if (!typeValue) continue;

    const label = labelMap[field] ?? field;

    if (typeValue.randomRange || typeValue.random) {
      // Range
      const minField = mode === 'percentage' ? 'minPercentage' : 'minCount';
      const maxField = mode === 'percentage' ? 'maxPercentage' : 'maxCount';
      const minRaw = typeValue[minField] ?? typeValue.min;
      const maxRaw = typeValue[maxField] ?? typeValue.max;
      if (minRaw === undefined || minRaw === null) {
        throw new Error(`min value is required for ${field} (mode: ${mode})`);
      }
      if (maxRaw === undefined || maxRaw === null) {
        throw new Error(`max value is required for ${field} (mode: ${mode})`);
      }
      const min = Number(minRaw);
      const max = Number(maxRaw);

      items.push(`${label} ${min}-${max}${unit}`);
    } else {
      // Static
      const valueField = mode === 'percentage' ? 'percentageValue' : 'countValue';
      const valRaw = typeValue[valueField] ?? typeValue.value;
      if (valRaw === undefined || valRaw === null) {
        throw new Error(`value is required for ${field} (mode: ${mode})`);
      }
      const val = Number(valRaw);

      items.push(`${label} ${val}${unit}`);
    }
  }

  return items.join(', ');
}

/**
 * Format allocation entries with analysis
 * @param {Array<{kind: 'static' | 'range', label: string, value?: number, min?: number, max?: number}>} entries - Allocation entries
 * @param {number} targetTotal - Target total
 * @param {Object} [options]
 * @param {'percentage' | 'count'} [options.mode] - Display mode
 * @param {Object.<string, string>} [options.labelMap] - Custom label mapping
 * @returns {string}
 */
export function formatAllocationEntries(entries, targetTotal, { mode = 'count', labelMap = {} } = {}) {
  if (!entries || entries.length === 0) {
    return '[ERROR: No allocation entries provided]';
  }
  if (targetTotal === undefined || targetTotal === null) {
    throw new Error('targetTotal is required for formatAllocationEntries');
  }

  const unit = mode === 'percentage' ? '%' : '';
  const items = [];

  for (const entry of entries) {
    const label = labelMap[entry.label] ?? entry.label;

    if (entry.kind === 'range') {
      if (entry.min === undefined || entry.min === null) {
        throw new Error(`min is required for range entry "${entry.label}"`);
      }
      if (entry.max === undefined || entry.max === null) {
        throw new Error(`max is required for range entry "${entry.label}"`);
      }
      const min = entry.min;
      const max = entry.max;
      if (min === max) {
        items.push(`${label} ${min}${unit}`);
      } else {
        items.push(`${label} ${min}-${max}${unit}`);
      }
    } else {
      if (entry.value === undefined || entry.value === null) {
        throw new Error(`value is required for static entry "${entry.label}"`);
      }
      items.push(`${label} ${entry.value}${unit}`);
    }
  }

  return items.join(', ');
}

/**
 * Format vintage range display
 * @param {Object} range - Vintage range
 * @param {Object} range.from - From vintage
 * @param {string} range.from.season - From season
 * @param {number} range.from.year - From year
 * @param {Object} range.to - To vintage
 * @param {string} range.to.season - To season
 * @param {number} range.to.year - To year
 * @returns {string}
 */
export function formatVintageRange(range) {
  if (!range) {
    return '[ERROR: Range is missing]';
  }
  if (!range.from) {
    return '[ERROR: Range.from is missing]';
  }
  if (!range.to) {
    return '[ERROR: Range.to is missing]';
  }

  const from = `${range.from.season} ${range.from.year}`;
  const to = `${range.to.season} ${range.to.year}`;

  if (from === to) {
    return from;
  }

  return `${from} - ${to}`;
}

/**
 * Format genres/tags display (include/exclude/optional counts)
 * @param {Object} value - Filter value
 * @param {string} itemType - Item type name ('genres' or 'tags')
 * @returns {string}
 */
export function formatGenresTags(value, itemType = 'items') {
  if (!value) {
    return `Not configured`;
  }
  if (!value.stateByKey) {
    return `Not configured`;
  }
  if (Object.keys(value.stateByKey).length === 0) {
    return `No ${itemType} selected`;
  }

  const stateByKey = value.stateByKey;
  const included = [];
  const excluded = [];
  const optional = [];

  for (const [key, state] of Object.entries(stateByKey)) {
    if (state === 'include') included.push(key);
    else if (state === 'exclude') excluded.push(key);
    else if (state === 'optional') optional.push(key);
  }

  const parts = [];
  const total = included.length + excluded.length + optional.length;

  if (included.length > 0) {
    parts.push(`+${included.length}`);
  }
  if (excluded.length > 0) {
    parts.push(`−${excluded.length}`);
  }
  if (optional.length > 0) {
    parts.push(`~${optional.length}`);
  }

  let displayText = parts.join(' ');

  // If rates are enabled, show the mode
  if (value.showRates) {
    const mode = value.mode || 'percentage';
    displayText += ` (${mode === 'percentage' ? '%' : 'count'})`;
  }

  // Show first few item names if only a small number
  if (total <= 3 && total > 0) {
    const allItems = [...included, ...excluded, ...optional];
    return `${allItems.join(', ')}${value.showRates ? ` (${value.mode === 'percentage' ? '%' : 'count'})` : ''}`;
  }

  return displayText;
}

/**
 * Format score range display
 * @param {Object} value - Score filter value
 * @param {number} value.min - Minimum score
 * @param {number} value.max - Maximum score
 * @param {string} [value.mode] - Display mode
 * @param {Object.<string, number>} [value.percentages] - Score percentages
 * @param {number[]} [value.disallowed] - Disallowed scores
 * @returns {string}
 */
export function formatScoreRange(value) {
  if (!value) {
    return '[ERROR: Score filter value is missing]';
  }

  if (value.min === undefined || value.min === null || value.max === undefined || value.max === null) {
    return '[ERROR: min and max are required for score range]';
  }
  const base = `${value.min}-${value.max}`;

  const mode = value.mode || 'range';
  const p = value.percentages || {};
  const pCount = Object.keys(p).filter((k) => {
    const val = p[k];
    return val !== undefined && (typeof val === 'string' ? val !== '' : true);
  }).length;
  const dis = Array.isArray(value.disallowed) ? value.disallowed.length : 0;

  const parts = [base];
  if (pCount > 0) parts.push(`${pCount} scores set`);
  if (dis > 0) parts.push(`${dis} disallowed`);

  return parts.join(' | ');
}

/**
 * Format anime type display (simple mode)
 * @param {Object} value - Anime type value
 * @param {string[]} validTypes - Valid anime type keys
 * @returns {string}
 */
export function formatAnimeTypesSimple(value, validTypes = ['tv', 'movie', 'ova', 'ona', 'special']) {
  if (!value) {
    return '[ERROR: Anime type value is missing]';
  }

  const enabledTypes = Object.keys(value).filter(
    (key) => validTypes.includes(key) && typeof value[key] === 'boolean' && value[key] === true
  );

  if (enabledTypes.length === 0) {
    return '[ERROR: No anime types selected]';
  }

  return enabledTypes.map((t) => t.toUpperCase()).join(', ');
}

/**
 * Format song categories simple display
 * @param {Object} value - Song categories value
 * @param {string[]} rows - Row names
 * @param {string[]} cols - Column names
 * @returns {string}
 */
export function formatSongCategoriesSimple(value, rows = ['openings', 'endings', 'inserts'], cols = ['standard', 'instrumental', 'chanting', 'character']) {
  if (!value) {
    return '[ERROR: Song categories value is missing]';
  }

  let disabled = 0;
  for (const r of rows) {
    for (const c of cols) {
      if (value?.[r]?.[c] === false) disabled++;
    }
  }

  return disabled === 0 ? 'All categories' : `${disabled} disabled`;
}

/**
 * Build allocation entries from type configuration
 * @param {Object} value - Filter value
 * @param {string[]} typeFields - Type field names
 * @param {'percentage' | 'count'} mode - Allocation mode
 * @returns {Array<{kind: 'static' | 'range', label: string, value?: number, min?: number, max?: number}>}
 */
export function buildAllocationEntries(value, typeFields, mode) {
  /** @type {Array<{kind: 'static' | 'range', label: string, value?: number, min?: number, max?: number}>} */
  const entries = [];

  for (const field of typeFields) {
    const typeValue = value[field];
    if (!typeValue || !typeValue.enabled) continue;

    if (typeValue.randomRange || typeValue.random) {
      // Range entry
      const minField = mode === 'percentage' ? 'minPercentage' : 'minCount';
      const maxField = mode === 'percentage' ? 'maxPercentage' : 'maxCount';
      entries.push({
        kind: 'range',
        label: field,
        min: Number(typeValue[minField] ?? typeValue.min ?? 0),
        max: Number(typeValue[maxField] ?? typeValue.max ?? 0)
      });
    } else {
      // Static entry
      const valueField = mode === 'percentage' ? 'percentageValue' : 'countValue';
      entries.push({
        kind: 'static',
        label: field,
        value: Number(typeValue[valueField] ?? typeValue.value ?? 0)
      });
    }
  }

  return entries;
}

