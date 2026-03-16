-- =============================================================================
-- UPDATE MARKETING AGENTS TO USE DIVERSE TYPES
-- =============================================================================
-- Changes the auto-selected agents from all "conversational" writers to
-- one of each type: conversational, creative, technical, persuasive
-- Same for editors and evaluators - one of each type instead of all same type
--
-- This provides better variety in the swarm by having different writing styles,
-- editing approaches, and evaluation perspectives.
--
-- Created: 2026-02-08
-- =============================================================================

-- =============================================================================
-- UPDATE AGENT LLM CONFIGS - Set defaults for diverse types
-- =============================================================================

-- Writers: One of each type with different providers
-- First, clear existing defaults for writers
UPDATE marketing.agent_llm_configs 
SET is_default = false 
WHERE agent_slug IN ('writer-conversational', 'writer-creative', 'writer-technical', 'writer-persuasive');

-- Conversational Writer - Anthropic (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('writer-conversational', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Creative Writer - Google (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('writer-creative', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Technical Writer - Grok (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('writer-technical', 'xai', 'grok-3', 'Grok 3', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Persuasive Writer - Ollama (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('writer-persuasive', 'ollama', 'qwen3:8b', 'Qwen 3 8B', true, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Editors: One of each type with different providers
-- First, clear existing defaults for editors
UPDATE marketing.agent_llm_configs 
SET is_default = false 
WHERE agent_slug IN ('editor-clarity', 'editor-brand', 'editor-engagement', 'editor-seo');

-- Clarity Editor - Anthropic (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('editor-clarity', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Brand Editor - Google (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('editor-brand', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Engagement Editor - Grok (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('editor-engagement', 'xai', 'grok-3', 'Grok 3', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- SEO Editor - Ollama (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('editor-seo', 'ollama', 'qwen3:8b', 'Qwen 3 8B', true, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Evaluators: One of each type with different providers
-- First, clear existing defaults for evaluators
UPDATE marketing.agent_llm_configs 
SET is_default = false 
WHERE agent_slug IN ('evaluator-quality', 'evaluator-conversion', 'evaluator-creativity');

-- Quality Evaluator - Anthropic (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('evaluator-quality', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Conversion Evaluator - Google (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('evaluator-conversion', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Creativity Evaluator - Grok (set as default)
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    ('evaluator-creativity', 'xai', 'grok-3', 'Grok 3', true, false)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = true,
    is_local = EXCLUDED.is_local;

-- Note: We only have 3 evaluator types, so we'll use 3 providers (Anthropic, Google, Grok)
-- If a 4th evaluator type is added later, it can use Ollama

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify we have one default config for each writer type
SELECT 
    'Writers' as category,
    agent_slug,
    llm_provider,
    llm_model,
    is_default
FROM marketing.agent_llm_configs
WHERE agent_slug IN ('writer-conversational', 'writer-creative', 'writer-technical', 'writer-persuasive')
  AND is_default = true
ORDER BY agent_slug;

-- Verify we have one default config for each editor type
SELECT 
    'Editors' as category,
    agent_slug,
    llm_provider,
    llm_model,
    is_default
FROM marketing.agent_llm_configs
WHERE agent_slug IN ('editor-clarity', 'editor-brand', 'editor-engagement', 'editor-seo')
  AND is_default = true
ORDER BY agent_slug;

-- Verify we have one default config for each evaluator type
SELECT 
    'Evaluators' as category,
    agent_slug,
    llm_provider,
    llm_model,
    is_default
FROM marketing.agent_llm_configs
WHERE agent_slug IN ('evaluator-quality', 'evaluator-conversion', 'evaluator-creativity')
  AND is_default = true
ORDER BY agent_slug;
