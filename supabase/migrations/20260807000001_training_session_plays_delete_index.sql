-- training_session_plays (650k rows) was only indexed on (session_id, played_at),
-- but the delete/recalculate path in
-- src/routes/api/training/[quizId]/progress/song/+server.js and
-- training-utils.js:recalculateSongProgress filters on
-- (user_id, quiz_id, song_ann_id) - a sequential scan over the whole table on
-- every song delete. That is the intermittent "Failed to delete play records".
--
-- Production got these built CONCURRENTLY by hand (see the applied migration
-- history) so the 650k-row table was never locked. The statements here are
-- plain CREATE INDEX on purpose: `supabase db push` wraps each migration file
-- in a transaction, and CREATE INDEX CONCURRENTLY cannot run inside one - it
-- fails with 25001 and takes the whole deploy with it. IF NOT EXISTS makes this
-- a no-op against production, and a fresh environment has an empty table where
-- the brief lock costs nothing.

create index if not exists idx_tsp_user_quiz_song
  on public.training_session_plays (user_id, quiz_id, song_ann_id);

create index if not exists idx_tsp_user_quiz
  on public.training_session_plays (user_id, quiz_id);
