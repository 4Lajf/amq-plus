-- Coordinated release after atomic ratings, duplicate locks and active deletion guards.
-- No baseline backfill: the first subsequent mutation captures the retained state.
create table public.training_history_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_configurations(id) on delete cascade,
  revision bigint not null default 0, primary key(user_id,quiz_id)
);
create table public.training_history_journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_configurations(id) on delete cascade,
  song_ann_id integer not null,
  kind text not null check(kind in ('checkpoint','rating')),
  snapshot jsonb,
  payload jsonb,
  request_id uuid,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index training_history_journal_scope on public.training_history_journal(user_id,quiz_id,id);
create index training_history_journal_card on public.training_history_journal(user_id,quiz_id,song_ann_id,id);
create index training_history_journal_request on public.training_history_journal(request_id) where request_id is not null;
alter table public.training_history_versions enable row level security;
alter table public.training_history_journal enable row level security;
revoke all on public.training_history_versions, public.training_history_journal from public,anon,authenticated;
grant all on public.training_history_versions, public.training_history_journal to service_role;
grant usage,select on sequence public.training_history_journal_id_seq to service_role;

create function public.lock_training_history(p_user uuid,p_quiz uuid) returns bigint
language plpgsql set search_path=public,pg_temp as $$
declare v_revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('history:'||p_user::text||':'||p_quiz::text,0));
 insert into training_history_versions(user_id,quiz_id) values(p_user,p_quiz) on conflict do nothing;
 select revision into v_revision from training_history_versions where user_id=p_user and quiz_id=p_quiz for update;
 return v_revision;
end; $$;
revoke all on function public.lock_training_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_training_history(uuid,uuid) to service_role;

-- Every progress, play and session write invalidates a concurrently prepared replay.
create function public.track_training_history_version() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_row jsonb;
begin
 v_row := case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 -- Cascading account/quiz removal needs no surviving replay version.
 if TG_OP='DELETE' and pg_trigger_depth()>1 then
   return coalesce(NEW,OLD);
 end if;
 perform lock_training_history((v_row->>'user_id')::uuid,(v_row->>'quiz_id')::uuid);
 update training_history_versions set revision=revision+1 where user_id=(v_row->>'user_id')::uuid and quiz_id=(v_row->>'quiz_id')::uuid;
 return coalesce(NEW,OLD);
end; $$;
create trigger history_version_progress before insert or update or delete on public.training_progress for each row execute function public.track_training_history_version();
create trigger history_version_plays before insert or update or delete on public.training_session_plays for each row execute function public.track_training_history_version();
create trigger history_version_sessions before insert or update or delete on public.training_sessions for each row execute function public.track_training_history_version();

create function public.training_replay_snapshot(p_row jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('fsrs_state',p_row->'fsrs_state','attempt_count',p_row->'attempt_count',
 'success_count',p_row->'success_count','failure_count',p_row->'failure_count',
 'success_streak',p_row->'success_streak','failure_streak',p_row->'failure_streak',
 'last_attempt_at',p_row->'last_attempt_at','history',p_row->'history');
$$;
create function public.capture_training_checkpoint() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_mode text:=current_setting('amq.history_mode',true); v_context jsonb; v_before jsonb; v_after jsonb; v_row jsonb;
begin
 if v_mode='rebuild' then return coalesce(NEW,OLD); end if;
 v_row:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 if (v_row->>'song_ann_id') is null then return coalesce(NEW,OLD); end if;
 if TG_OP='DELETE' and pg_trigger_depth()>1 then return coalesce(NEW,OLD); end if;
 v_before:=case when TG_OP='INSERT' then null else training_replay_snapshot(to_jsonb(OLD)) end;
 v_after:=case when TG_OP='DELETE' then null else training_replay_snapshot(to_jsonb(NEW)) end;
 if v_mode='rating' and TG_OP<>'DELETE' then
   v_context:=current_setting('amq.history_rating',true)::jsonb;
   if TG_OP='INSERT' or not exists(select 1 from training_history_journal where user_id=NEW.user_id and quiz_id=NEW.quiz_id and song_ann_id=NEW.song_ann_id) then
     if v_before is null then
       v_before:=jsonb_build_object('fsrs_state',v_context->'before','attempt_count',0,'success_count',0,'failure_count',0,'success_streak',0,'failure_streak',0,'last_attempt_at',null,'history','[]'::jsonb);
     end if;
     insert into training_history_journal(user_id,quiz_id,song_ann_id,kind,snapshot) values(NEW.user_id,NEW.quiz_id,NEW.song_ann_id,'checkpoint',v_before);
   end if;
   insert into training_history_journal(user_id,quiz_id,song_ann_id,kind,payload,request_id)
   values(NEW.user_id,NEW.quiz_id,NEW.song_ann_id,'rating',v_context,(v_context->>'requestId')::uuid);
 elsif v_before is distinct from v_after then
   insert into training_history_journal(user_id,quiz_id,song_ann_id,kind,snapshot)
   values((v_row->>'user_id')::uuid,(v_row->>'quiz_id')::uuid,(v_row->>'song_ann_id')::integer,'checkpoint',v_after);
 end if;
 return coalesce(NEW,OLD);
end; $$;
create trigger history_z_checkpoint_progress before insert or update or delete on public.training_progress for each row execute function public.capture_training_checkpoint();

-- Keep attempt retry identities after deletion so an offline retry cannot resurrect it.
alter table public.training_rating_commits drop constraint training_rating_commits_play_id_fkey;
alter table public.training_rating_commits add constraint training_rating_commits_play_id_fkey foreign key(play_id) references public.training_session_plays(id) on delete set null;

create or replace function public.commit_training_rating_checkpointed(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_ann_song_id integer,
  p_rating integer,
  p_success boolean,
  p_played_at timestamptz,
  p_expected_progress_id uuid,
  p_expected_updated_at timestamptz,
  p_fsrs_before jsonb,
  p_fsrs_after jsonb,
  p_user_answer text,
  p_correct_answer text,
  p_duplicate_song_ids integer[],
  p_replay_options jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.training_sessions%rowtype;
  v_quiz uuid;
  v_progress public.training_progress%rowtype;
  v_commit public.training_rating_commits%rowtype;
  v_payload_hash text;
  v_play_id uuid;
  v_current_streak integer;
  v_duplicates_updated integer := 0;
  v_lock_song_id integer;
  v_response jsonb;
begin
  select quiz_id into v_quiz from training_sessions where id=p_session_id and user_id=p_user_id;
  if v_quiz is null then perform set_config('amq.history_mode','',true); return jsonb_build_object('status','not_found'); end if;
  perform lock_training_history(p_user_id,v_quiz);
  if p_replay_options->>'version' is distinct from 'amq-fsrs-20260924-v1'
     or jsonb_typeof(p_replay_options->'allowSameDayReviews') is distinct from 'boolean' then
    perform set_config('amq.history_mode','',true); return jsonb_build_object('status','invalid','message','Missing supported replay settings');
  end if;
  perform set_config('amq.history_mode','rating',true);
  perform set_config('amq.history_rating',jsonb_build_object('sourceSong',p_ann_song_id,'requestId',p_request_id,
    'rating',p_rating,'success',p_success,'playedAt',p_played_at,'before',p_fsrs_before,'after',p_fsrs_after,'options',p_replay_options)::text,true);
  if p_user_id is null or p_session_id is null or p_request_id is null then
    perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'invalid', 'message', 'User, session, and request ID are required');
  end if;
  if p_ann_song_id is null or p_ann_song_id <= 0
     or p_rating is null or p_rating not between 1 and 4 or p_success is null then
    perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'invalid', 'message', 'The rating payload is invalid');
  end if;
  if p_fsrs_before is null or jsonb_typeof(p_fsrs_before) <> 'object'
     or p_fsrs_after is null or jsonb_typeof(p_fsrs_after) <> 'object' then
    perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'invalid', 'message', 'FSRS state must be an object');
  end if;

  -- Serializing a session makes its counter increments deterministic and keeps
  -- two ratings from racing the same session-level idempotency decision.
  select *
    into v_session
    from public.training_sessions
   where id = p_session_id
     and user_id = p_user_id
   for update;

  if not found then
    perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'not_found', 'message', 'Session not found');
  end if;

  if jsonb_typeof(v_session.session_data->'playlistAnnSongIds') = 'array'
     and jsonb_array_length(v_session.session_data->'playlistAnnSongIds') > 0
     and not exists (
       select 1
         from jsonb_array_elements_text(v_session.session_data->'playlistAnnSongIds') as item(value)
        where item.value ~ '^[0-9]+$'
          and item.value::integer = p_ann_song_id
     ) then
    perform set_config('amq.history_mode','',true); return jsonb_build_object(
      'status', 'song_not_in_session',
      'message', 'Song is not part of this training session playlist'
    );
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'userId', p_user_id,
    'sessionId', p_session_id,
    'annSongId', p_ann_song_id,
    'rating', p_rating,
    'success', p_success,
    'playedAt', p_played_at,
    'userAnswer', p_user_answer,
    'correctAnswer', p_correct_answer
  )::text);

  -- ON CONFLICT waits for an in-flight transaction with the same request ID.
  -- If that transaction commits, this request reads its original response; if
  -- it rolls back, this request owns the newly inserted ledger row.
  insert into public.training_rating_commits (
    request_id, user_id, session_id, song_ann_id, payload_hash
  ) values (
    p_request_id, p_user_id, p_session_id, p_ann_song_id, v_payload_hash
  )
  on conflict (request_id) do nothing
  returning * into v_commit;

  if not found then
    select * into v_commit
      from public.training_rating_commits
     where request_id = p_request_id;

    if v_commit.user_id is distinct from p_user_id
       or v_commit.session_id is distinct from p_session_id
       or v_commit.payload_hash is distinct from v_payload_hash then
      perform set_config('amq.history_mode','',true); return jsonb_build_object(
        'status', 'idempotency_conflict',
        'message', 'requestId was already used for a different rating'
      );
    end if;

    perform set_config('amq.history_mode','',true); return coalesce(v_commit.response_data, '{}'::jsonb)
      || jsonb_build_object('status', 'duplicate', 'idempotentReplay', true);
  end if;

  -- Lock the entire duplicate group in a shared order before touching rows.
  -- Two sessions can rate opposite siblings; per-card locks alone deadlock
  -- when each transaction later updates the sibling held by the other.
  for v_lock_song_id in
    select distinct song_id
      from unnest(array_append(coalesce(p_duplicate_song_ids, '{}'::integer[]), p_ann_song_id)) as ids(song_id)
     where song_id is not null and song_id > 0
     order by song_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      p_user_id::text || ':' || v_session.quiz_id::text || ':' || v_lock_song_id::text,
      0
    ));
  end loop;

  select *
    into v_progress
    from public.training_progress
   where user_id = p_user_id
     and quiz_id = v_session.quiz_id
     and song_ann_id = p_ann_song_id
   limit 1
   for update;

  if found then
    if p_expected_progress_id is null
       or v_progress.id is distinct from p_expected_progress_id
       or v_progress.updated_at is distinct from p_expected_updated_at
       or v_progress.fsrs_state is distinct from p_fsrs_before then
      delete from public.training_rating_commits where request_id = p_request_id;
      perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'stale', 'message', 'Training progress changed; recompute the rating');
    end if;

    update public.training_progress
       set fsrs_state = p_fsrs_after,
           attempt_count = attempt_count + 1,
           success_count = success_count + case when p_success then 1 else 0 end,
           failure_count = failure_count + case when p_success then 0 else 1 end,
           success_streak = case when p_success then success_streak + 1 else 0 end,
           failure_streak = case when p_success then 0 else failure_streak + 1 end,
           history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'timestamp', p_played_at,
             'success', p_success,
             'rating', p_rating,
             'requestId', p_request_id
           )),
           last_attempt_at = p_played_at,
           is_active = true,
           inactivated_at = null
     where id = v_progress.id
     returning success_streak into v_current_streak;
  else
    if p_expected_progress_id is not null or p_expected_updated_at is not null then
      delete from public.training_rating_commits where request_id = p_request_id;
      perform set_config('amq.history_mode','',true); return jsonb_build_object('status', 'stale', 'message', 'Training progress changed; recompute the rating');
    end if;

    insert into public.training_progress (
      user_id, quiz_id, song_ann_id, fsrs_state,
      attempt_count, success_count, failure_count,
      success_streak, failure_streak, history, last_attempt_at,
      is_active, inactivated_at
    ) values (
      p_user_id, v_session.quiz_id, p_ann_song_id, p_fsrs_after,
      1, case when p_success then 1 else 0 end, case when p_success then 0 else 1 end,
      case when p_success then 1 else 0 end, case when p_success then 0 else 1 end,
      jsonb_build_array(jsonb_build_object(
        'timestamp', p_played_at,
        'success', p_success,
        'rating', p_rating,
        'requestId', p_request_id
      )),
      p_played_at, true, null
    )
    returning success_streak into v_current_streak;
  end if;

  v_play_id := gen_random_uuid();
  insert into public.training_session_plays (
    id, user_id, session_id, quiz_id, song_ann_id, played_at,
    rating, success, user_answer, correct_answer, fsrs_before, fsrs_after
  ) values (
    v_play_id, p_user_id, p_session_id, v_session.quiz_id, p_ann_song_id, p_played_at,
    p_rating, p_success, p_user_answer, p_correct_answer, p_fsrs_before, p_fsrs_after
  );

  if coalesce(array_length(p_duplicate_song_ids, 1), 0) > 0 then
    with changed as (
      update public.training_progress tp
         set fsrs_state = p_fsrs_after || jsonb_build_object(
               'songKey', coalesce(tp.fsrs_state->>'songKey', tp.song_ann_id::text)
             ),
             is_active = true,
             inactivated_at = null
       where tp.user_id = p_user_id
         and tp.quiz_id = v_session.quiz_id
         and tp.song_ann_id = any(p_duplicate_song_ids)
         and tp.song_ann_id <> p_ann_song_id
         and tp.suspended_at is null
       returning 1
    )
    select count(*)::integer into v_duplicates_updated from changed;
  end if;

  update public.training_sessions
     set correct_songs = correct_songs + case when p_success then 1 else 0 end,
         incorrect_songs = incorrect_songs + case when p_success then 0 else 1 end
   where id = p_session_id;

  v_response := jsonb_build_object(
    'status', 'committed',
    'success', true,
    'nextReview', p_fsrs_after->>'due',
    'currentStreak', v_current_streak,
    'duplicatesUpdated', v_duplicates_updated,
    'idempotentReplay', false
  );

  update public.training_rating_commits
     set play_id = v_play_id,
         response_data = v_response
   where request_id = p_request_id;

  perform set_config('amq.history_mode','',true);
  perform set_config('amq.history_mode','',true); return v_response;
end;
$$;


revoke all on function public.commit_training_rating_checkpointed(uuid,uuid,uuid,integer,integer,boolean,timestamptz,uuid,timestamptz,jsonb,jsonb,text,text,integer[],jsonb) from public,anon,authenticated;
grant execute on function public.commit_training_rating_checkpointed(uuid,uuid,uuid,integer,integer,boolean,timestamptz,uuid,timestamptz,jsonb,jsonb,text,text,integer[],jsonb) to service_role;

-- Prepare a versioned plan; no history or progress is deleted here.
create function public.prepare_training_history_deletion(p_user_id uuid,p_session_id uuid,p_play_id uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_session training_sessions%rowtype; v_revision bigint; v_plays jsonb; v_requests jsonb;
begin
 select * into v_session from training_sessions where id=p_session_id and user_id=p_user_id;
 if not found then raise exception using errcode='PT404',message='Session not found'; end if;
 v_revision:=lock_training_history(p_user_id,v_session.quiz_id);
 if exists(select 1 from training_sessions where user_id=p_user_id and quiz_id=v_session.quiz_id and ended_at is null) then
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

-- The JS server computes FSRS; this transaction checks its input version and
-- commits every rebuilt song, journal tombstone, counter and deletion together.
create function public.commit_training_history_deletion(p_user_id uuid,p_session_id uuid,p_play_id uuid,
 p_expected_revision text,p_expected_play_ids jsonb,p_changes jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_plan jsonb; v_change jsonb; v_count integer; v_total integer:=0; v_quiz uuid;
begin
 v_plan:=prepare_training_history_deletion(p_user_id,p_session_id,p_play_id);
 v_quiz:=(v_plan->>'quizId')::uuid;
 if v_plan->>'revision' is distinct from p_expected_revision or v_plan->'playIds' is distinct from p_expected_play_ids then
   return jsonb_build_object('status','stale');
 end if;
 if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Invalid replay changes'; end if;
 if exists(select 1 from training_history_journal j where j.user_id=p_user_id and j.quiz_id=v_quiz
   and j.request_id in(select value::uuid from jsonb_array_elements_text(v_plan->'requestIds'))
   and not exists(select 1 from jsonb_array_elements(p_changes) c where (c->>'song_ann_id')::integer=j.song_ann_id)) then
   raise exception 'Replay omitted an affected song';
 end if;
 perform set_config('amq.history_mode','rebuild',true);
 for v_change in select value from jsonb_array_elements(p_changes) loop
   if jsonb_typeof(v_change->'fsrs_state') is distinct from 'object' or jsonb_typeof(v_change->'history') is distinct from 'array'
     or (v_change->>'attempt_count')::integer<0
     or (v_change->>'success_count')::integer+(v_change->>'failure_count')::integer<>(v_change->>'attempt_count')::integer then
     raise exception 'Invalid rebuilt progress';
   end if;
   update training_progress set fsrs_state=v_change->'fsrs_state',attempt_count=(v_change->>'attempt_count')::integer,
    success_count=(v_change->>'success_count')::integer,failure_count=(v_change->>'failure_count')::integer,
    success_streak=(v_change->>'success_streak')::integer,failure_streak=(v_change->>'failure_streak')::integer,
    last_attempt_at=(v_change->>'last_attempt_at')::timestamptz,history=v_change->'history'
    where user_id=p_user_id and quiz_id=v_quiz and song_ann_id=(v_change->>'song_ann_id')::integer;
   get diagnostics v_count=row_count;
   if v_count<>1 then raise exception 'Replay target disappeared'; end if;
   v_total:=v_total+1;
 end loop;
 update training_history_journal set deleted=true,payload=null where user_id=p_user_id and quiz_id=v_quiz
   and request_id in (select value::uuid from jsonb_array_elements_text(v_plan->'requestIds'));
 delete from training_session_plays where user_id=p_user_id and session_id=p_session_id and (p_play_id is null or id=p_play_id);
 get diagnostics v_count=row_count;
 if v_count<>jsonb_array_length(p_expected_play_ids) then raise exception 'Replay deletion count changed'; end if;
 if p_play_id is null then
   delete from training_sessions where id=p_session_id and user_id=p_user_id;
 else
   update training_sessions set correct_songs=(select count(*) from training_session_plays where session_id=p_session_id and success is true),
    incorrect_songs=(select count(*) from training_session_plays where session_id=p_session_id and success is false),
    total_songs=(select count(*) from training_session_plays where session_id=p_session_id)
    where id=p_session_id and user_id=p_user_id;
 end if;
 perform set_config('amq.history_mode','',true);
 return jsonb_build_object('status','deleted','success',true,'progressUpdated',true,'deletedPlays',v_count,'recalculatedSongs',v_total,'recalculationErrors',0,
   'message','History deleted and progress rebuilt.');
end; $$;
revoke all on function public.commit_training_history_deletion(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_training_history_deletion(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;

-- Covered events can only be removed through the atomic replay operation.
-- Older/uncovered history retains the active-session guard but cannot be
-- removed through the new session/attempt endpoints without a checkpoint.
create function public.protect_checkpointed_play() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if pg_trigger_depth()>1 then return OLD; end if;
 if current_setting('amq.history_mode',true) is distinct from 'rebuild'
 and exists(select 1 from training_rating_commits c join training_history_journal j on j.request_id=c.request_id where c.play_id=OLD.id) then
   raise exception using errcode='PT409',message='Checkpointed history must be deleted with an atomic rebuild.';
 end if;
 return OLD;
end; $$;
create trigger protect_checkpointed_play before delete on public.training_session_plays for each row execute function public.protect_checkpointed_play();
-- Trigger helpers are not callable application APIs.
revoke all on function public.track_training_history_version(),public.capture_training_checkpoint(),public.training_replay_snapshot(jsonb),public.protect_checkpointed_play() from public,anon,authenticated;
grant execute on function public.training_replay_snapshot(jsonb) to service_role;

-- Explicitly forgetting a whole song is also atomic; it establishes an empty
-- checkpoint rather than pretending it is an individual-rating undo.
create function public.clear_training_song_history(p_user_id uuid,p_quiz_id uuid,p_song_ann_id integer,p_record_id uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_song integer; v_record uuid; v_sessions uuid[];
begin
 if not exists(select 1 from quiz_configurations where id=p_quiz_id and user_id=p_user_id) then
   raise exception using errcode='PT403',message='Not authorized to modify this quiz';
 end if;
 perform lock_training_history(p_user_id,p_quiz_id);
 if exists(select 1 from training_sessions where user_id=p_user_id and quiz_id=p_quiz_id and ended_at is null) then
   raise exception using errcode='PT409',message='Finish active training sessions before deleting song history.';
 end if;
 select id,song_ann_id into v_record,v_song from training_progress where user_id=p_user_id and quiz_id=p_quiz_id
   and ((p_record_id is not null and id=p_record_id) or (p_record_id is null and song_ann_id=p_song_ann_id)) for update;
 if not found then raise exception using errcode='PT404',message='Progress record not found'; end if;
 select array_agg(distinct session_id) into v_sessions from training_session_plays where user_id=p_user_id and quiz_id=p_quiz_id and song_ann_id is not distinct from v_song;
 perform set_config('amq.history_mode','rebuild',true);
 delete from training_session_plays where user_id=p_user_id and quiz_id=p_quiz_id and song_ann_id is not distinct from v_song;
 delete from training_progress where user_id=p_user_id and quiz_id=p_quiz_id and id=v_record;
 update training_sessions s set correct_songs=(select count(*) from training_session_plays where session_id=s.id and success is true),
  incorrect_songs=(select count(*) from training_session_plays where session_id=s.id and success is false),
  total_songs=(select count(*) from training_session_plays where session_id=s.id)
  where s.id=any(v_sessions);
 if v_song is not null then
  insert into training_history_journal(user_id,quiz_id,song_ann_id,kind,snapshot) values(p_user_id,p_quiz_id,v_song,'checkpoint',null);
 end if;
 perform set_config('amq.history_mode','',true);
 return jsonb_build_object('success',true,'message','Song record and attempt history deleted.');
end; $$;
revoke all on function public.clear_training_song_history(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.clear_training_song_history(uuid,uuid,integer,uuid) to service_role;

create function public.protect_checkpointed_session() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if pg_trigger_depth()>1 then return OLD; end if;
 if current_setting('amq.history_mode',true) is distinct from 'rebuild' and exists(
   select 1 from training_rating_commits c join training_history_journal j on j.request_id=c.request_id where c.session_id=OLD.id) then
   raise exception using errcode='PT409',message='Checkpointed history must be deleted with an atomic rebuild.';
 end if;
 return OLD;
end; $$;
revoke all on function public.protect_checkpointed_session() from public,anon,authenticated;
create trigger protect_checkpointed_session before delete on public.training_sessions for each row execute function public.protect_checkpointed_session();
