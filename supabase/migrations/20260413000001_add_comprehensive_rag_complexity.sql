-- Add 'comprehensive' RAG complexity type
-- Comprehensive = hybrid search + attribution + cross-references + temporal awareness
-- Designed for high-stakes domains (legal, compliance) where maximum recall matters

ALTER TABLE rag_data.rag_collections DROP CONSTRAINT IF EXISTS valid_complexity_type;
ALTER TABLE rag_data.rag_collections ADD CONSTRAINT valid_complexity_type
  CHECK (complexity_type IN ('basic', 'attributed', 'hybrid', 'cross-reference', 'temporal', 'comprehensive'));

-- Set all legal collections to comprehensive
UPDATE rag_data.rag_collections
SET complexity_type = 'comprehensive'
WHERE organization_slug = 'legal';
