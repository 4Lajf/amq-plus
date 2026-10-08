import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync('amqPlusConnector.user.js', 'utf8');
const code = source.slice(source.indexOf('function applyQuizToLobby('), source.indexOf('// Valid list statuses'));
function setup(communityMode) {
	const sent = [], timers = [];
	let receive, unbound = 0;
	const ctx = {
		console: { log() {} }, lobby: { communityMode }, isApplyingRoomSettingsQuiz: false,
		socket: { sendCommand(c) { sent.push(c.command); } },
		Listener: class { constructor(name, fn) { receive = fn; } bindListener() {} unbindListener() { unbound++; } },
		setTimeout(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
		clearTimeout(timer) { timer.cleared = true; },
		updateModalStatus() {}, $: () => ({ modal() {} })
	};
	vm.runInNewContext(code, ctx);
	ctx.applyQuizToLobby(42, 'test');
	return { sent, timers, receive: p => receive(p), unbound: () => unbound };
}
it('selects immediately if Community mode is already active', () => {
	const h = setup(true);
	expect(h.sent).toEqual(['select custom quiz']);
});
it('selects once on mode acknowledgement and cancels the fallback', () => {
	const h = setup(false);
	expect(h.sent).toEqual(['change game settings']);
	h.receive({ communityMode: false });
	expect(h.sent).toHaveLength(1);
	h.receive({ communityMode: true });
	h.receive({ communityMode: true });
	h.timers[0].fn();
	expect(h.sent).toEqual(['change game settings', 'select custom quiz']);
	expect(h.timers[0].cleared).toBe(true);
	expect(h.unbound()).toBe(1);
});
it('retains the existing fallback if AMQ omits the mode acknowledgement', () => {
	const h = setup(false);
	expect(h.timers[0].delay).toBe(500);
	h.timers[0].fn();
	expect(h.sent).toEqual(['change game settings', 'select custom quiz']);
});
