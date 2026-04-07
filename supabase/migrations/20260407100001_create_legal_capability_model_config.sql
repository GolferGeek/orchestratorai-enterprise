-- =============================================================================
-- legal.capability_model_config — per-capability, per-role model selection
-- =============================================================================
-- Each Legal Department capability (document-onboarding, future ones) has up
-- to three model "roles":
--   workhorse — heavy lifting (extraction, specialist analysis)
--   thinking  — synthesis, routing, reasoning
--   image     — vision-based extraction for scanned PDFs and images
--
-- A row holds the (provider, model) pair the worker should use when running
-- jobs for that capability/role. The Phase 4 settings UI reads/writes this
-- table; the worker reads it before invoking the LangGraph workflow.
--
-- See: docs/efforts/current/prd.md  Phase 4
-- Created: 2026-04-07
-- =============================================================================

CREATE TABLE legal.capability_model_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    capability_slug text NOT NULL,
    role            text NOT NULL CHECK (role IN ('workhorse','thinking','image')),
    provider        text,
    model           text,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (capability_slug, role)
);

CREATE INDEX legal_capability_model_config_slug_idx
    ON legal.capability_model_config (capability_slug);

COMMENT ON TABLE legal.capability_model_config IS
    'Per-capability, per-role model selection for Legal Department workflows.';
COMMENT ON COLUMN legal.capability_model_config.role IS
    'workhorse | thinking | image — see PRD Phase 4 model picker';

-- Seed defaults for Document Onboarding: gemma4:e4b for workhorse + thinking,
-- vision/image deliberately left null until a vision pipeline is wired.
INSERT INTO legal.capability_model_config (capability_slug, role, provider, model)
VALUES
    ('document-onboarding','workhorse','ollama','gemma4:e4b'),
    ('document-onboarding','thinking','ollama','gemma4:e4b'),
    ('document-onboarding','image',NULL,NULL);

ALTER TABLE legal.capability_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_capability_model_config" ON legal.capability_model_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'legal.capability_model_config created and seeded';
    RAISE NOTICE '================================================';
END $$;
