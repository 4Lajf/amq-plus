/**
 * Load a saved song list from Pixeldrain.
 *
 * There used to be a Supabase Storage mirror behind this. It was dropped: the
 * mirrors cost ~1 GB of paid storage to protect data that is reproducible (a
 * song list is a list of annSongIds the user assembled), while the things that
 * actually matter - quizzes and training progress - live in Postgres. Users who
 * want a copy can export the list.
 *
 * @module lib/server/song-list-loader
 */

import { createSupabaseAdmin } from './supabase-admin.js';
import { fetchFromPixeldrain } from './pixeldrain.js';

/**
 * @param {string} listId
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @returns {Promise<{ songs: any[], name: string, source: 'pixeldrain'|'empty', list: Object }>}
 */
export async function loadSavedSongList(listId, supabase = createSupabaseAdmin()) {
	const { data: listData, error: dbError } = await supabase
		.from('song_lists')
		.select('id, name, songs_list_link, updated_at')
		.eq('id', listId)
		.single();

	if (dbError) {
		if (dbError.code === 'PGRST116') {
			throw new Error(`Failed to load saved list: List with ID "${listId}" not found in database`);
		}
		throw new Error(`Failed to load saved list from database: ${dbError.message || dbError.code}`);
	}

	if (!listData) {
		throw new Error(`Failed to load saved list: List with ID "${listId}" not found`);
	}

	return loadFromLinks(listData);
}

/**
 * @param {Object} listData
 * @returns {Promise<{ songs: any[], name: string, source: 'pixeldrain'|'empty', list: Object }>}
 */
async function loadFromLinks(listData) {
	if (!listData.songs_list_link) {
		console.warn(`[SONG LIST] "${listData.name}" has no Pixeldrain link`);
		return { songs: [], name: listData.name, source: 'empty', list: listData };
	}

	try {
		const songs = await fetchFromPixeldrain(listData.songs_list_link);
		if (!Array.isArray(songs)) {
			throw new Error('Pixeldrain response is not a JSON array');
		}

		console.log(
			`[SONG LIST] Loaded ${songs.length} songs from Pixeldrain for "${listData.name}" (${listData.id})`
		);
		return { songs, name: listData.name, source: 'pixeldrain', list: listData };
	} catch (err) {
		console.warn(
			`[SONG LIST] Pixeldrain failed for "${listData.name}" (${listData.id}):`,
			err.message
		);
		throw new Error(`Failed to load songs for list "${listData.name}": ${err.message}`);
	}
}
