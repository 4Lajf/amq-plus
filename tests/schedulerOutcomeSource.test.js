import { describe, expect, it } from 'vitest';
import { readOutcomePages, readSchedulerOutcomeSource } from '../src/lib/server/training/scheduler-outcome-source.js';

function database(tables, failAt = Infinity) {
  let reads = 0;
  return { from(table) {
    let key, cursor;
    const query = {
      select() { return query; }, gte() { return query; }, lt() { return query; },
      lte() { return query; }, eq() { return query; }, limit() { return query; }, abortSignal() { return query; },
      order(value) { key = value; return query; },
      gt(field, value) { expect(field).toBe(key); cursor = value; return query; },
      then(resolve) {
        reads++;
        // Simulate a server cap smaller than the requested page size.
        const data = tables[table].filter(row => !cursor || row[key] > cursor)
          .sort((a, b) => a[key].localeCompare(b[key])).slice(0, 2);
        return Promise.resolve(reads === failAt ? { error: { code: '57014' } } : { data }).then(resolve);
      }
    };
    return query;
  } };
}

describe('scheduler history reader', () => {
  it('reads beyond a short server page and joins retained ledger membership', async () => {
    const db = database({ training_session_plays: [{ id: 'c' }, { id: 'a' }, { id: 'b' }],
      training_rating_commits: [{ request_id: 'r', play_id: 'b' }] });
    expect(await readSchedulerOutcomeSource(db, { from: 'start', asOf: 'end', capturedAt: 'now' }))
      .toEqual([{ id: 'a', provenance: 'untracked' }, { id: 'b', provenance: 'atomic_commit' }, { id: 'c', provenance: 'untracked' }]);
  });
  it('rejects a later page error rather than returning a partial sample', async () => {
    const db = database({ plays: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, 2);
    await expect(readOutcomePages(() => db.from('plays'), 'id')).rejects.toThrow('57014');
  });
  it('fails when the page limit cannot establish complete coverage', async () => {
    const db = database({ plays: [{ id: 'a' }] });
    await expect(readOutcomePages(() => db.from('plays'), 'id', { maxPages: 1 })).rejects.toThrow('safety limit');
  });
});
