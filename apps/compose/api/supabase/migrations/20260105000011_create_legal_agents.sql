-- =============================================================================
-- Create Legal RAG Agents for Advanced RAG Demo
-- =============================================================================
-- Creates 5 rag-runner agents, one for each complexity type collection
-- Per Advanced RAG Implementation Plan
-- =============================================================================

-- =============================================================================
-- 1. Legal Policies Agent (Attributed)
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'legal-policies-agent',
    ARRAY['legal'],
    'Legal Policies Assistant',
    'Answers questions about firm policies (fee agreements, confidentiality, conflicts, retention) with proper citations [FP-001, Section 2.1].',
    '1.0.0',
    'rag-runner',
    'legal',
    ARRAY['legal', 'policy', 'compliance', 'attributed', 'rag'],
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The policy-related question to answer"
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
                            "document_id": {"type": "string"},
                            "section": {"type": "string"},
                            "excerpt": {"type": "string"},
                            "score": {"type": "number"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    ARRAY['policy-lookup', 'compliance-check', 'citation-support'],
    'You are a Legal Policies Assistant. Answer questions about firm policies using the knowledge base. Always cite sources using document ID and section (e.g., [FP-001, Article II]).',
    NULL,
    '{"model": "gpt-oss:20b", "provider": "ollama", "parameters": {"temperature": 0.3, "maxTokens": 2000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "collection_slug": "law-firm-policies-attributed",
            "top_k": 5,
            "similarity_threshold": 0.6,
            "no_access_message": "I do not have access to the firm policies knowledge base.",
            "no_results_message": "I could not find relevant policy information. Please consult the policy manual directly."
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- 2. Legal Contracts Agent (Hybrid)
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'legal-contracts-agent',
    ARRAY['legal'],
    'Legal Contracts Assistant',
    'Finds contract clauses and templates using hybrid search (keyword + semantic). Great for finding specific terms like "indemnification" or "limitation of liability".',
    '1.0.0',
    'rag-runner',
    'legal',
    ARRAY['legal', 'contracts', 'templates', 'clauses', 'hybrid', 'rag'],
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The contract/clause question to search"
                }
            }
        },
        "output": {
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The answer with matching clauses"
                },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "document": {"type": "string"},
                            "match_type": {"type": "string", "enum": ["keyword", "semantic", "both"]},
                            "excerpt": {"type": "string"},
                            "score": {"type": "number"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    ARRAY['clause-search', 'template-lookup', 'contract-drafting'],
    'You are a Legal Contracts Assistant. Use hybrid search to find relevant contract clauses. Indicate whether matches are keyword-based (exact terms), semantic (meaning-based), or both.',
    NULL,
    '{"model": "gpt-oss:20b", "provider": "ollama", "parameters": {"temperature": 0.3, "maxTokens": 2000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "collection_slug": "law-contracts-hybrid",
            "top_k": 8,
            "similarity_threshold": 0.5,
            "no_access_message": "I do not have access to the contracts knowledge base.",
            "no_results_message": "I could not find relevant clauses. Consider using different search terms."
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- 3. Legal Litigation Agent (Cross-Reference)
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'legal-litigation-agent',
    ARRAY['legal'],
    'Legal Litigation Assistant',
    'Provides litigation guidance with cross-referenced documents. Links related checklists (motions → discovery → depositions → trial).',
    '1.0.0',
    'rag-runner',
    'legal',
    ARRAY['legal', 'litigation', 'motions', 'discovery', 'cross-reference', 'rag'],
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The litigation question to answer"
                }
            }
        },
        "output": {
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The answer with linked documents"
                },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "document_id": {"type": "string"},
                            "excerpt": {"type": "string"},
                            "score": {"type": "number"}
                        }
                    }
                },
                "related_documents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "document_id": {"type": "string"},
                            "title": {"type": "string"},
                            "relationship": {"type": "string"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    ARRAY['litigation-guidance', 'cross-reference', 'checklist-lookup'],
    'You are a Legal Litigation Assistant. Provide guidance on litigation procedures. Always mention related documents (e.g., "See also: Written Discovery Checklist [LIT-002]").',
    NULL,
    '{"model": "gpt-oss:20b", "provider": "ollama", "parameters": {"temperature": 0.3, "maxTokens": 2000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "collection_slug": "law-litigation-cross-reference",
            "top_k": 5,
            "similarity_threshold": 0.6,
            "no_access_message": "I do not have access to the litigation knowledge base.",
            "no_results_message": "I could not find relevant litigation guidance."
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- 4. Legal Intake Agent (Temporal)
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'legal-intake-agent',
    ARRAY['legal'],
    'Legal Intake Assistant',
    'Provides client intake guidance with version tracking. Shows what changed between document versions (v1.0 vs v2.0).',
    '1.0.0',
    'rag-runner',
    'legal',
    ARRAY['legal', 'intake', 'client', 'versions', 'temporal', 'rag'],
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The intake question to answer"
                },
                "compare_versions": {
                    "type": "boolean",
                    "description": "Whether to show version differences"
                }
            }
        },
        "output": {
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The answer with version info"
                },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "document": {"type": "string"},
                            "version": {"type": "string"},
                            "excerpt": {"type": "string"},
                            "score": {"type": "number"}
                        }
                    }
                },
                "version_changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "section": {"type": "string"},
                            "change_type": {"type": "string", "enum": ["added", "modified", "removed"]},
                            "description": {"type": "string"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    ARRAY['intake-guidance', 'version-tracking', 'change-detection'],
    'You are a Legal Intake Assistant. Help with client intake procedures. When relevant, indicate document versions and highlight changes between versions.',
    NULL,
    '{"model": "gpt-oss:20b", "provider": "ollama", "parameters": {"temperature": 0.3, "maxTokens": 2000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "collection_slug": "law-client-intake-temporal",
            "top_k": 5,
            "similarity_threshold": 0.6,
            "no_access_message": "I do not have access to the intake knowledge base.",
            "no_results_message": "I could not find relevant intake procedures."
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- 5. Legal Estate Planning Agent (Attributed)
-- =============================================================================
INSERT INTO public.agents (
    slug, organization_slug, name, description, version, agent_type,
    department, tags, io_schema, capabilities, context, endpoint,
    llm_config, metadata, created_at, updated_at
)
VALUES (
    'legal-estate-agent',
    ARRAY['legal'],
    'Legal Estate Planning Assistant',
    'Provides estate planning guidance with proper citations. Covers wills, trusts, POAs, and healthcare directives.',
    '1.0.0',
    'rag-runner',
    'legal',
    ARRAY['legal', 'estate', 'wills', 'trusts', 'attributed', 'rag'],
    '{
        "input": {
            "type": "object",
            "required": ["question"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The estate planning question to answer"
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
                            "document_id": {"type": "string"},
                            "section": {"type": "string"},
                            "excerpt": {"type": "string"},
                            "score": {"type": "number"}
                        }
                    }
                }
            }
        }
    }'::jsonb,
    ARRAY['estate-planning', 'wills', 'trusts', 'poa', 'healthcare-directives'],
    'You are a Legal Estate Planning Assistant. Answer questions about estate planning using the knowledge base. Always cite sources using document ID and section.',
    NULL,
    '{"model": "gpt-oss:20b", "provider": "ollama", "parameters": {"temperature": 0.3, "maxTokens": 2000}}'::jsonb,
    '{
        "author": "Orchestrator AI Team",
        "license": "PROPRIETARY",
        "rag_config": {
            "collection_slug": "law-estate-planning-attributed",
            "top_k": 5,
            "similarity_threshold": 0.6,
            "no_access_message": "I do not have access to the estate planning knowledge base.",
            "no_results_message": "I could not find relevant estate planning information."
        }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata,
    context = EXCLUDED.context,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- Success notification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Legal RAG Agents Created';
    RAISE NOTICE '================================================';
    RAISE NOTICE '1. legal-policies-agent (attributed) -> law-firm-policies-attributed';
    RAISE NOTICE '2. legal-contracts-agent (hybrid) -> law-contracts-hybrid';
    RAISE NOTICE '3. legal-litigation-agent (cross-reference) -> law-litigation-cross-reference';
    RAISE NOTICE '4. legal-intake-agent (temporal) -> law-client-intake-temporal';
    RAISE NOTICE '5. legal-estate-agent (attributed) -> law-estate-planning-attributed';
    RAISE NOTICE '================================================';
END $$;
