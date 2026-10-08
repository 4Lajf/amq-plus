-- The daily due budget used to be `lastSession.total_songs`: the number of due
-- songs you could review in a whole day equalled the length of your last
-- session. Play one 50-song session and the remaining budget for the day was 0
-- regardless of a 500-song backlog, and the empty slots were padded with
-- not-yet-due songs that then got pushed to tomorrow.
--
-- Replace it with an explicit per-quiz limit, Anki-style. NULL means unlimited,
-- which is the default, so every existing backlog becomes reachable the moment
-- this ships.

alter table public.quiz_configurations
  add column if not exists daily_review_limit integer;

alter table public.quiz_configurations
  drop constraint if exists quiz_configurations_daily_review_limit_positive;

alter table public.quiz_configurations
  add constraint quiz_configurations_daily_review_limit_positive
  check (daily_review_limit is null or daily_review_limit > 0);

comment on column public.quiz_configurations.daily_review_limit is
  'Max due songs reviewable per day for this quiz. NULL = unlimited.';
