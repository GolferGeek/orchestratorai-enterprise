-- =============================================================================
-- CREATE ENGINEERING STORAGE BUCKET
-- =============================================================================
-- Storage bucket for CAD files: STEP, STL, GLTF, DXF, thumbnails
-- Structure: engineering/projects/{projectId}/drawings/{drawingId}/*.{ext}
-- Created: 2025-12-29
-- =============================================================================

-- Create engineering storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'engineering',
    'engineering',
    true,  -- Public for easy 3D viewer access
    104857600,  -- 100MB limit (CAD files can be large)
    ARRAY[
        -- STEP files
        'application/step',
        'application/x-step',
        'model/step',
        -- STL files
        'application/sla',
        'model/stl',
        'model/x.stl-ascii',
        'model/x.stl-binary',
        'application/vnd.ms-pki.stl',
        -- GLTF files
        'model/gltf+json',
        'model/gltf-binary',
        'application/octet-stream',  -- For .glb files
        -- DXF files
        'image/vnd.dxf',
        'application/dxf',
        -- Images (thumbnails)
        'image/png',
        'image/jpeg',
        'image/webp'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- STORAGE POLICIES
-- =============================================================================

-- Allow authenticated users to read files from engineering bucket
-- (actual access control is done via RLS on engineering.cad_outputs)
CREATE POLICY "engineering_bucket_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'engineering');

-- Allow service role to insert files
CREATE POLICY "engineering_bucket_insert_service"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'engineering');

-- Allow service role to update files
CREATE POLICY "engineering_bucket_update_service"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'engineering');

-- Allow service role to delete files
CREATE POLICY "engineering_bucket_delete_service"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'engineering');

-- =============================================================================
-- NOTIFY
-- =============================================================================

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Engineering storage bucket created';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Bucket: engineering (public, 100MB limit)';
    RAISE NOTICE 'Supported formats:';
    RAISE NOTICE '  - STEP (.step, .stp)';
    RAISE NOTICE '  - STL (.stl)';
    RAISE NOTICE '  - GLTF (.gltf, .glb)';
    RAISE NOTICE '  - DXF (.dxf)';
    RAISE NOTICE '  - Images (.png, .jpg, .webp)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Path structure:';
    RAISE NOTICE '  engineering/projects/{projectId}/drawings/{drawingId}/*.{ext}';
    RAISE NOTICE '================================================';
END $$;
