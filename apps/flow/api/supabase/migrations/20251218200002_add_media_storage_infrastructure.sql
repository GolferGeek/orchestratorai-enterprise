-- =============================================================================
-- ADD MEDIA STORAGE INFRASTRUCTURE
-- =============================================================================
-- Creates the media storage bucket and adds metadata column to assets table
-- Required for MediaAgentRunner image/video generation
-- Created: 2025-12-18
-- =============================================================================

-- Create media storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800,  -- 50MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Add metadata column to assets table for storing generation parameters
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE 'Media storage infrastructure created:';
    RAISE NOTICE '  - Storage bucket: media (50MB limit, public)';
    RAISE NOTICE '  - Assets table: metadata column added';
END $$;
