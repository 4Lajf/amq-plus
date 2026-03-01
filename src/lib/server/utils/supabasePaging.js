/**
 * Fetch all pages from a Supabase query using .range().
 *
 * IMPORTANT:
 * - Supabase/PostgREST commonly caps results at 1000 rows per request.
 * - To reliably paginate beyond that, callers should pass a *query factory*
 *   that returns a fresh query builder each time.
 *
 * @param {(() => import('@supabase/supabase-js').PostgrestFilterBuilder) | import('@supabase/supabase-js').PostgrestFilterBuilder} makeQueryOrBaseQuery
 * @param {Object} [options]
 * @param {number} [options.pageSize=1000]
 * @param {number} [options.maxPages=1000] Safety guard to prevent infinite paging
 * @returns {Promise<{data: any[], error: any}>}
 */
export async function fetchAllPages(makeQueryOrBaseQuery, { pageSize = 1000, maxPages = 1000 } = {}) {
  const all = [];
  let from = 0;
  let pagesFetched = 0;

  const makeQuery =
    typeof makeQueryOrBaseQuery === 'function'
      ? makeQueryOrBaseQuery
      : () => makeQueryOrBaseQuery;

  while (true) {
    if (pagesFetched >= maxPages) {
      return {
        data: all,
        error: new Error(
          `fetchAllPages exceeded maxPages (${maxPages}). Increase maxPages/pageSize or add stricter filters.`
        )
      };
    }

    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);

    if (error) {
      return { data: all, error };
    }

    if (!data || data.length === 0) {
      break;
    }

    all.push(...data);
    pagesFetched += 1;

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { data: all, error: null };
}
