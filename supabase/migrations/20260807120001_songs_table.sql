-- Local song metadata so training/play can survive AnisongDB outages.
-- Populated from masterlist.json via `npm run sync:songs` after a masterlist
-- refresh. payload holds the full song object.
--
-- RETIRED: the app no longer reads this table (masterlist.json only).
-- Dropped by 20260812191500_drop_songs_table.sql. Left intact so environments
-- that already applied this file keep a valid migration history.

create table if not exists public.songs (
  ann_song_id bigint primary key,
  mal_id integer,
  anilist_id integer,
  ann_id integer,
  song_name text,
  song_artist text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_songs_mal_id
  on public.songs (mal_id)
  where mal_id is not null;

create index if not exists idx_songs_anilist_id
  on public.songs (anilist_id)
  where anilist_id is not null;

alter table public.songs enable row level security;

comment on table public.songs is
  'Cached AnisongDB/masterlist song rows for offline-capable generation. RETIRED — drop via 20260812191500.';
