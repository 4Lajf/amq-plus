-- Add song_ann_id column to training_progress table
-- This stores the AMQ annSongId for more reliable matching between progress records and quiz songs

ALTER TABLE training_progress 
ADD COLUMN IF NOT EXISTS song_ann_id INTEGER;

-- Add index on song_ann_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_training_progress_song_ann_id 
ON training_progress(song_ann_id);

-- Add comment to explain the column
COMMENT ON COLUMN training_progress.song_ann_id IS 'AMQ annSongId for reliable matching with quiz songs. Used as primary matching key over song_key format.';

