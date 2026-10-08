// node --env-file=.env scripts/verify-source-scoping.mjs --run
// Exercises the real API with a temporary copy of M16, including bypass sources.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
if (!process.argv.includes('--run')) throw new Error('Pass --run to create a temporary fixture.');
const db = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const owner = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const id = randomUUID();
const token = randomBytes(16).toString('base64url');
const check = ({ data, error }) => { if (error) throw new Error(JSON.stringify(error)); return data; };
let created = false;
try {
	const { configuration_data: configuration } = check(await db.from('quiz_configurations')
		.select('configuration_data').eq('id', '213d73dd-1197-4cb2-9c38-08e8f2ff004a').single());
	check(await db.from('quiz_configurations').insert({ id, user_id: owner,
		name: '[TEST] M16 API scoping', creator_username: '4Lajf', configuration_data: configuration,
		is_public: false, play_token: token, share_token: randomBytes(16).toString('base64url') }));
	created = true;
	const play = async () => {
		const r = await fetch(`http://localhost:5173/play/${token}?format=full`);
		return { status: r.status, body: await r.json() };
	};
	const valid = await play();
	assert.equal(valid.status, 200, JSON.stringify(valid.body));
	assert.equal(valid.body.songCount, 20);
	configuration.routes[0].sources = configuration.routes[0].sources.filter(x => x.id !== 'src-scope-a');
	check(await db.from('quiz_configurations').update({ configuration_data: configuration }).eq('id', id));
	const broken = await play();
	assert.equal(broken.status, 400);
	assert.equal(broken.body.errorType, 'configuration_error');
	assert.match(broken.body.userMessage, /vintage/);
	assert.match(broken.body.userMessage, /src-scope-a/);
	assert.match(broken.body.userMessage, /Source Selector/);
	console.log(JSON.stringify({ valid: { status: valid.status, songs: valid.body.songCount }, broken }));
} finally {
	if (created) {
		const removed = check(await db.from('quiz_configurations').delete().eq('id', id).eq('user_id', owner).select('id'));
		assert.equal(removed.length, 1);
		console.log('Temporary scoping fixture removed.');
	}
}
