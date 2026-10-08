-- Drop the Supabase Storage song-list mirror added in Phase 2.4.
--
-- The mirror held 385 objects / ~975 MB of paid storage to protect data that is
-- reproducible: a song list is a set of annSongIds the user assembled, and the
-- things that are not reproducible - quiz configurations and training progress -
-- already live in Postgres. Every one of the 388 lists has a Pixeldrain link, so
-- the mirror was a second copy of a second copy.
--
-- Durability for song lists is now the export button instead (docs/REMAINING.md
-- R12), which is what Cherryish actually asked for in May.
--
-- The bucket and its objects were removed via the Storage API before this ran.

alter table public.song_lists drop column if exists songs_list_mirror_path;
