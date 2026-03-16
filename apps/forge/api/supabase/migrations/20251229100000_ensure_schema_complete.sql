-- =============================================================================
-- ENSURE SCHEMA COMPLETE
-- =============================================================================
-- This migration ensures all required columns exist after a backup/restore.
-- Run this after restoring from a backup to fix any missing columns.
-- All statements use IF NOT EXISTS / IF EXISTS to be idempotent.
-- =============================================================================

-- =============================================================================
-- 1. PSEUDONYM_DICTIONARIES - Required by DictionaryPseudonymizerService
-- =============================================================================
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS organization_slug TEXT,
ADD COLUMN IF NOT EXISTS agent_slug TEXT;

CREATE INDEX IF NOT EXISTS pseudonym_dict_org_agent_idx
ON public.pseudonym_dictionaries(organization_slug, agent_slug)
WHERE is_active = true;

-- =============================================================================
-- 2. CIDAFM_COMMANDS - Required by CIDAFMService
-- =============================================================================
ALTER TABLE public.cidafm_commands
ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '^',
ADD COLUMN IF NOT EXISTS default_active BOOLEAN DEFAULT false;

-- Populate name from command_name if empty
UPDATE public.cidafm_commands SET name = command_name WHERE name IS NULL OR name = '';

CREATE INDEX IF NOT EXISTS cidafm_commands_type_idx ON public.cidafm_commands(type);
CREATE INDEX IF NOT EXISTS cidafm_commands_builtin_idx ON public.cidafm_commands(is_builtin);

-- =============================================================================
-- 3. ASSETS - Required by MediaStorageHelper
-- =============================================================================
-- Make legacy columns nullable (new media storage uses object_key instead)
DO $$
BEGIN
  -- Check if filename is NOT NULL and alter if so
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'assets'
    AND column_name = 'filename'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.assets ALTER COLUMN filename DROP NOT NULL;
  END IF;

  -- Check if file_path is NOT NULL and alter if so
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'assets'
    AND column_name = 'file_path'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.assets ALTER COLUMN file_path DROP NOT NULL;
  END IF;
END $$;

-- Add new media storage columns
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS storage TEXT DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS bucket TEXT,
ADD COLUMN IF NOT EXISTS object_key TEXT,
ADD COLUMN IF NOT EXISTS mime TEXT,
ADD COLUMN IF NOT EXISTS size INTEGER,
ADD COLUMN IF NOT EXISTS width INTEGER,
ADD COLUMN IF NOT EXISTS height INTEGER;

CREATE INDEX IF NOT EXISTS assets_bucket_idx ON public.assets(bucket);
CREATE INDEX IF NOT EXISTS assets_storage_idx ON public.assets(storage);

-- =============================================================================
-- 4. DELIVERABLE_VERSIONS - May be missing columns
-- =============================================================================
ALTER TABLE public.deliverable_versions
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by_type TEXT DEFAULT 'ai_response',
ADD COLUMN IF NOT EXISTS task_id UUID,
ADD COLUMN IF NOT EXISTS file_attachments JSONB DEFAULT '[]'::jsonb;

-- =============================================================================
-- SUCCESS NOTIFICATION
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Schema completeness check finished';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables verified:';
    RAISE NOTICE '  - pseudonym_dictionaries (data_type, category, is_active, org/agent scope)';
    RAISE NOTICE '  - cidafm_commands (is_builtin, name, type, default_active)';
    RAISE NOTICE '  - assets (storage, bucket, object_key, mime, size, width, height)';
    RAISE NOTICE '  - deliverable_versions (is_current_version, created_by_type, task_id, file_attachments)';
    RAISE NOTICE '================================================';
END $$;
