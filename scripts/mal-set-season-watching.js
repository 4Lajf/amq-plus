#!/usr/bin/env node

/**
 * Fetch a MAL season and set every anime to "watching" on the authorized account.
 *
 * Usage:
 *   node scripts/mal-set-season-watching.js
 *   node scripts/mal-set-season-watching.js --year=2026 --season=summer
 *   node scripts/mal-set-season-watching.js --dry-run
 *   node scripts/mal-set-season-watching.js --tv-only
 *   node scripts/mal-set-season-watching.js --code=AUTH_CODE
 *
 * Env:
 *   MAL_CLIENT_ID (required)
 *   MAL_CLIENT_SECRET (required for token exchange)
 *   MAL_ACCESS_TOKEN / MAL_REFRESH_TOKEN (optional; skip browser OAuth)
 *   MAL_REDIRECT_URI (default: http://localhost:8765/callback)
 */

import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';
import { URL } from 'url';
import { exec } from 'child_process';

const MAL_API_URL = 'https://api.myanimelist.net/v2';
const MAL_AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const DEFAULT_REDIRECT_URI = 'http://localhost:8765/callback';
const SEASON_LIMIT = 500;
const UPDATE_DELAY_MS = 350;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const options = {
    year: 2026,
    season: 'summer',
    dryRun: false,
    tvOnly: false,
    code: null,
    redirectUri: process.env.MAL_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    help: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--tv-only') options.tvOnly = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--year=')) options.year = Number(arg.split('=')[1]);
    else if (arg.startsWith('--season=')) options.season = arg.split('=')[1];
    else if (arg.startsWith('--code=')) options.code = arg.slice('--code='.length);
    else if (arg.startsWith('--redirect-uri=')) options.redirectUri = arg.slice('--redirect-uri='.length);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

function generatePkce() {
  // MAL only supports plain: challenge === verifier
  const verifier = crypto.randomBytes(48).toString('base64url').slice(0, 64);
  return { verifier, challenge: verifier };
}

async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(MAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    exec(`powershell -NoProfile -Command "Start-Process '${url.replace(/'/g, "''")}'"`);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function askForCode() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      'Paste the authorization code (or full redirect URL), then press Enter:\n> ',
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        try {
          if (trimmed.includes('://')) {
            const u = new URL(trimmed);
            resolve(u.searchParams.get('code') || trimmed);
            return;
          }
        } catch {
          // fall through
        }
        resolve(trimmed);
      }
    );
  });
}

function waitForAuthCode(redirectUri, expectedState) {
  const parsed = new URL(redirectUri);
  const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
  const expectedPath = parsed.pathname || '/';

  let server;
  let settled = false;

  const promise = new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, redirectUri);
        if (reqUrl.pathname !== expectedPath) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
          if (!settled) {
            settled = true;
            reject(new Error(`OAuth error: ${error}`));
          }
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing code</h1>');
          return;
        }

        if (expectedState && state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Invalid state</h1>');
          if (!settled) {
            settled = true;
            reject(new Error('OAuth state mismatch'));
          }
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful</h1><p>You can close this tab and return to the terminal.</p>');
        if (!settled) {
          settled = true;
          resolve(code);
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`Listening for OAuth callback on ${redirectUri}`);
    });

    server.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });

  return {
    promise,
    close: () =>
      new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
      }),
  };
}

async function obtainAccessToken({ clientId, clientSecret, options }) {
  if (process.env.MAL_ACCESS_TOKEN) {
    console.log('Using MAL_ACCESS_TOKEN from env');
    return process.env.MAL_ACCESS_TOKEN;
  }

  try {
    const pending = JSON.parse(fs.readFileSync(new URL('../.mal-oauth-pending.json', import.meta.url), 'utf8'));
    if (pending.access_token) {
      console.log('Using access token from .mal-oauth-pending.json');
      return pending.access_token;
    }
    if (pending.refresh_token) {
      console.log('Refreshing access token from .mal-oauth-pending.json...');
      const tokens = await refreshAccessToken({
        clientId,
        clientSecret,
        refreshToken: pending.refresh_token,
      });
      return tokens.access_token;
    }
  } catch {
    // no pending token file
  }

  if (process.env.MAL_REFRESH_TOKEN) {
    console.log('Refreshing access token from MAL_REFRESH_TOKEN...');
    const tokens = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: process.env.MAL_REFRESH_TOKEN,
    });
    console.log('Got fresh access token');
    return tokens.access_token;
  }

  const { verifier, challenge } = generatePkce();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(MAL_AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', options.redirectUri);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'plain');

  console.log('\nOpen this URL to authorize (log in as the MAL account you want to update):\n');
  console.log(authUrl.toString());
  console.log(`\nRedirect URI must match your MAL API client registration exactly:`);
  console.log(`  ${options.redirectUri}`);
  console.log('After approving, either the browser will return here automatically,');
  console.log('or paste the `code` / full redirect URL below.\n');

  openBrowser(authUrl.toString());

  let code = options.code;
  let callback = null;
  if (!code) {
    try {
      callback = waitForAuthCode(options.redirectUri, state);
      code = await Promise.race([callback.promise, askForCode()]);
    } catch (err) {
      console.warn(`Callback listener unavailable (${err.message}). Paste the code manually.`);
      code = await askForCode();
    } finally {
      if (callback) await callback.close();
    }
  }

  if (!code) {
    throw new Error('No authorization code received');
  }

  console.log('Exchanging authorization code for tokens...');
  const tokens = await exchangeCodeForToken({
    clientId,
    clientSecret,
    code,
    redirectUri: options.redirectUri,
    codeVerifier: verifier,
  });

  console.log('Authorized successfully');
  return tokens.access_token;
}

async function fetchSeasonAnime(clientId, year, season) {
  const all = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${MAL_API_URL}/anime/season/${year}/${season}`);
    url.searchParams.set('limit', String(SEASON_LIMIT));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('nsfw', 'true');
    url.searchParams.set('fields', 'id,title,media_type,status,start_season');

    const res = await fetch(url, {
      headers: { 'X-MAL-CLIENT-ID': clientId },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Season fetch failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const page = data.data || [];
    all.push(...page.map((e) => e.node));
    console.log(`  Fetched ${page.length} (total ${all.length})`);

    if (!data.paging?.next || page.length === 0) break;
    offset += SEASON_LIMIT;
    await sleep(400);
  }

  return all;
}

async function setWatching(accessToken, animeId) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${MAL_API_URL}/anime/${animeId}/my_list_status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ status: 'watching' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`${res.status} ${JSON.stringify(data)}`);
      }
      if (!res.ok) {
        throw new Error(`${res.status} ${JSON.stringify(data)}`);
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const wait = 1000 * attempt;
        console.warn(`  retry ${attempt}/${MAX_RETRIES} for ${animeId} after ${wait}ms (${err.message || err})`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function fetchWatchingIds(accessToken) {
  const ids = new Set();
  let offset = 0;
  while (true) {
    const url = new URL(`${MAL_API_URL}/users/@me/animelist`);
    url.searchParams.set('status', 'watching');
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('nsfw', 'true');
    url.searchParams.set('fields', 'list_status');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Failed to fetch watching list: ${JSON.stringify(data)}`);

    const page = data.data || [];
    for (const entry of page) ids.add(entry.node.id);
    if (!data.paging?.next || page.length === 0) break;
    offset += 1000;
    await sleep(300);
  }
  return ids;
}

async function getMe(accessToken) {
  const res = await fetch(`${MAL_API_URL}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to get @me: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(`Usage: node scripts/mal-set-season-watching.js [--year=2026] [--season=summer] [--tv-only] [--dry-run]`);
    process.exit(0);
  }

  const clientId = process.env.MAL_CLIENT_ID;
  const clientSecret = process.env.MAL_CLIENT_SECRET;
  if (!clientId) {
    console.error('MAL_CLIENT_ID is required');
    process.exit(1);
  }
  if (!clientSecret && !process.env.MAL_ACCESS_TOKEN) {
    console.error('MAL_CLIENT_SECRET is required for OAuth (or set MAL_ACCESS_TOKEN)');
    process.exit(1);
  }

  console.log(`Fetching ${options.year} ${options.season} season anime...`);
  let anime = await fetchSeasonAnime(clientId, options.year, options.season);
  if (options.tvOnly) {
    anime = anime.filter((a) => a.media_type === 'tv');
    console.log(`Filtered to TV only: ${anime.length}`);
  }
  console.log(`Total anime to update: ${anime.length}`);

  if (options.dryRun) {
    console.log('\nDry run — first 20 titles:');
    for (const a of anime.slice(0, 20)) {
      console.log(`  ${a.id}\t${a.media_type}\t${a.title}`);
    }
    if (anime.length > 20) console.log(`  ... and ${anime.length - 20} more`);
    return;
  }

  const accessToken = await obtainAccessToken({ clientId, clientSecret, options });
  const me = await getMe(accessToken);
  console.log(`Updating list for MAL user: ${me.name} (id ${me.id})`);

  console.log('Fetching current watching list to skip already-set entries...');
  const alreadyWatching = await fetchWatchingIds(accessToken);
  console.log(`Already watching: ${alreadyWatching.size}`);

  let ok = 0;
  let skipped = 0;
  let fail = 0;
  const failures = [];

  for (let i = 0; i < anime.length; i++) {
    const a = anime[i];
    const label = `[${i + 1}/${anime.length}] ${a.id} ${a.title}`;
    if (alreadyWatching.has(a.id)) {
      skipped++;
      console.log(`· ${label} (already watching)`);
      continue;
    }
    try {
      await setWatching(accessToken, a.id);
      ok++;
      alreadyWatching.add(a.id);
      console.log(`✓ ${label}`);
    } catch (err) {
      fail++;
      failures.push({ id: a.id, title: a.title, error: String(err.message || err) });
      console.error(`✗ ${label}: ${err.message || err}`);
    }
    if (i < anime.length - 1) await sleep(UPDATE_DELAY_MS);
  }

  console.log(`\nDone. Updated: ${ok}, Skipped: ${skipped}, Failed: ${fail}`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  ${f.id} ${f.title}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
