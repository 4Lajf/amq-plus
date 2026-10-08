-- Soft Daily Goal default is 50 again.
-- Saved goals of 20 move to 50 too: 20 was the column default from 2026-09-04,
-- so almost every stored 20 is the default rather than a choice. Off (NULL) and
-- every other value stay as they are.

begin;

alter table public.quiz_configurations
  alter column daily_review_goal set default 50;

comment on column public.quiz_configurations.daily_review_goal is
  'Soft daily due-review goal for UI (default 50). NULL turns goal UI off. Never hard-caps playlist fill.';

alter table public.user_quiz_training_preferences
  alter column daily_review_goal set default 50;

-- Not an edit by the owner: keep updated_at so these quizzes do not jump to
-- the top of "recently updated".
alter table public.quiz_configurations disable trigger quiz_configurations_updated_at;
alter table public.user_quiz_training_preferences
  disable trigger update_user_quiz_training_preferences_updated_at;

update public.quiz_configurations
  set daily_review_goal = 50
  where daily_review_goal = 20;

update public.user_quiz_training_preferences
  set daily_review_goal = 50
  where daily_review_goal = 20;

alter table public.quiz_configurations enable trigger quiz_configurations_updated_at;
alter table public.user_quiz_training_preferences
  enable trigger update_user_quiz_training_preferences_updated_at;

commit;
