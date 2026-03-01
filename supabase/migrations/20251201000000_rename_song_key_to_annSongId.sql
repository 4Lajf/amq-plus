-- Rename song_key to annSongId in training tables
-- This migration changes the primary song identifier field name

-- 1. Rename column in training_progress table
ALTER TABLE public.training_progress 
    RENAME COLUMN song_key TO "annSongId";

-- 2. Rename column in training_session_plays table  
ALTER TABLE public.training_session_plays 
    RENAME COLUMN song_key TO "annSongId";

-- 3. Drop old index that references song_key
DROP INDEX IF EXISTS idx_training_session_plays_user_quiz_song;

-- 4. Create new index with annSongId
CREATE INDEX IF NOT EXISTS idx_training_session_plays_user_quiz_song 
    ON public.training_session_plays(user_id, quiz_id, "annSongId", played_at DESC);

-- 5. Update comments
COMMENT ON COLUMN public.training_progress."annSongId" IS 'Unique song identifier in format: {artist}_{title}';
COMMENT ON COLUMN public.training_session_plays."annSongId" IS 'Unique song identifier in format: {artist}_{title}';

-- Note: The existing song_ann_id column (integer AMQ ID) is kept as-is for backward compatibility
-- The unique constraint (user_id, quiz_id, annSongId) is automatically updated with the column rename

