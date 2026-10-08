-- Training preferences belong to the person training, not to the shared quiz.
-- Keep the old quiz columns for rollback compatibility; new code reads this table.
create table if not exists public.user_quiz_training_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_configurations(id) on delete cascade,
  daily_review_limit integer check (daily_review_limit is null or daily_review_limit > 0),
  daily_new_limit integer check (daily_new_limit is null or daily_new_limit > 0) default 20,
  daily_review_goal integer check (daily_review_goal is null or daily_review_goal > 0) default 20,
  combine_duplicates boolean not null default false,
  allow_same_day_reviews boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quiz_id)
);

insert into public.user_quiz_training_preferences (
  user_id,
  quiz_id,
  daily_review_limit,
  daily_new_limit,
  daily_review_goal,
  combine_duplicates,
  allow_same_day_reviews
)
select
  user_id,
  id,
  daily_review_limit,
  coalesce(daily_new_limit, 20),
  coalesce(daily_review_goal, 20),
  coalesce(combine_duplicates, false),
  coalesce(allow_same_day_reviews, true)
from public.quiz_configurations
where user_id is not null
on conflict (user_id, quiz_id) do nothing;

create index if not exists user_quiz_training_preferences_quiz_idx
  on public.user_quiz_training_preferences(quiz_id);

alter table public.user_quiz_training_preferences enable row level security;
revoke all on table public.user_quiz_training_preferences from anon, authenticated;
grant all on table public.user_quiz_training_preferences to service_role;

drop trigger if exists update_user_quiz_training_preferences_updated_at
  on public.user_quiz_training_preferences;
create trigger update_user_quiz_training_preferences_updated_at
before update on public.user_quiz_training_preferences
for each row execute function public.update_updated_at_column();

