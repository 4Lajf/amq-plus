const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_ANSWER_LENGTH = 1000;

function optionalAnswer(value) {
	if (value == null || value === '') return null;
	return typeof value === 'string' ? value : null;
}

/**
 * Validate and normalize the connector-facing rating payload. A request ID and
 * original play timestamp are mandatory: retries must carry the same identity
 * and scheduling time as the first delivery.
 *
 * @param {unknown} input
 * @returns {{ value: null, error: string } | { value: {
 *   token: string,
 *   requestId: string,
 *   playedAt: string,
 *   annSongId: number,
 *   rating: number,
 *   success: boolean,
 *   userAnswer: string|null,
 *   correctAnswer: string|null
 * }, error: null }}
 */
export function parseTrainingRatingRequest(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return { value: null, error: 'A JSON request body is required' };
	}

	const body = /** @type {Record<string, unknown>} */ (input);
	if (typeof body.token !== 'string' || body.token.length === 0) {
		return { value: null, error: 'Token is required' };
	}
	if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) {
		return { value: null, error: 'requestId must be a UUID' };
	}

	const playedAtInput = body.playedAt ?? body.timestamp;
	const playedAtDate =
		typeof playedAtInput === 'string' || typeof playedAtInput === 'number'
			? new Date(playedAtInput)
			: null;
	if (!playedAtDate || !Number.isFinite(playedAtDate.getTime())) {
		return { value: null, error: 'playedAt must be a valid timestamp' };
	}

	// The connector pins revealed song IDs as strings, including queued ratings.
	const annSongId = typeof body.annSongId === 'string' && /^[0-9]+$/.test(body.annSongId)
		? Number(body.annSongId)
		: body.annSongId;
	if (typeof annSongId !== 'number' || !Number.isSafeInteger(annSongId) || annSongId <= 0) {
		return { value: null, error: 'annSongId must be a positive whole number' };
	}
	if (
		typeof body.rating !== 'number' ||
		!Number.isInteger(body.rating) ||
		body.rating < 1 ||
		body.rating > 4
	) {
		return { value: null, error: 'Rating must be between 1 (No idea) and 4 (Trivial)' };
	}
	if (typeof body.success !== 'boolean') {
		return { value: null, error: 'Success must be true or false' };
	}

	const userAnswer = optionalAnswer(body.userAnswer);
	const correctAnswer = optionalAnswer(body.correctAnswer);
	if (body.userAnswer != null && body.userAnswer !== '' && userAnswer === null) {
		return { value: null, error: 'userAnswer must be text' };
	}
	if (body.correctAnswer != null && body.correctAnswer !== '' && correctAnswer === null) {
		return { value: null, error: 'correctAnswer must be text' };
	}
	if (
		(userAnswer?.length ?? 0) > MAX_ANSWER_LENGTH ||
		(correctAnswer?.length ?? 0) > MAX_ANSWER_LENGTH
	) {
		return { value: null, error: `Answers cannot exceed ${MAX_ANSWER_LENGTH} characters` };
	}

	return {
		value: {
			token: body.token,
			requestId: body.requestId.toLowerCase(),
			playedAt: playedAtDate.toISOString(),
			annSongId,
			rating: body.rating,
			success: body.success,
			userAnswer,
			correctAnswer
		},
		error: null
	};
}

/**
 * Reject timestamps outside the lifetime of the session or implausibly in the
 * future. Delayed offline retries remain valid because there is no maximum age
 * after the session started.
 *
 * @param {string} playedAt
 * @param {string} sessionStartedAt
 * @param {number} [currentTime=Date.now()]
 */
export function validateRatingTimestamp(playedAt, sessionStartedAt, currentTime = Date.now()) {
	const playedTime = Date.parse(playedAt);
	const sessionStart = Date.parse(sessionStartedAt);
	const clockTolerance = 5 * 60 * 1000;

	if (!Number.isFinite(playedTime) || !Number.isFinite(sessionStart)) {
		return 'The rating timestamp is invalid';
	}
	if (playedTime < sessionStart - clockTolerance) {
		return 'The rating occurred before this training session started';
	}
	if (playedTime > currentTime + clockTolerance) {
		return 'The rating timestamp is too far in the future';
	}
	return null;
}

/**
 * Keep a delayed/offline queue from applying an older answer on top of a newer
 * card state. Equal timestamps are allowed because an idempotent replay uses
 * the same original play time.
 *
 * @param {string} playedAt
 * @param {string|null|undefined} lastAttemptAt
 */
export function validateRatingOrder(playedAt, lastAttemptAt) {
	if (!lastAttemptAt) return null;

	const playedTime = Date.parse(playedAt);
	const lastAttemptTime = Date.parse(lastAttemptAt);
	if (!Number.isFinite(playedTime) || !Number.isFinite(lastAttemptTime)) {
		return 'The rating order could not be verified';
	}
	if (playedTime < lastAttemptTime) {
		return 'This queued rating is older than the latest saved answer';
	}
	return null;
}
