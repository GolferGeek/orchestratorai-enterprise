-- =============================================================================
-- Create HR Assistant RAG Agent for Human Resources Organization
-- =============================================================================
-- Uses the "HR Policy" RAG collection (efc9c5ac-84cc-4242-8bf4-f236eff4dd18)
-- =============================================================================

-- Update the HR Policy collection to belong to the human-resources org
UPDATE rag_data.rag_collections
SET organization_slug = 'human-resources'
WHERE id = 'efc9c5ac-84cc-4242-8bf4-f236eff4dd18';

-- Create the HR Assistant agent
INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    capabilities,
    context,
    llm_config,
    metadata,
    io_schema
)
VALUES (
    'hr-assistant',
    ARRAY['human-resources'],
    'HR Assistant',
    'Answers questions about HR policies, employee handbooks, benefits, and workplace guidelines with proper citations.',
    '1.0.0',
    'rag-runner',
    'human-resources',
    ARRAY['hr', 'policy', 'benefits', 'employee', 'handbook', 'rag'],
    ARRAY['policy-lookup', 'benefits-inquiry', 'handbook-reference', 'citation-support'],
    'You are an HR Assistant. Answer questions about human resources policies, employee benefits, workplace guidelines, and company handbooks using the knowledge base. Always cite the source document when providing information. Be helpful and clear, but remind users to consult HR directly for sensitive or case-specific matters.',
    '{"model": "claude-sonnet-4-6", "provider": "anthropic", "parameters": {"maxTokens": 2000, "temperature": 0.3}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "top_k": 5,
            "collection_slug": "hr-policy",
            "no_access_message": "I do not have access to the HR knowledge base.",
            "no_results_message": "I could not find relevant HR policy information. Please contact your HR representative directly.",
            "similarity_threshold": 0.3
        }
    }'::jsonb,
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The HR policy-related question to answer"
                }
            }
        },
        "output": {
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The answer with document citations"
                },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "score": {"type": "number"},
                            "excerpt": {"type": "string"},
                            "section": {"type": "string"},
                            "document_id": {"type": "string"}
                        }
                    }
                }
            }
        }
    }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    organization_slug = EXCLUDED.organization_slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    agent_type = EXCLUDED.agent_type,
    department = EXCLUDED.department,
    tags = EXCLUDED.tags,
    capabilities = EXCLUDED.capabilities,
    context = EXCLUDED.context,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    io_schema = EXCLUDED.io_schema,
    updated_at = NOW();
