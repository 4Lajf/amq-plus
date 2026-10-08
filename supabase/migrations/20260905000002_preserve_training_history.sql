-- Training history and inactive progress are retained until explicitly deleted
-- by the user. Supersedes the age-based retention jobs; deletes no user data.
DO $block$
DECLARE
  retention_job record;
BEGIN
  FOR retention_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('prune-training-session-plays', 'prune-inactive-training-progress')
       OR command ~ 'prune_(training_session_plays|inactive_training_progress)\s*\('
  LOOP
    PERFORM cron.unschedule(retention_job.jobid);
  END LOOP;
END;
$block$;

-- Keep the signatures for compatibility, but even a stale privileged caller
-- must not be able to run the retired age-based cleanup.
CREATE OR REPLACE FUNCTION public.prune_training_session_plays(p_retention interval DEFAULT interval '12 months')
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $fn$ SELECT 0; $fn$;

CREATE OR REPLACE FUNCTION public.prune_inactive_training_progress(p_retention interval DEFAULT interval '12 months')
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $fn$ SELECT 0; $fn$;

REVOKE ALL ON FUNCTION public.prune_training_session_plays(interval) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_inactive_training_progress(interval) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.prune_training_session_plays(interval) IS
  'Disabled: training play history is retained regardless of age. Compatibility no-op returns zero.';
COMMENT ON FUNCTION public.prune_inactive_training_progress(interval) IS
  'Disabled: inactive training progress is retained regardless of age. Compatibility no-op returns zero.';

-- Fail the migration if either cleanup remains scheduled or callable behavior
-- does not match the preservation policy.
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname IN ('prune-training-session-plays', 'prune-inactive-training-progress')
       OR command ~ 'prune_(training_session_plays|inactive_training_progress)\s*\('
  ) THEN
    RAISE EXCEPTION 'Training retention job is still scheduled';
  END IF;
  IF public.prune_training_session_plays(interval '0 days') <> 0
     OR public.prune_inactive_training_progress(interval '0 days') <> 0 THEN
    RAISE EXCEPTION 'Training retention functions must be no-ops';
  END IF;
END;
$verify$;
