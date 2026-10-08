import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const connector = readFileSync('amqPlusConnector.user.js', 'utf8').replace(/\r\n/g, '\n');
const start = connector.indexOf('  const POLL_INTERVAL_MS =');
const end = connector.indexOf('\n  GM_xmlhttpRequest({\n    method: "POST",', start);
if (start < 0 || end < 0) throw new Error('Session polling source boundaries not found');
const code = connector.slice(start, end);

function harness() {
	let now = 0;
	const requests = [], timers = [], ready = [], failures = [];
	const context = {
		Date: { now: () => now }, console: { warn() {} },
		API_BASE_URL: 'https://example.test', trainingState: { authToken: 'test-token' },
		GM_xmlhttpRequest: request => requests.push(request),
		setTimeout: (callback, delay) => timers.push({ callback, delay }),
		showTrainingStatus() {}, applyReadySession: data => ready.push(data),
		failSessionStart: (...args) => failures.push(args)
	};
	vm.runInNewContext(code, context);
	context.pollSessionJob('job', 0);
	return { requests, timers, ready, failures, advance: value => { now = value; } };
}

describe('connector session job polling', () => {
	it('picks up a fast ready result after 250ms without scheduling another poll', () => {
		const h = harness();
		h.requests[0].onload({ status: 202, responseText: '{"status":"pending"}' });
		expect(h.timers[0].delay).toBe(250);
		h.advance(250); h.timers[0].callback();
		h.requests[1].onload({ status: 200, responseText: '{"status":"ready","sessionId":"session"}' });
		expect(h.ready).toHaveLength(1);
		expect(h.timers).toHaveLength(1);
		expect(h.requests[1].url).not.toContain('test-token');
	});
	it('reduces polling frequency for slower generation', () => {
		const h = harness();
		for (const [time, delay] of [[3000, 1000], [10000, 2000]]) {
			h.advance(time);
			h.requests.at(-1).onload({ status: 202, responseText: '{"status":"pending"}' });
			expect(h.timers.at(-1).delay).toBe(delay);
			h.timers.at(-1).callback();
		}
	});
	it('keeps failure backoff and stops after five consecutive failures', () => {
		const h = harness();
		for (const delay of [2000, 4000, 8000, 16000]) {
			h.requests.at(-1).onerror();
			expect(h.timers.at(-1).delay).toBe(delay);
			h.timers.at(-1).callback();
		}
		h.requests.at(-1).onerror();
		expect(h.failures).toHaveLength(1);
		expect(h.timers).toHaveLength(4);
	});
});
