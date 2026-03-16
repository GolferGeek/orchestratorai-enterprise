-- Migration: Create get_global_model_config function
-- Returns the default LLM model configuration for the system

CREATE OR REPLACE FUNCTION public.get_global_model_config()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  -- Return a default model configuration
  -- This can be customized based on system preferences stored in a config table
  SELECT jsonb_build_object(
    'provider', 'anthropic',
    'model', 'claude-sonnet-4-5-20250929',
    'temperature', 0.7,
    'maxTokens', 8000
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_global_model_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_model_config() TO anon;
