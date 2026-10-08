import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync('amqPlusConnector.user.js', 'utf8');
const begin = source.indexOf('        let loadQuizHandled = false;');
const end = source.indexOf('        loadQuizListener.bindListener();', begin);
if (begin < 0 || end < 0) throw new Error('Verified-start handler not found');

function harness() {
	let receive;
	const timers = [], starts = [], errors = [];
	const context = {
		newQuizId: 42, quizName: 'Test',
		trainingState: { currentSession: { playlist: [{ annSongId: 1 }] } },
		Listener: class {
			constructor(name, callback) { receive = callback; }
			unbindListener() {}
		},
		sendSystemMessage() {},
		setTimeout(callback, delay) { timers.push({ callback, delay }); },
		lobby: { fireMainButtonEvent(value) { starts.push(value); } },
		reconcilePlaylistWithAmq(blocks, playlist) {
			return { reconciledPlaylist: playlist, droppedSongs: [] };
		},
		abortTrainingSessionStart() { errors.push('aborted'); },
		showTrainingError() {}
	};
	vm.runInNewContext(source.slice(begin, end), context);
	return { receive: payload => receive(payload), timers, starts, errors };
}

it('starts once on the next event turn after the matching quiz is verified', () => {
	const h = harness();
	const payload = { quizId: 42, quizSave: { ruleBlocks: [{ blocks: [{}] }] } };
	h.receive({ ...payload, quizId: 99 });
	expect(h.timers).toHaveLength(0);
	h.receive(payload);
	h.receive(payload);
	expect(h.timers).toHaveLength(1);
	expect(h.timers[0].delay).toBe(0);
	expect(h.starts).toHaveLength(0);
	h.timers[0].callback();
	expect(h.starts).toEqual([false]);
});

it('does not start when AMQ verifies an empty quiz', () => {
	const h = harness();
	h.receive({ quizId: 42, quizSave: { ruleBlocks: [{ blocks: [] }] } });
	expect(h.errors).toEqual(['aborted']);
	expect(h.timers).toHaveLength(0);
	expect(h.starts).toHaveLength(0);
});
