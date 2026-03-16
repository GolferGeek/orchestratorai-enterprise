-- =============================================================================
-- FIX ASSETS TABLE FOR MEDIA STORAGE
-- =============================================================================
-- Add missing columns required by MediaStorageHelper
-- The service inserts: storage, bucket, object_key, mime, size, width, height
-- Also make filename/file_path nullable since new storage uses object_key
-- =============================================================================

-- Make legacy columns nullable (new media storage uses object_key instead)
ALTER TABLE public.assets ALTER COLUMN filename DROP NOT NULL;
ALTER TABLE public.assets ALTER COLUMN file_path DROP NOT NULL;

-- Add missing columns for media storage
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS storage TEXT DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS bucket TEXT,
ADD COLUMN IF NOT EXISTS object_key TEXT,
ADD COLUMN IF NOT EXISTS mime TEXT,
ADD COLUMN IF NOT EXISTS size INTEGER,
ADD COLUMN IF NOT EXISTS width INTEGER,
ADD COLUMN IF NOT EXISTS height INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN public.assets.storage IS 'Storage provider (supabase, s3, etc.)';
COMMENT ON COLUMN public.assets.bucket IS 'Storage bucket name';
COMMENT ON COLUMN public.assets.object_key IS 'Storage object key/path';
COMMENT ON COLUMN public.assets.mime IS 'MIME type of the asset';
COMMENT ON COLUMN public.assets.size IS 'File size in bytes';
COMMENT ON COLUMN public.assets.width IS 'Image/video width in pixels';
COMMENT ON COLUMN public.assets.height IS 'Image/video height in pixels';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS assets_bucket_idx ON public.assets(bucket);
CREATE INDEX IF NOT EXISTS assets_storage_idx ON public.assets(storage);

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Assets table media columns added:';
    RAISE NOTICE '  - storage (default: supabase)';
    RAISE NOTICE '  - bucket';
    RAISE NOTICE '  - object_key';
    RAISE NOTICE '  - mime';
    RAISE NOTICE '  - size';
    RAISE NOTICE '  - width';
    RAISE NOTICE '  - height';
    RAISE NOTICE '================================================';
END $$;
