import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parseTrainingRatingRequest,
	validateRatingOrder,
	validateRatingTimestamp
} from '../src/lib/server/training/rating-request.js';
import { TrainingScheduler } from '../src/lib/server/training/fsrs-service.js';

const REQUEST_ID = 'c4c8f2dc-0137-4a66-81aa-5bf8497201d7';
const PLAYED_AT = '2026-09-05T12:00:00.000Z';

function validRequest(overrides = {}) {
	return {
		token: 'training-token',
		requestId: REQUEST_ID,
		playedAt: PLAYED_AT,
		annSongId: 42,
		rating: 3,
		success: true,
		userAnswer: 'Frieren',
		correctAnswer: 'Sousou no Frieren',
		...overrides
	};
}

describe('training rating request integrity', () => {
	it('normalizes a valid request without changing its idempotency identity', () => {
		const parsed = parseTrainingRatingRequest(validRequest());

		expect(parsed.error).toBeNull();
		expect(parsed.value).toMatchObject({
			requestId: REQUEST_ID,
			playedAt: PLAYED_AT,
			annSongId: 42,
			rating: 3,
			success: true
		});
	});

	it.each([
		[{ requestId: undefined }, 'requestId'],
		[{ requestId: 'retry-me' }, 'requestId'],
		[{ playedAt: 'not-a-date' }, 'playedAt'],
		[{ annSongId: 3.5 }, 'annSongId'],
		[{ rating: 5 }, 'Rating'],
		[{ success: 1 }, 'Success']
	])('rejects malformed identity or scheduling fields', (override, message) => {
		expect(parseTrainingRatingRequest(validRequest(override)).error).toContain(message);
	});

	it('accepts the legacy timestamp name while queued connectors migrate', () => {
		const request = validRequest({ playedAt: undefined, timestamp: PLAYED_AT });

		expect(parseTrainingRatingRequest(request).value?.playedAt).toBe(PLAYED_AT);
	});

	it('accepts pinned connector song IDs as decimal strings', () => {
		expect(parseTrainingRatingRequest(validRequest({ annSongId: '42' })).value?.annSongId).toBe(42);
	});

	it.each(['', ' ', '4.2', '4e2', '-42', '0', '9007199254740992', true, null])(
		'rejects malformed string or nonnumeric song ID %s', (annSongId) => {
			expect(parseTrainingRatingRequest(validRequest({ annSongId })).error).toContain('annSongId');
		}
	);

	it('rejects ratings before the session or too far in the future', () => {
		const now = Date.parse('2026-09-05T12:00:00.000Z');

		expect(validateRatingTimestamp(PLAYED_AT, '2026-09-05T11:00:00.000Z', now)).toBeNull();
		expect(
			validateRatingTimestamp('2026-09-05T10:54:59.000Z', '2026-09-05T11:00:00.000Z', now)
		).toContain('before');
		expect(
			validateRatingTimestamp('2026-09-05T12:05:01.000Z', '2026-09-05T11:00:00.000Z', now)
		).toContain('future');
	});

	it('rejects an older queued answer without rejecting an idempotent replay', () => {
		expect(validateRatingOrder(PLAYED_AT, '2026-09-05T12:00:01.000Z')).toContain('older');
		expect(validateRatingOrder(PLAYED_AT, PLAYED_AT)).toBeNull();
		expect(validateRatingOrder(PLAYED_AT, null)).toBeNull();
	});

	it('schedules from the original play time so a delayed retry is deterministic', () => {
		const scheduler = new TrainingScheduler({ enable_fuzz: false });
		const card = scheduler.createNewCard('42', new Date(PLAYED_AT));
		const first = scheduler.updateCardState(card, 3, { now: PLAYED_AT });
		const retry = scheduler.updateCardState(card, 3, { now: PLAYED_AT });

		expect(first).toEqual(retry);
		expect(first.last_review).toBe(PLAYED_AT);
	});

	it('queues connector writes with the same request ID and play time used by retries', () => {
		const connector = fs.readFileSync('amqPlusConnector.user.js', 'utf8');
		const queueWriter = connector.slice(
			connector.indexOf('function sendProgressToServer'),
			connector.indexOf('function processTrainingSyncQueue')
		);
		const queueProcessor = connector.slice(
			connector.indexOf('function processTrainingSyncQueue'),
			connector.indexOf('function updateTrainingAccuracy')
		);

		expect(queueWriter).toContain('trainingState.pendingSync.push(identified)');
		expect(queueWriter).not.toContain('GM_xmlhttpRequest');
		expect(queueProcessor).toContain('requestId: syncItem.requestId');
		expect(queueProcessor).toContain('playedAt: syncItem.playedAt');
	});

	it('keeps all three durable writes inside the service-role-only database function', () => {
		const migration = fs.readFileSync(
			'supabase/migrations/20260905000000_atomic_training_rating_commits.sql',
			'utf8'
		);

		expect(migration).toContain('create or replace function public.commit_training_rating');
		expect(migration).toContain('update public.training_progress');
		expect(migration).toContain('insert into public.training_session_plays');
		expect(migration).toContain('update public.training_sessions');
		expect(migration).toContain('grant execute on function public.commit_training_rating');
		expect(migration).toContain('to service_role');
	});
});
