import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedLatest } from '../src/lib/utils/debouncedLatest.js';

describe('createDebouncedLatest', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not call run until waitMs of idle, then only with the latest arg', async () => {
		const run = vi.fn(async (arg) => arg);
		const schedule = createDebouncedLatest(run, 250);

		const p1 = schedule('n');
		const p2 = schedule('na');
		const p3 = schedule('naruto');

		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(249);
		expect(run).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await Promise.all([p1, p2, p3]);

		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBe('naruto');
	});

	it('aborts the previous in-flight run when a newer call is scheduled', async () => {
		/** @type {AbortSignal[]} */
		const signals = [];
		const run = vi.fn(async (_arg, signal) => {
			signals.push(signal);
			await new Promise(() => {});
		});
		const schedule = createDebouncedLatest(run, 50);

		schedule('n');
		await vi.advanceTimersByTimeAsync(50);
		expect(run).toHaveBeenCalledTimes(1);

		schedule('naruto');
		await vi.advanceTimersByTimeAsync(50);

		expect(signals[0].aborted).toBe(true);
		expect(run).toHaveBeenCalledTimes(2);
		expect(signals[1].aborted).toBe(false);
	});

	it('marks superseded results stale so callers can ignore them', async () => {
		let releaseFirst;
		const run = vi.fn(async (arg) => {
			if (arg === 'slow') {
				await new Promise((resolve) => {
					releaseFirst = resolve;
				});
			}
			return arg;
		});
		const schedule = createDebouncedLatest(run, 10);

		const first = schedule('slow');
		await vi.advanceTimersByTimeAsync(10);

		const second = schedule('fast');
		await vi.advanceTimersByTimeAsync(10);
		const secondResult = await second;

		releaseFirst();
		const firstResult = await first;

		expect(firstResult).toEqual({ stale: true, result: undefined });
		expect(secondResult).toEqual({ stale: false, result: 'fast' });
	});
});
