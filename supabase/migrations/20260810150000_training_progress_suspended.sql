-- R9: user-owned suspend flag for training songs.
--
-- The obvious implementation is `is_active = false`, and that is a trap:
-- is_active is machine-owned. sessionStartService.js re-derives it from pool
-- membership on every session start, so a song the user suspended is flipped
-- back to active the next time they play a quiz that still contains it. That is
-- almost certainly why the old "mastered" category was removed rather than
-- fixed.
--
-- suspended_at is owned by the user and nothing else writes it. The pool sync
-- skips suspended rows entirely - they neither reactivate nor deactivate - so a
-- suspension survives until the user lifts it.
--
-- Requested by lng, doomchicken, Cherryish, 3shine and TriusHalf between
-- 2026-03-05 and 2026-07-25.

alter table public.training_progress
  add column if not exists suspended_at timestamptz;

comment on column public.training_progress.suspended_at is
  'User-set suspension. Non-null = excluded from every selection path until the user unsuspends. Distinct from is_active, which is derived from pool membership.';

-- Selection filters read "not suspended" on every session start, always scoped
-- to one user and quiz.
create index if not exists idx_training_progress_suspended
  on public.training_progress (user_id, quiz_id)
  where suspended_at is not null;
