-- =============================================================================
-- FIX CIDAFM_COMMANDS SCHEMA
-- =============================================================================
-- Add missing columns required by CIDAFMService
-- The service queries: id, name, type, description, is_builtin, default_active
-- But the table only has: command_name, prompt_template, example_usage, etc.
-- =============================================================================

-- Add missing columns
ALTER TABLE public.cidafm_commands
ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '^',
ADD COLUMN IF NOT EXISTS default_active BOOLEAN DEFAULT false;

-- Update name from command_name for existing rows
UPDATE public.cidafm_commands SET name = command_name WHERE name IS NULL OR name = '';

-- Add comments for documentation
COMMENT ON COLUMN public.cidafm_commands.is_builtin IS 'Whether this is a built-in command (true) or user-created (false)';
COMMENT ON COLUMN public.cidafm_commands.name IS 'Short name of the command (used in CIDAFM syntax)';
COMMENT ON COLUMN public.cidafm_commands.type IS 'Command type: ^ (response modifier), & (state modifier), ! (execution)';
COMMENT ON COLUMN public.cidafm_commands.default_active IS 'Whether this command is active by default';

-- Create index for type lookups
CREATE INDEX IF NOT EXISTS cidafm_commands_type_idx ON public.cidafm_commands(type);
CREATE INDEX IF NOT EXISTS cidafm_commands_builtin_idx ON public.cidafm_commands(is_builtin);

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'CIDAFM commands schema fixed:';
    RAISE NOTICE '  - Added is_builtin column';
    RAISE NOTICE '  - Added name column';
    RAISE NOTICE '  - Added type column';
    RAISE NOTICE '  - Added default_active column';
    RAISE NOTICE '  - Added type and builtin indexes';
    RAISE NOTICE '================================================';
END $$;
