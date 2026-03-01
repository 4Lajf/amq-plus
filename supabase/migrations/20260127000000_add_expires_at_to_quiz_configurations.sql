-- Add expires_at column to quiz_configurations for temporary quizzes with specific expiry times
-- Used for room settings quizzes that expire after 1 hour

-- Add expires_at column if it doesn't exist
ALTER TABLE public.quiz_configurations 
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_quiz_configurations_expires_at 
ON public.quiz_configurations(expires_at) 
WHERE expires_at IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.quiz_configurations.expires_at IS 
'Explicit expiration timestamp for temporary quizzes. If set, the quiz will be deleted after this time. Used for room settings quizzes (1 hour expiry).';

-- Create function to clean up expired quizzes (both by expires_at and by last_played_at for is_temporary)
CREATE OR REPLACE FUNCTION public.cleanup_expired_quizzes() 
RETURNS TABLE(deleted_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  -- Delete quizzes that have explicit expires_at and have passed
  DELETE FROM public.quiz_configurations
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted = ROW_COUNT;
  
  -- Also delete temporary quizzes that haven't been played in 72 hours (existing behavior)
  DELETE FROM public.quiz_configurations
  WHERE is_temporary = true 
    AND expires_at IS NULL 
    AND (last_played_at IS NULL OR last_played_at < NOW() - INTERVAL '72 hours')
    AND created_at < NOW() - INTERVAL '72 hours';
  
  deleted := deleted + ROW_COUNT;
  
  RETURN QUERY SELECT deleted;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_quizzes() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_quizzes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_quizzes() TO service_role;

-- Add comment for the cleanup function
COMMENT ON FUNCTION public.cleanup_expired_quizzes() IS 
'Deletes expired quizzes: 1) Quizzes with explicit expires_at that have passed, 2) Temporary quizzes without expires_at that have not been played in 72 hours. Should be called periodically via pg_cron.';

-- Schedule cleanup job via pg_cron (runs every 15 minutes)
-- Note: pg_cron must be enabled in the database
-- This statement is idempotent - it will update the job if it already exists
DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any
    PERFORM cron.unschedule('cleanup_expired_quizzes');
    
    -- Schedule new job to run every 15 minutes
    PERFORM cron.schedule(
      'cleanup_expired_quizzes',
      '*/15 * * * *',
      'SELECT public.cleanup_expired_quizzes();'
    );
    
    RAISE NOTICE 'Scheduled cleanup_expired_quizzes job to run every 15 minutes';
  ELSE
    RAISE NOTICE 'pg_cron extension not available - cleanup job not scheduled. Please call cleanup_expired_quizzes() manually or via external cron.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %. Please call cleanup_expired_quizzes() manually or via external cron.', SQLERRM;
END;
$$;
