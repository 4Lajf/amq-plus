-- Song Categories: turn OFF the explicitly-stored `noCategory: true`.
--
-- NOT APPLIED. Applying is the owner's call, like every other migration here.
--
-- WHY THIS EXISTS
--
-- B1 (W3) made songs with no `songCategory` land in the "None" column - now
-- labelled "Unspecified" - instead of matching no column at all and being
-- dropped unreachably. That is the fix 3shine is blocked on.
--
-- Left at the usual "absent means enabled" default, it would also have widened
-- almost every existing Song Categories node: those songs would start appearing
-- in quizzes whose owners never asked for them. So the code default was flipped
-- (commit "Unspecified buckets where songs need them"): absent now resolves to
-- false, and SONG_CATEGORIES_DEFAULT_SETTINGS writes false.
--
-- That handled the 192 nodes with no `noCategory` key at all. It did NOT handle
-- nodes that store an explicit `true`, because a stored value is a user setting,
-- not a default - and code must not quietly overrule one. Changing those is a
-- data migration, which is this file.
--
-- The case for doing it: those values were almost certainly never chosen. The
-- editor's ensureBaseMatrix() writes every column from
-- SONG_CATEGORIES_DEFAULT_SETTINGS whenever a node is opened and a key is
-- absent, and that default used to be `true`. So "explicit true" mostly means
-- "the dialog was opened once", not "the user ticked Unspecified".
--
-- The case against, kept honest: some of these 99 quiz owners may genuinely want
-- metadata-less songs. They can tick the box again, and after this migration the
-- box means what it says.
--
-- SCOPE (measured 2026-08-11 against production, read-only)
--
--   song-categories nodes total                        303
--   ... with no `noCategory` key at all                192   <- untouched, code default covers them
--   ... with at least one row explicitly true          101
--   ... with at least one row explicitly false          17   <- untouched
--
--   row-level flips this migration performs            295
--     of those, viewMode simple/basic                  286
--     of those, viewMode advanced                        9   <- see note below
--     on nodes with enabled: false                       3
--   distinct quizzes touched                            99
--   temporary quizzes touched                            0
--   expired quizzes touched                              0
--
-- Advanced-mode nodes are included deliberately. Their basic-mode booleans are
-- not read while the node stays advanced, so flipping them changes nothing now -
-- but if the user switches back to simple, an untouched `true` would reintroduce
-- exactly the widening this migration exists to prevent.
--
-- WHAT IT DOES NOT DO
--
--   - It does not create the key where it is absent. jsonb_set is called with
--     create_if_missing = false throughout. Absent stays absent and is resolved
--     by the code default; writing 576 redundant `false`s would be churn.
--   - It does not touch `settings.advanced.<row>.noCategory`, which is an
--     OBJECT (min/max/enabled/...), not the boolean. Different path, never
--     matched. Verified: 0 of the target paths hold a non-boolean.
--   - It does not touch `updated_at`. A system-initiated default correction
--     must not masquerade as the owner editing their quiz - that column drives
--     "recently updated" ordering, and bumping 99 quizzes would reshuffle
--     people's lists for a change they did not make.
--
-- DRY RUN RESULT (computed in memory against production, nothing written)
--
--   quizzes rewritten                99
--   target `true` values remaining    0
--   quizzes with collateral change    0   <- with the three target paths blanked
--                                          in both old and new, the configs are
--                                          identical, so nothing else moved
--   route count changed               0
--   filter count changed              0
--
-- Route and filter ORDER is preserved explicitly via WITH ORDINALITY. jsonb_agg
-- without an ORDER BY would be free to reorder a user's routes, which decides
-- which route a generation picks.

begin;

-- Reversibility. 99 rows of jsonb; drop it once you are satisfied.
create table if not exists public.song_categories_nocategory_backup_20260811 (
  quiz_id uuid primary key,
  configuration_data jsonb not null,
  backed_up_at timestamptz not null default now()
);

comment on table public.song_categories_nocategory_backup_20260811 is
  'Pre-migration configuration_data for quizzes altered by '
  '20260811140000_song_categories_nocategory_default_off. Safe to drop once the '
  'change has been verified in production.';

-- Every other table in this schema has RLS on. A new table without it is a
-- finding in the next advisor run, and this one holds user quiz configs.
-- No policies: service-role access only, which is all a backup needs.
alter table public.song_categories_nocategory_backup_20260811 enable row level security;

insert into public.song_categories_nocategory_backup_20260811 (quiz_id, configuration_data)
select q.id, q.configuration_data
from public.quiz_configurations q
where jsonb_typeof(q.configuration_data->'routes') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(q.configuration_data->'routes') r,
         jsonb_array_elements(r->'filters') f
    where f->>'filterId' = 'song-categories'
      and (f->'settings'->'openings'->'noCategory' = 'true'::jsonb
        or f->'settings'->'endings'->'noCategory'  = 'true'::jsonb
        or f->'settings'->'inserts'->'noCategory'  = 'true'::jsonb)
  )
on conflict (quiz_id) do nothing;

update public.quiz_configurations q
set configuration_data = jsonb_set(
      q.configuration_data,
      '{routes}',
      (
        select coalesce(jsonb_agg(
                 case
                   when jsonb_typeof(r->'filters') = 'array' then
                     jsonb_set(
                       r,
                       '{filters}',
                       (
                         select coalesce(jsonb_agg(
                                  case
                                    when f->>'filterId' = 'song-categories' then
                                      jsonb_set(
                                        jsonb_set(
                                          jsonb_set(f, '{settings,openings,noCategory}', 'false'::jsonb, false),
                                          '{settings,endings,noCategory}', 'false'::jsonb, false),
                                        '{settings,inserts,noCategory}', 'false'::jsonb, false)
                                    else f
                                  end
                                  order by fo
                                ), '[]'::jsonb)
                         from jsonb_array_elements(r->'filters') with ordinality as tf(f, fo)
                       ),
                       false
                     )
                   else r
                 end
                 order by ro
               ), '[]'::jsonb)
        from jsonb_array_elements(q.configuration_data->'routes') with ordinality as tr(r, ro)
      ),
      false
    )
where jsonb_typeof(q.configuration_data->'routes') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(q.configuration_data->'routes') r,
         jsonb_array_elements(r->'filters') f
    where f->>'filterId' = 'song-categories'
      and (f->'settings'->'openings'->'noCategory' = 'true'::jsonb
        or f->'settings'->'endings'->'noCategory'  = 'true'::jsonb
        or f->'settings'->'inserts'->'noCategory'  = 'true'::jsonb)
  );

-- Refuse to commit if anything is left behind. Expected: 0.
do $$
declare
  remaining int;
  backed_up int;
begin
  select count(*) into remaining
  from public.quiz_configurations q,
       lateral jsonb_array_elements(q.configuration_data->'routes') r,
       lateral jsonb_array_elements(r->'filters') f
  where jsonb_typeof(q.configuration_data->'routes') = 'array'
    and f->>'filterId' = 'song-categories'
    and (f->'settings'->'openings'->'noCategory' = 'true'::jsonb
      or f->'settings'->'endings'->'noCategory'  = 'true'::jsonb
      or f->'settings'->'inserts'->'noCategory'  = 'true'::jsonb);

  select count(*) into backed_up
  from public.song_categories_nocategory_backup_20260811;

  if remaining <> 0 then
    raise exception
      'song-categories noCategory migration incomplete: % row(s) still true', remaining;
  end if;

  raise notice
    'song-categories noCategory: 0 explicit true remaining, % quiz config(s) backed up', backed_up;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (run after applying)
--
--   select count(*) as should_be_zero
--   from quiz_configurations q,
--        lateral jsonb_array_elements(q.configuration_data->'routes') r,
--        lateral jsonb_array_elements(r->'filters') f
--   where f->>'filterId' = 'song-categories'
--     and (f->'settings'->'openings'->'noCategory' = 'true'::jsonb
--       or f->'settings'->'endings'->'noCategory'  = 'true'::jsonb
--       or f->'settings'->'inserts'->'noCategory'  = 'true'::jsonb);
--
-- ROLLBACK (restores the exact pre-migration configs)
--
--   update quiz_configurations q
--   set configuration_data = b.configuration_data
--   from song_categories_nocategory_backup_20260811 b
--   where b.quiz_id = q.id;
--
-- CLEAN UP (once satisfied - this is what makes the rollback unavailable)
--
--   drop table song_categories_nocategory_backup_20260811;
-- ---------------------------------------------------------------------------
