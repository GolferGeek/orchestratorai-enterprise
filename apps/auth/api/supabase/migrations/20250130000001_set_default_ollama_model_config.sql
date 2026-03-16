-- Migration: Set default global model configuration to Ollama with llama3.2:1b
-- This migration:
-- 1. Updates get_global_model_config() to read from system_settings table with fallback
-- 2. Inserts the default Ollama/llama3.2:1b configuration into system_settings

-- Update the function to read from system_settings table, with fallback to hardcoded default
CREATE OR REPLACE FUNCTION public.get_global_model_config()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  -- First try to get from system_settings table
  -- If not found, return a fallback default (Ollama/llama3.2:1b)
  SELECT COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'model_config_global'),
    jsonb_build_object(
      'provider', 'ollama',
      'model', 'llama3.2:1b',
      'parameters', jsonb_build_object(
        'temperature', 0.7,
        'maxTokens', 8000
      )
    )
  );
$$;

-- Insert the default Ollama/llama3.2:1b configuration into system_settings
-- Using INSERT ... ON CONFLICT to handle case where it already exists
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'model_config_global',
  jsonb_build_object(
    'provider', 'ollama',
    'model', 'llama3.2:1b',
    'parameters', jsonb_build_object(
      'temperature', 0.7,
      'maxTokens', 8000
    )
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) 
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = CURRENT_TIMESTAMP;

-- Grant execute permission to authenticated users (if not already granted)
GRANT EXECUTE ON FUNCTION public.get_global_model_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_model_config() TO anon;

