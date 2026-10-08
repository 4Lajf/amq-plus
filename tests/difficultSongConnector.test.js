import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('amqPlusConnector.user.js', 'utf8');
const showFunction = source.slice(
	source.indexOf('function showDifficultSongSuggestions('),
	source.indexOf('function createTrainingRequestId(')
);

const queueFunction = source.slice(
	source.indexOf('function processTrainingSyncQueue('),
	source.indexOf('function updateTrainingAccuracy(')
);

describe('saving final ratings before suggestions', () => {
	function queueHarness() {
		const requests = [],
			timers = [];
		const item = {
			sessionId: 's',
			requestId: 'stable-id',
			playedAt: '2026-09-05T12:00:00Z',
			annSongId: 42,
			rating: 1,
			success: false
		};
		let completed = 0;
		const chain = {
			fadeIn() {
				return chain;
			},
			delay() {
				return chain;
			},
			fadeOut() {
				return chain;
			}
		};
		const context = {
			trainingState: { pendingSync: [item], syncInProgress: false, authToken: 'token' },
			trainingCompletionRequested: true,
			API_BASE_URL: 'https://example.test',
			console: { log() {}, warn() {}, error() {} },
			GM_xmlhttpRequest: (req) => requests.push(req),
			saveTrainingSettings() {},
			$: () => chain,
			setTimeout: (fn) => timers.push(fn),
			endTrainingSession: () => completed++,
			sendSystemMessage() {}
		};
		vm.runInNewContext(queueFunction, context);
		context.processTrainingSyncQueue();
		return { context, requests, timers, completed: () => completed };
	}
	it('retains identity after temporary contention and completes only after saving', () => {
		const h = queueHarness();
		h.requests[0].onload({ status: 503 });
		expect(h.context.trainingState.pendingSync).toHaveLength(1);
		expect(h.completed()).toBe(0);
		h.timers[0]();
		expect(JSON.parse(h.requests[1].data)).toEqual(JSON.parse(h.requests[0].data));
		h.requests[1].onload({ status: 200 });
		expect(h.completed()).toBe(1);
	});
	it('finishes the summary after a permanently rejected last queue entry', () => {
		const h = queueHarness();
		h.requests[0].onload({ status: 409 });
		expect(h.context.trainingState.pendingSync).toHaveLength(0);
		expect(h.completed()).toBe(1);
	});
});

function harness({ paused = false, host = true } = {}) {
	const elements = [],
		commands = [],
		requests = [],
		storage = new Map();
	function element(tag) {
		const node = {
			tag,
			children: [],
			handlers: {},
			attrs: {},
			removed: false,
			attr(value) {
				Object.assign(this.attrs, value);
				return this;
			},
			css() {
				return this;
			},
			text() {
				return this;
			},
			addClass() {
				return this;
			},
			appendTo(parent) {
				parent.children.push(this);
				return this;
			},
			on(event, callback) {
				this.handlers[event] = callback;
				return this;
			},
			prop() {
				return this;
			},
			remove() {
				this.removed = true;
			},
			find() {
				return { prop() {}, first: () => ({ trigger() {} }) };
			}
		};
		elements.push(node);
		return node;
	}
	const context = {
		$,
		document: { body: { children: [] }, getElementById: () => null },
		localStorage: { setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
		quiz: { pauseButton: { pauseOn: paused } },
		lobby: { isHost: host, gameId: 7 },
		socket: { sendCommand: (command) => commands.push(command) },
		API_BASE_URL: 'https://example.test',
		trainingState: { authToken: 'token' },
		GM_xmlhttpRequest: (request) => requests.push(request),
		sendSystemMessage() {}
	};
	function $(tag) {
		return element(tag);
	}
	vm.runInNewContext(showFunction, context);
	context.showDifficultSongSuggestions({
		roomId: 7,
		sessionId: 's',
		quizId: 'q',
		summary: '1/2',
		songs: [
			{ annSongId: 42, name: '<unsafe name>', lapses: 8 },
			{ annSongId: 43, name: 'Second', lapses: 9 }
		]
	});
	return {
		elements,
		commands,
		requests,
		storage,
		buttons: elements.filter((e) => e.tag === '<button>')
	};
}

describe('post-session lobby pause lifecycle', () => {
	it('pauses once and sends no song mutation until an explicit choice', () => {
		const h = harness();
		expect(h.commands).toEqual([{ type: 'quiz', command: 'quiz pause' }]);
		expect(h.requests).toHaveLength(0);
		expect(h.elements.find((e) => e.tag === '<section>').attrs['aria-modal']).toBeUndefined();
	});
	it('unpauses only after every choice has saved', () => {
		const h = harness();
		h.buttons[0].handlers.click();
		expect(JSON.parse(h.requests[0].data).choice).toBe('pause');
		h.requests[0].onload({ status: 200, responseText: '{"success":true,"choice":"pause"}' });
		expect(h.commands).toHaveLength(1);
		h.buttons[3].handlers.click();
		h.requests[1].onload({ status: 200, responseText: '{"success":true,"choice":"keep"}' });
		expect(h.commands[1]).toEqual({ type: 'quiz', command: 'quiz unpause' });
		expect(h.storage.size).toBe(0);
	});
	it('keeps the lobby paused and pending decisions on a save error', () => {
		const h = harness();
		h.buttons[0].handlers.click();
		h.requests[0].onerror();
		expect(h.commands).toHaveLength(1);
		expect(JSON.parse(h.storage.get('amqPlusDifficultSongs')).songs).toHaveLength(2);
	});
	it.each([{ paused: true }, { host: false }])(
		'does not take over an existing pause or a non-host lobby: %o',
		(options) => {
			const h = harness(options);
			for (const index of [1, 3]) {
				h.buttons[index].handlers.click();
				h.requests.at(-1).onload({ status: 200, responseText: '{"success":true,"choice":"keep"}' });
			}
			expect(h.commands).toHaveLength(0);
		}
	);
});
