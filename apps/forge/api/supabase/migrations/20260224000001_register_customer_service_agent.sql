-- =============================================================================
-- Register Customer Service Agent
-- =============================================================================
-- Registers the customer service agent and makes it available to
-- demo-org and rapid-ai organizations.
-- =============================================================================

-- =============================================================================
-- 1. Insert the agent
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'customer-service',
    ARRAY['demo-org', 'rapid-ai'],
    'Customer Service',
    'AI-powered customer service agent for Orchestrator AI. Answers questions about the platform, pricing, and how to get started. Supports both text and voice interaction modes.',
    '1.0.0',
    'langgraph',
    'customer-service',
    ARRAY['customer-service', 'voice', 'text', 'support', 'langgraph'],
    '{
        "input": {
            "type": "object",
            "required": ["userMessage"],
            "properties": {
                "userMessage": {
                    "type": "string",
                    "description": "The user''s message or question"
                },
                "interactionMode": {
                    "type": "string",
                    "enum": ["text", "voice"],
                    "description": "Whether the user is in text or voice mode (affects response length)"
                }
            }
        },
        "output": {
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The assistant''s response"
                }
            }
        }
    }'::jsonb,
    ARRAY['converse'],
    'You are the Orchestrator AI assistant. You answer questions about the Orchestrator AI platform, explain pricing, help visitors understand use cases, and guide them toward getting started. You are friendly, concise, and professional. In voice mode, keep responses to 2-3 sentences. Never make up features or pricing not in your knowledge base. When unsure, provide contact info: hello@orchestrator-ai.com or 763-220-0146.',
    NULL,
    '{"model": "claude-sonnet-4-6", "provider": "anthropic", "parameters": {"temperature": 0.7, "maxTokens": 1000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "MIT",
        "provider": "langgraph",
        "framework": "langgraph",
        "forwardConverse": true,
        "supportsVoice": true
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- 2. Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Customer Service Agent Registered';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'slug: customer-service';
    RAISE NOTICE 'type: langgraph (direct invocation)';
    RAISE NOTICE 'orgs: demo-org, rapid-ai';
    RAISE NOTICE 'supportsVoice: true';
    RAISE NOTICE '================================================';
END $$;
