-- Retire Phase 2.5 public.songs.
-- Song metadata lives only in the bundled masterlist.json; the Postgres copy
-- was a cache with masterlist fallback and is no longer read by the app.

drop table if exists public.songs;
