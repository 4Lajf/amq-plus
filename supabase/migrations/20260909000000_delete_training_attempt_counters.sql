-- Apply with the API switch to delete_training_attempt. No historical backfill.
-- Lock the session before the play, matching commit_training_rating.
create or replace function public.delete_training_attempt(
  p_user_id uuid, p_session_id uuid, p_play_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play public.training_session_plays%rowtype;
  v_correct integer;
  v_incorrect integer;
begin
  perform 1 from public.training_sessions
    where id = p_session_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  delete from public.training_session_plays
    where id = p_play_id and session_id = p_session_id and user_id = p_user_id
    returning * into v_play;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select count(*) filter (where success is true), count(*) filter (where success is false)
    into v_correct, v_incorrect
    from public.training_session_plays where session_id = p_session_id;
  update public.training_sessions
    set correct_songs = v_correct,
        incorrect_songs = v_incorrect,
        total_songs = case when ended_at is not null then v_correct + v_incorrect else total_songs end
    where id = p_session_id;

  return jsonb_build_object('status', 'deleted', 'quiz_id', v_play.quiz_id,
    'song_ann_id', v_play.song_ann_id);
end;
$$;

revoke all on function public.delete_training_attempt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_training_attempt(uuid, uuid, uuid) to service_role;
