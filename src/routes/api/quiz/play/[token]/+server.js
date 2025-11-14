/**
 * Quiz basic info by play token API endpoint.
 * Returns basic information about a quiz (name, song count) for a play token.
 *
 * @module api/quiz/play/[token]
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/quiz/play/[token]
 * Gets basic information about a quiz configuration by play token.
 * Public endpoint - anyone can view basic quiz info via play token.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.token - Play token
 * @returns {Promise<Response>} Quiz basic information
 */
export async function GET({ params }) {
	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch quiz configuration by play token
		const { data: quizData, error: fetchError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id, name, configuration_data')
			.eq('play_token', params.token)
			.single();

		if (fetchError || !quizData) {
			console.error('[QUIZ INFO] Quiz not found for play token:', params.token, fetchError);
			return error(404, { message: 'Quiz not found' });
		}

		// Count songs in the configuration
		let songCount = 0;
		try {
			if (quizData.configuration_data) {
				const config = quizData.configuration_data;
				// Count songs in song list if available
				if (config.songList && Array.isArray(config.songList)) {
					songCount = config.songList.length;
				}
			}
		} catch (e) {
			console.warn('[QUIZ INFO] Error counting songs:', e);
		}

		return json({
			id: quizData.id,
			name: quizData.name,
			songCount: songCount,
			token: params.token
		});
	} catch (err) {
		console.error('[QUIZ INFO] Error fetching quiz info by play token:', err);
		return error(500, { message: 'Failed to fetch quiz information' });
	}
}

