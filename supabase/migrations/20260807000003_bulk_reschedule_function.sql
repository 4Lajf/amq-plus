-- reset-due, clear-due and the new rescue-shelved endpoint all ended in a
-- per-row `await supabaseAdmin.from('training_progress').update(...).eq('id')`
-- loop. zCrimlet's 416-song reset was 416 serialised round trips; a 2,000-song
-- quiz cannot finish inside Cloudflare's 100s window at all.
--
-- One statement instead. Ownership is enforced inside the function by the
-- (user_id, quiz_id) predicate, so a caller cannot touch rows it does not own
-- even if it passes ids belonging to someone else.

create or replace function public.bulk_set_training_due(
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
      (elem->>'id')::uuid as id,
      (elem->>'due') as due
    from jsonb_array_elements(p_updates) as elem
  )
  update public.training_progress tp
     set fsrs_state = jsonb_set(
           coalesce(tp.fsrs_state, '{}'::jsonb),
           '{due}',
           to_jsonb(incoming.due)
         ),
         updated_at = now()
    from incoming
   where tp.id = incoming.id
     and tp.user_id = p_user_id
     and tp.quiz_id = p_quiz_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.bulk_set_training_due(uuid, uuid, jsonb) from public;
revoke all on function public.bulk_set_training_due(uuid, uuid, jsonb) from anon;
revoke all on function public.bulk_set_training_due(uuid, uuid, jsonb) from authenticated;
grant execute on function public.bulk_set_training_due(uuid, uuid, jsonb) to service_role;
