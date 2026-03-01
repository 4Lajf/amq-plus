-- Add is_active and inactivated_at columns to training_progress table
ALTER TABLE public.training_progress 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS inactivated_at TIMESTAMP WITH TIME ZONE;

-- Add index for performance when filtering by active status
CREATE INDEX IF NOT EXISTS idx_training_progress_is_active 
ON public.training_progress(is_active);

COMMENT ON COLUMN public.training_progress.is_active IS 'Whether the song is still part of the quiz pool. Inactive songs are skipped during training sessions.';
COMMENT ON COLUMN public.training_progress.inactivated_at IS 'Timestamp when the song was last marked as inactive. Used to shift due dates upon reactivation.';

