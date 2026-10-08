-- W18: pull cards scheduled beyond six months back to the cap.
--
-- ts-fsrs's stock maximum_interval is 36500 days - a hundred years, effectively
-- uncapped - and nothing was ever configured, so production accumulated:
--
--   scheduled beyond 6 months   12,369 cards   8.8% of 140,862 active
--   scheduled beyond 1 year      2,912 cards   2.1%
--   scheduled beyond 2 years       119 cards   0.1%
--   furthest due date         2029-06-30
--
-- That is TriusHalf's "rescheduled to mid-September" and 3shine's "then I just
-- won't see that song for a year". fsrs-service.js now sets
-- maximum_interval: 180, but that only binds cards as they are next reviewed -
-- and a card due in 2029 is not reviewed until 2029. The 12,369 cards that
-- motivated the setting would sit exactly where they are. Hence retroactive.
--
-- ONLY `due` moves. Stability and difficulty are untouched, so this is
-- reversible: raise the cap and the next review restores the old shape.
--
-- The pulled-back cards are SPREAD rather than dropped on one date. 12k cards
-- landing together would look, to the affected users, exactly like the backlog
-- bug they have been reporting for months. Each user's cards are dealt out
-- 30/day over at least 7 days, soonest-due first - the same shape as
-- reset-due's computeSpread.
--
-- NOT YET APPLIED. Run it when you are ready to announce it; due counts will
-- visibly jump for affected users the day it lands, and that is the intended
-- effect.

do $$
declare
  v_cap_days   integer := 180;  -- keep in sync with MAX_INTERVAL_DAYS in fsrs-service.js
  v_per_day    integer := 30;   -- MAX_SONGS_PER_DAY in reset-due
  v_min_days   integer := 7;    -- MIN_SPREAD_DAYS in reset-due
  v_updated    integer;
begin
  with affected as (
    select
      tp.id,
      tp.user_id,
      (tp.fsrs_state->>'due')::timestamptz as due,
      -- Most fragile first, so the soonest-due of the over-cap cards come back
      -- first. Ties broken by id so the result is reproducible.
      row_number() over (
        partition by tp.user_id
        order by (tp.fsrs_state->>'due')::timestamptz, tp.id
      ) - 1 as seq
    from public.training_progress tp
    where tp.is_active is true
      and tp.suspended_at is null
      and tp.fsrs_state ? 'due'
      and (tp.fsrs_state->>'due') ~ '^\d{4}-'
      and (tp.fsrs_state->>'due')::timestamptz > now() + make_interval(days => v_cap_days)
      -- The 2090+ parking lot is the "shelved" sentinel, not a real due date.
      and (tp.fsrs_state->>'due')::timestamptz < timestamptz '2090-01-01'
  ),
  per_user as (
    select user_id, count(*) as card_count
    from affected
    group by user_id
  ),
  spread as (
    select
      a.id,
      -- Deal each user's over-cap cards across their own spread window, never
      -- past the cap itself.
      least(
        v_cap_days,
        floor(
          a.seq / greatest(
            1,
            ceil(
              p.card_count::numeric
              / greatest(v_min_days, ceil(p.card_count::numeric / v_per_day))
            )
          )
        )::integer
      ) as day_offset
    from affected a
    join per_user p on p.user_id = a.user_id
  )
  update public.training_progress tp
     set fsrs_state = jsonb_set(
           tp.fsrs_state,
           '{due}',
           to_jsonb(
             to_char(
               date_trunc('day', now() at time zone 'UTC') + make_interval(days => s.day_offset),
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
             )
           )
         ),
         updated_at = now()
    from spread s
   where tp.id = s.id;

  get diagnostics v_updated = row_count;
  raise notice 'W18 interval cap: pulled back % card(s) to within % days', v_updated, v_cap_days;
end $$;
