/**
 * Seed [TEST] quizzes + training rows for the §2 hand-test plan.
 * Idempotent: deletes previous [TEST] / [TEST-FIXTURE] quizzes for this user first.
 *
 *   node --env-file=.env scripts/seed-hand-test-fixtures.mjs
 */
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const USER = '25b56784-dd1a-4d95-9455-e12fc710cfdf';
const PREFIX = '[TEST]';
const FOREIGN_QUIZ = '1154c001-1dcd-4bf8-8fd2-240858727d47'; // Jojo OP and ED (violet)

const LISTS = {
	emi: { id: '86689eda-8c38-411e-b9bf-4b2c1a5d912f', name: 'Emi Evans' },
	weebshit: { id: '9c032a61-73d1-4236-a1e7-4c059eb63ed4', name: 'weebshit' },
	vibin: { id: '0c306d7c-caa9-4100-a5b0-98bc1d88e723', name: "vibin'" },
	wishlist: { id: '3f538906-79cd-47da-8612-ead5f4fb4be9', name: 'Grupowa Wishlista' },
	weebonium: { id: '7306b013-49af-41f3-863a-5951b3f942b0', name: 'weebonium 4000mg' },
	directors: { id: 'e2b62b60-a37f-4970-a411-74b9701e4b77', name: "vibin' directors cut" },
	mergeA: { id: 'd1de45f0-7bb6-44b9-b77c-55e8f59f5347', name: 'merge test' },
	mergeB: { id: '57530f31-5dca-4ecf-9731-019b1f219a68', name: 'merge test2' }
};

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
	console.error('PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing');
	process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function token() {
	return randomBytes(16).toString('base64url');
}
function iso(d) {
	return new Date(d).toISOString();
}
function daysAgo(n) {
	return iso(Date.now() - n * 86400000);
}
function daysAhead(n) {
	return iso(Date.now() + n * 86400000);
}
function hoursAgo(n) {
	return iso(Date.now() - n * 3600000);
}

function reviewState({ due, stability = 8, difficulty = 5, reps = 4, state = 2, scheduledDays = 7 }) {
	return {
		due,
		reps,
		state,
		lapses: 0,
		stability,
		difficulty,
		last_review: daysAgo(scheduledDays),
		elapsed_days: scheduledDays,
		learning_steps: 0,
		scheduled_days: scheduledDays
	};
}

function songId(song) {
	const n = song?.annSongId ?? song?.song_ann_id ?? song?.annSongID ?? song?.ann_song_id;
	const v = Number(n);
	return Number.isFinite(v) && v > 0 ? v : null;
}

async function fetchPixeldrain(link) {
	const apiKey = process.env.PIXELDRAIN_API_KEY;
	if (!apiKey || !link) return null;
	const auth = `Basic ${Buffer.from(`:${apiKey}`).toString('base64')}`;
	const res = await fetch(link, {
		headers: { Accept: 'application/json', Authorization: auth },
		signal: AbortSignal.timeout(45000)
	});
	if (!res.ok) throw new Error(`Pixeldrain ${res.status}`);
	return res.json();
}

async function loadListIds(list) {
	const { data, error } = await sb
		.from('song_lists')
		.select('id, name, songs_list_link, song_count')
		.eq('id', list.id)
		.single();
	if (error) throw error;
	try {
		const songs = await fetchPixeldrain(data.songs_list_link);
		const ids = (Array.isArray(songs) ? songs : []).map(songId).filter(Boolean);
		const unique = [...new Set(ids)];
		console.log(`  list "${list.name}": ${unique.length} ids from Pixeldrain`);
		return unique;
	} catch (err) {
		console.warn(`  list "${list.name}": Pixeldrain failed (${err.message})`);
		return [];
	}
}

async function donorIds(limit) {
	const ids = [];
	const seen = new Set();
	for (let from = 0; ids.length < limit && from < 8000; from += 1000) {
		const { data, error } = await sb
			.from('training_progress')
			.select('song_ann_id')
			.not('song_ann_id', 'is', null)
			.range(from, from + 999);
		if (error) throw error;
		for (const row of data || []) {
			if (!seen.has(row.song_ann_id)) {
				seen.add(row.song_ann_id);
				ids.push(row.song_ann_id);
			}
		}
		if (!data || data.length < 1000) break;
	}
	console.log(`  donor fallback: ${ids.length} distinct song_ann_ids`);
	return ids;
}

async function cleanup() {
	const { data: old, error } = await sb
		.from('quiz_configurations')
		.select('id, name')
		.eq('user_id', USER)
		.like('name', `${PREFIX}%`);
	if (error) throw error;
	if (!old?.length) return;
	const ids = old.map((q) => q.id);
	await sb.from('training_progress').delete().eq('user_id', USER).in('quiz_id', ids);
	await sb.from('quiz_configurations').delete().eq('user_id', USER).in('id', ids);
	console.log(`Removed ${old.length} previous ${PREFIX} quizzes`);
}

function deepClone(v) {
	return JSON.parse(JSON.stringify(v));
}

function savedSource(list, { entire = true, id } = {}) {
	return {
		id: id || `src-${list.id.slice(0, 8)}`,
		sourceType: 'song-list',
		mode: 'saved-lists',
		useEntirePool: entire,
		selectedListId: list.id,
		selectedListName: list.name,
		userListImport: {
			platform: 'anilist',
			username: '',
			selectedLists: { completed: true, watching: true, planning: false, on_hold: false, dropped: false }
		}
	};
}

function quizSource(quizId, quizName, id) {
	return {
		id,
		sourceType: 'song-list',
		mode: 'quiz',
		useEntirePool: true,
		selectedQuizId: quizId,
		selectedListName: quizName
	};
}

function applySource(config, source, extras = {}) {
	const next = deepClone(config);
	const route = next.routes[0];
	route.sources = Array.isArray(source) ? source : [source];
	if (extras.numberOfSongs) route.numberOfSongs = { ...route.numberOfSongs, ...extras.numberOfSongs };
	if (extras.filters) {
		for (const patch of extras.filters) {
			const f = route.filters.find((x) => x.filterId === patch.filterId);
			if (!f) continue;
			f.settings = { ...f.settings, ...patch.settings };
			if (patch.sourceSelector) f.sourceSelector = patch.sourceSelector;
		}
	}
	if (extras.disableFilters) {
		for (const f of route.filters) f.enabled = false;
	}
	next.metadata = { version: '2.0', savedAt: new Date().toISOString(), fixture: true };
	return next;
}

async function insertQuiz({ name, description, config, public: isPublic = false, remix = false, settings = {} }) {
	const { data, error } = await sb
		.from('quiz_configurations')
		.insert({
			user_id: USER,
			creator_username: '4Lajf',
			name,
			description,
			configuration_data: config,
			is_public: isPublic,
			allow_remixing: remix,
			share_token: isPublic ? null : token(),
			play_token: token(),
			daily_review_limit: settings.daily_review_limit ?? null,
			daily_new_limit: settings.daily_new_limit ?? null,
			daily_review_goal: settings.daily_review_goal ?? 20,
			combine_duplicates: settings.combine_duplicates ?? false,
			allow_same_day_reviews: settings.allow_same_day_reviews ?? true
		})
		.select('id, name')
		.single();
	if (error) throw error;
	return data;
}

async function insertProgress(quizId, rows) {
	const payload = rows.map((row) => ({
		user_id: USER,
		quiz_id: quizId,
		song_ann_id: row.song_ann_id,
		fsrs_state: row.fsrs_state,
		attempt_count: row.attempt_count ?? 3,
		success_count: row.success_count ?? 2,
		failure_count: row.failure_count ?? 1,
		success_streak: 1,
		failure_streak: 0,
		last_attempt_at: row.last_attempt_at ?? daysAgo(2),
		history: [],
		is_active: row.is_active !== false,
		suspended_at: row.suspended_at ?? null
	}));
	for (let i = 0; i < payload.length; i += 400) {
		const chunk = payload.slice(i, i + 400);
		const { error } = await sb.from('training_progress').insert(chunk);
		if (error) throw error;
	}
}

function need(ids, n, label) {
	if (ids.length < n) {
		throw new Error(`${label} needs ${n} song ids, got ${ids.length}`);
	}
	return ids.slice(0, n);
}

const { data: profile } = await sb.from('profiles').select('name').eq('id', USER).maybeSingle();
console.log(`Seeding fixtures for ${USER} (${profile?.name || '4Lajf'})`);

const { data: tmplRow, error: tmplErr } = await sb
	.from('quiz_configurations')
	.select('configuration_data')
	.eq('id', '0c27d99e-2a2c-459c-9786-99502ead9c68')
	.single();
if (tmplErr) throw tmplErr;
const base = tmplRow.configuration_data;

await cleanup();

console.log('Loading list song ids…');
const listIds = {};
for (const [key, list] of Object.entries(LISTS)) {
	listIds[key] = await loadListIds(list);
}
const fallback = await donorIds(600);
function pick(key, n) {
	const fromList = listIds[key] || [];
	if (fromList.length >= n) return fromList.slice(0, n);
	return [...fromList, ...fallback.filter((id) => !fromList.includes(id))].slice(0, n);
}

const catalog = [];

// M1 — no progress, settings above the fold
{
	const quiz = await insertQuiz({
		name: `${PREFIX} M1 blank settings`,
		description: 'No training rows. Settings card must show above the fold (M1). Also fine for M21 duplicate.',
		config: applySource(base, savedSource(LISTS.emi), { disableFilters: true, numberOfSongs: { staticValue: 20, useRange: false } }),
		settings: { daily_review_goal: 50, daily_new_limit: null, allow_same_day_reviews: true }
	});
	catalog.push({ key: 'M1', id: quiz.id, name: quiz.name, progress: 0, checks: ['M1', 'M21'] });
}

// M2 / M4 / M5 / M9 / M11 — mixed dues + suspend + mature
{
	const ids = need(pick('weebshit', 80), 80, 'M2');
	const quiz = await insertQuiz({
		name: `${PREFIX} M2 goal + catch-up`,
		description:
			'15 due today, 30 catch-up (3–12d overdue), 20 future, 4 suspended, 3 mature (stability 46). Goal 10. Same-day ON.',
		config: applySource(base, savedSource(LISTS.weebshit), { disableFilters: true, numberOfSongs: { staticValue: 20, useRange: false } }),
		settings: { daily_review_goal: 10, daily_new_limit: null, allow_same_day_reviews: true }
	});
	const rows = [];
	ids.slice(0, 15).forEach((id, i) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: hoursAgo(6 + i), stability: 6 + i, scheduledDays: 1 })
		})
	);
	ids.slice(15, 45).forEach((id, i) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAgo(3 + (i % 10)), stability: 4 + (i % 8), scheduledDays: 5 })
		})
	);
	ids.slice(45, 65).forEach((id, i) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(4 + i), stability: 12, scheduledDays: 8 })
		})
	);
	ids.slice(65, 69).forEach((id) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(20), stability: 10 }),
			suspended_at: new Date().toISOString()
		})
	);
	ids.slice(69, 72).forEach((id) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(22), stability: 46, difficulty: 4, reps: 18, scheduledDays: 40 })
		})
	);
	await insertProgress(quiz.id, rows);
	catalog.push({
		key: 'M2',
		id: quiz.id,
		name: quiz.name,
		progress: rows.length,
		checks: ['M2', 'M4', 'M5', 'M9', 'M11', 'M32']
	});
}

// M3 / M31 / M41 — mostly new, limit 2
{
	const practiced = need(pick('vibin', 12), 12, 'M3 practiced');
	const quiz = await insertQuiz({
		name: `${PREFIX} M3 new-song limit`,
		description: 'Huge unused pool + 8 practiced. daily_new_limit=2. Use for Auto then Manual (M3, M31, M41).',
		config: applySource(base, savedSource(LISTS.vibin), { disableFilters: true, numberOfSongs: { staticValue: 20, useRange: false } }),
		settings: { daily_review_goal: 50, daily_new_limit: 2, allow_same_day_reviews: true }
	});
	await insertProgress(
		quiz.id,
		practiced.slice(0, 8).map((id, i) => ({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(3 + i), stability: 10 })
		}))
	);
	catalog.push({ key: 'M3', id: quiz.id, name: quiz.name, progress: 8, checks: ['M3', 'M31', 'M41'] });
}

// M6 / M33 / M41 taper — large overdue pile
{
	const ids = need(pick('wishlist', 180), 180, 'M6');
	const quiz = await insertQuiz({
		name: `${PREFIX} M6 spread backlog`,
		description: '160 overdue (many 2+ days). Spread backlog 7/14/30 (M6). Auto still introduces new songs (M33, M41).',
		config: applySource(base, savedSource(LISTS.wishlist), {
			disableFilters: true,
			numberOfSongs: { staticValue: 20, useRange: false }
		}),
		settings: { daily_review_goal: 25, daily_new_limit: 20, allow_same_day_reviews: true }
	});
	await insertProgress(
		quiz.id,
		ids.slice(0, 160).map((id, i) => ({
			song_ann_id: id,
			fsrs_state: reviewState({
				due: daysAgo(1 + (i % 40)),
				stability: 3 + (i % 20),
				difficulty: 3 + (i % 6),
				scheduledDays: 10
			})
		}))
	);
	catalog.push({ key: 'M6', id: quiz.id, name: quiz.name, progress: 160, checks: ['M6', 'M33', 'M41'] });
}

// M7 / M35 — shelving retirement
{
	const ids = need(pick('weebonium', 40), 40, 'M7');
	const quiz = await insertQuiz({
		name: `${PREFIX} M7 gradual return`,
		description:
			'24 previously parked songs spread over the next 14 days. No shelving or rescue controls should appear (M7/M35).',
		config: applySource(base, savedSource(LISTS.weebonium), {
			disableFilters: true,
			numberOfSongs: { staticValue: 20, useRange: false }
		}),
		settings: { daily_review_goal: 50 }
	});
	const rows = ids.slice(0, 24).map((id, index) => ({
		song_ann_id: id,
		fsrs_state: reviewState({
			due: daysAhead(1 + (index % 14)),
			stability: 15,
			scheduledDays: 30
		})
	}));
	ids.slice(24, 32).forEach((id) =>
		rows.push({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAgo(1), stability: 8 })
		})
	);
	await insertProgress(quiz.id, rows);
	catalog.push({
		key: 'M7',
		id: quiz.id,
		name: quiz.name,
		progress: rows.length,
		checks: ['M7', 'M35']
	});
}

// M8 merge
{
	const idsA = need(pick('mergeA', 20), 12, 'M8A');
	const idsB = need(pick('mergeB', 8).concat(idsA), 8, 'M8B');
	const source = await insertQuiz({
		name: `${PREFIX} M8 merge source`,
		description: 'Source deck for Merge on the target quiz (M8).',
		config: applySource(base, savedSource(LISTS.mergeA), { disableFilters: true }),
		settings: {}
	});
	const target = await insertQuiz({
		name: `${PREFIX} M8 merge target`,
		description: 'Open Maintenance → Merge from the source quiz (M8). Shared song ids on purpose.',
		config: applySource(base, savedSource(LISTS.mergeB), { disableFilters: true }),
		settings: {}
	});
	await insertProgress(
		source.id,
		idsA.map((id, i) => ({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAgo(2), stability: 20 + i, reps: 8 })
		}))
	);
	await insertProgress(
		target.id,
		idsB.slice(0, 6).map((id) => ({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(30), stability: 4, reps: 1 })
		}))
	);
	catalog.push({ key: 'M8-source', id: source.id, name: source.name, progress: idsA.length, checks: ['M8'] });
	catalog.push({ key: 'M8-target', id: target.id, name: target.name, progress: 6, checks: ['M8'] });
}

// M12–M14 builder
{
	const cat = deepClone(base);
	const catFilter = cat.routes[0].filters.find((f) => f.filterId === 'song-categories');
	if (catFilter) {
		catFilter.settings = {
			...catFilter.settings,
			viewMode: 'advanced',
			mode: 'count',
			openings: { standard: true, instrumental: true, chanting: true, character: true, noCategory: false },
			endings: { standard: true, instrumental: true, chanting: true, character: true, noCategory: false },
			inserts: { standard: true, instrumental: true, chanting: true, character: true, noCategory: false }
		};
		if (catFilter.settings.advanced?.openings?.standard) {
			catFilter.settings.advanced.openings.standard.countValue = 2;
			catFilter.settings.advanced.openings.standard.enabled = true;
		}
	}
	const typeFilter = cat.routes[0].filters.find((f) => f.filterId === 'anime-type');
	if (typeFilter) {
		typeFilter.settings = { ...typeFilter.settings, viewMode: 'advanced', unspecified: false };
		if (typeFilter.settings.advanced?.tv) typeFilter.settings.advanced.tv.countValue = 2;
	}
	cat.routes[0].sources = [savedSource(LISTS.vibin, { entire: false, id: 'src-categories' })];
	const quiz = await insertQuiz({
		name: `${PREFIX} M12 categories + quotas`,
		description:
			'Song Categories Unspecified unticked; Advanced Standard count=2. Compare pool size vs Basic (M12–M14).',
		config: cat,
		settings: {}
	});
	catalog.push({ key: 'M12', id: quiz.id, name: quiz.name, progress: 0, checks: ['M12', 'M13', 'M14'] });
}

// M16 scoping
{
	const srcA = savedSource(LISTS.directors, { entire: true, id: 'src-scope-a' });
	const srcB = savedSource(LISTS.weebonium, { entire: true, id: 'src-scope-b' });
	const quiz = await insertQuiz({
		name: `${PREFIX} M16 source scoping`,
		description: 'Two sources. Vintage filter scoped to src-scope-a only (M16). Delete that source → named error.',
		config: applySource(base, [srcA, srcB], {
			filters: [
				{
					filterId: 'vintage',
					sourceSelector: { targetSourceId: 'src-scope-a' }
				}
			]
		}),
		settings: {}
	});
	catalog.push({ key: 'M16', id: quiz.id, name: quiz.name, progress: 0, checks: ['M16'] });
}

// M18 quiz-as-source
{
	const source = await insertQuiz({
		name: `${PREFIX} M18 source quiz`,
		description: 'Edit this pool; the consumer re-runs filters live (M18).',
		config: applySource(base, savedSource(LISTS.emi, { entire: true, id: 'src-m18' }), {
			disableFilters: true,
			numberOfSongs: { staticValue: 20, useRange: false }
		}),
		settings: {}
	});
	const consumer = await insertQuiz({
		name: `${PREFIX} M18 live consumer`,
		description: 'Uses the source quiz as a live source. Edit the source → this pool changes (M18).',
		config: applySource(base, quizSource(source.id, source.name, 'src-quiz-live'), {
			disableFilters: true,
			numberOfSongs: { staticValue: 20, useRange: false }
		}),
		settings: {}
	});
	catalog.push({ key: 'M18-source', id: source.id, name: source.name, progress: 0, checks: ['M18'] });
	catalog.push({ key: 'M18-consumer', id: consumer.id, name: consumer.name, progress: 0, checks: ['M18'] });
}

// M23 public / remix
{
	const quiz = await insertQuiz({
		name: `${PREFIX} M23 public remix`,
		description: 'Owned + public + remix. Toggle Public/Remix in the builder top bar (M23). Also usable for M22 like.',
		config: applySource(base, savedSource(LISTS.emi), { disableFilters: true }),
		public: true,
		remix: true,
		settings: {}
	});
	catalog.push({ key: 'M23', id: quiz.id, name: quiz.name, progress: 0, checks: ['M22', 'M23'] });
}

// M36 empty session
{
	const ids = need(pick('emi', 26), 20, 'M36');
	const quiz = await insertQuiz({
		name: `${PREFIX} M36 empty session`,
		description: 'Every song already practiced and due in 10+ days. Set new songs to 0 → "nothing ready" (M36).',
		config: applySource(base, savedSource(LISTS.emi), {
			disableFilters: true,
			numberOfSongs: { staticValue: 20, useRange: false }
		}),
		settings: { daily_new_limit: 20 }
	});
	await insertProgress(
		quiz.id,
		ids.map((id) => ({
			song_ann_id: id,
			fsrs_state: reviewState({ due: daysAhead(12), stability: 20, scheduledDays: 12 })
		}))
	);
	catalog.push({ key: 'M36', id: quiz.id, name: quiz.name, progress: ids.length, checks: ['M36'] });
}

// M5 trainee on someone else's quiz
{
	const { data: foreignSongs } = await sb
		.from('training_progress')
		.select('song_ann_id')
		.eq('quiz_id', FOREIGN_QUIZ)
		.not('song_ann_id', 'is', null)
		.limit(12);
	const ids = [...new Set((foreignSongs || []).map((r) => r.song_ann_id))].slice(0, 8);
	const use = ids.length ? ids : pick('emi', 6);
	await sb.from('training_progress').delete().eq('user_id', USER).eq('quiz_id', FOREIGN_QUIZ);
	await insertProgress(
		FOREIGN_QUIZ,
		use.map((id, i) => ({
			song_ann_id: id,
			fsrs_state: reviewState({ due: i < 3 ? daysAgo(1) : daysAhead(5), stability: 9 })
		}))
	);
	catalog.push({
		key: 'M5-shared',
		id: FOREIGN_QUIZ,
		name: 'Jojo OP and ED (violet) — trainee rows',
		progress: use.length,
		checks: ['M5'],
		note: 'You do not own this quiz. Mark due / Suspend must work on your rows only; settings must 403.'
	});
}

console.log('\nCreated fixtures:\n');
for (const row of catalog) {
	console.log(`  ${row.name}`);
	console.log(`    ${row.id}  checks: ${row.checks.join(', ')}${row.note ? `\n    ${row.note}` : ''}`);
}

console.log('\nCATALOG_JSON');
console.log(JSON.stringify(catalog, null, 2));
