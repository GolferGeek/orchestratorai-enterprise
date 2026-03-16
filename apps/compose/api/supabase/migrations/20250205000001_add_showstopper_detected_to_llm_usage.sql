-- Add showstopper_detected column to llm_usage table
-- This column tracks whether showstopper PII was detected during the request

ALTER TABLE public.llm_usage
ADD COLUMN IF NOT EXISTS showstopper_detected BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.llm_usage.showstopper_detected IS 'Whether showstopper PII was detected during this LLM request (triggers blocking)';

-- Create index for filtering/showstopper queries
CREATE INDEX IF NOT EXISTS llm_usage_showstopper_detected_idx ON public.llm_usage(showstopper_detected);

