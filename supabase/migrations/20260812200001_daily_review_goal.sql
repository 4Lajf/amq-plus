-- Soft daily review goal (psychology). Default 50. NULL = goal UI off.
-- Does not hard-cap sessions — only powers Daily Goal progress UI.
-- User applies this migration later.

alter table public.quiz_configurations
  add column if not exists daily_review_goal integer;

alter table public.quiz_configurations
  drop constraint if exists quiz_configurations_daily_review_goal_positive;

alter table public.quiz_configurations
  add constraint quiz_configurations_daily_review_goal_positive
  check (daily_review_goal is null or daily_review_goal > 0);

alter table public.quiz_configurations
  alter column daily_review_goal set default 50;

update public.quiz_configurations
set daily_review_goal = 50
where daily_review_goal is null;

comment on column public.quiz_configurations.daily_review_goal is
  'Soft daily due-review goal for UI (default 50). NULL turns goal UI off. Never hard-caps playlist fill.';
