-- Allow the atomic rebuild path to delete a stuck in-progress session.
-- Direct deletes stay blocked. Individual attempt deletion still requires
-- the session to be finished first.
create or replace function public.guard_active_training_deletion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_ended_at timestamptz;
begin
  if current_setting('amq.history_mode', true) = 'rebuild' then
    return OLD;
  end if;
  if TG_TABLE_NAME = 'training_sessions' then
    if OLD.ended_at is null then
      raise exception using errcode = 'PT409', message = 'Finish the training session before deleting its history.';
    end if;
  else
    select ended_at into v_ended_at from public.training_sessions
      where id = OLD.session_id for update;
    if found and v_ended_at is null then
      raise exception using errcode = 'PT409', message = 'Finish the training session before deleting its history.';
    end if;
  end if;
  return OLD;
end;
$$;

create or replace function public.prepare_training_history_deletion(p_user_id uuid,p_session_id uuid,p_play_id uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_session training_sessions%rowtype; v_revision bigint; v_plays jsonb; v_requests jsonb;
begin
 select * into v_session from training_sessions where id=p_session_id and user_id=p_user_id;
 if not found then raise exception using errcode='PT404',message='Session not found'; end if;
 v_revision:=lock_training_history(p_user_id,v_session.quiz_id);
 if p_play_id is not null and exists(select 1 from training_sessions where user_id=p_user_id and quiz_id=v_session.quiz_id and ended_at is null) then
   raise exception using errcode='PT409',message='Finish active training sessions before deleting history.';
 end if;
 if p_play_id is not null and not exists(select 1 from training_session_plays where id=p_play_id and session_id=p_session_id and user_id=p_user_id) then
   raise exception using errcode='PT404',message='Attempt not found';
 end if;
 if exists(select 1 from training_session_plays p left join training_rating_commits c on c.play_id=p.id
   where p.session_id=p_session_id and p.user_id=p_user_id and (p_play_id is null or p.id=p_play_id)
   and (c.request_id is null or not exists(select 1 from training_history_journal j where j.request_id=c.request_id and j.kind='rating' and j.song_ann_id=p.song_ann_id and not j.deleted))) then
   raise exception using errcode='PT409',message='This older history has no reliable replay checkpoint. Nothing was deleted.';
 end if;
 select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb),coalesce(jsonb_agg(c.request_id order by p.id),'[]'::jsonb)
 into v_plays,v_requests from training_session_plays p left join training_rating_commits c on c.play_id=p.id
 where p.session_id=p_session_id and p.user_id=p_user_id and (p_play_id is null or p.id=p_play_id);
 return jsonb_build_object('quizId',v_session.quiz_id,'revision',v_revision::text,'playIds',v_plays,'requestIds',v_requests);
end; $$;
revoke all on function public.prepare_training_history_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_training_history_deletion(uuid,uuid,uuid) to service_role;
