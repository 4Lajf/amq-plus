/**
 * Poll the status of an async training session start job.
 *
 *   GET  /api/training/session/job/[jobId]   with `X-Training-Token: <token>`
 *   POST /api/training/session/job/[jobId]   with `{ "token": "<token>" }`
 *
 * The token is deliberately NOT accepted from the query string. The connector
 * polls this endpoint every 2s for up to 10 minutes, so a `?token=` would write
 * the plaintext connector token into Cloudflare and origin access logs a few
 * hundred times per training session.
 */

import { json } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { lookupToken, INVALID_TOKEN_MESSAGE } from '$lib/server/training/training-utils.js';
import { getSessionJob } from '$lib/server/training/session-jobs.js';

const TOKEN_HEADER = 'x-training-token';

/**
 * @param {string} jobId
 * @param {string|null} token
 * @returns {Promise<Response>}
 */
async function respondWithJob(jobId, token) {
	if (!token) {
		return json({ error: 'Token required', status: 'error' }, { status: 400 });
	}

	const supabaseAdmin = createSupabaseAdmin();
	const validToken = await lookupToken(supabaseAdmin, token);
	if (!validToken) {
		return json({ error: INVALID_TOKEN_MESSAGE, status: 'error' }, { status: 401 });
	}

	const job = getSessionJob(jobId);
	if (!job || job.userId !== validToken.user_id) {
		return json({ error: 'Job not found or expired', status: 'error' }, { status: 404 });
	}

	if (job.status === 'pending') {
		return json({
			status: 'pending',
			jobId: job.id,
			message: job.message || 'Generating session…'
		});
	}

	if (job.status === 'error') {
		return json(
			{
				status: 'error',
				jobId: job.id,
				error: job.error || 'Session start failed'
			},
			{ status: job.errorStatus && job.errorStatus >= 400 ? job.errorStatus : 500 }
		);
	}

	// ready — return the same payload the old sync endpoint used to return
	return json({
		status: 'ready',
		jobId: job.id,
		...job.result
	});
}

// @ts-ignore
export async function GET({ params, request }) {
	return respondWithJob(params.jobId, request.headers.get(TOKEN_HEADER));
}

// @ts-ignore
export async function POST({ params, request }) {
	let token = request.headers.get(TOKEN_HEADER);

	if (!token) {
		const body = await request.json().catch(() => ({}));
		token = body?.token || null;
	}

	return respondWithJob(params.jobId, token);
}
