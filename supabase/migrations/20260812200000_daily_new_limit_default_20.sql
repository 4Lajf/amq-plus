-- Default new-song intake to 20 for every quiz (backlog brake).
-- User applies this migration later; do not auto-run in this workstream.
-- Existing NULL values are backfilled; Unlimited remains writable via settings.

alter table public.quiz_configurations
  alter column daily_new_limit set default 20;

update public.quiz_configurations
set daily_new_limit = 20
where daily_new_limit is null;

comment on column public.quiz_configurations.daily_new_limit is
  'Max never-practiced songs introducible per UTC day. Default 20. NULL = unlimited.';
