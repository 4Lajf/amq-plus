-- N8: opt-in "combine duplicate recordings" per quiz.
--
-- AnisongDB stores one row per (song, anime entry), so a song reused across a
-- franchise becomes N independent FSRS cards. On production that is 5,398
-- redundant cards over 94 of 186 training users, with copies of one recording
-- averaging 461 days apart in due date.
--
-- Default is false so no existing quiz changes behaviour. Same shape as
-- daily_review_limit: a nullable/defaulted per-quiz opt-in read at session start.

alter table public.quiz_configurations
  add column if not exists combine_duplicates boolean not null default false;

comment on column public.quiz_configurations.combine_duplicates is
  'N8: when true, training schedules at most one card per duplicate recording per session and keeps sibling cards on the same FSRS schedule. Never merges or deletes cards.';
