-- Migration: Add is_builtin column to cidafm_commands table
-- This column identifies system built-in commands vs user-created commands

ALTER TABLE public.cidafm_commands
ADD COLUMN is_builtin boolean DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS cidafm_commands_is_builtin_idx ON public.cidafm_commands(is_builtin);

-- Update existing commands to be marked as user commands (not built-in)
UPDATE public.cidafm_commands SET is_builtin = false WHERE is_builtin IS NULL;
