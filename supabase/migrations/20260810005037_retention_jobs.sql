-- M6 retention. `training_session_plays` is at ~676k rows and grows ~15k/week
-- with no pruning; `training_progress` accumulates is_active = false rows that
-- nothing ever reads again.
--
-- Both jobs delete nothing today (the oldest play is 2025-12-01, well inside 12
-- months) - this is preventive, and the window is deliberately generous because
-- plays back the per-song history UI.
--
-- Also widens the user_list_cache cleanup. That job deleted rows the moment
-- they expired, which left nothing behind for the stale-fallback path in
-- src/routes/api/user-list-cache/+server.js to serve during a MAL outage.
-- Expired rows now survive a 7-day grace window; they are still cache MISSES
-- and still trigger a refresh, they are just available when the refresh fails.

create extension if not exists pg_cron;

create or replace function public.prune_training_session_plays(p_retention interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
begin
  delete from public.training_session_plays
   where played_at < now() - p_retention;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    raise notice 'prune_training_session_plays: deleted % rows older than %', v_deleted, p_retention;
  end if;

  return v_deleted;
end;
$fn$;

comment on function public.prune_training_session_plays(interval) is
  'M6 retention: drop per-song play history older than the retention window. FSRS state lives on training_progress and is untouched.';

create or replace function public.prune_inactive_training_progress(p_retention interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
begin
  -- Only rows that have been out of every pool for the whole window. A song
  -- coming back into a quiz flips is_active and bumps updated_at, so anything
  -- still in rotation is safe.
  delete from public.training_progress
   where is_active = false
     and inactivated_at is not null
     and inactivated_at < now() - p_retention
     and updated_at < now() - p_retention;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    raise notice 'prune_inactive_training_progress: deleted % rows', v_deleted;
  end if;

  return v_deleted;
end;
$fn$;

comment on function public.prune_inactive_training_progress(interval) is
  'M6 retention: drop training_progress rows that have been inactive for the whole retention window.';

-- Weekly, off-peak, staggered so they never overlap the cache cleanup.
select cron.unschedule('prune-training-session-plays')
 where exists (select 1 from cron.job where jobname = 'prune-training-session-plays');

select cron.schedule(
  'prune-training-session-plays',
  '15 3 * * 0',
  $job$select public.prune_training_session_plays();$job$
);

select cron.unschedule('prune-inactive-training-progress')
 where exists (select 1 from cron.job where jobname = 'prune-inactive-training-progress');

select cron.schedule(
  'prune-inactive-training-progress',
  '45 3 * * 0',
  $job$select public.prune_inactive_training_progress();$job$
);

-- Keep expired cache rows around as an outage fallback for 7 days.
select cron.unschedule('cleanup-expired-cache')
 where exists (select 1 from cron.job where jobname = 'cleanup-expired-cache');

select cron.schedule(
  'cleanup-expired-cache',
  '0 2 * * *',
  $job$delete from public.user_list_cache where expires_at < now() - interval '7 days';$job$
);
