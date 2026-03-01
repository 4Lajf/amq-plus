-- Add function to auto-generate tokens for quiz_configurations
CREATE OR REPLACE FUNCTION generate_quiz_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate share_token if NULL (only for private quizzes)
  IF NEW.share_token IS NULL AND (NEW.is_public = false OR NEW.is_public IS NULL) THEN
    NEW.share_token := encode(gen_random_bytes(16), 'base64');
    -- Make it URL-safe by replacing characters
    NEW.share_token := replace(replace(replace(NEW.share_token, '+', '-'), '/', '_'), '=', '');
  END IF;
  
  -- Generate play_token if NULL (for all quizzes)
  IF NEW.play_token IS NULL THEN
    NEW.play_token := encode(gen_random_bytes(16), 'base64');
    -- Make it URL-safe by replacing characters
    NEW.play_token := replace(replace(replace(NEW.play_token, '+', '-'), '/', '_'), '=', '');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-generate tokens before insert
CREATE TRIGGER quiz_configurations_generate_tokens
  BEFORE INSERT ON quiz_configurations
  FOR EACH ROW
  EXECUTE FUNCTION generate_quiz_tokens();

-- Add comment explaining the trigger
COMMENT ON FUNCTION generate_quiz_tokens() IS 'Automatically generates share_token (for private quizzes) and play_token (for all quizzes) if they are NULL during insert';

-- Backfill existing quiz configurations that don't have tokens
UPDATE quiz_configurations
SET 
  share_token = CASE 
    WHEN share_token IS NULL AND (is_public = false OR is_public IS NULL)
    THEN replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '')
    ELSE share_token
  END,
  play_token = CASE 
    WHEN play_token IS NULL 
    THEN replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '')
    ELSE play_token
  END
WHERE share_token IS NULL OR play_token IS NULL;

