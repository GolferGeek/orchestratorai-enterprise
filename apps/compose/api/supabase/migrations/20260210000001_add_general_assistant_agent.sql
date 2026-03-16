-- =============================================================================
-- ADD GENERAL ASSISTANT CONTEXT AGENT
-- =============================================================================
-- A general-purpose chat agent for open-ended conversations.
-- Supports document and image understanding via multimodal support.
-- Available to all orgs via ARRAY['global']::TEXT[]
-- Created: 2026-02-10
-- =============================================================================

INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    llm_config,
    metadata
) VALUES (
    'general-assistant',
    ARRAY['global']::TEXT[],
    'General Assistant',
    'A helpful AI assistant for open-ended conversations. Can discuss any topic, answer questions, help with analysis, and process uploaded documents and images.',
    '1.0.0',
    'context',
    'general',
    ARRAY['chat', 'conversation', 'general-purpose', 'assistant', 'multimodal']::TEXT[],

    -- io_schema: open-ended text in/out
    '{
        "input": {
            "type": "object",
            "properties": {
                "message": { "type": "string", "description": "User message" },
                "documents": { "type": "array", "description": "Optional uploaded documents or images" }
            },
            "required": ["message"]
        },
        "output": {
            "type": "object",
            "properties": {
                "message": { "type": "string", "description": "Assistant response" }
            }
        }
    }'::JSONB,

    -- capabilities
    ARRAY['converse', 'multimodal', 'document-understanding', 'image-understanding']::TEXT[],

    -- context: system prompt and configuration
    '{
        "system_prompt": "You are a helpful, knowledgeable AI assistant. You can discuss any topic, answer questions, help with analysis and writing, and process uploaded documents and images.\n\nWhen documents are uploaded, carefully read and reference the extracted text provided in the prompt.\n\nWhen images are uploaded, describe what you see and answer questions about the visual content.\n\nBe conversational, accurate, and helpful. Ask clarifying questions when the user''s intent is ambiguous.",
        "conversation_guidelines": "Be friendly and professional. Provide thorough but concise answers. Use markdown formatting when it improves readability. Cite specific parts of uploaded documents when referencing them."
    }'::JSONB,

    -- llm_config: defaults (frontend can override via ExecutionContext)
    '{
        "temperature": 0.7,
        "maxTokens": 4000
    }'::JSONB,

    -- metadata: execution profile and capabilities
    '{
        "execution_profile": "conversation_only",
        "execution_modes": ["immediate"],
        "execution_capabilities": {
            "can_converse": true,
            "can_plan": false,
            "can_build": false,
            "requires_human_gate": false
        },
        "multimodal": {
            "supports_images": true,
            "supports_documents": true,
            "vision_capable": true
        }
    }'::JSONB
) ON CONFLICT (slug) DO UPDATE SET
    organization_slug = EXCLUDED.organization_slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    agent_type = EXCLUDED.agent_type,
    department = EXCLUDED.department,
    tags = EXCLUDED.tags,
    io_schema = EXCLUDED.io_schema,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
