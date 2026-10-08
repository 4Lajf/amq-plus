-- Quiz Lobby Song History: track last 100 songs per quiz & AMQ room
-- File: supabase/migrations/20251211000000_quiz_lobby_song_history.sql

CREATE TABLE IF NOT EXISTS public.quiz_lobby_song_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id uuid NOT NULL REFERENCES public.quiz_configurations(id) ON DELETE CASCADE,
    room_id text NOT NULL,
    "annSongId" text NOT NULL,
    played_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for fast lookups by quiz + room and for membership checks
CREATE INDEX IF NOT EXISTS idx_quiz_lobby_song_history_quiz_room_played
    ON public.quiz_lobby_song_history(quiz_id, room_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_lobby_song_history_quiz_room_song
    ON public.quiz_lobby_song_history(quiz_id, room_id, "annSongId");

-- Enable Row Level Security (RLS); access from the app uses the service role key
ALTER TABLE public.quiz_lobby_song_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.quiz_lobby_song_history IS
  'Rolling history of songs played per quiz configuration and AMQ room; used for prevent same song spam.';

COMMENT ON COLUMN public.quiz_lobby_song_history.quiz_id IS
  'FK to quiz_configurations.id for the quiz this lobby is playing.';

COMMENT ON COLUMN public.quiz_lobby_song_history.room_id IS
  'AMQ lobby room ID; keeps history stable even if the quiz name changes.';

COMMENT ON COLUMN public.quiz_lobby_song_history."annSongId" IS
  'Song identifier matching the annSongId field on generated quiz songs; used to exclude recently played songs.';

COMMENT ON COLUMN public.quiz_lobby_song_history.played_at IS
  'Timestamp when the song was played in this room for this quiz.';

-- Trigger function to prune history to the most recent 100 songs per (quiz_id, room_id)
CREATE OR REPLACE FUNCTION public.prune_quiz_lobby_song_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete all but the 100 most recent rows for this quiz & room
    DELETE FROM public.quiz_lobby_song_history h
    WHERE h.id IN (
        SELECT id
        FROM public.quiz_lobby_song_history
        WHERE quiz_id = NEW.quiz_id
          AND room_id = NEW.room_id
        ORDER BY played_at DESC, id DESC
        OFFSET 100
    );

    RETURN NEW;
END;
$$;

-- Attach trigger to run after each insert
CREATE TRIGGER prune_quiz_lobby_song_history_trigger
AFTER INSERT ON public.quiz_lobby_song_history
FOR EACH ROW
EXECUTE FUNCTION public.prune_quiz_lobby_song_history();

