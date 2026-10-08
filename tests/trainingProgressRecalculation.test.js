import { describe, expect, it } from 'vitest';
import { recalculateSongProgress } from '../src/lib/server/training/training-utils.js';

// Model the API's row cap and scoped writes, rather than mocking recalculation.
function database(rows, { failPage = -1, failDelete = false, beforeWrite, missingProgress = false } = {}) {
  const writes = [];
  const queries = [];
  let progress = missingProgress ? null : { ...identity, id: 'progress', updated_at: 'version-0' };
  return {
    writes, queries,
    get progress() { return progress; },
    from(table) {
      const filters = {};
      const orders = [];
      let operation = 'select';
      let payload;
      const result = (from = 0, to = 999) => {
        queries.push({ table, operation, filters: { ...filters }, orders: [...orders], from, to });
        const matches = row => row && Object.entries(filters).every(([key, value]) => row[key] === value);
        if (operation !== 'select') {
          writes.push({ table, operation, filters: { ...filters }, payload });
          if (operation === 'delete' && failDelete) return { error: { message: 'cleanup failed' } };
          beforeWrite?.(progress, rows, writes.length);
          if (!matches(progress)) return { data: [], error: null };
          const id = progress.id;
          progress = operation === 'delete' ? null : { ...progress, ...payload };
          return { data: [{ id }], error: null };
        }
        if (table === 'training_progress') return { data: matches(progress) ? { ...progress } : null, error: null };
        if (from === failPage) return { data: null, error: { message: 'page failed' } };
        const scoped = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        scoped.sort((a, b) => {
          for (const key of orders) {
            if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
          }
          return 0;
        });
        return { data: scoped.slice(from, to + 1), error: null };
      };
      const query = {
        select() { return query; },
        maybeSingle() { return Promise.resolve(result()); },
        eq(key, value) { filters[key] = value; return query; },
        order(key) { orders.push(key); return query; },
        range(from, to) { return Promise.resolve(result(from, to)); },
        delete() { operation = 'delete'; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
      return query;
    }
  };
}

const identity = { user_id: 'owner', quiz_id: 'quiz', song_ann_id: 42 };
const play = (index, extra = {}) => ({
  ...identity,
  id: String(index).padStart(6, '0'),
  played_at: new Date(Date.UTC(2025, 0, 1) + index * 86400000).toISOString(),
  rating: 3, success: true, ...extra
});

describe('song progress recalculation', () => {
  it('replays beyond the row cap and preserves the final outcome and scoped writes', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => play(index));
    rows[1000] = play(1000, { rating: 1, success: false });
    const db = database([...rows, play(1002, { user_id: 'someone-else' })]);
    const rebuilt = await recalculateSongProgress(db, 'owner', 'quiz', 42);
    expect(rebuilt).toMatchObject({ attempt_count: 1001, success_count: 1000, failure_count: 1,
      success_streak: 0, failure_streak: 1, last_attempt_at: rows[1000].played_at });
    expect(rebuilt.history).toHaveLength(1001);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].filters).toMatchObject(identity);
    expect(db.writes[0].payload).not.toHaveProperty('suspended_at');
    expect(db.writes[0].payload).not.toHaveProperty('is_active');
  });

  it('does not overwrite progress after a later history page fails', async () => {
    const db = database(Array.from({ length: 1001 }, (_, index) => play(index)), { failPage: 1000 });
    await expect(recalculateSongProgress(db, 'owner', 'quiz', 42)).rejects.toThrow('page failed');
    expect(db.writes).toEqual([]);
  });

  it('orders equal-time plays by ID consistently', async () => {
    const sameTime = '2026-01-01T00:00:00.000Z';
    const db = database([play(2, { played_at: sameTime, rating: 1, success: false }),
      play(1, { played_at: sameTime })]);
    const rebuilt = await recalculateSongProgress(db, 'owner', 'quiz', 42);
    expect(rebuilt.history.map(row => row.rating)).toEqual([3, 1]);
    expect(rebuilt.failure_streak).toBe(1);
  });

  it('surfaces failed cleanup instead of reporting successful recalculation', async () => {
    const db = database([], { failDelete: true });
    await expect(recalculateSongProgress(db, 'owner', 'quiz', 42)).rejects.toThrow('cleanup failed');
    expect(db.writes[0].filters).toMatchObject(identity);
  });

  it('re-reads history when a concurrent rating changes progress before the update', async () => {
    const db = database([play(0)], { beforeWrite(progress, rows, attempt) {
      if (attempt === 1) {
        progress.updated_at = 'concurrent-rating';
        rows.push(play(1, { success: false, rating: 1 }));
      }
    } });
    const rebuilt = await recalculateSongProgress(db, 'owner', 'quiz', 42);
    expect(db.writes).toHaveLength(2);
    expect(rebuilt).toMatchObject({ attempt_count: 2, success_count: 1, failure_count: 1, failure_streak: 1 });
    expect(db.progress.attempt_count).toBe(2);
  });

  it('does not erase a concurrent rating when the final old play was removed', async () => {
    const db = database([], { beforeWrite(progress, rows, attempt) {
      if (attempt === 1) {
        progress.updated_at = 'concurrent-rating';
        rows.push(play(1));
      }
    } });
    const rebuilt = await recalculateSongProgress(db, 'owner', 'quiz', 42);
    expect(db.writes.map(write => write.operation)).toEqual(['delete', 'update']);
    expect(rebuilt.attempt_count).toBe(1);
    expect(db.progress).not.toBeNull();
  });

  it('stops with an error instead of overwriting repeatedly changing progress', async () => {
    const db = database([play(0)], { beforeWrite(progress, rows, attempt) {
      progress.updated_at = `concurrent-${attempt}`;
      progress.attempt_count = 100 + attempt;
    } });
    await expect(recalculateSongProgress(db, 'owner', 'quiz', 42)).rejects.toThrow('kept changing');
    expect(db.writes).toHaveLength(3);
    expect(db.progress.attempt_count).toBe(103);
  });

  it('does not claim to rebuild a missing progress row from retained history', async () => {
    const db = database([play(0)], { missingProgress: true });
    await expect(recalculateSongProgress(db, 'owner', 'quiz', 42)).rejects.toThrow('Progress is missing');
    expect(db.writes).toEqual([]);
  });
});
