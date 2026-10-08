-- W7: mergeProgress applied its updates one row at a time -
-- `await supabase.from('training_progress').update(...).eq('id', record.id)`
-- inside a for-loop. That is the exact pattern Phase 1.7 replaced with
-- bulk_set_training_due in reset-due, clear-due and rescue-shelved; merge was
-- missed. Fine for 3shine's 10-song merge, and unfinishable inside
-- Cloudflare's 100s window for a large one.
--
-- One statement instead. Ownership is enforced inside the function by the
-- (user_id, quiz_id) predicate, so a caller cannot touch rows it does not own
-- even if it passes ids belonging to someone else - same contract as
-- bulk_set_training_due.

create or replace function public.bulk_merge_training_progress(
  p_user_id uuid,
  p_quiz_id uuid,
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  with incoming as (
    select
      (elem->>'id')::uuid                       as id,
      (elem->'fsrs_state')                      as fsrs_state,
      (elem->>'attempt_count')::integer         as attempt_count,
      (elem->>'success_count')::integer         as success_count,
      (elem->>'failure_count')::integer         as failure_count,
      (elem->>'success_streak')::integer        as success_streak,
      (elem->>'failure_streak')::integer        as failure_streak,
      (elem->'history')                         as history,
      nullif(elem->>'last_attempt_at', '')::timestamptz as last_attempt_at
    from jsonb_array_elements(p_updates) as elem
  )
  update public.training_progress tp
     set fsrs_state     = coalesce(incoming.fsrs_state, tp.fsrs_state),
         attempt_count  = coalesce(incoming.attempt_count, tp.attempt_count),
         success_count  = coalesce(incoming.success_count, tp.success_count),
         failure_count  = coalesce(incoming.failure_count, tp.failure_count),
         success_streak = coalesce(incoming.success_streak, tp.success_streak),
         failure_streak = coalesce(incoming.failure_streak, tp.failure_streak),
         history        = coalesce(incoming.history, tp.history),
         last_attempt_at = coalesce(incoming.last_attempt_at, tp.last_attempt_at),
         -- A merge always brings the target row back into play; this mirrors
         -- what the per-row path wrote.
         is_active      = true,
         inactivated_at = null,
         updated_at     = now()
    from incoming
   where tp.id = incoming.id
     and tp.user_id = p_user_id
     and tp.quiz_id = p_quiz_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.bulk_merge_training_progress(uuid, uuid, jsonb) from public;
revoke all on function public.bulk_merge_training_progress(uuid, uuid, jsonb) from anon;
revoke all on function public.bulk_merge_training_progress(uuid, uuid, jsonb) from authenticated;
grant execute on function public.bulk_merge_training_progress(uuid, uuid, jsonb) to service_role;
