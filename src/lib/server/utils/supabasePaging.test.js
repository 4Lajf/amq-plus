import { describe, expect, it } from 'vitest';
import { fetchAllPages } from './supabasePaging.js';

describe('fetchAllPages', () => {
	it('fetches multiple pages beyond 1000 rows', async () => {
		const totalRows = 2200;
		const pageSize = 1000;

		const ranges = [];
		let queryInstances = 0;

		const makeQuery = () => {
			queryInstances += 1;
			return {
				range: async (from, to) => {
					ranges.push([from, to]);
					const len = Math.max(0, Math.min(totalRows, to + 1) - from);
					const data = Array.from({ length: len }, (_, i) => ({ id: from + i }));
					return { data, error: null };
				}
			};
		};

		const { data, error } = await fetchAllPages(makeQuery, { pageSize });

		expect(error).toBeNull();
		expect(data).toHaveLength(totalRows);
		expect(ranges).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999]
		]);
		expect(queryInstances).toBe(3);
	});

	it('stops with an error if maxPages is exceeded', async () => {
		const makeQuery = () => ({
			range: async () => ({ data: Array.from({ length: 1000 }, () => ({})), error: null })
		});

		const { data, error } = await fetchAllPages(makeQuery, { pageSize: 1000, maxPages: 2 });

		expect(data).toHaveLength(2000);
		expect(error).toBeInstanceOf(Error);
		expect(String(error.message)).toMatch(/exceeded maxPages/i);
	});
});

