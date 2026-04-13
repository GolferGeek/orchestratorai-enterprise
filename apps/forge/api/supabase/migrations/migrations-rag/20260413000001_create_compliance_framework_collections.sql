-- =============================================================================
-- RAG DATABASE: Create Compliance Framework Collections
-- =============================================================================
-- Creates framework collections for the Regulatory Compliance Audit workflow.
-- Each collection holds the full text of a regulatory framework, chunked by
-- article/section for optimal RAG retrieval.
--
-- These are org-scoped, shared, read-only reference collections. The actual
-- framework text must be ingested separately (via seed script or manual upload).
--
-- See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.5.1
-- =============================================================================

SET search_path TO rag_data, public;

-- 1. GDPR — EU General Data Protection Regulation
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'big-ideas',
    'GDPR (EU General Data Protection Regulation)',
    'framework-gdpr',
    'Full text of the EU General Data Protection Regulation (GDPR). Articles 1-99, chunked by article/section. Used by the Compliance Audit workflow to cross-reference company policies against GDPR requirements.',
    'nomic-embed-text', 768, 1500, 300,
    'active', 'attributed',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 2. HIPAA — US Health Insurance Portability and Accountability Act
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'big-ideas',
    'HIPAA (Health Insurance Portability and Accountability Act)',
    'framework-hipaa',
    'Key provisions of HIPAA: Privacy Rule, Security Rule, Breach Notification Rule. Chunked by rule/section. Used by the Compliance Audit workflow for healthcare compliance assessments.',
    'nomic-embed-text', 768, 1500, 300,
    'active', 'attributed',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 3. SOX — US Sarbanes-Oxley Act
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'big-ideas',
    'SOX (Sarbanes-Oxley Act)',
    'framework-sox',
    'Key compliance sections of the Sarbanes-Oxley Act: Sections 302, 404, 409, 802, 906. Chunked by section. Used by the Compliance Audit workflow for financial reporting compliance assessments.',
    'nomic-embed-text', 768, 1500, 300,
    'active', 'attributed',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Compliance Framework Collections Created';
    RAISE NOTICE '================================================';
    RAISE NOTICE '1. framework-gdpr (GDPR)';
    RAISE NOTICE '2. framework-hipaa (HIPAA)';
    RAISE NOTICE '3. framework-sox (SOX)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'NOTE: Collections are empty. Ingest framework';
    RAISE NOTICE 'text via the seed script or manual upload.';
    RAISE NOTICE '================================================';
END $$;
