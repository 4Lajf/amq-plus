import { describe, expect, it } from 'vitest';
import { rebuildHistory } from '../src/lib/server/training/history-replay.js';
import { trainingScheduler } from '../src/lib/server/training/fsrs-service.js';
import { replayOptions } from '../src/lib/server/training/replay-config.js';

const options = replayOptions(false);
const schedule = (state, rating, settings) => trainingScheduler.updateCardState(state, rating, settings);
const baseline = () => ({ fsrs_state: trainingScheduler.createNewCard('1', new Date('2026-01-01T00:00:00Z')),
  attempt_count: 12, success_count: 9, failure_count: 3, success_streak: 2, failure_streak: 0,
  last_attempt_at: '2025-12-31T00:00:00Z', history: [{ imported: true }] });
function fixture() {
  let state = baseline().fsrs_state;
  return [{ id: '1', kind: 'checkpoint', song_ann_id: 1, snapshot: baseline() }, ...[3, 1, 4].map((rating, index) => {
    const now = `2026-01-0${index + 2}T12:00:00Z`;
    const before = state; state = schedule(state, rating, { ...options, now });
    return { id: String(index + 2), kind: 'rating', song_ann_id: 1, request_id: `r${index}`,
      payload: { sourceSong: 1, requestId: `r${index}`, rating, success: rating !== 1, playedAt: now, before, after: state, options } };
  })];
}
describe('checkpoint history replay', () => {
  it('preserves imported totals/history and replays remaining ratings with recorded timing/preferences', () => {
    const journal = fixture();
    const [change] = rebuildHistory(journal, ['r1'], schedule, options);
    const afterA = schedule(baseline().fsrs_state, 3, { ...options, now: journal[1].payload.playedAt });
    const expected = schedule(afterA, 4, { ...options, now: journal[3].payload.playedAt });
    expect(change.fsrs_state).toEqual(expected);
    expect(change).toMatchObject({ attempt_count: 14, success_count: 11, failure_count: 3, success_streak: 4 });
    expect(change.history).toEqual([baseline().history[0], expect.objectContaining({ requestId: 'r0' }), expect.objectContaining({ requestId: 'r2' })]);
  });
  it('restores the checkpoint when all new ratings are removed', () => {
    expect(rebuildHistory(fixture(), ['r0', 'r1', 'r2'], schedule, options)).toEqual([{ song_ann_id: 1, ...baseline() }]);
  });
  it('continues to omit previously deleted ratings on another deletion', () => {
    const journal = fixture(); journal[2].deleted = true;
    expect(rebuildHistory(journal, ['r2'], schedule, options)[0].attempt_count).toBe(13);
  });
  it('does not restore an earlier deletion through a later duplicate copy', () => {
    const rows = fixture(); rows[2].deleted = true; rows[2].payload = null;
    const sibling = baseline(); sibling.fsrs_state.songKey = '2';
    const other = { ...structuredClone(rows[1]), song_ann_id: 2, request_id: 'other',
      payload: { ...structuredClone(rows[1].payload), sourceSong: 2, requestId: 'other' } };
    const journal = [rows[0], { kind: 'checkpoint', song_ann_id: 2, snapshot: sibling }, rows[1], rows[2], other, rows[3],
      { ...structuredClone(rows[3]), song_ann_id: 2 }].map((row, index) => ({ ...row, id: String(index + 1) }));
    const [changed] = rebuildHistory(journal, ['other'], schedule, options);
    const afterA = schedule(baseline().fsrs_state, 3, { ...options, now: rows[1].payload.playedAt });
    const afterC = schedule(afterA, 4, { ...options, now: rows[3].payload.playedAt });
    expect(changed.song_ann_id).toBe(2);
    expect(changed.fsrs_state).toEqual({ ...afterC, songKey: '2' });
    expect(changed.attempt_count).toBe(12);
  });
  it('propagates rebuilt scheduling to duplicate cards without copying their counters', () => {
    const journal = fixture();
    const sibling = baseline(); sibling.fsrs_state.songKey = '2';
    journal.unshift({ id: '0', kind: 'checkpoint', song_ann_id: 2, snapshot: sibling });
    journal.forEach((row, i) => { row.id = String(i + 1); });
    journal.push({ ...structuredClone(journal.at(-1)), id: '6', song_ann_id: 2 });
    const changes = rebuildHistory(journal, ['r1'], schedule, options);
    expect(changes.map(row => row.song_ann_id)).toEqual([1, 2]);
    expect(changes[1].fsrs_state).toEqual({ ...changes[0].fsrs_state, songKey: '2' });
    expect(changes[1].attempt_count).toBe(12);
  });
  it('refuses to silently replay through a later merge checkpoint', () => {
    const journal = fixture(); journal.push({ id: '5', kind: 'checkpoint', song_ann_id: 1, snapshot: baseline() });
    expect(() => rebuildHistory(journal, ['r1'], schedule, options)).toThrow('later import');
  });
  it('fails closed for missing history or changed scheduler code', () => {
    expect(() => rebuildHistory(fixture().slice(1), ['r1'], schedule, options)).toThrow('checkpoint');
    const journal = fixture(); journal[3].payload.options = { ...options, fingerprint: 'other' };
    expect(() => rebuildHistory(journal, ['r1'], schedule, options)).toThrow('scheduler version');
    expect(() => rebuildHistory(fixture(), ['absent'], schedule, options)).toThrow('missing');
  });
});
