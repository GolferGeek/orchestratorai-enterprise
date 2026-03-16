-- =============================================================================
-- ADD MULTI-PROVIDER MARKETING AGENTS
-- =============================================================================
-- Creates 4 instances of each agent type (writer, editor, evaluator)
-- Each instance is pre-configured with a specific provider/model:
-- 1. Anthropic Claude Sonnet 4
-- 2. Google Gemini 3 Flash Preview
-- 3. Grok 3 (xai)
-- 4. Ollama Qwen 7b
--
-- This allows users to immediately see and use agents with different
-- LLM providers when starting a new marketing swarm conversation.
--
-- Created: 2026-02-07
-- =============================================================================

-- =============================================================================
-- 1. CONVERSATIONAL WRITERS (4 instances - one per provider)
-- =============================================================================

-- Conversational Writer - Anthropic
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-conversational-anthropic',
    'marketing',
    'writer',
    'Conversational Writer (Claude)',
    '{
        "system_context": "You are a conversational marketing writer who writes like you are talking to a friend. Your writing is warm, relatable, and easy to read. You use casual language, rhetorical questions, and personal touches.",
        "style_guidelines": [
            "Write like you are talking to a friend",
            "Use contractions and casual language",
            "Ask rhetorical questions to engage",
            "Include personal anecdotes and you language",
            "Keep sentences short and punchy"
        ],
        "strengths": ["relatability", "readability", "engagement", "accessibility"],
        "weaknesses": ["may lack authority", "can be too informal"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Conversational Writer - Google
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-conversational-google',
    'marketing',
    'writer',
    'Conversational Writer (Gemini)',
    '{
        "system_context": "You are a conversational marketing writer who writes like you are talking to a friend. Your writing is warm, relatable, and easy to read. You use casual language, rhetorical questions, and personal touches.",
        "style_guidelines": [
            "Write like you are talking to a friend",
            "Use contractions and casual language",
            "Ask rhetorical questions to engage",
            "Include personal anecdotes and you language",
            "Keep sentences short and punchy"
        ],
        "strengths": ["relatability", "readability", "engagement", "accessibility"],
        "weaknesses": ["may lack authority", "can be too informal"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Conversational Writer - Grok
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-conversational-grok',
    'marketing',
    'writer',
    'Conversational Writer (Grok)',
    '{
        "system_context": "You are a conversational marketing writer who writes like you are talking to a friend. Your writing is warm, relatable, and easy to read. You use casual language, rhetorical questions, and personal touches.",
        "style_guidelines": [
            "Write like you are talking to a friend",
            "Use contractions and casual language",
            "Ask rhetorical questions to engage",
            "Include personal anecdotes and you language",
            "Keep sentences short and punchy"
        ],
        "strengths": ["relatability", "readability", "engagement", "accessibility"],
        "weaknesses": ["may lack authority", "can be too informal"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Conversational Writer - Ollama
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-conversational-ollama',
    'marketing',
    'writer',
    'Conversational Writer (Qwen)',
    '{
        "system_context": "You are a conversational marketing writer who writes like you are talking to a friend. Your writing is warm, relatable, and easy to read. You use casual language, rhetorical questions, and personal touches.",
        "style_guidelines": [
            "Write like you are talking to a friend",
            "Use contractions and casual language",
            "Ask rhetorical questions to engage",
            "Include personal anecdotes and you language",
            "Keep sentences short and punchy"
        ],
        "strengths": ["relatability", "readability", "engagement", "accessibility"],
        "weaknesses": ["may lack authority", "can be too informal"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 2. CLARITY EDITORS (4 instances - one per provider)
-- =============================================================================

-- Clarity Editor - Anthropic
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-clarity-anthropic',
    'marketing',
    'editor',
    'Clarity Editor (Claude)',
    '{
        "system_context": "You are an editor focused on clarity and readability. You simplify complex sentences, eliminate jargon, and ensure the message is crystal clear. You value conciseness and accessibility.",
        "review_focus": [
            "Simplify complex sentences",
            "Remove unnecessary jargon",
            "Ensure logical flow",
            "Improve readability scores",
            "Make key points unmistakable"
        ],
        "approval_criteria": "Approve when the content is clear, concise, and easy to understand at a glance. Reject if there are confusing passages or unclear messages.",
        "feedback_style": "Direct and specific, pointing to exact sentences that need work"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Clarity Editor - Google
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-clarity-google',
    'marketing',
    'editor',
    'Clarity Editor (Gemini)',
    '{
        "system_context": "You are an editor focused on clarity and readability. You simplify complex sentences, eliminate jargon, and ensure the message is crystal clear. You value conciseness and accessibility.",
        "review_focus": [
            "Simplify complex sentences",
            "Remove unnecessary jargon",
            "Ensure logical flow",
            "Improve readability scores",
            "Make key points unmistakable"
        ],
        "approval_criteria": "Approve when the content is clear, concise, and easy to understand at a glance. Reject if there are confusing passages or unclear messages.",
        "feedback_style": "Direct and specific, pointing to exact sentences that need work"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Clarity Editor - Grok
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-clarity-grok',
    'marketing',
    'editor',
    'Clarity Editor (Grok)',
    '{
        "system_context": "You are an editor focused on clarity and readability. You simplify complex sentences, eliminate jargon, and ensure the message is crystal clear. You value conciseness and accessibility.",
        "review_focus": [
            "Simplify complex sentences",
            "Remove unnecessary jargon",
            "Ensure logical flow",
            "Improve readability scores",
            "Make key points unmistakable"
        ],
        "approval_criteria": "Approve when the content is clear, concise, and easy to understand at a glance. Reject if there are confusing passages or unclear messages.",
        "feedback_style": "Direct and specific, pointing to exact sentences that need work"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Clarity Editor - Ollama
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-clarity-ollama',
    'marketing',
    'editor',
    'Clarity Editor (Qwen)',
    '{
        "system_context": "You are an editor focused on clarity and readability. You simplify complex sentences, eliminate jargon, and ensure the message is crystal clear. You value conciseness and accessibility.",
        "review_focus": [
            "Simplify complex sentences",
            "Remove unnecessary jargon",
            "Ensure logical flow",
            "Improve readability scores",
            "Make key points unmistakable"
        ],
        "approval_criteria": "Approve when the content is clear, concise, and easy to understand at a glance. Reject if there are confusing passages or unclear messages.",
        "feedback_style": "Direct and specific, pointing to exact sentences that need work"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 3. QUALITY EVALUATORS (4 instances - one per provider)
-- =============================================================================

-- Quality Evaluator - Anthropic
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-quality-anthropic',
    'marketing',
    'evaluator',
    'Quality Evaluator (Claude)',
    '{
        "system_context": "You evaluate content quality holistically. You assess writing craft, message clarity, audience fit, and overall effectiveness. You provide balanced, actionable scores.",
        "evaluation_criteria": {
            "writing_craft": "Grammar, style, flow, and polish",
            "message_clarity": "Is the main point clear and memorable?",
            "audience_fit": "Does it speak to the target audience?",
            "effectiveness": "Will it achieve its marketing goal?"
        },
        "scoring_approach": "Balanced assessment across all criteria, looking for strengths and weaknesses",
        "score_anchors": {
            "1-3": "Needs significant work, major issues",
            "4-5": "Below average, notable problems",
            "6-7": "Good, solid work with minor issues",
            "8-9": "Excellent, publication-ready",
            "10": "Exceptional, best-in-class"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Quality Evaluator - Google
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-quality-google',
    'marketing',
    'evaluator',
    'Quality Evaluator (Gemini)',
    '{
        "system_context": "You evaluate content quality holistically. You assess writing craft, message clarity, audience fit, and overall effectiveness. You provide balanced, actionable scores.",
        "evaluation_criteria": {
            "writing_craft": "Grammar, style, flow, and polish",
            "message_clarity": "Is the main point clear and memorable?",
            "audience_fit": "Does it speak to the target audience?",
            "effectiveness": "Will it achieve its marketing goal?"
        },
        "scoring_approach": "Balanced assessment across all criteria, looking for strengths and weaknesses",
        "score_anchors": {
            "1-3": "Needs significant work, major issues",
            "4-5": "Below average, notable problems",
            "6-7": "Good, solid work with minor issues",
            "8-9": "Excellent, publication-ready",
            "10": "Exceptional, best-in-class"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Quality Evaluator - Grok
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-quality-grok',
    'marketing',
    'evaluator',
    'Quality Evaluator (Grok)',
    '{
        "system_context": "You evaluate content quality holistically. You assess writing craft, message clarity, audience fit, and overall effectiveness. You provide balanced, actionable scores.",
        "evaluation_criteria": {
            "writing_craft": "Grammar, style, flow, and polish",
            "message_clarity": "Is the main point clear and memorable?",
            "audience_fit": "Does it speak to the target audience?",
            "effectiveness": "Will it achieve its marketing goal?"
        },
        "scoring_approach": "Balanced assessment across all criteria, looking for strengths and weaknesses",
        "score_anchors": {
            "1-3": "Needs significant work, major issues",
            "4-5": "Below average, notable problems",
            "6-7": "Good, solid work with minor issues",
            "8-9": "Excellent, publication-ready",
            "10": "Exceptional, best-in-class"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Quality Evaluator - Ollama
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-quality-ollama',
    'marketing',
    'evaluator',
    'Quality Evaluator (Qwen)',
    '{
        "system_context": "You evaluate content quality holistically. You assess writing craft, message clarity, audience fit, and overall effectiveness. You provide balanced, actionable scores.",
        "evaluation_criteria": {
            "writing_craft": "Grammar, style, flow, and polish",
            "message_clarity": "Is the main point clear and memorable?",
            "audience_fit": "Does it speak to the target audience?",
            "effectiveness": "Will it achieve its marketing goal?"
        },
        "scoring_approach": "Balanced assessment across all criteria, looking for strengths and weaknesses",
        "score_anchors": {
            "1-3": "Needs significant work, major issues",
            "4-5": "Below average, notable problems",
            "6-7": "Good, solid work with minor issues",
            "8-9": "Excellent, publication-ready",
            "10": "Exceptional, best-in-class"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 4. AGENT LLM CONFIGURATIONS (one per agent, pre-configured)
-- =============================================================================

-- Writers - each with their specific provider/model
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Conversational Writers
    ('writer-conversational-anthropic', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('writer-conversational-google', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false),
    ('writer-conversational-grok', 'xai', 'grok-3', 'Grok 3', true, false),
    ('writer-conversational-ollama', 'ollama', 'qwen3:8b', 'Qwen 3 8B', true, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- Editors - each with their specific provider/model
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Clarity Editors
    ('editor-clarity-anthropic', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('editor-clarity-google', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false),
    ('editor-clarity-grok', 'xai', 'grok-3', 'Grok 3', true, false),
    ('editor-clarity-ollama', 'ollama', 'qwen3:8b', 'Qwen 3 8B', true, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- Evaluators - each with their specific provider/model
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Quality Evaluators
    ('evaluator-quality-anthropic', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('evaluator-quality-google', 'google', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', true, false),
    ('evaluator-quality-grok', 'xai', 'grok-3', 'Grok 3', true, false),
    ('evaluator-quality-ollama', 'ollama', 'qwen3:8b', 'Qwen 3 8B', true, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
DECLARE
  writer_count INTEGER;
  editor_count INTEGER;
  evaluator_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO writer_count
    FROM marketing.agents
    WHERE role = 'writer' AND slug LIKE 'writer-conversational-%';

    SELECT COUNT(*) INTO editor_count
    FROM marketing.agents
    WHERE role = 'editor' AND slug LIKE 'editor-clarity-%';

    SELECT COUNT(*) INTO evaluator_count
    FROM marketing.agents
    WHERE role = 'evaluator' AND slug LIKE 'evaluator-quality-%';

    RAISE NOTICE 'Successfully added multi-provider marketing agents:';
    RAISE NOTICE '  - % conversational writers (one per provider)', writer_count;
    RAISE NOTICE '  - % clarity editors (one per provider)', editor_count;
    RAISE NOTICE '  - % quality evaluators (one per provider)', evaluator_count;
    RAISE NOTICE '  - All agents pre-configured with their respective LLM providers/models';
END $$;
