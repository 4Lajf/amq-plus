/**
 * Masterlist access
 *
 * masterlist.json is ~150 MB. It used to be imported statically by
 * songFiltering.js and by the training page loader, which meant every cold start
 * paid the full parse before it could serve a single request - on top of the
 * auth and generation cost that was already pushing requests past Cloudflare's
 * 100s origin timeout.
 *
 * Loading is deferred to first use here, and the parsed array is held at module
 * scope so the cost is paid once per process rather than once per request. The
 * annSongId index is built the same way: the training page used to linear-scan
 * all ~38k entries on every load to resolve metadata for a user's progress rows.
 *
 * Note this defers and dedupes the cost - it does not reduce resident memory,
 * since masterlist mode needs the whole array. masterlist.json is the song
 * database; there is no Postgres songs cache.
 *
 * @module lib/server/masterlist
 */

/**
 * The parsed file, memoised for the life of the process and deliberately NOT
 * cleared by resetMasterlistCache().
 *
 * In production the JSON arrives through import(), which the module registry
 * memoises, so a reset has never re-read it from disk. The VITEST branch below
 * reads with fs, which has no such registry - so without this, every reset paid
 * another full 157 MB read and parse. masterlist.test.js resets three times and
 * was doing three ~13 s parses of the same unchanged file.
 *
 * That is not just slow. Each parse blocks its worker for ~13 s of CPU and disk,
 * and Vitest gives a worker 5 s to start (WORKER_START_TIMEOUT, hardcoded), so
 * any worker unlucky enough to boot during one dies with "Timeout starting
 * forks runner". Keeping the parse to once per process is what makes the
 * masterlist suites safe to run alongside everything else.
 *
 * @type {Array<Object>|null}
 */
let rawCache = null;

/** @type {Array<Object>|null} */
let masterlistCache = null;

/** @type {Map<string, Object>|null} */
let masterlistIndexCache = null;

/** @type {Promise<Array<Object>>|null} */
let inflight = null;

/** @type {Promise<Map<string, Object>>|null} */
let indexInflight = null;

/**
 * The masterlist as an array, loaded on first call.
 *
 * Concurrent callers during a cold start share one load rather than each
 * kicking off their own parse.
 *
 * @returns {Promise<Array<Object>>} Masterlist songs (empty array if unavailable)
 */
export async function getMasterlist() {
  if (masterlistCache) return masterlistCache;
  if (inflight) return inflight;

  inflight = (async () => {
    const started = Date.now();
    try {
      if (rawCache) {
        // A reset drops the derived index but keeps the parsed file, matching
        // what the module registry does for the production import().
        masterlistCache = rawCache;
        return masterlistCache;
      }

      let data;
      if (process.env.VITEST) {
        // Under test, read the file rather than importing it. `import()` makes
        // Vite transform this ~157 MB JSON into an ES module and cache it under
        // node_modules/.vite; with a worker per test file, several do that at
        // once against the same cache and one of them reads a half-written
        // module. That is the flake this suite had for months - `SyntaxError:
        // Unexpected end of input`, `X is not a function`, `TrainingScheduler
        // is not a constructor` - always on a different file, always passing
        // when that file ran alone.
        //
        // Deliberately test-only. In a built app the import is what gets the
        // JSON bundled as an asset next to the server code, and swapping that
        // for a filesystem read changes what has to be present at runtime.
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const filePath = fileURLToPath(new URL('./masterlist.json', import.meta.url));
        data = JSON.parse(await readFile(filePath, 'utf8'));
      } else {
        const mod = await import('./masterlist.json');
        data = mod.default ?? mod;
      }
      masterlistCache = Array.isArray(data) ? data : [];
      rawCache = masterlistCache;
      console.log(`[MASTERLIST] Loaded ${masterlistCache.length} songs in ${Date.now() - started}ms`);
    } catch (err) {
      // Serve an empty masterlist rather than failing the request outright -
      // a quiz whose sources are user lists or saved lists does not need it.
      console.error('[MASTERLIST] Failed to load masterlist.json:', err);
      masterlistCache = [];
    }
    return masterlistCache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * The masterlist indexed by annSongId (as a string), built on first call.
 *
 * Concurrent callers share one build — otherwise two cold requests each get
 * their own Map and the "same instance" cache guarantee falls apart.
 *
 * @returns {Promise<Map<string, Object>>} annSongId -> song
 */
export async function getMasterlistIndex() {
  if (masterlistIndexCache) return masterlistIndexCache;
  if (indexInflight) return indexInflight;

  indexInflight = (async () => {
    const songs = await getMasterlist();
    const index = new Map();
    for (const song of songs) {
      if (song?.annSongId === null || song?.annSongId === undefined) continue;
      const key = String(song.annSongId);
      // First entry wins: the masterlist can carry duplicates for the same song
      // across anime entries, and the training page only needs display metadata.
      if (!index.has(key)) index.set(key, song);
    }

    masterlistIndexCache = index;
    console.log(`[MASTERLIST] Indexed ${index.size} unique annSongIds`);
    return masterlistIndexCache;
  })();

  try {
    return await indexInflight;
  } finally {
    indexInflight = null;
  }
}

/**
 * Highest annSongId the masterlist knows about.
 *
 * The frontier between "AnisongDB has not caught up yet" and "this song is
 * genuinely absent". AMQ hands out ids in ascending order, so anything above
 * this is a newer upload than our last refresh and needs no user action.
 *
 * @returns {Promise<number>} 0 if the masterlist is empty
 */
export async function getMasterlistMaxAnnSongId() {
  const index = await getMasterlistIndex();
  let max = 0;
  for (const key of index.keys()) {
    const id = Number(key);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max;
}

/**
 * Look up a single song by annSongId.
 * @param {string|number} annSongId
 * @returns {Promise<Object|undefined>}
 */
export async function getSongByAnnSongId(annSongId) {
  if (annSongId === null || annSongId === undefined) return undefined;
  const index = await getMasterlistIndex();
  return index.get(String(annSongId));
}

/**
 * Drop this module's cached references.
 *
 * This clears the derived index and forces getMasterlist() to hand out a fresh
 * reference - but the parsed file is kept (see rawCache), so the JSON is not
 * re-read from disk on either the import or the fs path. Picking up a masterlist
 * rewritten by `npm run update:masterlist` still needs a process restart.
 *
 * Intended for tests.
 * @returns {void}
 */
export function resetMasterlistCache() {
  masterlistCache = null;
  masterlistIndexCache = null;
  inflight = null;
  indexInflight = null;
}
