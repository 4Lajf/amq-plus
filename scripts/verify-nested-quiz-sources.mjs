// Live API check using two temporary private quizzes; leaves source fixtures intact.
// node --env-file=.env scripts/verify-nested-quiz-sources.mjs --run
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
if (!process.argv.includes('--run')) throw new Error('Pass --run to create temporary fixtures.');
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const ids = [randomUUID(), randomUUID()];
const tokens = ids.map(() => randomBytes(16).toString('base64url'));
const names = ['[TEST] M18 API source', '[TEST] M18 API consumer'];
const check = ({ data, error }) => { if (error) throw new Error(JSON.stringify(error)); return data; };
const created = [];
try {
	const rows = check(await db.from('quiz_configurations').select('id,configuration_data')
		.in('id', ['0981688d-7f57-4e36-a27b-1fd849e63149', '99d1b672-b6da-40cb-9fff-95886408d2d7']));
	const source = structuredClone(rows.find(x => x.id === '0981688d-7f57-4e36-a27b-1fd849e63149').configuration_data);
	const consumer = structuredClone(rows.find(x => x.id === '99d1b672-b6da-40cb-9fff-95886408d2d7').configuration_data);
	Object.assign(consumer.routes[0].sources[0], { selectedQuizId: ids[0], selectedQuizName: names[0], selectedListName: names[0] });
	for (const [i, configuration_data] of [source, consumer].entries()) {
		check(await db.from('quiz_configurations').insert({ id: ids[i], user_id: owner,
			name: names[i], creator_username: '4Lajf', configuration_data,
			is_public: false, allow_remixing: false, play_token: tokens[i], share_token: randomBytes(16).toString('base64url') }));
		created.push(ids[i]);
	}
	const play = async (i = 1) => {
		const response = await fetch(`http://localhost:5173/play/${tokens[i]}?format=full`);
		return { status: response.status, body: await response.json() };
	};
	const before = await play();
	assert.equal(before.status, 200, JSON.stringify(before.body));
	assert.ok(before.body.songs.length > 0);
	const jojo = check(await db.from('public_song_lists').select('id').eq('name', 'Jojo OP and ED').single());
	Object.assign(source.routes[0].sources[0], { selectedListId: jojo.id, selectedListName: 'Jojo OP and ED' });
	check(await db.from('quiz_configurations').update({ configuration_data: source }).eq('id', ids[0]));
	const after = await play();
	assert.equal(after.status, 200, JSON.stringify(after.body));
	const direct = await play(0);
	assert.equal(direct.status, 200, JSON.stringify(direct.body));
	const members = result => result.body.songs.map(x => x.annSongId).sort((a, b) => a - b);
	assert.notDeepEqual(members(before), members(after));
	assert.equal(before.body.metadata.eligibleSongCount, 26);
	assert.equal(after.body.metadata.eligibleSongCount, 23);
	console.log(JSON.stringify({ stage: 'live source edit', beforeSongs: before.body.songCount,
		afterSongs: after.body.songCount, directSongs: direct.body.songCount,
		beforeEligible: before.body.metadata.eligibleSongCount,
		afterEligible: after.body.metadata.eligibleSongCount }));
	// Turn A into a reference to B: B -> A -> B is a structural loop.
	const cycle = structuredClone(source);
	cycle.routes[0].sources = [{ ...consumer.routes[0].sources[0], selectedQuizId: ids[1],
		selectedQuizName: names[1], selectedListName: names[1] }];
	check(await db.from('quiz_configurations').update({ configuration_data: cycle }).eq('id', ids[0]));
	const loop = await play();
	assert.equal(loop.status, 400);
	assert.match(loop.body.userMessage, /loop|itself/i);
	assert.match(loop.body.userMessage, /M18 API/);
	console.log(JSON.stringify({ stage: 'cycle rejected', status: loop.status, body: loop.body }));
	check(await db.from('quiz_configurations').delete().eq('id', ids[0]).eq('user_id', owner));
	const missing = await play();
	assert.equal(missing.status, 400);
	assert.match(missing.body.userMessage, /no longer exists/i);
	assert.match(missing.body.userMessage, /M18 API source/);
	console.log(JSON.stringify({ stage: 'deleted source rejected', status: missing.status, body: missing.body }));
} finally {
	if (created.length) {
		check(await db.from('quiz_configurations').delete().in('id', created).eq('user_id', owner));
		assert.equal(check(await db.from('quiz_configurations').select('id').in('id', created)).length, 0);
		console.log('Both temporary quiz IDs verified removed.');
	}
}
