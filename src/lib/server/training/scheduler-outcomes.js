// Pure, read-only analysis. Never imports or calls the scheduler.
const DAY = 86400000;
const STATES = ['New', 'Learning', 'Review', 'Relearning'];
const METRICS = ['lucky_next', 'short_step_next', 'short_step_later_review', 'review_interval_next'];
const time = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const iso = value => Number.isFinite(value) ? new Date(value).toISOString() : null;
const origin = row => ['atomic_commit', 'untracked', 'unknown'].includes(row.provenance)
  ? row.provenance : Array.isArray(row.training_rating_commits)
    ? (row.training_rating_commits.length ? 'atomic_commit' : 'untracked') : 'unknown';

export function intervalBand(days) {
  if (!Number.isFinite(days) || days <= 0) return 'unknown';
  if (days < 30) return '<30d';
  if (days < 90) return '30–<90d';
  if (days <= 180) return '90–180d';
  return '>180d';
}

function stabilityBand(value) {
  if (value === null || value < 0) return 'unknown';
  if (value < 1) return '<1d';
  if (value < 7) return '1–<7d';
  return intervalBand(value);
}

function elapsedBand(days) {
  if (!Number.isFinite(days)) return 'unknown';
  if (days < 1) return '<1d';
  if (days < 7) return '1–<7d';
  return intervalBand(days);
}

export function reviewTiming(prior, next) {
  if (!next) return 'unobserved';
  const due = time(prior.fsrs_after?.due);
  const interval = due - time(prior.played_at);
  const observed = time(next.played_at);
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(observed)) return 'unknown';
  const tolerance = Math.max(60000, Math.min(DAY, interval * 0.1));
  const offset = observed - due;
  return offset < -tolerance ? 'early' : offset > tolerance ? 'overdue' : 'on_time';
}

// Whole-learner resampling retains within-learner dependence. It does not make
// this observational sample representative of users who never returned.
function clusterInterval(learners) {
  if (learners.length < 2) return null;
  let seed = 0x6d2b79f5;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const samples = [];
  for (let sample = 0; sample < 500; sample++) {
    let successes = 0, count = 0;
    for (let index = 0; index < learners.length; index++) {
      const learner = learners[Math.floor(random() * learners.length)];
      successes += learner.successes; count += learner.count;
    }
    samples.push(successes / count);
  }
  samples.sort((a, b) => a - b);
  return [samples[Math.floor(0.025 * 499)], samples[Math.ceil(0.975 * 499)]];
}

function accumulator(dimensions) {
  return { dimensions, anchors: 0, excluded: {}, learners: new Map(), allLearners: new Set(),
    anchorTimes: [], outcomeTimes: [], intervals: [], elapsed: [], stability: [] };
}

function describe(values) {
  return values.length ? { count: values.length, min: minimum(values), max: maximum(values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length } : null;
}

const minimum = values => values.reduce((result, value) => Math.min(result, value), Infinity);
const maximum = values => values.reduce((result, value) => Math.max(result, value), -Infinity);

function finish(bucket) {
  const learners = [...bucket.learners.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const observations = learners.reduce((sum, row) => sum + row.count, 0);
  const successes = learners.reduce((sum, row) => sum + row.successes, 0);
  return { ...bucket.dimensions, anchors: bucket.anchors, anchorLearners: bucket.allLearners.size,
    observations, successes, failures: observations - successes, learners: learners.length,
    recall: observations ? successes / observations : null,
    learnerBalancedRecall: learners.length ? learners.reduce((sum, row) => sum + row.successes / row.count, 0) / learners.length : null,
    largestLearnerShare: observations ? maximum(learners.map(row => row.count)) / observations : null,
    recall95ClusterBootstrap: clusterInterval(learners),
    lowSupport: observations < 30 || learners.length < 10,
    exclusions: bucket.excluded,
    anchorDates: bucket.anchorTimes.length ? [iso(minimum(bucket.anchorTimes)), iso(maximum(bucket.anchorTimes))] : null,
    outcomeDates: bucket.outcomeTimes.length ? [iso(minimum(bucket.outcomeTimes)), iso(maximum(bucket.outcomeTimes))] : null,
    assignedIntervalDays: describe(bucket.intervals), elapsedDays: describe(bucket.elapsed),
    priorStabilityDays: describe(bucket.stability) };
}

/** Windows are half-open: from <= anchor < to; follow-ups must be < asOf. */
export function buildSchedulerOutcomeReport(rows, { from, to, asOf }) {
  const start = time(from), end = time(to), cutoff = time(asOf);
  if (![start, end, cutoff].every(Number.isFinite) || start >= end || end > cutoff) {
    throw new Error('Require valid UTC windows: from < to <= asOf.');
  }
  if (!Array.isArray(rows)) throw new Error('Expected an array of play records.');
  const coverage = { inputRows: rows.length, invalidRows: 0, outsideWindow: 0, duplicateIds: 0,
    plays: 0, anchorPlays: 0, missingBeforeSnapshot: 0, missingAfterSnapshot: 0,
    missingOutcome: 0, provenance: { atomic_commit: 0, untracked: 0, unknown: 0 } };
  const groups = new Map(), seen = new Set();
  for (const row of rows) {
    const at = time(row?.played_at);
    if (!row?.id || !row.user_id || !row.quiz_id || !Number.isInteger(row.song_ann_id) ||
      row.song_ann_id <= 0 || !Number.isFinite(at)) { coverage.invalidRows++; continue; }
    if (at < start || at >= cutoff) { coverage.outsideWindow++; continue; }
    if (seen.has(row.id)) { coverage.duplicateIds++; continue; }
    seen.add(row.id);
    coverage.plays++;
    coverage.provenance[origin(row)]++;
    if (at < end) coverage.anchorPlays++;
    if (!row.fsrs_before || ![0, 1, 2, 3].includes(row.fsrs_before.state)) coverage.missingBeforeSnapshot++;
    if (!row.fsrs_after || ![0, 1, 2, 3].includes(row.fsrs_after.state) || !Number.isFinite(time(row.fsrs_after.due))) coverage.missingAfterSnapshot++;
    if (typeof row.success !== 'boolean') coverage.missingOutcome++;
    const key = JSON.stringify([row.user_id, row.quiz_id, row.song_ann_id]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  // Conflicting repeated IDs cannot be resolved without guessing the history.
  if (coverage.duplicateIds) throw new Error('Duplicate play IDs in input; provide one consistent snapshot.');
  const summaries = new Map(), cohorts = new Map();

  function record(metric, anchor, next, timingPrior, status) {
    const assigned = (time(anchor.fsrs_after?.due) - time(anchor.played_at)) / DAY;
    const elapsed = next ? (time(next.played_at) - time(anchor.played_at)) / DAY : NaN;
    const stability = number(anchor.fsrs_before?.stability);
    const dimensions = { metric, origin: origin(anchor), followupOrigin: next ? origin(next) : 'unobserved',
      priorState: STATES[anchor.fsrs_before?.state] ?? 'unknown', stabilityBand: stabilityBand(stability),
      assignedIntervalBand: intervalBand(assigned), near180DayCeiling: Number.isFinite(assigned) && Math.abs(assigned - 180) <= 3,
      timing: reviewTiming(timingPrior, next), elapsedBand: elapsedBand(elapsed) };
    const summaryDimensions = { metric, origin: dimensions.origin, followupOrigin: dimensions.followupOrigin };
    for (const { map, dims } of [{ map: summaries, dims: summaryDimensions }, { map: cohorts, dims: dimensions }]) {
      const key = JSON.stringify(dims);
      if (!map.has(key)) map.set(key, accumulator(dims));
      const bucket = map.get(key);
      bucket.anchors++; bucket.allLearners.add(anchor.user_id); bucket.anchorTimes.push(time(anchor.played_at));
      if (Number.isFinite(assigned) && assigned > 0) bucket.intervals.push(assigned);
      if (stability !== null && stability >= 0) bucket.stability.push(stability);
      if (next) { bucket.outcomeTimes.push(time(next.played_at)); bucket.elapsed.push(elapsed); }
      if (status) { bucket.excluded[status] = (bucket.excluded[status] || 0) + 1; continue; }
      if (!bucket.learners.has(anchor.user_id)) bucket.learners.set(anchor.user_id, { count: 0, successes: 0 });
      const learner = bucket.learners.get(anchor.user_id);
      learner.count++; learner.successes += Number(next.success);
    }
  }

  for (const plays of groups.values()) {
    plays.sort((a, b) => time(a.played_at) - time(b.played_at) || String(a.id).localeCompare(String(b.id)));
    const counts = new Map();
    for (const play of plays) counts.set(time(play.played_at), (counts.get(time(play.played_at)) || 0) + 1);
    const linkStatus = index => {
      const previous = plays[index - 1], current = plays[index];
      if (counts.get(time(previous.played_at)) > 1 || counts.get(time(current.played_at)) > 1) return 'ambiguous_timestamp';
      const last = time(current.fsrs_before?.last_review);
      if (!Number.isFinite(last)) return 'missing_continuity_snapshot';
      if (Math.abs(last - time(previous.played_at)) > 1) return 'history_gap_or_shared_schedule';
      return null;
    };
    const reviewIndices = plays.flatMap((play, index) => play.fsrs_before?.state === 2 ? [index] : []);
    const nextBroken = new Array(plays.length + 1).fill(null);
    for (let index = plays.length - 1; index >= 1; index--)
      nextBroken[index] = linkStatus(index) ? index : nextBroken[index + 1];
    let reviewCursor = 0;
    const durableEndpoints = new Set();
    for (let i = 0; i < plays.length; i++) {
      const anchor = plays[i], at = time(anchor.played_at);
      if (at >= end) continue;
      const assigned = time(anchor.fsrs_after?.due) - at;
      const next = plays[i + 1];
      let status = !next ? 'no_followup_in_window' : linkStatus(i + 1);
      if (!Number.isFinite(assigned) || assigned <= 0) status = 'missing_or_invalid_schedule';
      if (!status && typeof next.success !== 'boolean') status = 'missing_answer_outcome';
      if (anchor.rating === 2) record('lucky_next', anchor, next, anchor, status);
      if (anchor.fsrs_after?.state === 2) record('review_interval_next', anchor, next, anchor, status);
      if (![1, 3].includes(anchor.fsrs_after?.state) || !(assigned > 0 && assigned <= 30 * 60000)) continue;
      record('short_step_next', anchor, next, anchor, status);
      let durable = null, prior = anchor, durableStatus = 'no_later_review_in_window';
      while (reviewCursor < reviewIndices.length && time(plays[reviewIndices[reviewCursor]].played_at) - at < DAY) reviewCursor++;
      const j = reviewIndices[reviewCursor];
      const brokenAt = nextBroken[i + 1];
      if (brokenAt !== null && (j === undefined || brokenAt <= j)) {
        durableStatus = linkStatus(brokenAt);
      } else if (j !== undefined) {
          durable = plays[j]; prior = plays[j - 1];
          durableStatus = durableEndpoints.has(durable.id) ? 'shared_later_review_already_counted'
            : typeof durable.success !== 'boolean' ? 'missing_answer_outcome' : null;
          durableEndpoints.add(durable.id);
      }
      record('short_step_later_review', anchor, durable, prior, durableStatus);
    }
  }
  const ordered = map => [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => finish(value));
  return { schemaVersion: 1, window: { from: iso(start), to: iso(end), asOf: iso(cutoff) }, coverage,
    rules: { pairing: 'Same learner, quiz and song; consecutive recorded plays with last_review continuity.',
      timing: 'Early/on_time/overdue relative to prior due; tolerance=max(1 minute,min(24 hours,10% assigned interval)).',
      durableLearning: 'First observed Review-state attempt >=24h after a <=30-minute learning/relearning step; intact chain required. Each later review counted once per card, assigned to earliest eligible step.',
      durableTiming: 'Later-review timing uses the immediately preceding play due, not the original short-step due.',
      recall: 'Boolean success on the follow-up, not its self-rating. Missing observations are excluded, never failures.',
      intervals: 'Assigned days use fsrs_after.due minus played_at; actual elapsed days use timestamps.',
      provenance: 'atomic_commit means a retained rating-ledger link; untracked means no link, not a proven version/date cutoff.',
      uncertainty: '95% whole-learner percentile bootstrap, 500 deterministic samples; unavailable below 2 learners. Low support if <10 learners or <30 observations.',
      descriptiveRanges: 'Date/interval/stability summaries describe available anchors and candidate follow-ups, including excluded pairs. Recall uses only eligible boolean outcomes.',
      bootstrapCaveat: 'Uniform outcomes can produce a zero-width bootstrap interval; this is not certainty or evidence of zero population error.',
      limitations: 'Observational, conditional on returning and retained history. No causal claim, no automatic scheduler tuning. Imports, pruning, shared schedules and missing snapshots can exclude pairs. Current quiz settings are not historical settings.' },
    emptyMetrics: METRICS.filter(metric => ![...summaries.values()].some(bucket => bucket.dimensions.metric === metric)),
    summaries: ordered(summaries), cohorts: ordered(cohorts) };
}

export function renderSchedulerOutcomeMarkdown(report) {
  const pct = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
  const lines = ['# Scheduler outcomes', '',
    `Anchors: ${report.window.from} through ${report.window.to} (exclusive). Follow-ups before ${report.window.asOf}.`, '',
    'Read-only observational report. No follow-up does not mean failed recall. Small cohorts do not establish population performance.', '',
    '## Coverage', '', '```json', JSON.stringify(report.coverage, null, 2), '```', '',
    '## Outcome summaries', '',
    '| Metric | Anchor → follow-up path | Anchors | Outcomes | Learners | Recall | Learner-balanced | 95% learner bootstrap | Low support |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |'];
  for (const row of report.summaries) lines.push(`| ${row.metric} | ${row.origin} → ${row.followupOrigin} | ${row.anchors} | ${row.observations} | ${row.learners} | ${pct(row.recall)} | ${pct(row.learnerBalancedRecall)} | ${row.recall95ClusterBootstrap?.map(pct).join('–') ?? 'unavailable'} | ${row.lowSupport ? 'yes' : 'no'} |`);
  lines.push('', `No eligible anchors: ${report.emptyMetrics.join(', ') || 'none'}.`, '', '## Excluded or unobserved anchors', '');
  for (const row of report.summaries) if (Object.keys(row.exclusions).length)
    lines.push(`- ${row.metric} (${row.origin} → ${row.followupOrigin}): ${JSON.stringify(row.exclusions)}`);
  lines.push('', '## Cohort detail', '', 'The companion JSON includes exact sample counts, learner counts, exclusion counts, date ranges and interval/elapsed/stability summaries for each cohort.', '',
    '| Metric | Paths | Prior state / stability | Assigned interval / near 180d | Actual elapsed | Timing | Outcomes / learners | Recall |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: |');
  for (const row of report.cohorts) lines.push(`| ${row.metric} | ${row.origin} → ${row.followupOrigin} | ${row.priorState} / ${row.stabilityBand} | ${row.assignedIntervalBand} / ${row.near180DayCeiling ? 'yes' : 'no'} | ${row.elapsedBand} | ${row.timing} | ${row.observations} / ${row.learners} | ${pct(row.recall)} |`);
  lines.push('', '## Definitions and limitations', '');
  for (const [key, value] of Object.entries(report.rules)) lines.push(`- **${key}:** ${value}`);
  if (report.source) lines.push('', '## Source', '', '```json', JSON.stringify(report.source, null, 2), '```');
  return `${lines.join('\n')}\n`;
}
