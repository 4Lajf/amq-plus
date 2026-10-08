import { describe, it, expect } from 'vitest';
import { mergeProgress } from '../src/lib/server/training/training-utils.js';

/**
 * Minimal Supabase stub: enough of the builder chain for mergeProgress, with a
 * hook to make writes fail the way production did.
 */
function makeSupabase({
	source = [],
	target = [],
	failInsert = false,
	failUpdateIds = [],
	rpcAvailable = true
} = {}) {
	const inserted = [];
	const updated = [];
	const rpcCalls = [];

	// fetchAllPages calls makeQuery().range(from, to) and keeps going until a
	// short page comes back, so the stub has to page rather than return everything.
	const selectPage = (quizId, from, to) => {
		const rows = quizId === 'source-quiz' ? source : target;
		return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
	};

	return {
		inserted,
		updated,
		rpcCalls,
		// W7: merge now goes through bulk_merge_training_progress. The RPC reports
		// only how many rows it touched, so rows named in failUpdateIds simply do
		// not count towards the total.
		rpc(name, args) {
			rpcCalls.push({ name, args });
			if (!rpcAvailable) {
				return Promise.resolve({ data: null, error: { message: 'function does not exist' } });
			}
			const applied = args.p_updates.filter((u) => !failUpdateIds.includes(u.id));
			applied.forEach((u) => updated.push(u.id));
			return Promise.resolve({ data: applied.length, error: null });
		},
		from() {
			let quizId = null;
			const builder = {
				select: () => builder,
				eq(column, value) {
					if (column === 'quiz_id') quizId = value;
					if (column === 'id') {
						const failed = failUpdateIds.includes(value);
						if (!failed) updated.push(value);
						return Promise.resolve({
							error: failed ? { message: `update ${value} blew up` } : null
						});
					}
					return builder;
				},
				order: () => builder,
				range: (from, to) => selectPage(quizId, from, to),
				update() {
					return builder;
				},
				insert(rows) {
					if (failInsert) {
						return Promise.resolve({ error: { message: 'duplicate key value' } });
					}
					inserted.push(...rows);
					return Promise.resolve({ error: null });
				}
			};
			return builder;
		}
	};
}

const songRow = (annId, extra = {}) => ({
	id: `row-${annId}`,
	song_ann_id: annId,
	quiz_id: 'source-quiz',
	fsrs_state: { due: '2026-09-01T00:00:00Z' },
	attempt_count: 3,
	success_count: 2,
	failure_count: 1,
	success_streak: 1,
	failure_streak: 0,
	history: [],
	last_attempt_at: '2026-08-01T00:00:00Z',
	is_active: true,
	...extra
});

describe('mergeProgress', () => {
	it('copies source-only songs into the target quiz', async () => {
		const supabase = makeSupabase({ source: [songRow(101), songRow(102)], target: [] });

		const result = await mergeProgress(supabase, 'target-quiz', 'source-quiz', 'user-1');

		expect(result.added).toBe(2);
		expect(result.failures).toEqual([]);
		expect(supabase.inserted.map((r) => r.song_ann_id)).toEqual([101, 102]);
		// Merged rows must land active, or they stay invisible in the target quiz.
		expect(supabase.inserted.every((r) => r.is_active === true)).toBe(true);
		expect(supabase.inserted.every((r) => r.quiz_id === 'target-quiz')).toBe(true);
		for (const row of supabase.inserted) {
			for (const column of ['id', 'created_at', 'updated_at']) {
				expect(Object.hasOwn(row, column)).toBe(false);
			}
		}
	});

	it('reports a failed insert instead of claiming the songs were added', async () => {
		const supabase = makeSupabase({ source: [songRow(101)], target: [], failInsert: true });

		const result = await mergeProgress(supabase, 'target-quiz', 'source-quiz', 'user-1');

		// The regression: `added` was the count it intended to write, and the
		// swallowed error meant the caller was told the merge succeeded while the
		// target quiz gained nothing (3shine, 2026-03-05).
		expect(result.added).toBe(0);
		expect(result.attempted.added).toBe(1);
		expect(result.failures).toHaveLength(1);
	});

	it('reports a failed update instead of claiming the songs were merged', async () => {
		const supabase = makeSupabase({
			source: [songRow(101)],
			target: [songRow(101, { id: 'target-101', quiz_id: 'target-quiz' })],
			failUpdateIds: ['target-101']
		});

		const result = await mergeProgress(supabase, 'target-quiz', 'source-quiz', 'user-1');

		expect(result.merged).toBe(0);
		expect(result.attempted.merged).toBe(1);
		expect(result.failures).toHaveLength(1);
	});

	it('merges a large overlap in bulk rather than one row at a time', async () => {
		// W7: this used to be one round trip per row. 2,500 of those cannot finish
		// inside Cloudflare's 100s window; at a chunk size of 1,000 it is 3 calls.
		const annIds = Array.from({ length: 2500 }, (_, i) => 1000 + i);
		const supabase = makeSupabase({
			source: annIds.map((id) => songRow(id)),
			target: annIds.map((id) => songRow(id, { id: `target-${id}`, quiz_id: 'target-quiz' }))
		});

		const result = await mergeProgress(supabase, 'target-quiz', 'source-quiz', 'user-1');

		expect(result.merged).toBe(2500);
		expect(result.failures).toEqual([]);
		expect(supabase.rpcCalls).toHaveLength(3);
		expect(supabase.rpcCalls.every((c) => c.name === 'bulk_merge_training_progress')).toBe(true);
		// Ownership is enforced inside the function, so both keys must be passed.
		expect(supabase.rpcCalls[0].args.p_user_id).toBe('user-1');
		expect(supabase.rpcCalls[0].args.p_quiz_id).toBe('target-quiz');
	});

	it('falls back to per-row updates when the bulk function is missing', async () => {
		// The code can ship ahead of the migration. Losing a merge is worse than
		// being slow.
		const supabase = makeSupabase({
			source: [songRow(101), songRow(102)],
			target: [
				songRow(101, { id: 'target-101', quiz_id: 'target-quiz' }),
				songRow(102, { id: 'target-102', quiz_id: 'target-quiz' })
			],
			rpcAvailable: false
		});

		const result = await mergeProgress(supabase, 'target-quiz', 'source-quiz', 'user-1');

		expect(result.merged).toBe(2);
		expect(result.failures).toEqual([]);
		expect(supabase.updated.sort()).toEqual(['target-101', 'target-102']);
	});
});
