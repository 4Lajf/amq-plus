/**
 * POST /api/training/session/start
 *
 * Accepts a training session request and returns 202 + jobId immediately.
 * Song-pool generation can exceed Cloudflare's 100s origin timeout on large
 * quizzes; the connector polls GET /api/training/session/job/[jobId] until
 * the job is ready or failed.
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { getUserTrainingPreferences } from '$lib/server/training/user-preferences.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { buildTrainingSession } from '$lib/server/training/sessionStartService.js';
import {
	createSessionJob,
	completeSessionJob,
	failSessionJob
} from '$lib/server/training/session-jobs.js';
import {
	CONNECTOR_UPDATE_MESSAGE,
	MIN_CONNECTOR_VERSION,
	isConnectorVersionAtLeast
} from '$lib/server/training/connector-version.js';
import { validateSessionStartParams } from '$lib/server/training/session-request.js';

// @ts-ignore
export async function POST({ request, url, fetch }) {
	const origin = url.origin;
	const serverFetch = (input, init) => {
		let urlString;
		if (typeof input === 'string') {
			urlString = input;
		} else if (input instanceof Request) {
			urlString = input.url;
		} else {
			urlString = input.toString();
		}
		const absoluteUrl = urlString.startsWith('http') ? urlString : `${origin}${urlString}`;
		return fetch(absoluteUrl, init);
	};

	const supabaseAdmin = createSupabaseAdmin();

	try {
		const params = await request.json();
		const {
			token,
			quizId,
			sessionLength = 20,
			mode = 'auto',
			dueSongPercentage = 70,
			connectorVersion = null
		} = params;

		console.log('[TRAINING SESSION] ========================================');
		console.log('[TRAINING SESSION] New session request received');
		console.log('[TRAINING SESSION] Quiz ID:', quizId);
		console.log('[TRAINING SESSION] Requested session length:', sessionLength, 'songs');
		console.log('[TRAINING SESSION] Mode:', mode);
		console.log('[TRAINING SESSION] Connector version:', connectorVersion || 'not reported');

		if (!token || !quizId) {
			return json({ error: 'Token and quizId required' }, { status: 400 });
		}

		// Reject a stale connector before spending a generation on it. Connectors
		// that predate version reporting send nothing, which is itself the answer.
		// 426 is not 200, so an older connector's generic branch renders `error` verbatim -
		// that is the only channel that reaches those users.
		if (!isConnectorVersionAtLeast(connectorVersion)) {
			console.warn(
				'[TRAINING SESSION] Rejected stale connector:',
				connectorVersion || 'unreported'
			);
			return json(
				{
					error: CONNECTOR_UPDATE_MESSAGE,
					minConnectorVersion: MIN_CONNECTOR_VERSION,
					yourConnectorVersion: connectorVersion || 'unknown'
				},
				{ status: 426 }
			);
		}

		const validationError = validateSessionStartParams(params);
		if (validationError) {
			return json({ error: validationError }, { status: 400 });
		}

		const validToken = await lookupToken(supabaseAdmin, token);
		if (!validToken) {
			return json({ error: INVALID_TOKEN_MESSAGE }, { status: 401 });
		}

		const userId = validToken.user_id;

		const { data: quiz, error: quizError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('*')
			.eq('play_token', quizId)
			.single();

		if (quizError || !quiz) {
			return json({ error: 'Quiz not found' }, { status: 404 });
		}

		const preferences = await getUserTrainingPreferences(supabaseAdmin, userId, quiz.id, quiz);
		Object.assign(quiz, preferences);

		let job;
		try {
			job = createSessionJob(userId);
		} catch (limitError) {
			if (limitError?.status === 429) {
				console.warn('[TRAINING SESSION] Rejected - user already has a job in flight:', userId);
				return json(
					{ error: limitError.message, jobId: limitError.existingJobId, status: 'pending' },
					{ status: 429 }
				);
			}
			throw limitError;
		}

		console.log('[TRAINING SESSION] ✓ Accepted as job', job.id, 'for quiz', quiz.name);

		// Fire-and-forget: must not await, or Cloudflare still times out the request.
		Promise.resolve()
			.then(async () => {
				const result = await buildTrainingSession({
					supabaseAdmin,
					userId,
					quiz,
					params,
					serverFetch,
					jobId: job.id
				});
				if (result.ok) {
					completeSessionJob(job.id, result.body);
					console.log('[TRAINING SESSION] ✓ Job ready:', job.id);
				} else {
					failSessionJob(job.id, result.body?.error || 'Session start failed', result.status);
					console.log('[TRAINING SESSION] ❌ Job failed:', job.id, result.body?.error);
				}
			})
			.catch((err) => {
				console.error('[TRAINING SESSION] ❌ Job crashed:', job.id, err);
				failSessionJob(job.id, err?.message || 'Internal server error', 500);
			});

		return json(
			{
				jobId: job.id,
				status: 'pending',
				message: 'Generating session…',
				minConnectorVersion: MIN_CONNECTOR_VERSION,
				// Belt and braces. The version gate above already turned away anything
				// that cannot poll, but a connector that reports a good version and
				// then fails to understand 202 still lands in its generic error branch,
				// which renders `error`. Current connectors take the `jobId` branch and
				// never read this.
				error: CONNECTOR_UPDATE_MESSAGE
			},
			{ status: 202 }
		);
	} catch (error) {
		console.error('[TRAINING SESSION] ❌ Unexpected error accepting job:', error);
		return json({ error: error.message || 'Internal server error' }, { status: 500 });
	}
}
