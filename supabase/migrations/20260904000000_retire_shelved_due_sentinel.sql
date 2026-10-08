-- Retire the hidden "shelved" state that was encoded as a due date in 2099.
--
-- Only the due timestamp (and its normal updated_at bookkeeping) changes. FSRS
-- stability/difficulty/state, attempt counters, history, pool membership, and
-- user-owned suspension are preserved. Cards are returned gradually, with the
-- highest elapsed/stability risk first, instead of becoming one due-date spike.

begin;

-- Keep an old clear-due request or another writer from racing between the data
-- rewrite and the constraint that permanently rejects the retired sentinel.
lock table public.training_progress in share row exclusive mode;

do $retire_shelf$
declare
  v_cutoff      constant timestamptz := timestamptz '2090-01-01 00:00:00+00';
  v_now         constant timestamptz := statement_timestamp();
  v_today_utc   constant timestamp   := date_trunc('day', v_now at time zone 'UTC');
  v_per_day     constant integer     := 10;
  v_min_days    constant integer     := 14;
  v_before      bigint;
  v_updated     bigint;
  v_remaining   bigint;
begin
  select count(*) into v_before
    from public.training_progress
   where public.extract_fsrs_due(fsrs_state) >= v_cutoff;

  with base as (
    select
      tp.id,
      tp.user_id,
      tp.quiz_id,
      tp.is_active,
      tp.inactivated_at,
      -- Rows unavailable now must not consume slots in the playable rollout.
      (tp.is_active is distinct from false
       and tp.suspended_at is null
       and tp.song_ann_id is not null) as playable_now,
      coalesce(tp.last_attempt_at, tp.created_at) as risk_origin,
      case
        when jsonb_typeof(tp.fsrs_state -> 'stability') = 'number'
          then (tp.fsrs_state ->> 'stability')::double precision
        else null
      end as stability
    from public.training_progress tp
    where public.extract_fsrs_due(tp.fsrs_state) >= v_cutoff
  ),
  ranked as (
    select
      b.*,
      row_number() over (
        partition by b.user_id, b.quiz_id, b.playable_now
        order by
          -- Unknown/zero stability is most fragile. For established cards,
          -- this is the same elapsed/stability risk used by backlog spreading.
          case when b.stability is null or b.stability <= 0 then 0 else 1 end,
          case when b.stability > 0 then
            extract(epoch from greatest(interval '0 seconds', v_now - b.risk_origin))
              / 86400.0 / b.stability
          end desc nulls last,
          b.stability asc nulls first,
          b.risk_origin asc,
          b.id
      ) - 1 as seq,
      count(*) over (
        partition by b.user_id, b.quiz_id, b.playable_now
      ) as card_count
    from base b
  ),
  sized as (
    select
      r.*,
      greatest(
        v_min_days,
        ceil(r.card_count::numeric / v_per_day)::integer
      ) as horizon_days
    from ranked r
  ),
  scheduled as (
    select
      s.id,
      s.is_active,
      s.inactivated_at,
      -- Start tomorrow so a mid-day deployment never changes today's queue.
      (
        v_today_utc
        + make_interval(
            days => 1 + floor(
              s.seq::numeric * s.horizon_days / s.card_count
            )::integer
          )
      ) at time zone 'UTC' as planned_due
    from sized s
  )
  update public.training_progress tp
     set fsrs_state = jsonb_set(
           tp.fsrs_state,
           '{due}',
           to_jsonb(
             sc.planned_due
             - case
                 -- Pool sync adds the complete inactive duration when this row
                 -- returns. Remove the pre-migration part now so the eventual
                 -- effective due date moves only by time inactive after today.
                 when sc.is_active is false and sc.inactivated_at is not null
                   then greatest(interval '0 seconds', v_now - sc.inactivated_at)
                 else interval '0 seconds'
               end
           ),
           true
         ),
         updated_at = v_now
    from scheduled sc
   where tp.id = sc.id
     and public.extract_fsrs_due(tp.fsrs_state) >= v_cutoff;

  get diagnostics v_updated = row_count;

  select count(*) into v_remaining
    from public.training_progress
   where public.extract_fsrs_due(fsrs_state) >= v_cutoff;

  if v_updated <> v_before or v_remaining <> 0 then
    raise exception
      'shelf retirement failed: before=%, updated=%, remaining=%',
      v_before, v_updated, v_remaining;
  end if;

  raise notice 'retired % shelved due-date sentinel row(s)', v_updated;
end
$retire_shelf$;

-- Prevent stale application versions, imports, or RPC calls from recreating a
-- hidden state with a far-future date. Guard creation is safe on a re-run.
do $guard$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.training_progress'::regclass
       and conname = 'training_progress_due_before_2090'
  ) then
    alter table public.training_progress
      add constraint training_progress_due_before_2090
      check (
        public.extract_fsrs_due(fsrs_state) is null
        or public.extract_fsrs_due(fsrs_state)
             < timestamptz '2090-01-01 00:00:00+00'
      ) not valid;
  end if;
end
$guard$;

alter table public.training_progress
  validate constraint training_progress_due_before_2090;

commit;
