import { describe, expect, it } from 'vitest';
import { buildSchedulerOutcomeReport, intervalBand, renderSchedulerOutcomeMarkdown, reviewTiming } from '../src/lib/server/training/scheduler-outcomes.js';

const DAY = 86400000;
const base = Date.parse('2025-01-01T00:00:00Z');
const at = days => new Date(base + days * DAY).toISOString();
const window = { from: at(0), to: at(200), asOf: at(400) };
function play(id, days, overrides = {}) {
  return { id, user_id: 'learner', quiz_id: 'quiz', song_ann_id: 1,
    played_at: at(days), rating: 3, success: true, provenance: 'atomic_commit',
    fsrs_before: { state: 2, stability: 46, last_review: at(days - 10) },
    fsrs_after: { state: 2, due: at(days + 10) }, ...overrides };
}
const pair = (days = 10, success = true) => [play('a', 0, { rating: 2 }),
  play('b', days, { success, fsrs_before: { state: 2, stability: 30, last_review: at(0) } })];
const rowsFor = (report, metric) => report.summaries.filter(row => row.metric === metric);
const total = (report, metric, field) => rowsFor(report, metric).reduce((sum, row) => sum + row[field], 0);

describe('scheduler outcome report', () => {
  it('uses actual answer correctness, not the follow-up rating, for recall', () => {
    const rows = pair(10, false); rows[1].rating = 4;
    const report = buildSchedulerOutcomeReport(rows, window);
    expect(rowsFor(report, 'lucky_next')[0]).toMatchObject({ observations: 1, failures: 1, recall: 0, learners: 1,
      recall95ClusterBootstrap: null, lowSupport: true });
    expect(report.cohorts.find(row => row.metric === 'lucky_next')).toMatchObject({ priorState: 'Review', stabilityBand: '30–<90d', timing: 'on_time' });
  });

  it.each([[8, 'early'], [9, 'on_time'], [11, 'on_time'], [12, 'overdue']])('classifies %i-day review as %s', (days, expected) => {
    const [a, b] = pair(days);
    expect(reviewTiming(a, b)).toBe(expected);
  });

  it('uses a one-minute minimum tolerance for short learning steps', () => {
    const a = play('a', 0, { fsrs_after: { state: 1, due: at(10 / 1440) } });
    expect(reviewTiming(a, play('b', 12 / 1440))).toBe('overdue');
  });

  it('keeps absent and missing-answer follow-ups out of the recall denominator', () => {
    const report = buildSchedulerOutcomeReport([play('a', 0, { rating: 2 }),
      ...pair(10, null).map(row => ({ ...row, id: `other-${row.id}`, song_ann_id: 2 }))], window);
    expect(total(report, 'lucky_next', 'observations')).toBe(0);
    expect(rowsFor(report, 'lucky_next').flatMap(row => Object.keys(row.exclusions))).toEqual(
      expect.arrayContaining(['no_followup_in_window', 'missing_answer_outcome']));
    expect(rowsFor(report, 'lucky_next').every(row => row.recall === null)).toBe(true);
  });

  it('does not pair different users, quizzes or songs', () => {
    for (const change of [{ user_id: 'other' }, { quiz_id: 'other' }, { song_ann_id: 2 }]) {
      const [a, b] = pair(); Object.assign(b, change);
      expect(total(buildSchedulerOutcomeReport([a, b], window), 'lucky_next', 'observations')).toBe(0);
    }
  });

  it('rejects gaps, missing continuity snapshots and equal-time ambiguity', () => {
    for (const last_review of [at(-2), null]) {
      const [a, b] = pair(); b.fsrs_before.last_review = last_review;
      expect(total(buildSchedulerOutcomeReport([a, b], window), 'lucky_next', 'observations')).toBe(0);
    }
    const [a, b] = pair(0);
    expect(rowsFor(buildSchedulerOutcomeReport([a, b], window), 'lucky_next')[0].exclusions).toEqual({ ambiguous_timestamp: 1 });
  });

  it('separates rating-ledger evidence from untracked and unknown history', () => {
    const rows = pair(); delete rows[0].provenance; rows[0].training_rating_commits = [];
    const report = buildSchedulerOutcomeReport(rows, window);
    expect(rowsFor(report, 'lucky_next')[0]).toMatchObject({ origin: 'untracked', followupOrigin: 'atomic_commit' });
    delete rows[0].training_rating_commits;
    expect(rowsFor(buildSchedulerOutcomeReport(rows, window), 'lucky_next')[0].origin).toBe('unknown');
  });

  it('separates immediate learning recall from later Review-state recall and counts each later review once', () => {
    const step = 10 / 1440;
    const rows = [
      play('a', 0, { fsrs_before: { state: 0, stability: 0 }, fsrs_after: { state: 1, due: at(step) } }),
      play('b', step, { fsrs_before: { state: 1, stability: 1, last_review: at(0) }, fsrs_after: { state: 1, due: at(2 * step) } }),
      play('c', 2 * step, { fsrs_before: { state: 1, stability: 1, last_review: at(step) }, fsrs_after: { state: 2, due: at(3) } }),
      play('d', 3, { success: false, fsrs_before: { state: 2, stability: 3, last_review: at(2 * step) } })
    ];
    const report = buildSchedulerOutcomeReport(rows, window);
    expect(total(report, 'short_step_next', 'observations')).toBe(2);
    expect(total(report, 'short_step_next', 'successes')).toBe(2);
    expect(total(report, 'short_step_later_review', 'observations')).toBe(1);
    expect(total(report, 'short_step_later_review', 'failures')).toBe(1);
    expect(report.cohorts.find(row => row.metric === 'short_step_later_review').timing).toBe('on_time');
    expect(rowsFor(report, 'short_step_later_review')[0].exclusions).toEqual({ shared_later_review_already_counted: 1 });
  });

  it('does not attribute later learning recall across a history gap', () => {
    const rows = [play('a', 0, { fsrs_after: { state: 1, due: at(10 / 1440) } }),
      play('b', 3, { fsrs_before: { state: 2, last_review: at(1) } })];
    expect(total(buildSchedulerOutcomeReport(rows, window), 'short_step_later_review', 'observations')).toBe(0);
  });

  it.each([[29, '<30d'], [30, '30–<90d'], [90, '90–180d'], [180, '90–180d'], [181, '>180d']])('bands %i assigned days as %s', (days, band) => {
    expect(intervalBand(days)).toBe(band);
    const rows = pair(days); rows[0].fsrs_after.due = at(days);
    expect(buildSchedulerOutcomeReport(rows, window).cohorts.find(row => row.metric === 'lucky_next')).toMatchObject({
      assignedIntervalBand: band, near180DayCeiling: Math.abs(days - 180) <= 3
    });
  });

  it('uses the requested anchor and observation windows without look-ahead', () => {
    const report = buildSchedulerOutcomeReport(pair(10), { from: at(0), to: at(1), asOf: at(10) });
    expect(report.coverage.outsideWindow).toBe(1);
    expect(total(report, 'lucky_next', 'observations')).toBe(0);
    expect(report.emptyMetrics).toContain('short_step_next');
    expect(() => buildSchedulerOutcomeReport([], { from: at(2), to: at(1), asOf: at(3) })).toThrow();
  });

  it('reports learner concentration and deterministic clustered uncertainty without leaking identities', () => {
    const rows = [];
    for (let song = 1; song <= 10; song++) rows.push(...pair().map(row => ({ ...row, id: `${song}-${row.id}`, song_ann_id: song })));
    rows.push(...pair(10, false).map(row => ({ ...row, id: `b-${row.id}`, user_id: 'private-second-learner' })));
    const report = buildSchedulerOutcomeReport(rows, window);
    const metric = rowsFor(report, 'lucky_next')[0];
    expect(metric.recall).toBeCloseTo(10 / 11);
    expect(metric.learnerBalancedRecall).toBe(0.5);
    expect(metric.largestLearnerShare).toBeCloseTo(10 / 11);
    expect(metric.recall95ClusterBootstrap).toEqual([0, 1]);
    expect(buildSchedulerOutcomeReport([...rows].reverse(), window)).toEqual(report);
    expect(JSON.stringify(report)).not.toContain('private-second-learner');
    expect(renderSchedulerOutcomeMarkdown(report)).toContain('Learner-balanced');
  });

  it('counts malformed data and refuses repeated IDs rather than silently merging it', () => {
    const row = play('a', 0);
    expect(buildSchedulerOutcomeReport([{}], window).coverage.invalidRows).toBe(1);
    expect(() => buildSchedulerOutcomeReport([row, row], window)).toThrow('Duplicate play IDs');
  });
});
