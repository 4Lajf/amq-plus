-- Per-quiz toggle: allow Learning/short-step cards to return later the same day.
-- Default true matches the shipped same-day reviews behaviour.
-- When false, applyDuePolicy snaps sub-day dues to the next UTC day (old bump).

alter table public.quiz_configurations
  add column if not exists allow_same_day_reviews boolean not null default true;

comment on column public.quiz_configurations.allow_same_day_reviews is
  'When true (default), FSRS short-term steps may schedule a card later today. When false, sub-day dues bump to the next UTC day.';
