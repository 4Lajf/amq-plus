/**
 * POST /api/song-lists/[id]/append-bulk
 *
 * W16 — doomchicken, Mar 5: "being able to use the search on a quiz' song
 * history for mass adding could be nice."
 *
 * R14's `training/song-lists/append` is one song at a time and authenticates
 * with a connector token, because it is called from inside AMQ. This is the
 * website's counterpart: cookie session, many songs, one read-modify-write.
 *
 * Body: { annSongIds: number[] }
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { loadSavedSongList } from '$lib/server/song-list-loader.js';
import { getMasterlistIndex } from '$lib/server/masterlist.js';
// @ts-ignore
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/** R14's ceiling, for R14's reason: a list is one JSON array with no append. */
const MAX_LIST_SONGS = 20000;
const MAX_PER_REQUEST = 5000;

async function uploadList(songs, listName) {
	if (!PIXELDRAIN_API_KEY) throw new Error('Pixeldrain API is not configured');

	const jsonContent = JSON.stringify(songs, null, 2);
	const sanitized = String(listName || 'song_list')
		.replace(/[^a-z0-9_-]/gi, '_')
		.toLowerCase();
	const filename = `${sanitized}_${Date.now()}.json`;
	const authHeader = `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`;

	const response = await fetch(
		`https://pixeldrain.com/api/filesystem/me/song_lists/${filename}?make_parents=true`,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Authorization: authHeader },
			body: jsonContent
		}
	);
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`Pixeldrain upload failed: ${response.status} ${text.slice(0, 200)}`);
	}
	await response.json().catch(() => ({}));

	const publicLink = `https://pixeldrain.com/api/filesystem/me/song_lists/${encodeURIComponent(filename)}`;

	// Verify before returning — a truncated write that still handed back a link
	// would silently eat the user's list.
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
export async function POST({ params, request, locals }) {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) throw error(401, { message: 'Unauthorized' });

	let body;
	try {
		body = await request.json();
	} catch {
		throw error(400, { message: 'Invalid JSON body' });
	}

	const { annSongIds } = body ?? {};
	if (!Array.isArray(annSongIds) || annSongIds.length === 0) {
		throw error(400, { message: '`annSongIds` must be a non-empty array' });
	}
	if (annSongIds.length > MAX_PER_REQUEST) {
		throw error(400, { message: `Too many songs in one request (max ${MAX_PER_REQUEST})` });
	}

	const ids = [...new Set(annSongIds.map(Number).filter((n) => Number.isFinite(n)))];
	if (ids.length === 0) {
		throw error(400, { message: '`annSongIds` contained no valid numeric ids' });
	}

	const supabaseAdmin = createSupabaseAdmin();

	const { data: list } = await supabaseAdmin
		.from('song_lists')
		.select('id, user_id, name, song_count')
		.eq('id', params.id)
		.maybeSingle();

	if (!list) throw error(404, { message: 'List not found' });
	if (list.user_id !== user.id) throw error(403, { message: 'You do not own this list' });

	const { songs: existingSongs } = await loadSavedSongList(params.id, supabaseAdmin);
	const existing = Array.isArray(existingSongs) ? existingSongs : [];
	const present = new Set(existing.map((s) => Number(s?.annSongId)).filter(Number.isFinite));

	const toAdd = ids.filter((id) => !present.has(id));

	// Adding songs that are already there is a misclick, not an intent. Report it
	// as success rather than as a failure the user has to interpret.
	if (toAdd.length === 0) {
		return json({
			success: true,
			added: 0,
			skipped: ids.length,
			songCount: existing.length,
			message: 'Those songs are already in the list.'
		});
	}

	if (existing.length + toAdd.length > MAX_LIST_SONGS) {
		throw error(413, {
			message:
				`Adding ${toAdd.length} songs would take "${list.name}" to ` +
				`${existing.length + toAdd.length}, over the ${MAX_LIST_SONGS} a song list can hold. ` +
				`Nothing was added — a partial add would be worse than none.`
		});
	}

	const byId = await getMasterlistIndex();
	const resolved = [];
	for (const id of toAdd) {
		const payload = byId.get(String(id));
		if (payload) resolved.push(payload);
	}

	if (resolved.length === 0) {
		throw error(404, {
			message: 'None of those songs are in our song database yet, so they cannot be added.'
		});
	}

	const merged = [...existing, ...resolved];
	const songsListLink = await uploadList(merged, list.name);

	const { error: updateError } = await supabaseAdmin
		.from('song_lists')
		.update({
			songs_list_link: songsListLink,
			song_count: merged.length,
			updated_at: new Date().toISOString()
		})
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (updateError) {
		console.error('[SONG LIST APPEND BULK] Update failed:', updateError);
		throw error(500, { message: 'Saved the songs but could not update the list record' });
	}

	return json({
		success: true,
		added: resolved.length,
		skipped: ids.length - resolved.length,
		songCount: merged.length,
		message: `Added ${resolved.length} song${resolved.length === 1 ? '' : 's'} to "${list.name}".`
	});
}
