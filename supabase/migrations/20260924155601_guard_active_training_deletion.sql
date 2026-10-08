-- An unfinished session must retain its history while ratings are arriving.
-- Invoker privileges; no new API entry point or role grants.
create or replace function public.guard_active_training_deletion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_ended_at timestamptz;
begin
  if TG_TABLE_NAME = 'training_sessions' then
    if OLD.ended_at is null then
      raise exception using errcode = 'PT409', message = 'Finish the training session before deleting its history.';
    end if;
  else
    -- Serialize with rating commits and session completion. During a completed
    -- parent cascade the parent is already absent, which is safe to allow.
    select ended_at into v_ended_at from public.training_sessions
      where id = OLD.session_id for update;
    if found and v_ended_at is null then
      raise exception using errcode = 'PT409', message = 'Finish the training session before deleting its history.';
    end if;
  end if;
  return OLD;
end;
$$;
revoke all on function public.guard_active_training_deletion() from public, anon, authenticated;
create trigger guard_active_session_delete before delete on public.training_sessions
for each row execute function public.guard_active_training_deletion();
create trigger guard_active_play_delete before delete on public.training_session_plays
for each row execute function public.guard_active_training_deletion();
