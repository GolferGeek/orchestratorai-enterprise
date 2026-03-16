-- =============================================================================
-- RAG DATABASE: Create Legal Collections for Advanced RAG Demo
-- =============================================================================
-- Creates 5 collections with different complexity types for legal documents
-- Per Advanced RAG Implementation Plan
-- =============================================================================

SET search_path TO rag_data, public;

-- =============================================================================
-- CREATE LEGAL COLLECTIONS
-- =============================================================================
-- Each collection demonstrates a different RAG complexity type

-- 1. Law Firm Policies - Attributed (with document citations)
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'legal',
    'Law Firm Policies (Attributed)',
    'law-firm-policies-attributed',
    'Internal firm policies including fee agreements, confidentiality, conflicts, and retention. Uses attributed search with document citations like [FP-001, Section 2.1].',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'attributed',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    complexity_type = EXCLUDED.complexity_type,
    updated_at = NOW();

-- 2. Law Contracts - Hybrid (keyword + semantic)
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'legal',
    'Law Contracts (Hybrid)',
    'law-contracts-hybrid',
    'Contract templates including NDAs, engagement letters, MSAs, and clause library. Uses hybrid search combining keyword matching with semantic understanding.',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'hybrid',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    complexity_type = EXCLUDED.complexity_type,
    updated_at = NOW();

-- 3. Law Litigation - Cross-Reference (linked documents)
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'legal',
    'Law Litigation (Cross-Reference)',
    'law-litigation-cross-reference',
    'Litigation checklists including motions, discovery, depositions, and trial prep. Uses cross-reference search to link related documents (e.g., discovery → motions → depositions).',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'cross-reference',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    complexity_type = EXCLUDED.complexity_type,
    updated_at = NOW();

-- 4. Law Client Intake - Temporal (version-aware)
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'legal',
    'Law Client Intake (Temporal)',
    'law-client-intake-temporal',
    'Client intake checklists with version history. Uses temporal search to track changes between document versions (v1.0 vs v2.0).',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'temporal',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    complexity_type = EXCLUDED.complexity_type,
    updated_at = NOW();

-- 5. Law Estate Planning - Attributed (with citations)
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'legal',
    'Law Estate Planning (Attributed)',
    'law-estate-planning-attributed',
    'Estate planning guides and templates. Uses attributed search with document citations for legal accuracy.',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'attributed',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    complexity_type = EXCLUDED.complexity_type,
    updated_at = NOW();

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Legal RAG Collections Created';
    RAISE NOTICE '================================================';
    RAISE NOTICE '1. law-firm-policies-attributed (attributed)';
    RAISE NOTICE '2. law-contracts-hybrid (hybrid)';
    RAISE NOTICE '3. law-litigation-cross-reference (cross-reference)';
    RAISE NOTICE '4. law-client-intake-temporal (temporal)';
    RAISE NOTICE '5. law-estate-planning-attributed (attributed)';
    RAISE NOTICE '================================================';
END $$;
