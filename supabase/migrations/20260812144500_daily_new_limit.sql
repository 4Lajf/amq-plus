-- Optional per-quiz daily cap on *new* song introductions.
-- daily_review_limit caps due reviews (can slow backlog drain).
-- daily_new_limit caps how many never-practiced songs enter training per day,
-- which is the lever that actually shrinks a growing backlog.
-- NULL = unlimited (default).

alter table public.quiz_configurations
  add column if not exists daily_new_limit integer;

alter table public.quiz_configurations
  drop constraint if exists quiz_configurations_daily_new_limit_positive;

alter table public.quiz_configurations
  add constraint quiz_configurations_daily_new_limit_positive
  check (daily_new_limit is null or daily_new_limit > 0);

comment on column public.quiz_configurations.daily_new_limit is
  'Max new (never-practiced) songs introducible per day for this quiz. NULL = unlimited.';
