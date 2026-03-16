-- =============================================================================
-- Create Legal Organization for Advanced RAG Demonstration
-- =============================================================================
-- Per Advanced RAG Implementation Plan
-- =============================================================================

-- Create the legal organization
INSERT INTO public.organizations (slug, name, description, settings, created_at, updated_at)
VALUES (
    'legal',
    'Legal',
    'Law firm RAG demonstration with 5 complexity types: attributed, hybrid, cross-reference, temporal, and basic',
    '{
        "theme": "light",
        "features": [
            "context-agents",
            "api-agents",
            "external-agents",
            "rag",
            "langgraph-agents"
        ],
        "limits": {
            "max_agents": 50,
            "max_conversations": 5000
        },
        "preferences": {
            "default_llm_provider": "ollama",
            "default_llm_model": "gpt-oss:20b"
        },
        "rag_demo": {
            "complexity_types": ["basic", "attributed", "hybrid", "cross-reference", "temporal"],
            "document_source": "docs/RAG-filler/law/"
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    settings = EXCLUDED.settings,
    updated_at = NOW();

COMMENT ON TABLE public.organizations IS 'Organizations including legal demo for advanced RAG features';
