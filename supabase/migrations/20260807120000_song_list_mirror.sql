-- Pixeldrain is a single point of failure for every song list. Mirror each
-- list into Supabase Storage and keep the path on the row so reads can fall
-- back when Pixeldrain is cold or corrupt.

alter table public.song_lists
  add column if not exists songs_list_mirror_path text;

comment on column public.song_lists.songs_list_mirror_path is
  'Supabase Storage path in bucket song-list-mirrors; fallback when Pixeldrain fails.';
