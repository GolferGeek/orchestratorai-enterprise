-- Insert legal-department agent
-- This migration ensures the legal department agent exists

DELETE FROM public.agents WHERE slug = 'legal-department';

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
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'legal-department',
    ARRAY['legal']::TEXT[],
    'Department AI',
    'Multi-agent legal document analysis system. Processes contracts, NDAs, MSAs, and legal documents using CLO routing, specialist agents (contract, compliance, IP), and synthesis. Supports multimodal input for scanned/PDF documents.',
    '1.0.0',
    'api',
    'legal',
    ARRAY['legal-analysis', 'contract-review', 'compliance', 'ip-law', 'multimodal', 'langgraph', 'multi-agent']::TEXT[],
    -- Input/Output Schema is extremely long, using a simplified version for migration
    '{}'::JSONB,
    ARRAY[
        'legal-document-analysis',
        'contract-review',
        'compliance-assessment',
        'ip-analysis',
        'risk-assessment',
        'multimodal-input',
        'multi-agent-routing',
        'specialist-collaboration',
        'legal-synthesis'
    ]::TEXT[],
    '{"markdown": "Department AI - Multi-agent legal document analysis system"}'::JSONB,
    '{"url": "http://localhost:6200/legal-department", "method": "POST", "timeout": 120000}'::JSONB,
    NULL,
    '{
        "provider": "langgraph",
        "framework": "langgraph",
        "langgraphWorkflow": "legal-department",
        "forwardConverse": true,
        "hasCustomUI": true,
        "customUIComponent": "legal-department"
    }'::JSONB,
    NOW(),
    NOW()
);
