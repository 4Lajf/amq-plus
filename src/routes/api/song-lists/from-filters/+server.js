/**
 * POST /api/song-lists/from-filters
 * GET  /api/song-lists/from-filters?jobId=...
 *
 * W11 / decision D2 — "everything matching these filters, saved as a song list".
 *
 * Three people independently started writing scrapers for this (Swapin set out
 * to script AnisongDB by season, Cherryish asked him to DM her the script,
 * 3shine needed 370 instrumentals and gave up), and the community workaround
 * became running a community quiz at 1-second songs to harvest a JSON. That is
 * the clearest product signal in the archive, and it reuses machinery that
 * already exists.
 *
 * Takes the quiz builder's own routes, resolves them through the SAME pool
 * resolver generation uses, and writes the result as an ordinary song list.
 *
 * Two things this deliberately does NOT do:
 *   - it takes the ELIGIBLE POOL, not the drawn selection. The ask is "every
 *     match", not "a sample of 20".
 *   - the result is a SNAPSHOT (decision Q5). A saved list is something you
 *     curated at a point in time; a quiz used as a source (W15) is a rule you
 *     keep, and re-resolves live. The UI says which is which.
 *
 * A full-masterlist filter run plus a Pixeldrain write can exceed Cloudflare's
 * ~100s origin timeout, so this uses the same 202 + jobId polling shape as
 * session start.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { resolveEligiblePool } from '$lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '$lib/utils/simulation.js';
import {
	createSessionJob,
	getSessionJob,
	setSessionJobMessage,
	completeSessionJob,
	failSessionJob
} from '$lib/server/training/session-jobs.js';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * R14 set this ceiling for in-game appends and it applies here for the same
 * reason: a song list is one JSON array in Pixeldrain with no append, so every
 * edit is a whole-list write. Report it rather than truncating — a silently
 * truncated list is worse than a refused one.
 */
const MAX_LIST_SONGS = 20000;

/**
 * Fields a saved song list carries. Anything else is generation scaffolding
 * (_sourceId, _bypassFilters, sourceAnime blobs) and would bloat the JSON.
 */
function toListEntry(song) {
	return {
		annSongId: song.annSongId,
		songName: song.songName,
		songArtist: song.songArtist,
		songType: song.songType,
		songCategory: song.songCategory,
		songDifficulty: song.songDifficulty,
		animeENName: song.animeENName,
		animeJPName: song.animeJPName,
		animeVintage: song.animeVintage,
		animeType: song.animeType,
		malId: song.malId,
		HQ: song.HQ,
		MQ: song.MQ,
		audio: song.audio
	};
}

async function uploadList(songs, listName) {
	if (!PIXELDRAIN_API_KEY) {
		throw new Error('Pixeldrain API is not configured');
	}

	const jsonContent = JSON.stringify(songs, null, 2);
	const sanitized = String(listName || 'song_list')
		.replace(/[^a-z0-9_-]/gi, '_')
		.toLowerCase();
	const filename = `${sanitized}_${Date.now()}.json`;

	const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;
	const uploadUrl = `https://pixeldrain.com/api/filesystem/me/song_lists/${filename}?make_parents=true`;

	const response = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Authorization: authHeader },
		body: jsonContent
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new Error(`Pixeldrain upload failed: ${response.status} ${errorText.slice(0, 200)}`);
	}
	await response.json().catch(() => ({}));

	const publicLink = `https://pixeldrain.com/api/filesystem/me/song_lists/${encodeURIComponent(filename)}`;

	// Verify before returning. A truncated write that still handed back a link
	// would silently eat the user's list — this project has been bitten by that.
	const expectedBytes = Buffer.byteLength(jsonContent, 'utf8');
	const head = await fetch(publicLink, { method: 'HEAD', headers: { Authorization: authHeader } });
	if (!head.ok) {
		throw new Error(`Pixeldrain verify failed: HTTP ${head.status}. The list was not saved.`);
	}
	const storedBytes = Number(head.headers.get('content-length'));
	if (!Number.isFinite(storedBytes) || storedBytes <= 0 || storedBytes !== expectedBytes) {
		throw new Error(`Pixeldrain verify failed: stored ${storedBytes}, expected ${expectedBytes}`);
	}

	return publicLink;
}

/**
 * Resolve, deduplicate and persist. Runs detached from the request.
 */
async function buildList({ jobId, userId, routes, name, description, isPublic, creatorUsername, fetchFn }) {
	try {
		setSessionJobMessage(jobId, 'Resolving filters…');

		const simulatedConfig = simulateQuizFromRoutes(routes);
		const { songs, sourceSongCount, filterStatistics, loadingErrors, scopingErrors } =
			await resolveEligiblePool(simulatedConfig, fetchFn);

		if (loadingErrors?.length || scopingErrors?.length) {
			const errors = [...(loadingErrors || []), ...(scopingErrors || [])];
			const details = errors.map(error => typeof error === 'string' ? error : error.error || error.message).filter(Boolean).join(' ');
			failSessionJob(jobId, `Could not load the complete pool. Nothing was saved. ${details}`, loadingErrors?.length ? 502 : 422);
			return;
		}

		// A song list is keyed by annSongId, and the pool can carry the same song
		// from several sources.
		const seen = new Set();
		const unique = [];
		for (const song of songs) {
			const id = song?.annSongId;
			if (id == null || seen.has(String(id))) continue;
			seen.add(String(id));
			unique.push(toListEntry(song));
		}

		if (unique.length === 0) {
			failSessionJob(
				jobId,
				'Those filters matched no songs, so there is nothing to save. Widen them and try again.',
				422
			);
			return;
		}

		if (unique.length > MAX_LIST_SONGS) {
			failSessionJob(
				jobId,
				`Those filters matched ${unique.length} songs, over the ${MAX_LIST_SONGS} a song list can hold. ` +
					`Narrow them — nothing was saved, because a truncated list would be worse than none.`,
				413
			);
			return;
		}

		setSessionJobMessage(jobId, `Saving ${unique.length} songs…`);
		const songsListLink = await uploadList(unique, name);

		const supabaseAdmin = createSupabaseAdmin();
		const { data, error: dbError } = await supabaseAdmin
			.from('song_lists')
			.insert({
				user_id: userId,
				name: name.trim(),
				description: description?.trim() || null,
				songs_list_link: songsListLink,
				creator_username: creatorUsername,
				song_count: unique.length,
				is_public: isPublic === true
			})
			.select()
			.single();

		if (dbError || !data) {
			failSessionJob(jobId, `Could not save the list: ${dbError?.message || 'unknown error'}`, 500);
			return;
		}

		completeSessionJob(jobId, {
			list: data,
			songCount: unique.length,
			sourceSongCount,
			filterStatistics,
			loadingErrors,
			scopingErrors
		});
	} catch (err) {
		console.error('[SONG LIST FROM FILTERS] Build failed:', err);
		failSessionJob(jobId, err?.message || 'Failed to build the song list', 500);
	}
}

// @ts-ignore
export async function POST({ request, locals, fetch: fetchFn }) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		throw error(401, { message: 'Sign in to save a song list.' });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const { routes, name, description, is_public: isPublic, creator_username: creatorUsername } = body ?? {};

	if (!Array.isArray(routes) || routes.length === 0) {
		throw error(400, { message: '`routes` must be a non-empty array of quiz builder routes.' });
	}
	if (!name || typeof name !== 'string' || !name.trim()) {
		throw error(400, { message: 'A list name is required.' });
	}
	if (name.trim().length > 64) {
		throw error(400, { message: 'List name must be 64 characters or less' });
	}
	if (description && description.length > 512) {
		throw error(400, { message: 'List description must be 512 characters or less' });
	}

	// Same reason session start rate-limits: returning 202 removes the natural
	// back-pressure a blocking request provided, and each of these can be a
	// full-masterlist filter run. The budget is shared with training session
	// generation on purpose - both are the same expensive pool resolution, and
	// the process holds one job store.
	let job;
	try {
		job = createSessionJob(user.id);
	} catch (err) {
		throw error(err?.status === 429 ? 429 : 500, {
			message:
				err?.status === 429
					? 'You already have two pool builds in flight. Wait for one to finish.'
					: 'Could not queue the build.'
		});
	}

	// Detached on purpose — the whole point is not to hold the request open.
	buildList({
		fetchFn,
		jobId: job.id,
		userId: user.id,
		routes,
		name,
		description,
		isPublic,
		creatorUsername: creatorUsername || user.email || 'unknown'
	});

	return json({ jobId: job.id, status: 'pending' }, { status: 202 });
}

// @ts-ignore
export async function GET({ url, locals }) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		throw error(401, { message: 'Unauthorized' });
	}

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		throw error(400, { message: 'jobId is required' });
	}

	const job = getSessionJob(jobId);
	if (!job || job.userId !== user.id) {
		throw error(404, { message: 'Job not found' });
	}

	return json({
		status: job.status,
		message: job.message,
		result: job.result,
		error: job.error
	});
}
