-- Update quiz_lobby_song_history to track by quiz_id only (not per room)
-- This migration adjusts indexes and trigger to ignore room_id

-- Drop the old indexes that included room_id
DROP INDEX IF EXISTS public.idx_quiz_lobby_song_history_quiz_room_played;
DROP INDEX IF EXISTS public.idx_quiz_lobby_song_history_quiz_room_song;

-- Create new indexes on quiz_id only
CREATE INDEX IF NOT EXISTS idx_quiz_lobby_song_history_quiz_played
    ON public.quiz_lobby_song_history(quiz_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_lobby_song_history_quiz_song
    ON public.quiz_lobby_song_history(quiz_id, "annSongId");

-- Update the trigger function to prune by quiz_id only (ignore room_id)
CREATE OR REPLACE FUNCTION public.prune_quiz_lobby_song_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete all but the 100 most recent rows for this quiz (globally, not per room)
    DELETE FROM public.quiz_lobby_song_history h
    WHERE h.id IN (
        SELECT id
        FROM public.quiz_lobby_song_history
        WHERE quiz_id = NEW.quiz_id
        ORDER BY played_at DESC, id DESC
        OFFSET 100
    );

    RETURN NEW;
END;
$$;

-- Update table comment to reflect global tracking
COMMENT ON TABLE public.quiz_lobby_song_history IS
  'Rolling history of songs played per quiz configuration (globally across all lobbies); used for prevent same song spam.';

COMMENT ON COLUMN public.quiz_lobby_song_history.room_id IS
  'AMQ lobby room ID; kept for reference but not used in history tracking (history is global per quiz).';

