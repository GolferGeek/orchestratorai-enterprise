-- Migration: Fix cidafm_commands table schema
-- Adds missing columns required by the CIDAFM service

-- Add type column (user, response_modifier, state_modifier, etc.)
ALTER TABLE public.cidafm_commands
ADD COLUMN IF NOT EXISTS type text DEFAULT 'user';

-- Add name column (used for command identification)
ALTER TABLE public.cidafm_commands
ADD COLUMN IF NOT EXISTS name text;

-- Populate name from command_name for existing rows
UPDATE public.cidafm_commands
SET name = command_name
WHERE name IS NULL;

-- Make name NOT NULL after populating
ALTER TABLE public.cidafm_commands
ALTER COLUMN name SET NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS cidafm_commands_type_idx ON public.cidafm_commands(type);
CREATE INDEX IF NOT EXISTS cidafm_commands_name_idx ON public.cidafm_commands(name);

-- Update NULL values
UPDATE public.cidafm_commands
SET type = 'user'
WHERE type IS NULL;

UPDATE public.cidafm_commands
SET is_builtin = false
WHERE is_builtin IS NULL;
