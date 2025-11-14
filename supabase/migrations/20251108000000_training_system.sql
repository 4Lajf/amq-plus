-- Training Mode System Tables
-- Creates tables for training mode with FSRS spaced repetition

-- Training tokens - one reusable token per user for connector authentication
CREATE TABLE IF NOT EXISTS public.training_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash text UNIQUE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Training progress - per-quiz, per-song detailed training metrics
CREATE TABLE IF NOT EXISTS public.training_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quiz_id uuid NOT NULL REFERENCES public.quiz_configurations(id) ON DELETE CASCADE,
    song_key text NOT NULL,
    fsrs_state jsonb NOT NULL DEFAULT '{
        "state": 0,
        "due": null,
        "stability": 0,
        "difficulty": 0,
        "elapsed_days": 0,
        "scheduled_days": 0,
        "reps": 0,
        "lapses": 0
    }'::jsonb,
    attempt_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    success_streak integer DEFAULT 0 NOT NULL,
    failure_streak integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    history jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(user_id, quiz_id, song_key)
);

-- Training sessions - historical session records
CREATE TABLE IF NOT EXISTS public.training_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quiz_id uuid NOT NULL REFERENCES public.quiz_configurations(id) ON DELETE CASCADE,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    total_songs integer DEFAULT 0 NOT NULL,
    correct_songs integer DEFAULT 0 NOT NULL,
    incorrect_songs integer DEFAULT 0 NOT NULL,
    session_data jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- Function to extract due timestamp from fsrs_state (IMMUTABLE for indexing)
CREATE OR REPLACE FUNCTION public.extract_fsrs_due(fsrs_state jsonb)
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE 
        WHEN fsrs_state->>'due' IS NULL OR fsrs_state->>'due' = 'null' THEN NULL
        ELSE (fsrs_state->>'due')::timestamp with time zone
    END;
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_progress_user_quiz 
    ON public.training_progress(user_id, quiz_id);

CREATE INDEX IF NOT EXISTS idx_training_progress_due 
    ON public.training_progress(public.extract_fsrs_due(fsrs_state));

CREATE INDEX IF NOT EXISTS idx_training_tokens_user 
    ON public.training_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_training_tokens_hash 
    ON public.training_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_training_sessions_user_quiz 
    ON public.training_sessions(user_id, quiz_id, ended_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_training_progress_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_training_progress_updated_at_trigger
    BEFORE UPDATE ON public.training_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_training_progress_updated_at();

-- Enable Row Level Security
ALTER TABLE public.training_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.training_tokens IS 'One reusable authentication token per user for connector access';
COMMENT ON TABLE public.training_progress IS 'Per-quiz, per-song training data with FSRS spaced repetition state';
COMMENT ON TABLE public.training_sessions IS 'Historical training session records';

COMMENT ON COLUMN public.training_tokens.token_hash IS 'Bcrypt hash of the authentication token';
COMMENT ON COLUMN public.training_progress.song_key IS 'Unique song identifier in format: {artist}_{title}';
COMMENT ON COLUMN public.training_progress.fsrs_state IS 'FSRS card state: due, stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days';
COMMENT ON COLUMN public.training_progress.history IS 'Array of attempts: [{timestamp, success, rating, time_spent}]';