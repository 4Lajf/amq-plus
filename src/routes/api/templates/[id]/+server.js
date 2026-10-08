/**
 * Stable starter templates built from one known-good quiz configuration.
 *
 * The public template IDs are kept so old links continue to work. Each level
 * adds a real builder capability while remaining immediately playable.
 *
 * @module api/templates/[id]
 */

import { error, json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import {
	BASIC_TEMPLATE_ID,
	EXECUTION_CHANCES_TEMPLATE_ID,
	ROUTER_MODIFIERS_TEMPLATE_ID,
	buildStarterConfiguration
} from '$lib/server/starter-templates.js';

const TEMPLATE_METADATA = {
	[BASIC_TEMPLATE_ID]: {
		name: 'Basic Linear Flow',
		description:
			'A clear, single-route quiz that introduces the source, game settings, song mix, and every core filter without extra branching.',
		level: 'Beginner',
		levelOrder: 1,
		features: ['1 route', '20 songs', 'All core filters'],
		isTemplate: true
	},
	[EXECUTION_CHANCES_TEMPLATE_ID]: {
		name: 'Random Execution Chances',
		description:
			'A dynamic single-route quiz where optional filters have fixed and ranged chances to run, producing controlled variety between games.',
		level: 'Intermediate',
		levelOrder: 2,
		features: ['1 route', 'Fixed chances', 'Chance ranges'],
		isTemplate: true
	},
	[ROUTER_MODIFIERS_TEMPLATE_ID]: {
		name: 'Router & Modifier Nodes',
		description:
			'A two-route quiz with weighted classic and modern paths, route-specific settings, and selection modifiers choosing among genre alternatives.',
		level: 'Advanced',
		levelOrder: 3,
		features: ['2 weighted routes', 'Selection modifiers', 'Route-specific filters'],
		isTemplate: true
	}
};

export async function GET({ params }) {
	const metadata = TEMPLATE_METADATA[params.id];
	if (!metadata) {
		throw error(404, { message: 'Template not found' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();
		const { data: quizData, error: dbError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('configuration_data, is_public, creator_username')
			.eq('id', BASIC_TEMPLATE_ID)
			.single();

		if (dbError || !quizData?.configuration_data) {
			console.error('Database error while loading starter template:', dbError);
			throw error(404, { message: 'Template configuration not found' });
		}

		return json({
			configuration_data: buildStarterConfiguration(quizData.configuration_data, params.id),
			name: metadata.name,
			description: metadata.description,
			is_public: quizData.is_public,
			creator_username: quizData.creator_username,
			metadata
		});
	} catch (err) {
		if (err?.status) throw err;
		console.error('Error loading template configuration:', err);
		throw error(500, { message: 'Failed to load template configuration' });
	}
}
