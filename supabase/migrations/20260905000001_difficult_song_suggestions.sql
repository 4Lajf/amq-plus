-- Small per-learner/card decision marker. No schedules or existing rows are rewritten.
alter table public.training_progress
  add column if not exists difficult_song_suggestion jsonb;
comment on column public.training_progress.difficult_song_suggestion is
  'Last explicit post-session choice: sessionId, lapses, decidedAt, choice. Never auto-suspends a card.';
