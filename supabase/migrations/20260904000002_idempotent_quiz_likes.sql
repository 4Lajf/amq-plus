-- Record one like per authenticated user while preserving the historical
-- anonymous aggregate already stored in quiz_stats.likes.

alter table public.quiz_stats
  add column if not exists legacy_likes integer not null default 0;

update public.quiz_stats
set legacy_likes = greatest(coalesce(likes, 0), 0)
where legacy_likes = 0 and likes > 0;

create table if not exists public.quiz_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_configurations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quiz_id)
);

create index if not exists quiz_likes_quiz_id_idx on public.quiz_likes(quiz_id);

alter table public.quiz_likes enable row level security;
revoke all on table public.quiz_likes from anon, authenticated;
grant all on table public.quiz_likes to service_role;

create or replace function public.sync_quiz_like_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quiz_id uuid := coalesce(new.quiz_id, old.quiz_id);
  authenticated_likes integer;
begin
  select count(*)::integer
  into authenticated_likes
  from public.quiz_likes
  where quiz_id = target_quiz_id;

  insert into public.quiz_stats (quiz_id, likes, plays, legacy_likes)
  values (target_quiz_id, authenticated_likes, 0, 0)
  on conflict (quiz_id) do update
  set likes = public.quiz_stats.legacy_likes + authenticated_likes,
      updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_quiz_like_total_after_change on public.quiz_likes;
create trigger sync_quiz_like_total_after_change
after insert or delete on public.quiz_likes
for each row execute function public.sync_quiz_like_total();

