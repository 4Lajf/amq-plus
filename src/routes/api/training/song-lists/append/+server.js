/**
 * POST /api/training/song-lists/append
 *
 * Add the song that just played to one of the user's AMQ+ song lists, without
 * leaving AMQ.
 *
 * R14 — 3shine and 4lajf both scoped this on Mar 5 and it never got built. It is
 * also the enabler for doomchicken's "add an 'again' to a song in a list when I
 * miss it in ranked": once the connector can append, the trigger is a policy
 * question rather than a missing capability.
 *
 * Song lists live as a single JSON array in Pixeldrain, which has no append, so
 * "add one song" is read-modify-write of the whole list. That is fine at the
 * sizes people actually have (median 138 songs, p90 ~3k) and deliberately
 * refused past `MAX_APPENDABLE_SONGS` — a 26k-song list is a multi-megabyte
 * round trip, and this runs from a button someone taps between quiz rounds.
 */

import { json } from '@sveltejs/kit';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { loadSavedSongList } from '$lib/server/song-list-loader.js';
import { getSongByAnnSongId } from '$lib/server/masterlist.js';

/**
 * Above this, the read-modify-write is too slow to run from an in-game button.
 * Two lists in production exceed it; both are edited on the website anyway.
 */
const MAX_APPENDABLE_SONGS = 20000;

const TAG = '[SONG LIST APPEND]';

/**
 * Resolve an annSongId to a masterlist-shaped song object.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} _supabase - unused
 * @param {number} annSongId
 * @returns {Promise<any|null>}
 */
async function resolveSong(_supabase, annSongId) {
	return (await getSongByAnnSongId(annSongId)) || null;
}

/**
 * Write the list back to Pixeldrain and return its new public link.
 *
 * Mirrors `api/pixeldrain/upload`, including the verify-before-return size
 * check — a truncated write that still returned a link would silently eat the
 * user's whole list, which is the failure this project has already been bitten
 * by once.
 *
 * @param {any[]} songs
 * @param {string} listName
 * @returns {Promise<string>}
 */
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

	const expectedBytes = Buffer.byteLength(jsonContent, 'utf8');
	const head = await fetch(publicLink, { method: 'HEAD', headers: { Authorization: authHeader } });
	if (!head.ok) throw new Error(`Pixeldrain verify failed: HTTP ${head.status}. Your list is unchanged.`);
	const storedBytes = Number(head.headers.get('content-length'));
	if (!Number.isFinite(storedBytes) || storedBytes <= 0 || storedBytes !== expectedBytes) {
		throw new Error(`Pixeldrain verify failed: stored ${storedBytes}, expected ${expectedBytes}`);
	}

	return publicLink;
}

// @ts-ignore
export async function POST({ request }) {
	const supabaseAdmin = createSupabaseAdmin();

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { token, listId, annSongId } = body || {};

	if (!token) return json({ error: 'Token required' }, { status: 400 });
	if (!listId) return json({ error: 'listId required' }, { status: 400 });

	const numericAnnSongId = Number(annSongId);
	if (!Number.isFinite(numericAnnSongId)) {
		return json({ error: 'A numeric annSongId is required' }, { status: 400 });
	}

	const validToken = await lookupToken(supabaseAdmin, token);
	if (!validToken) {
		return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
	}

	try {
		const { data: list, error: listError } = await supabaseAdmin
			.from('song_lists')
			.select('id, user_id, name, song_count')
			.eq('id', listId)
			.maybeSingle();

		if (listError || !list) {
			return json({ error: 'List not found' }, { status: 404 });
		}
		if (list.user_id !== validToken.user_id) {
			return json({ error: 'You do not own this list' }, { status: 403 });
		}
		if ((list.song_count || 0) >= MAX_APPENDABLE_SONGS) {
			return json(
				{
					error: `"${list.name}" is too large to edit from in-game (${list.song_count} songs). Use the website.`
				},
				{ status: 413 }
			);
		}

		const song = await resolveSong(supabaseAdmin, numericAnnSongId);
		if (!song) {
			return json(
				{ error: 'That song is not in our song database yet, so it cannot be added to a list.' },
				{ status: 404 }
			);
		}

		const { songs, name } = await loadSavedSongList(listId, supabaseAdmin);
		const existing = Array.isArray(songs) ? songs : [];

		// Adding the same song twice is a misclick, not an intent. Report it as a
		// success so the connector does not present it as a failure.
		const alreadyPresent = existing.some((s) => Number(s?.annSongId) === numericAnnSongId);
		if (alreadyPresent) {
			return json({
				success: true,
				added: false,
				alreadyPresent: true,
				listId,
				listName: name,
				songCount: existing.length,
				songName: song.songName,
				message: `"${song.songName}" is already in ${name}.`
			});
		}

		if (existing.length >= MAX_APPENDABLE_SONGS) {
			return json({ error: `"${name}" is too large to edit from in-game (${existing.length} songs). Use the website.` }, { status: 413 });
		}

		const updated = [...existing, song];
		const songsListLink = await uploadList(updated, name);

		const { error: updateError } = await supabaseAdmin
			.from('song_lists')
			.update({
				songs_list_link: songsListLink,
				song_count: updated.length,
				updated_at: new Date().toISOString()
			})
			.eq('id', listId)
			.eq('user_id', validToken.user_id);

		if (updateError) {
			// The upload succeeded but the row still points at the old file, so the
			// list is intact — just without the new song. Say that rather than
			// leaving the user guessing which half happened.
			console.error(`${TAG} Row update failed after upload:`, updateError);
			return json(
				{ error: 'Uploaded the new list but could not save it. Your list is unchanged.' },
				{ status: 500 }
			);
		}

		console.log(`${TAG} Added ${numericAnnSongId} to "${name}" (${updated.length} songs)`);

		return json({
			success: true,
			added: true,
			listId,
			listName: name,
			songCount: updated.length,
			songName: song.songName,
			message: `Added "${song.songName}" to ${name} (${updated.length} songs).`
		});
	} catch (err) {
		console.error(`${TAG} Error:`, err);
		return json({ error: err.message || 'Failed to add the song to that list' }, { status: 500 });
	}
}
