-- Training Session Plays Table
-- Records individual song attempts within a session for detailed history

CREATE TABLE IF NOT EXISTS public.training_session_plays (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
    quiz_id uuid NOT NULL REFERENCES public.quiz_configurations(id) ON DELETE CASCADE,
    song_key text NOT NULL,
    song_ann_id integer,
    
    played_at timestamp with time zone DEFAULT now() NOT NULL,
    rating integer NOT NULL, -- FSRS rating (1-4)
    success boolean NOT NULL,
    
    user_answer text,
    correct_answer text,
    time_spent_ms integer,
    answer_data jsonb DEFAULT '{}'::jsonb,
    
    -- Store FSRS state snapshot before and after this attempt
    -- This allows replaying history or undoing specific attempts
    fsrs_before jsonb,
    fsrs_after jsonb,
    
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.training_session_plays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own session plays"
    ON public.training_session_plays FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own session plays"
    ON public.training_session_plays FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own session plays"
    ON public.training_session_plays FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own session plays"
    ON public.training_session_plays FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_session_plays_session 
    ON public.training_session_plays(session_id, played_at);

CREATE INDEX IF NOT EXISTS idx_training_session_plays_user_quiz_song 
    ON public.training_session_plays(user_id, quiz_id, song_key, played_at DESC);

COMMENT ON TABLE public.training_session_plays IS 'Individual song attempts within a training session';

