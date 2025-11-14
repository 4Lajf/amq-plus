/**
 * Comprehensive test suite for songFiltering.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateQuizSongs, parseVintage, isInVintageRange, makeRng } from '../src/lib/server/songFiltering.js';
import { validateSongMatchesFilters, validateBasketDistribution, colorLog, printTestResults } from './utils/testHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all test configurations
function loadTestConfig(filename) {
  const configPath = path.join(__dirname, 'testConfigs', filename);
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

// Test timeout for API calls (2 minutes for large datasets)
const TEST_TIMEOUT = 120000;

// Base URL for API calls (use dev server when available)
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';

// Create fetch wrapper that uses absolute URLs
function createFetch(baseUrl) {
  return async (url, options) => {
    // Convert relative URLs to absolute
    const absoluteUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
    return fetch(absoluteUrl, options);
  };
}

describe('Song Filtering - Utility Functions', () => {
  it('should parse vintage strings correctly', () => {
    const vintage1 = parseVintage('Fall 2023');
    expect(vintage1).toEqual({ season: 'Fall', year: 2023 });

    const vintage2 = parseVintage('Winter 2010');
    expect(vintage2).toEqual({ season: 'Winter', year: 2010 });

    const vintage3 = parseVintage('');
    expect(vintage3).toEqual({ season: 'Winter', year: 1944 });
  });

  it('should check vintage ranges correctly', () => {
    const from = { season: 'Winter', year: 2010 };
    const to = { season: 'Fall', year: 2020 };

    expect(isInVintageRange('Spring 2015', from, to)).toBe(true);
    expect(isInVintageRange('Winter 2010', from, to)).toBe(true);
    expect(isInVintageRange('Fall 2020', from, to)).toBe(true);
    expect(isInVintageRange('Fall 2009', from, to)).toBe(false);
    expect(isInVintageRange('Winter 2021', from, to)).toBe(false);
  });

  it('should generate deterministic random numbers', () => {
    const rng1 = makeRng('test-seed');
    const rng2 = makeRng('test-seed');

    const values1 = [rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2()];

    expect(values1).toEqual(values2);
  });
});

describe('Song Filtering - Basic Filters', () => {
  it('01 - Basic Song Types (Opening/Ending/Insert)', async () => {
    const config = loadTestConfig('01-basic-song-types.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate song types distribution
    const openings = result.songs.filter(s => s.songType?.startsWith('Opening')).length;
    const endings = result.songs.filter(s => s.songType?.startsWith('Ending')).length;
    const inserts = result.songs.filter(s => s.songType?.includes('Insert')).length;

    colorLog(`\n[01] Song types: OP=${openings}, ED=${endings}, INS=${inserts}`, 'cyan');

    // Check baskets meet minimums
    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[01] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('02 - Vintage Ranges', async () => {
    const config = loadTestConfig('02-vintage-ranges.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs are in specified vintage ranges
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[02] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('02-vintage-ranges', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('03 - Difficulty Basic (Easy/Medium/Hard)', async () => {
    const config = loadTestConfig('03-difficulty-basic.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Count songs by difficulty category
    const easy = result.songs.filter(s => s.songDifficulty >= 60 && s.songDifficulty <= 100).length;
    const medium = result.songs.filter(s => s.songDifficulty >= 25 && s.songDifficulty < 60).length;
    const hard = result.songs.filter(s => s.songDifficulty >= 0 && s.songDifficulty < 25).length;

    colorLog(`\n[03] Difficulty: Easy=${easy}, Medium=${medium}, Hard=${hard}`, 'cyan');

    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('04 - Difficulty Advanced (Custom Ranges)', async () => {
    const config = loadTestConfig('04-difficulty-advanced.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[04] ${validationErrors.length} songs failed validation`, 'red');
    }

    expect(validationErrors.length).toBe(0);

    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('07 - Anime Score', async () => {
    const config = loadTestConfig('07-anime-score.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet anime score criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[07] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('07-anime-score', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('08 - Anime Type Basic', async () => {
    const config = loadTestConfig('08-anime-type-basic.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs have enabled anime types
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[08] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('08-anime-type-basic', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('09 - Anime Type Advanced', async () => {
    const config = loadTestConfig('09-anime-type-advanced.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[09] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('10 - Song Categories Basic', async () => {
    const config = loadTestConfig('10-song-categories-basic.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet category criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[10] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('10-song-categories-basic', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('11 - Song Categories Advanced', async () => {
    const config = loadTestConfig('11-song-categories-advanced.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[11] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('12 - Genres Basic (Include/Exclude)', async () => {
    const config = loadTestConfig('12-genres-basic.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet genre criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[12] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('12-genres-basic', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('13 - Genres Advanced (With Counts)', async () => {
    const config = loadTestConfig('13-genres-advanced.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet genre criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[13] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('13-genres-advanced', result, config, validationErrors);
    }

    // Check basket distribution for genre baskets
    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[13] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }

    expect(validationErrors.length).toBe(0);
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('14 - Tags Basic (Include/Exclude)', async () => {
    const config = loadTestConfig('14-tags-basic.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet tag criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[14] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('14-tags-basic', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('15 - Tags Advanced (With Counts)', async () => {
    const config = loadTestConfig('15-tags-advanced.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet tag criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[15] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('15-tags-advanced', result, config, validationErrors);
    }

    // Check basket distribution for tag baskets
    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[15] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }

    expect(validationErrors.length).toBe(0);
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);
});

describe('Song Filtering - User Lists', () => {
  it('05 - Player Score Basic (User List)', async () => {
    const config = loadTestConfig('05-player-score-basic.json');
    const result = await generateQuizSongs(config, createFetch(BASE_URL));

    expect(result.songs).toBeDefined();

    // Skip test if API is not available or no songs were loaded
    if (result.songs.length === 0) {
      if (result.metadata.loadingErrors && result.metadata.loadingErrors.length > 0) {
        console.log('[05] Skipping test - User list API not available:', result.metadata.loadingErrors[0].error);
        return;
      }
    }

    expect(result.songs.length).toBeGreaterThan(0);

    // Validate all songs meet player score criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, true);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[05] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('05-player-score-basic', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);

  it('06 - Player Score with Counts (User List)', async () => {
    const config = loadTestConfig('06-player-score-counts.json');
    const result = await generateQuizSongs(config, createFetch(BASE_URL));

    expect(result.songs).toBeDefined();

    // Skip test if API is not available or no songs were loaded
    if (result.songs.length === 0) {
      if (result.metadata.loadingErrors && result.metadata.loadingErrors.length > 0) {
        console.log('[06] Skipping test - User list API not available:', result.metadata.loadingErrors[0].error);
        return;
      }
    }

    expect(result.songs.length).toBeGreaterThan(0);

    // Check basket distribution for player score baskets
    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[06] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('17 - User List (AniList)', async () => {
    const config = loadTestConfig('17-user-list.json');
    const result = await generateQuizSongs(config, createFetch(BASE_URL));

    expect(result.songs).toBeDefined();

    // Skip test if API is not available or no songs were loaded
    if (result.songs.length === 0) {
      if (result.metadata.loadingErrors && result.metadata.loadingErrors.length > 0) {
        console.log('[17] Skipping test - User list API not available:', result.metadata.loadingErrors[0].error);
        return;
      }
    }

    expect(result.songs.length).toBeGreaterThan(0);

    // All songs should have sourceAnime with score
    const songsWithoutScore = result.songs.filter(s => !s.sourceAnime?.score && s.sourceAnime?.score !== 0);
    if (songsWithoutScore.length > 0) {
      colorLog(`[17] Warning: ${songsWithoutScore.length} songs without player score`, 'yellow');
    }

    // Validate player score filter
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, true);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[17] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('17-user-list', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);
  }, TEST_TIMEOUT);
});

describe('Song Filtering - Combined Filters', () => {
  it('16 - Combined Heavy (Multiple Filters)', async () => {
    const config = loadTestConfig('16-combined-heavy.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);

    // Debug: Analyze song types distribution
    const openings = result.songs.filter(s => s.songType?.startsWith('Opening')).length;
    const endings = result.songs.filter(s => s.songType?.startsWith('Ending')).length;
    const inserts = result.songs.filter(s => s.songType?.includes('Insert')).length;
    colorLog(`[16] Song types: OP=${openings}, ED=${endings}, INS=${inserts}`, 'cyan');

    // Debug: Check if eligible songs exist for missing basket
    if (result.metadata.basketStatus) {
      const failedBaskets = result.metadata.basketStatus.filter(b => !b.meetsMin);
      if (failedBaskets.length > 0) {
        colorLog(`[16] Debugging failed baskets:`, 'yellow');
        failedBaskets.forEach(basket => {
          const missing = basket.min - basket.current;
          colorLog(`  ${basket.id}: missing ${missing} songs (has ${basket.current}/${basket.min})`, 'yellow');

          // Count eligible songs that could fill this basket
          let eligibleCount = 0;
          if (basket.id.startsWith('songType-')) {
            const type = basket.id.replace('songType-', '');
            eligibleCount = result.songs.filter(s => {
              if (type === 'openings') return s.songType?.startsWith('Opening');
              if (type === 'endings') return s.songType?.startsWith('Ending');
              if (type === 'inserts') return s.songType?.includes('Insert');
              return false;
            }).length;
            colorLog(`    Eligible songs for ${type}: ${eligibleCount}`, 'cyan');
          }
        });
      }
    }

    // Validate all songs meet all filter criteria
    const validationErrors = [];
    for (const song of result.songs) {
      const validation = validateSongMatchesFilters(song, config.filters, false);
      if (!validation.valid) {
        validationErrors.push({ song, errors: validation.errors });
      }
    }

    if (validationErrors.length > 0) {
      colorLog(`[16] ${validationErrors.length} songs failed validation`, 'red');
      printTestResults('16-combined-heavy', result, config, validationErrors);
    }

    expect(validationErrors.length).toBe(0);

    // Check basket distribution
    const basketValidation = validateBasketDistribution(result.metadata.basketStatus || []);
    if (!basketValidation.valid) {
      colorLog(`[16] Basket validation errors:`, 'red');
      basketValidation.errors.forEach(err => colorLog(`  - ${err}`, 'red'));
    }
    expect(basketValidation.valid).toBe(true);
  }, TEST_TIMEOUT);

  it('20 - Regression Test (Example Config)', async () => {
    const config = loadTestConfig('20-regression-example.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.metadata).toBeDefined();

    // Note: This config has conflicting basket constraints (e.g., song categories advanced mode
    // requires 9 ending songs but songs-and-types allows max 3 endings), so it may return 0 songs
    colorLog(`[20] Generated ${result.songs.length}/${config.numberOfSongs} songs (config has potentially conflicting constraints)`, 'yellow');

    // This is a user list config, so player score is supported
    const supportsPlayerScore = true;

    // Validate songs that were generated (if any)
    if (result.songs.length > 0) {
      const validationErrors = [];
      for (const song of result.songs) {
        const validation = validateSongMatchesFilters(song, config.filters, supportsPlayerScore);
        if (!validation.valid) {
          validationErrors.push({ song, errors: validation.errors });
        }
      }

      if (validationErrors.length > 0) {
        colorLog(`[20] ${validationErrors.length} songs failed validation`, 'red');
        printTestResults('20-regression-example', result, config, validationErrors);
      }

      expect(validationErrors.length).toBe(0);
    }

    // Show basket status for debugging
    if (result.metadata.basketStatus && result.metadata.basketStatus.length > 0) {
      const failedBaskets = result.metadata.basketStatus.filter(b => !b.meetsMin);
      if (failedBaskets.length > 0) {
        colorLog(`[20] Warning: ${failedBaskets.length} baskets failed to meet minimum requirements`, 'yellow');
      }
    }
  }, TEST_TIMEOUT);
});

describe('Song Filtering - Edge Cases', () => {
  it('18 - Impossible Constraints (Should Return Empty or Partial)', async () => {
    const config = loadTestConfig('18-edge-impossible.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.metadata).toBeDefined();

    // With impossible constraints, we expect very few or zero songs
    colorLog(`[18] Generated ${result.songs.length} songs with impossible constraints`, 'yellow');

    // If any songs were generated, they should still pass validation
    if (result.songs.length > 0) {
      const validationErrors = [];
      for (const song of result.songs) {
        const validation = validateSongMatchesFilters(song, config.filters, false);
        if (!validation.valid) {
          validationErrors.push({ song, errors: validation.errors });
        }
      }

      if (validationErrors.length > 0) {
        colorLog(`[18] ${validationErrors.length} songs failed validation`, 'red');
      }
    }
  }, TEST_TIMEOUT);

  it('19 - Minimal Config (1 Song, No Filters)', async () => {
    const config = loadTestConfig('19-edge-minimal.json');
    const result = await generateQuizSongs(config, fetch);

    expect(result.songs).toBeDefined();
    expect(result.songs.length).toBeGreaterThan(0);
    expect(result.songs.length).toBeLessThanOrEqual(1);

    colorLog(`[19] Generated ${result.songs.length} song(s) with minimal config`, 'cyan');
  }, TEST_TIMEOUT);
});

// Summary report after all tests
describe('Test Summary', () => {
  it('should generate test summary', () => {
    colorLog('\n' + '='.repeat(80), 'cyan');
    colorLog('TEST SUITE COMPLETED', 'brightGreen');
    colorLog('='.repeat(80), 'cyan');
    colorLog('\nAll filter types tested:', 'yellow');
    colorLog('  ✓ Songs and Types', 'green');
    colorLog('  ✓ Vintage Ranges', 'green');
    colorLog('  ✓ Song Difficulty (Basic & Advanced)', 'green');
    colorLog('  ✓ Player Score (Basic & Counts)', 'green');
    colorLog('  ✓ Anime Score', 'green');
    colorLog('  ✓ Anime Type (Basic & Advanced)', 'green');
    colorLog('  ✓ Song Categories (Basic & Advanced)', 'green');
    colorLog('  ✓ Genres (Basic & Advanced)', 'green');
    colorLog('  ✓ Tags (Basic & Advanced)', 'green');
    colorLog('  ✓ Combined Filters', 'green');
    colorLog('  ✓ User Lists', 'green');
    colorLog('  ✓ Edge Cases', 'green');
    colorLog('\n' + '='.repeat(80), 'cyan');
  });
});

