// Read-only keyset pagination: fail closed on errors or an exhausted safety cap.
export async function readOutcomePages(factory, key, { pageSize = 1000, maxPages = 10000, onProgress = (_count) => {} } = {}) {
  const rows = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    let query = factory().order(key, { ascending: true }).limit(pageSize);
    if (cursor !== undefined) query = query.gt(key, cursor);
    const { data, error } = await query;
    if (error) throw new Error(`History read failed (${error.code || 'database error'}); no partial report written.`);
    if (!Array.isArray(data)) throw new Error('History read returned no data; no partial report written.');
    if (!data.length) return rows;
    const next = data.at(-1)[key];
    if (typeof next !== 'string' || (cursor !== undefined && next <= cursor))
      throw new Error('History cursor did not advance; no partial report written.');
    rows.push(...data);
    onProgress(rows.length);
    cursor = next;
    // Do not infer completion from short pages: the server may cap page size.
  }
  throw new Error('History page safety limit reached; no partial report written.');
}

export async function readSchedulerOutcomeSource(db, { from, asOf, capturedAt, user, quiz, onProgress = (_table, _count) => {} }) {
  const plays = await readOutcomePages(() => {
    let query = db.from('training_session_plays')
      .select('id,user_id,quiz_id,song_ann_id,played_at,rating,success,fsrs_before,fsrs_after')
      .gte('played_at', from).lt('played_at', asOf).lte('created_at', capturedAt)
      .abortSignal(AbortSignal.timeout(30000));
    if (user) query = query.eq('user_id', user);
    if (quiz) query = query.eq('quiz_id', quiz);
    return query;
  }, 'id', { onProgress: count => onProgress('plays', count) });
  if (!plays.length) return plays;
  const commits = await readOutcomePages(() => {
    let query = db.from('training_rating_commits').select('request_id,play_id').lte('created_at', capturedAt)
      .abortSignal(AbortSignal.timeout(30000));
    if (user) query = query.eq('user_id', user);
    return query;
  }, 'request_id', { onProgress: count => onProgress('ledger', count) });
  const committed = new Set(commits.map(row => row.play_id));
  return plays.map(row => ({ ...row, provenance: committed.has(row.id) ? 'atomic_commit' : 'untracked' }));
}
