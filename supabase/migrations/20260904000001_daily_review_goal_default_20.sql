-- Make the soft Daily Goal match one normal training session for new quizzes.
-- Existing explicit values are user choices and remain unchanged.

begin;

alter table public.quiz_configurations
  alter column daily_review_goal set default 20;

comment on column public.quiz_configurations.daily_review_goal is
  'Soft daily due-review goal for UI (default 20). NULL turns goal UI off. Never hard-caps playlist fill.';

commit;
