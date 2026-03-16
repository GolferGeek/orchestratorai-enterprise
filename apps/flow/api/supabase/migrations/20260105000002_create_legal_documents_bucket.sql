-- =============================================================================
-- CREATE LEGAL DOCUMENTS STORAGE BUCKET
-- =============================================================================
-- Storage bucket for legal document uploads (NDAs, MSAs, contracts, etc.)
-- Structure: legal-documents/{orgSlug}/{analysisTaskId}/{originalFilename}
-- Created: 2026-01-05
-- =============================================================================

-- Create legal-documents storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'legal-documents',
    'legal-documents',
    false,  -- Private bucket for sensitive legal documents
    52428800,  -- 50MB limit
    ARRAY[
        -- PDF files
        'application/pdf',
        -- Microsoft Word files
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
        'application/msword',  -- .doc
        -- Images (for scanned documents)
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/tiff',
        -- Plain text and markdown
        'text/plain',
        'text/markdown'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- STORAGE POLICIES
-- =============================================================================
-- Organization-based access control:
-- - Users can only access files from their organization
-- - Path structure enforces: legal-documents/{orgSlug}/...
-- - Service role has full access for backend operations
-- =============================================================================

-- SELECT: Users can view files from their organization
CREATE POLICY "legal_documents_org_read"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'legal-documents' AND
    -- Extract orgSlug from path (legal-documents/{orgSlug}/...)
    (storage.foldername(name))[1] IN (
        SELECT organization_slug FROM public.rbac_user_org_roles
        WHERE user_id = auth.uid()
    )
);

-- INSERT: Users can upload files to their organization's folder
CREATE POLICY "legal_documents_org_insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'legal-documents' AND
    -- Extract orgSlug from path (legal-documents/{orgSlug}/...)
    (storage.foldername(name))[1] IN (
        SELECT organization_slug FROM public.rbac_user_org_roles
        WHERE user_id = auth.uid()
    )
);

-- UPDATE: Users can update metadata for their organization's files
CREATE POLICY "legal_documents_org_update"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'legal-documents' AND
    (storage.foldername(name))[1] IN (
        SELECT organization_slug FROM public.rbac_user_org_roles
        WHERE user_id = auth.uid()
    )
);

-- DELETE: Only org admins/owners can delete files
CREATE POLICY "legal_documents_org_admin_delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'legal-documents' AND
    (storage.foldername(name))[1] IN (
        SELECT r.organization_slug FROM public.rbac_user_org_roles r
        JOIN public.rbac_roles roles ON r.role_id = roles.id
        WHERE r.user_id = auth.uid() AND roles.name IN ('admin', 'owner')
    )
);

-- =============================================================================
-- SERVICE ROLE BYPASS (for backend operations)
-- =============================================================================

-- Allow service role full access for backend upload/download operations
CREATE POLICY "legal_documents_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'legal-documents')
WITH CHECK (bucket_id = 'legal-documents');

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
    RAISE NOTICE 'Legal documents storage bucket created';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Bucket: legal-documents (private, 50MB limit)';
    RAISE NOTICE 'Supported formats:';
    RAISE NOTICE '  - PDF (.pdf)';
    RAISE NOTICE '  - Microsoft Word (.docx, .doc)';
    RAISE NOTICE '  - Images (.png, .jpg, .jpeg, .tiff)';
    RAISE NOTICE '  - Text files (.txt, .md)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Path structure:';
    RAISE NOTICE '  legal-documents/{orgSlug}/{analysisTaskId}/{filename}';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Access control:';
    RAISE NOTICE '  - Organization-based RLS (users access only their org files)';
    RAISE NOTICE '  - Admins/owners can delete files';
    RAISE NOTICE '  - Service role has full access for backend operations';
    RAISE NOTICE '================================================';
END $$;
