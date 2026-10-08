import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync('amqPlusConnector.user.js', 'utf8');
const code = source.slice(source.indexOf('let cancelPendingTrainingQuizSave ='), source.indexOf('function startTrainingSession('));

function harness() {
  const listeners = new Set();
  const timers = new Map();
  let id = 0;
  const context = {
    Listener: class {
      constructor(event, callback) { this.callback = callback; }
      bindListener() { listeners.add(this); }
      unbindListener() { listeners.delete(this); }
    },
    setTimeout(callback) { timers.set(++id, callback); return id; },
    clearTimeout(timer) { timers.delete(timer); }
  };
  vm.runInNewContext(code, context);
  return { context, listeners, timers, emit(payload) { for (const listener of [...listeners]) listener.callback(payload); } };
}

describe('training quiz save lifecycle', () => {
  it('routes an accepted session through the actual save timeout without posting completion', () => {
    const h = harness();
    const requests = [];
    const pendingSync = [{ sessionId: 'older-session', requestId: 'older-answer' }];
    const element = { prop: () => element, html: () => element, modal: () => element };
    Object.assign(h.context, {
      document: { getElementById: () => null },
      trainingState: { authToken: 'test-token', pendingSync },
      isTrainingMode: false, savedAutoSkipReplayState: null,
      API_BASE_URL: 'http://localhost:5173',
      console: { log() {}, error() {}, warn() {} },
      $: () => element,
      getConnectorVersion: () => '1.4.5',
      showTrainingStatus: vi.fn(), showTrainingError: vi.fn(),
      resetCatchUpButton: vi.fn(), saveTrainingSettings: vi.fn(),
      sendSystemMessage: vi.fn(), hideTrainingRatingUI: vi.fn(),
      createOrUpdateQuiz: vi.fn(),
      GM_xmlhttpRequest: request => requests.push(request)
    });
    vm.runInNewContext(source.slice(source.indexOf('function startTrainingSession('), source.indexOf('function endTrainingSession(')), h.context);
    h.context.startTrainingSession('test-quiz', 5, { mode: 'auto' });
    requests[0].onload({ status: 200, responseText: JSON.stringify({
      sessionId: 'accepted-but-not-played', quizId: 'test-quiz', quizName: 'Test',
      totalSongs: 5, playlist: [{ annSongId: 42 }],
      command: { data: { quizSave: { name: 'Test' } } }
    }) });
    expect(h.context.createOrUpdateQuiz).toHaveBeenCalledOnce();
    expect(h.context.trainingState.currentSession.sessionId).toBe('accepted-but-not-played');
    [...h.timers.values()][0]();
    expect(h.context.trainingState.currentSession.sessionId).toBeNull();
    expect(h.context.trainingState.pendingSync).toBe(pendingSync);
    expect(h.context.isTrainingMode).toBe(false);
    expect(requests).toHaveLength(1);
    expect(h.context.showTrainingError).toHaveBeenCalledWith('Training: Quiz Save Failed', expect.stringContaining('20 seconds'));
    expect(h.context.sendSystemMessage.mock.calls.flat().join(' ')).not.toContain('completed');
    h.emit({ success: true, quizSave: { name: 'Test' }, quizId: 1 });
    expect(h.listeners.size).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it('clears a failed start without completing it or dropping queued answers', () => {
    const pendingSync = [{ sessionId: 'older-session', requestId: 'answer' }];
    const prop = vi.fn();
    const context = {
      trainingState: { currentSession: { sessionId: 'never-started' }, pendingSync, isSubmittingRating: true },
      trainingCompletionRequested: true, isTrainingMode: true,
      savedAutoSkipReplayState: true,
      cancelPendingTrainingQuizSave: vi.fn(),
      options: { $AUTO_VOTE_REPLAY: { prop }, updateAutoVoteSkipReplay: vi.fn() },
      $: () => ({ prop }), hideTrainingRatingUI: vi.fn(), saveTrainingSettings: vi.fn(),
      GM_xmlhttpRequest: vi.fn(), sendSystemMessage: vi.fn()
    };
    vm.runInNewContext(source.slice(source.indexOf('function abortTrainingSessionStart('), source.indexOf('function endTrainingSession(')), context);
    context.abortTrainingSessionStart();
    expect(context.trainingState.currentSession.sessionId).toBeNull();
    expect(context.trainingState.pendingSync).toBe(pendingSync);
    expect(context.trainingCompletionRequested).toBe(false);
    expect(context.isTrainingMode).toBe(false);
    expect(context.options.updateAutoVoteSkipReplay).toHaveBeenCalledOnce();
    expect(context.saveTrainingSettings).toHaveBeenCalledOnce();
    expect(context.GM_xmlhttpRequest).not.toHaveBeenCalled();
    expect(context.sendSystemMessage).not.toHaveBeenCalled();
  });

  it('replaces stale save listeners before retrying the same quiz', () => {
    const h = harness(), stale = vi.fn(), saved = vi.fn(), failed = vi.fn();
    h.context.waitForTrainingQuizSave('test', stale, failed);
    h.context.waitForTrainingQuizSave('test', saved, failed);
    expect(h.listeners.size).toBe(1);
    h.emit({ success: true, quizSave: { name: 'test' }, quizId: 1 });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
    expect(h.timers.size).toBe(0);
  });

  it('reports a timeout and ignores a late acknowledgement', () => {
    const h = harness(), saved = vi.fn(), failed = vi.fn();
    h.context.waitForTrainingQuizSave('test', saved, failed);
    [...h.timers.values()][0]();
    h.emit({ success: true, quizSave: { name: 'test' } });
    expect(failed).toHaveBeenCalledWith({ success: false, timeout: true });
    expect(saved).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });

  it('ignores another quiz and cleans up a rejected save', () => {
    const h = harness(), saved = vi.fn(), failed = vi.fn();
    h.context.waitForTrainingQuizSave('test', saved, failed);
    h.emit({ success: true, quizSave: { name: 'other' } });
    expect(h.listeners.size).toBe(1);
    h.emit({ success: false });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
    expect(h.timers.size).toBe(0);
  });
});
