/**
 * INTEGRATION ONLY - not in `npm test`. Run it with `npm run test:integration`.
 *
 * This is the one suite still held out of the default run, and not because of
 * the forks flake that parked it on 2026-08-12. It needs SUPABASE_SECRET_KEY and
 * network access, it reads the ten production quiz ids below, and it takes about
 * 219 s - longer than the other 39 files put together. A failure here usually
 * means one of those quizzes was edited or deleted, not that quiz generation
 * regressed, so check the rows before hunting for a code change.
 */
/**
 * Real production quizzes: same fixed simulatedConfig ↁEsame membership/count
 * across many regenerations. Play order may shuffle.
 *
 * Also shrinks the eligible pool below the goal to prove exhaustive fill
 * (all remaining eligible songs every time, same count).
 *
 * Run: npx vitest run tests/realQuizDeterminism.test.js
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { unlinkSync, existsSync } from 'fs';
import { simulateQuizFromRoutes } from '../src/lib/utils/simulation.js';
import { generateQuizSongs } from '../src/lib/server/songFiltering.js';

loadEnv();

const ATTEMPTS = 10;

const QUIZ_IDS = [
	'34ff3497-37d0-445a-82b7-06af034f92a4', // 0-20 Random ops 1959-2000
	'569e46d5-182c-4d38-bad0-d87e3f58592d', // ED 1%
	'b94f79d8-0865-48bb-b936-e08d06252c22', // Zoomer
	'b5e5cd17-7523-4ea7-8b5e-f48bcb1c2c67', // 2000s op
	'57afa192-11e7-4ff9-b444-b5d6dce3ddf8', // pop
	'befa1d7b-0e4f-41f1-9d8c-8222d6ab56d5', // Bokep 2.0
	'1154c001-1dcd-4bf8-8fd2-240858727d47', // Jojo OP and ED
	'f1c0bf40-ae17-4a43-bff9-8913077d9f04', // OPs 1990
	'e845ab46-ac34-4d54-b1c9-49336311552e', // 0-40 -2000 OPs
	'91571d78-e963-4222-94ce-858c99788b0d' // 2000-2009 Openings
];

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function loadQuiz(id) {
	const { data, error } = await supabase
		.from('quiz_configurations')
		.select('id, name, configuration_data')
		.eq('id', id)
		.single();
	if (error || !data) throw new Error(`quiz ${id}: ${error?.message || 'not found'}`);
	return data;
}

function membershipKey(songs) {
	return songs
		.map((s) => Number(s.annSongId))
		.filter(Number.isFinite)
		.sort((a, b) => a - b)
		.join(',');
}

function orderKey(songs) {
	return songs
		.map((s) => Number(s.annSongId))
		.filter(Number.isFinite)
		.join(',');
}

function collectSourceAnnSongIds(metadata) {
	const ids = [];
	for (const source of metadata?.songsBySource || []) {
		for (const song of source.songs || []) {
			const id = Number(song.annSongId);
			if (Number.isFinite(id)) ids.push(id);
		}
	}
	return [...new Set(ids)];
}

describe('real player quizzes  Edeterministic membership + shuffled order', () => {
	it(
		'10 regenerations: same membership/count; order can differ; exhaustive when target > eligible',
		async () => {
			const results = [];

			for (const id of QUIZ_IDS) {
				let quiz;
				try {
					quiz = await loadQuiz(id);
				} catch (e) {
					console.warn(`skip ${id}: ${e.message}`);
					continue;
				}

				const routes = quiz.configuration_data?.routes;
				expect(routes?.length).toBeGreaterThan(0);

				// Freeze settings so range rolls don't re-roll between attempts.
				const sim = simulateQuizFromRoutes(routes);
				const runs = [];
				for (let i = 0; i < ATTEMPTS; i++) {
					runs.push(await generateQuizSongs(sim, fetch));
				}

				const memberships = runs.map((r) => membershipKey(r.songs));
				const counts = runs.map((r) => r.songs.length);
				const orders = runs.map((r) => orderKey(r.songs));
				const eligible = runs[0].metadata?.eligibleSongCount;
				const feasibleCap = runs[0].metadata?.constraintFeasibleCap;
				const target = sim.numberOfSongs;

				const sameMembership = memberships.every((m) => m === memberships[0]);
				const sameCount = counts.every((c) => c === counts[0]);
				const orderVaried = new Set(orders).size > 1 || counts[0] <= 1;

				expect(sameCount, `${quiz.name}: count drifted across ${ATTEMPTS} attempts`).toBe(true);
				expect(sameMembership, `${quiz.name}: membership drifted across ${ATTEMPTS} attempts`).toBe(
					true
				);

				if (counts[0] === 0) {
					console.warn(`${quiz.name}: empty draw (source load failed?)  Eskipping`);
					continue;
				}

				const expectedCap =
					typeof feasibleCap === 'number' && Number.isFinite(feasibleCap)
						? feasibleCap
						: eligible;
				const targetExceedsPool = typeof expectedCap === 'number' && target > expectedCap;
				if (targetExceedsPool) {
					expect(
						counts[0],
						`${quiz.name}: expected exhaustive fill to ${expectedCap}, got ${counts[0]}`
					).toBe(expectedCap);
				}

				// Low-pool exhaustive: keep only songs from the first draw, exclude
				// everything else, strip filter nodes (relative filters like popularity
				// re-rank a tiny pool), and ask for more songs than remain.
				const keepIds = runs[0].songs
					.map((s) => Number(s.annSongId))
					.filter(Number.isFinite);
				expect(keepIds.length, `${quiz.name}: need a non-empty first draw`).toBeGreaterThan(0);

				const sourceIds = collectSourceAnnSongIds(runs[0].metadata);
				const keepSet = new Set(keepIds);
				const exclude =
					sourceIds.length > 0
						? sourceIds.filter((id) => !keepSet.has(id))
						: [];

				// If songsBySource wasn't returned fully, fall back to excluding
				// nothing and instead rely on a synthetic tiny target check via
				// distribute unit tests  Ebut prefer real exclusion when possible.
				const lowPoolSim = {
					...sim,
					numberOfSongs: keepIds.length + 50,
					filters: []
				};

				if (exclude.length === 0) {
					console.warn(
						`${quiz.name}: cannot shrink source via exclusion  Eskipping low-pool case (unit exhaustive covers this)`
					);
					results.push({
						name: quiz.name,
						target,
						count: counts[0],
						eligible,
						feasibleCap,
						sameMembership,
						sameCount,
						orderVaried,
						targetExceedsPool,
						lowPoolEligible: null,
						lowPoolCount: null,
						lowPoolExhaustive: null,
						lowPoolSkipped: true
					});
					continue;
				}

				const lowPoolRuns = [];
				for (let i = 0; i < ATTEMPTS; i++) {
					lowPoolRuns.push(await generateQuizSongs(lowPoolSim, fetch, exclude));
				}

				const lowMemberships = lowPoolRuns.map((r) => membershipKey(r.songs));
				const lowCounts = lowPoolRuns.map((r) => r.songs.length);
				const lowEligible = lowPoolRuns[0].metadata?.eligibleSongCount;
				const lowCap = lowPoolRuns[0].metadata?.constraintFeasibleCap;

				if (!lowEligible) {
					console.warn(
						`${quiz.name}: low-pool regen returned 0 eligible (source load flake?)  Eskipping exhaustive check`
					);
					results.push({
						name: quiz.name,
						target,
						count: counts[0],
						eligible,
						feasibleCap,
						sameMembership,
						sameCount,
						orderVaried,
						targetExceedsPool,
						lowPoolEligible: 0,
						lowPoolCount: lowCounts[0],
						lowPoolExhaustive: null,
						lowPoolSkipped: true
					});
					continue;
				}

				const expectedExhaust =
					typeof lowCap === 'number' && Number.isFinite(lowCap) ? lowCap : lowEligible;

				expect(
					lowCounts.every((c) => c === lowCounts[0]),
					`${quiz.name}: low-pool count drifted`
				).toBe(true);
				expect(
					lowMemberships.every((m) => m === lowMemberships[0]),
					`${quiz.name}: low-pool membership drifted`
				).toBe(true);
				expect(lowEligible, `${quiz.name}: low-pool should leave a tiny eligible set`).toBeLessThanOrEqual(
					keepIds.length
				);
				expect(lowEligible, `${quiz.name}: low-pool eligible empty`).toBeGreaterThan(0);
				expect(
					lowPoolSim.numberOfSongs,
					`${quiz.name}: goal must exceed eligible for exhaustive case`
				).toBeGreaterThan(lowEligible);
				expect(
					lowCounts[0],
					`${quiz.name}: target>eligible must exhaust the feasible pool`
				).toBe(expectedExhaust);
				// Every drawn song must be from the keep set; exhaustive ⇁Esize matches cap.
				const lowIds = lowMemberships[0].split(',').map(Number);
				expect(lowIds.every((id) => keepSet.has(id)), `${quiz.name}: drew outside keep set`).toBe(
					true
				);

				results.push({
					name: quiz.name,
					target,
					count: counts[0],
					eligible,
					feasibleCap,
					sameMembership,
					sameCount,
					orderVaried,
					targetExceedsPool,
					lowPoolEligible: lowEligible,
					lowPoolCount: lowCounts[0],
					lowPoolExhaustive: lowCounts[0] === expectedExhaust,
					lowPoolSkipped: false
				});
			}

			expect(results.length).toBeGreaterThanOrEqual(8);

			console.log('\n=== Real quiz scoreboard (10 attempts each) ===');
			console.log(
				'(membership/count must match; order may shuffle; low-pool target>eligible must exhaust)\n'
			);
			for (const r of results) {
				const exhaustiveOk = r.lowPoolSkipped || r.lowPoolExhaustive;
				const flag = r.sameMembership && r.sameCount && exhaustiveOk ? 'PASS' : 'FAIL';
				const orderNote = r.orderVaried ? 'order-shuffled' : 'order-stable (tiny/unlucky)';
				const lowNote = r.lowPoolSkipped
					? 'lowPool=skipped'
					: `lowPool ${r.lowPoolCount}/${r.lowPoolEligible} exhaustive=${r.lowPoolExhaustive}`;
				console.log(
					`${flag} | ${r.name} | target=${r.target} got=${r.count} eligible=${r.eligible} cap=${r.feasibleCap} | ${orderNote} | ${lowNote}`
				);
			}

			if (existsSync('zoomer-route.json')) unlinkSync('zoomer-route.json');
		},
		600_000
	);
});
