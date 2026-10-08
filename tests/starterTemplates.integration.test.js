/**
 * Integration-only starter check. It reads the known-good base template from
 * Supabase, then runs the same simulation/generation path used by /play.
 */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { generateQuizSongs } from '../src/lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '../src/lib/utils/simulation.js';
import {
	BASIC_TEMPLATE_ID,
	EXECUTION_CHANCES_TEMPLATE_ID,
	ROUTER_MODIFIERS_TEMPLATE_ID,
	buildStarterConfiguration
} from '../src/lib/server/starter-templates.js';

loadEnv();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function loadBaseConfiguration() {
	const { data, error } = await supabase
		.from('quiz_configurations')
		.select('configuration_data')
		.eq('id', BASIC_TEMPLATE_ID)
		.single();

	if (error || !data?.configuration_data) {
		throw new Error(error?.message || 'Starter source configuration is missing');
	}

	return data.configuration_data;
}

function countSongTypes(songs) {
	return songs.reduce(
		(counts, song) => {
			const type = song.songType ?? '';
			if (type.startsWith('Opening')) counts.openings += 1;
			else if (type.startsWith('Ending')) counts.endings += 1;
			else if (type.startsWith('Insert')) counts.inserts += 1;
			return counts;
		},
		{ openings: 0, endings: 0, inserts: 0 }
	);
}

describe('production-backed homepage starters', () => {
	it.each([
		['Basic Linear Flow', BASIC_TEMPLATE_ID, null, null],
		[
			'Random Execution Chances',
			EXECUTION_CHANCES_TEMPLATE_ID,
			0,
			{ openings: 10, endings: 10, inserts: 0 }
		],
		[
			'Router & Modifier Nodes — Classic route',
			ROUTER_MODIFIERS_TEMPLATE_ID,
			0,
			{
				openings: 12,
				endings: 8,
				inserts: 0
			}
		],
		[
			'Router & Modifier Nodes — Modern route',
			ROUTER_MODIFIERS_TEMPLATE_ID,
			1,
			{
				openings: 8,
				endings: 12,
				inserts: 0
			}
		]
	])(
		'generates a playable 20-song quiz for %s',
		async (_name, templateId, routeIndex, expectedTypes) => {
			const base = await loadBaseConfiguration();
			const configuration = buildStarterConfiguration(base, templateId);
			const routes = routeIndex == null ? configuration.routes : [configuration.routes[routeIndex]];
			const simulated = simulateQuizFromRoutes(routes);
			const result = await generateQuizSongs(simulated, fetch);

			expect(result.songs).toHaveLength(20);
			if (expectedTypes) expect(countSongTypes(result.songs)).toEqual(expectedTypes);
		},
		120_000
	);
});
