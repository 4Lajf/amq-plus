-- Prevent cross-session deadlocks when rating duplicate-linked songs.
-- Replaces only the commit function; preserves its existing grants and ledger.

create or replace function public.commit_training_rating(
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
  p_duplicate_song_ids integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.training_sessions%rowtype;
  v_progress public.training_progress%rowtype;
  v_commit public.training_rating_commits%rowtype;
  v_payload_hash text;
  v_play_id uuid;
  v_current_streak integer;
  v_duplicates_updated integer := 0;
  v_lock_song_id integer;
  v_response jsonb;
begin
  if p_user_id is null or p_session_id is null or p_request_id is null then
    return jsonb_build_object('status', 'invalid', 'message', 'User, session, and request ID are required');
  end if;
  if p_ann_song_id is null or p_ann_song_id <= 0
     or p_rating is null or p_rating not between 1 and 4 or p_success is null then
    return jsonb_build_object('status', 'invalid', 'message', 'The rating payload is invalid');
  end if;
  if p_fsrs_before is null or jsonb_typeof(p_fsrs_before) <> 'object'
     or p_fsrs_after is null or jsonb_typeof(p_fsrs_after) <> 'object' then
    return jsonb_build_object('status', 'invalid', 'message', 'FSRS state must be an object');
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
    return jsonb_build_object('status', 'not_found', 'message', 'Session not found');
  end if;

  if jsonb_typeof(v_session.session_data->'playlistAnnSongIds') = 'array'
     and jsonb_array_length(v_session.session_data->'playlistAnnSongIds') > 0
     and not exists (
       select 1
         from jsonb_array_elements_text(v_session.session_data->'playlistAnnSongIds') as item(value)
        where item.value ~ '^[0-9]+$'
          and item.value::integer = p_ann_song_id
     ) then
    return jsonb_build_object(
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
      return jsonb_build_object(
        'status', 'idempotency_conflict',
        'message', 'requestId was already used for a different rating'
      );
    end if;

    return coalesce(v_commit.response_data, '{}'::jsonb)
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
      return jsonb_build_object('status', 'stale', 'message', 'Training progress changed; recompute the rating');
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
      return jsonb_build_object('status', 'stale', 'message', 'Training progress changed; recompute the rating');
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

  return v_response;
end;
$$;
