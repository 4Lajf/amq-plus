import { describe, it, expect, beforeEach } from 'vitest';
import {
	createSessionJob,
	getSessionJob,
	setSessionJobMessage,
	completeSessionJob,
	failSessionJob,
	resetSessionJobsForTests
} from '../src/lib/server/training/session-jobs.js';

describe('session job store', () => {
	beforeEach(() => {
		resetSessionJobsForTests();
	});

	it('creates a pending job owned by the user', () => {
		const job = createSessionJob('user-1');

		expect(job.status).toBe('pending');
		expect(job.userId).toBe('user-1');
		expect(getSessionJob(job.id)).toBe(job);
	});

	it('updates the pending message', () => {
		const job = createSessionJob('user-1');
		setSessionJobMessage(job.id, 'Generating song pool…');

		expect(getSessionJob(job.id).message).toBe('Generating song pool…');
	});

	it('completes with a result payload', () => {
		const job = createSessionJob('user-1');
		completeSessionJob(job.id, { sessionId: 's1', totalSongs: 20 });

		const ready = getSessionJob(job.id);
		expect(ready.status).toBe('ready');
		expect(ready.result.sessionId).toBe('s1');
	});

	it('fails with an error and status', () => {
		const job = createSessionJob('user-1');
		failSessionJob(job.id, 'No songs found', 400);

		const failed = getSessionJob(job.id);
		expect(failed.status).toBe('error');
		expect(failed.error).toBe('No songs found');
		expect(failed.errorStatus).toBe(400);
	});

	it('ignores message updates after completion', () => {
		const job = createSessionJob('user-1');
		completeSessionJob(job.id, { sessionId: 's1' });
		setSessionJobMessage(job.id, 'should not stick');

		expect(getSessionJob(job.id).message).toBe('Ready');
	});

	describe('per-user concurrency', () => {
		it('rejects a third concurrent job with 429', () => {
			createSessionJob('user-1');
			createSessionJob('user-1');

			// The blocking start used to rate-limit button-mashing on its own; 202
			// removed that, so a spammed Start Training would queue N generations.
			expect(() => createSessionJob('user-1')).toThrowError(/already being generated/i);

			try {
				createSessionJob('user-1');
			} catch (err) {
				expect(err.status).toBe(429);
				expect(err.existingJobId).toBeDefined();
			}
		});

		it('does not count another user against the limit', () => {
			createSessionJob('user-1');
			createSessionJob('user-1');

			expect(() => createSessionJob('user-2')).not.toThrow();
		});

		it('frees a slot once a job finishes', () => {
			const first = createSessionJob('user-1');
			createSessionJob('user-1');
			completeSessionJob(first.id, { sessionId: 's1' });

			expect(() => createSessionJob('user-1')).not.toThrow();
		});

		it('frees a slot once a job fails', () => {
			const first = createSessionJob('user-1');
			createSessionJob('user-1');
			failSessionJob(first.id, 'No songs found', 400);

			expect(() => createSessionJob('user-1')).not.toThrow();
		});
	});
});
