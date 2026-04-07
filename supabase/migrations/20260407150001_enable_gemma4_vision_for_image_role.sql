-- =============================================================================
-- Enable Gemma 4 native vision for the Document Onboarding image role
-- =============================================================================
-- Gemma 4 (released 2026-04-02) ships with native multimodal support —
-- vision + audio — in its smallest local variants. The 8B `gemma4:e4b`
-- variant on the Mac Studio has a 16-block ViT baked into its gguf and
-- reports vision as a native capability via Ollama. No separate vision
-- pipeline is needed.
--
-- This migration flips the image role of the document-onboarding capability
-- from NULL/NULL to ollama/gemma4:e4b so scanned PDFs and image uploads
-- can route through the DocumentExtractionRouter's vision fallback path.
--
-- See: docs/efforts/current/prd.md  Phase 4
-- See: https://ai.google.dev/gemma/docs/core/model_card_4
-- Created: 2026-04-07
-- =============================================================================

UPDATE legal.capability_model_config
SET provider   = 'ollama',
    model      = 'gemma4:e4b',
    updated_at = now()
WHERE capability_slug = 'document-onboarding'
  AND role = 'image';

DO $$
DECLARE
    updated_count int;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Enabled Gemma 4 vision for document-onboarding image role (% row updated)', updated_count;
    RAISE NOTICE '================================================';
END $$;
