// node --env-file=.env scripts/verify-unspecified-filters.mjs --run
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
	ANIME_TYPE_DEFAULT_SETTINGS,
	SONG_CATEGORIES_DEFAULT_SETTINGS,
	SONG_LIST_DEFAULT_SETTINGS,
	BASIC_SETTINGS_DEFAULT_SETTINGS
} from '../src/lib/utils/defaultNodeSettings.js';

if (!process.argv.includes('--run')) throw new Error('Pass --run to create a temporary quiz.');
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
	auth: { persistSession: false }
});
const id = randomUUID();
const playToken = randomBytes(16).toString('base64url');
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const check = ({ data, error }) => {
	if (error) throw error;
	return data;
};
const route = {
	id: 'test-route',
	enabled: true,
	percentage: 100,
	basicSettings: { ...BASIC_SETTINGS_DEFAULT_SETTINGS, duplicateShows: true },
	numberOfSongs: { useRange: false, staticValue: 100 },
	sources: [
		{
			...SONG_LIST_DEFAULT_SETTINGS,
			id: 'test-source',
			sourceType: 'song-list',
			mode: 'masterlist',
			useEntirePool: false
		}
	],
	negativeSources: [],
	filters: []
};
let created = false;
try {
	check(
		await db.from('quiz_configurations').insert({
			id,
			user_id: owner,
			name: '[TEST] Unspecified API verification',
			creator_username: '4Lajf',
			is_public: false,
			play_token: playToken,
			share_token: randomBytes(16).toString('base64url'),
			configuration_data: { routes: [route] }
		})
	);
	created = true;
	for (const filterId of ['anime-type', 'song-categories']) {
		const results = {};
		for (const mode of ['known', 'all', 'unspecified']) {
			const settings = structuredClone(
				filterId === 'anime-type' ? ANIME_TYPE_DEFAULT_SETTINGS : SONG_CATEGORIES_DEFAULT_SETTINGS
			);
			if (filterId === 'anime-type') {
				for (const key of ['tv', 'movie', 'ova', 'ona', 'special'])
					settings[key] = mode !== 'unspecified';
				settings.unspecified = mode !== 'known';
			} else {
				for (const group of ['openings', 'endings', 'inserts']) {
					for (const key of ['standard', 'instrumental', 'chanting', 'character'])
						settings[group][key] = mode !== 'unspecified';
					settings[group].noCategory = mode !== 'known';
				}
			}
			route.filters = [
				{ id: 'test-filter', filterId, settings, enabled: true, executionChance: 100 }
			];
			check(
				await db
					.from('quiz_configurations')
					.update({ configuration_data: { routes: [route] } })
					.eq('id', id)
			);
			const response = await fetch(`http://localhost:5173/play/${playToken}?format=full`);
			const body = await response.json();
			if (mode === 'unspecified') {
				assert.equal(response.status, 422, body.userMessage);
				assert.equal(body.errorType, 'insufficient_songs');
				assert.match(body.userMessage, /100 were requested/);
			} else assert.equal(response.status, 200, body.userMessage);
			const missing = (song) =>
				filterId === 'anime-type'
					? !song.animeType
					: !song.songCategory || /^no category$/i.test(song.songCategory);
			if (mode === 'known') assert.ok(body.songs.every((song) => !missing(song)));
			if (mode === 'unspecified') {
				assert.ok(body.songs.length > 0);
				assert.ok(body.songs.every(missing));
			}
			results[mode] = {
				eligible: (body.metadata || body.technicalDetails).eligibleSongCount,
				generated: body.songs.length
			};
		}
		assert.equal(results.all.eligible - results.known.eligible, results.unspecified.eligible);
		console.log(JSON.stringify({ filterId, results }));
		const advanced = structuredClone(
			filterId === 'anime-type' ? ANIME_TYPE_DEFAULT_SETTINGS : SONG_CATEGORIES_DEFAULT_SETTINGS
		);
		advanced.viewMode = 'advanced';
		advanced.mode = 'count';
		const groups =
			filterId === 'anime-type' ? [advanced.advanced] : Object.values(advanced.advanced);
		for (const group of groups) for (const value of Object.values(group)) value.enabled = false;
		const quota =
			filterId === 'anime-type' ? advanced.advanced.tv : advanced.advanced.openings.standard;
		Object.assign(quota, { enabled: true, random: false, countValue: 2 });
		route.numberOfSongs.staticValue = 20;
		for (const viewMode of ['advanced', 'simple', 'conflict']) {
			advanced.viewMode = viewMode === 'conflict' ? 'advanced' : viewMode;
			if (viewMode === 'conflict') {
				quota.countValue = 15;
				const second =
					filterId === 'anime-type' ? advanced.advanced.movie : advanced.advanced.endings.standard;
				Object.assign(second, { enabled: true, random: false, countValue: 15 });
			}
			route.filters[0].settings = advanced;
			check(
				await db
					.from('quiz_configurations')
					.update({ configuration_data: { routes: [route] } })
					.eq('id', id)
			);
			const response = await fetch(`http://localhost:5173/play/${playToken}?format=full`);
			const body = await response.json();
			console.log(
				JSON.stringify({
					filterId,
					viewMode,
					status: response.status,
					count: body.songCount,
					message: body.userMessage
				})
			);
			if (viewMode === 'conflict') {
				console.log(
					JSON.stringify({
						minimums: (body.metadata || body.technicalDetails)?.unsatisfiedMinimums
					})
				);
				assert.equal(response.status, 200);
				assert.equal(body.songCount, 20);
				const unmet = body.metadata.unsatisfiedMinimums;
				assert.equal(unmet.length, 1);
				assert.match(unmet[0].basket, filterId === 'anime-type' ? /^animeType-/ : /^category-/);
				assert.equal(unmet[0].min, 15);
				assert.equal(unmet[0].got, 5);
			} else {
				assert.equal(body.songCount, viewMode === 'advanced' ? 2 : 20);
				assert.equal(response.status, viewMode === 'advanced' ? 422 : 200);
			}
		}
		route.numberOfSongs.staticValue = 100;
	}
} finally {
	if (created) {
		check(await db.from('quiz_configurations').delete().eq('id', id).eq('user_id', owner));
		assert.deepEqual(check(await db.from('quiz_configurations').select('id').eq('id', id)), []);
		console.log('Temporary Unspecified quiz verified removed.');
	}
}
