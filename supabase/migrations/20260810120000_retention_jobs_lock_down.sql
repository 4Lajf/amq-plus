-- 20260810005037_retention_jobs.sql created both prune functions as SECURITY
-- DEFINER and relied on the default grant, which is EXECUTE to PUBLIC. PostgREST
-- exposes everything in `public`, so both were callable unauthenticated at
-- /rest/v1/rpc/prune_training_session_plays with a caller-supplied interval:
--
--   POST /rest/v1/rpc/prune_training_session_plays  {"p_retention": "00:00:00"}
--
-- The anon key ships inside the userscript, so that is a public endpoint that
-- deletes every play-history row. Revoke it - only pg_cron (postgres) calls
-- these - and clamp the argument so a wrong retention can never mean "delete
-- everything" even from a privileged session.

revoke all on function public.prune_training_session_plays(interval) from public, anon, authenticated;
revoke all on function public.prune_inactive_training_progress(interval) from public, anon, authenticated;

create or replace function public.prune_training_session_plays(p_retention interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
  v_retention interval := greatest(coalesce(p_retention, interval '12 months'), interval '30 days');
begin
  delete from public.training_session_plays
   where played_at < now() - v_retention;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    raise notice 'prune_training_session_plays: deleted % rows older than %', v_deleted, v_retention;
  end if;

  return v_deleted;
end;
$fn$;

comment on function public.prune_training_session_plays(interval) is
  'M6 retention: drop per-song play history older than the retention window (floor: 30 days). FSRS state lives on training_progress and is untouched. Not granted to anon/authenticated.';

create or replace function public.prune_inactive_training_progress(p_retention interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
  v_retention interval := greatest(coalesce(p_retention, interval '12 months'), interval '30 days');
begin
  -- Only rows that have been out of every pool for the whole window. A song
  -- coming back into a quiz flips is_active and bumps updated_at, so anything
  -- still in rotation is safe.
  delete from public.training_progress
   where is_active = false
     and inactivated_at is not null
     and inactivated_at < now() - v_retention
     and updated_at < now() - v_retention;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    raise notice 'prune_inactive_training_progress: deleted % rows', v_deleted;
  end if;

  return v_deleted;
end;
$fn$;

comment on function public.prune_inactive_training_progress(interval) is
  'M6 retention: drop training_progress rows inactive for the whole retention window (floor: 30 days). Not granted to anon/authenticated.';

-- `create or replace` re-applies the default PUBLIC grant, so revoke again after.
revoke all on function public.prune_training_session_plays(interval) from public, anon, authenticated;
revoke all on function public.prune_inactive_training_progress(interval) from public, anon, authenticated;
