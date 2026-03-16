-- =============================================================================
-- LEGAL DEPARTMENT AI AGENT REGISTRATION
-- =============================================================================
-- Registers legal-department as a LangGraph agent for legal document analysis
-- Multi-agent system with CLO routing, specialist agents, and synthesis
-- Created: 2025-01-05
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
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'legal-department',
    ARRAY['demo-org', 'global']::TEXT[],
    'Legal Department AI',
    'Multi-agent legal document analysis system. Processes contracts, NDAs, MSAs, and legal documents using CLO routing, specialist agents (contract, compliance, IP), and synthesis. Supports multimodal input for scanned/PDF documents.',
    '1.0.0',
    'api',
    'legal',
    ARRAY['legal-analysis', 'contract-review', 'compliance', 'ip-law', 'multimodal', 'langgraph', 'multi-agent']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "required": ["task"],
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Natural language description of the legal analysis task"
                },
                "documentType": {
                    "type": "string",
                    "enum": ["contract", "nda", "msa", "policy", "terms", "ip", "compliance", "general"],
                    "default": "general",
                    "description": "Type of legal document to analyze"
                },
                "documents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "URL to document (PDF, image, text)"
                            },
                            "fileName": {
                                "type": "string",
                                "description": "Original filename"
                            },
                            "mimeType": {
                                "type": "string",
                                "enum": ["application/pdf", "image/png", "image/jpeg", "text/plain"],
                                "description": "Document MIME type"
                            }
                        }
                    },
                    "description": "Documents to analyze (supports multimodal input)"
                },
                "analysisDepth": {
                    "type": "string",
                    "enum": ["quick", "standard", "comprehensive"],
                    "default": "standard",
                    "description": "Depth of legal analysis to perform"
                },
                "focusAreas": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["liability", "termination", "payment", "ip-rights", "confidentiality", "compliance", "warranties", "indemnification"]
                    },
                    "description": "Specific legal areas to focus on"
                },
                "jurisdiction": {
                    "type": "string",
                    "description": "Legal jurisdiction for analysis (e.g., US, UK, EU)"
                },
                "context": {
                    "type": "object",
                    "properties": {
                        "organizationSlug": {
                            "type": "string",
                            "description": "Organization requesting analysis"
                        },
                        "userId": {
                            "type": "string",
                            "description": "User requesting analysis"
                        },
                        "conversationId": {
                            "type": "string",
                            "description": "Conversation/thread ID for context"
                        }
                    }
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "taskId": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Unique identifier for this analysis task"
                },
                "status": {
                    "type": "string",
                    "enum": ["queued", "routing", "analyzing", "synthesizing", "completed", "failed"],
                    "description": "Current status of the analysis"
                },
                "routing": {
                    "type": "object",
                    "properties": {
                        "cloAssessment": {
                            "type": "string",
                            "description": "CLO initial assessment and routing decision"
                        },
                        "assignedAgents": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["contract-specialist", "compliance-specialist", "ip-specialist"]
                            },
                            "description": "Which specialist agents were assigned"
                        }
                    }
                },
                "specialistAnalyses": {
                    "type": "object",
                    "properties": {
                        "contractSpecialist": {
                            "type": "object",
                            "description": "Contract law specialist analysis"
                        },
                        "complianceSpecialist": {
                            "type": "object",
                            "description": "Compliance specialist analysis"
                        },
                        "ipSpecialist": {
                            "type": "object",
                            "description": "IP law specialist analysis"
                        }
                    }
                },
                "synthesis": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "Executive summary of legal analysis"
                        },
                        "keyFindings": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "area": { "type": "string" },
                                    "finding": { "type": "string" },
                                    "severity": {
                                        "type": "string",
                                        "enum": ["low", "medium", "high", "critical"]
                                    },
                                    "recommendation": { "type": "string" }
                                }
                            },
                            "description": "Key legal findings and recommendations"
                        },
                        "riskAssessment": {
                            "type": "object",
                            "properties": {
                                "overallRisk": {
                                    "type": "string",
                                    "enum": ["low", "medium", "high", "critical"]
                                },
                                "riskFactors": {
                                    "type": "array",
                                    "items": { "type": "string" }
                                }
                            }
                        },
                        "actionItems": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "action": { "type": "string" },
                                    "priority": {
                                        "type": "string",
                                        "enum": ["low", "medium", "high", "urgent"]
                                    },
                                    "assignedTo": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "metadata": {
                    "type": "object",
                    "properties": {
                        "processingTime": { "type": "number" },
                        "documentsProcessed": { "type": "number" },
                        "agentsInvolved": { "type": "array" },
                        "confidence": { "type": "number" }
                    }
                }
            }
        }
    }'::JSONB,

    -- Capabilities
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

    -- Context (documentation and system overview)
    '{"markdown": "# Legal Department AI\n\nA sophisticated multi-agent legal document analysis system powered by LangGraph.\n\n## Architecture\n\n### Chief Legal Officer (CLO) Agent\n- **Role**: Intake, routing, and synthesis\n- **Responsibilities**:\n  - Initial document assessment\n  - Route to appropriate specialist agents\n  - Synthesize specialist findings\n  - Generate executive summary and recommendations\n\n### Specialist Agents\n\n#### Contract Specialist Agent\n- **Focus**: Contract law, terms, obligations\n- **Analyzes**: Payment terms, termination clauses, liability, warranties\n- **Expertise**: Commercial contracts, NDAs, MSAs\n\n#### Compliance Specialist Agent\n- **Focus**: Regulatory compliance, legal standards\n- **Analyzes**: GDPR, CCPA, industry regulations, compliance gaps\n- **Expertise**: Data protection, industry-specific regulations\n\n#### IP Specialist Agent\n- **Focus**: Intellectual property law\n- **Analyzes**: IP ownership, licensing, patents, trademarks, copyrights\n- **Expertise**: IP rights, infringement risks, licensing terms\n\n## Workflow\n\n1. **Intake** (CLO)\n   - Receive task and documents\n   - Perform initial assessment\n   - Extract document text (multimodal support)\n   - Determine routing strategy\n\n2. **Routing** (CLO)\n   - Assign to one or more specialist agents based on:\n     - Document type\n     - Focus areas\n     - Analysis depth\n   - Parallel execution of specialist analyses\n\n3. **Specialist Analysis**\n   - Each assigned specialist performs deep analysis\n   - Specialist findings include:\n     - Area-specific findings\n     - Risk assessment\n     - Recommendations\n     - Confidence levels\n\n4. **Synthesis** (CLO)\n   - Aggregate specialist findings\n   - Resolve conflicts/contradictions\n   - Generate executive summary\n   - Prioritize action items\n   - Assess overall risk\n\n5. **Deliverable**\n   - Comprehensive legal analysis report\n   - Risk assessment matrix\n   - Prioritized action items\n   - Specialist appendices\n\n## Multimodal Support\n\n- **PDF Documents**: Extract text from native PDFs\n- **Scanned Documents**: OCR processing for images/scanned PDFs\n- **Image Documents**: PNG/JPEG analysis (contracts, forms)\n- **Text Documents**: Direct text analysis\n\n## Analysis Depths\n\n- **Quick**: High-level review, key risk flags (5-10 min)\n- **Standard**: Comprehensive analysis with recommendations (15-30 min)\n- **Comprehensive**: Deep dive with all specialists, detailed action plan (30-60 min)\n\n## Focus Areas\n\n- **Liability**: Liability clauses, indemnification, limitations\n- **Termination**: Termination rights, notice periods, post-termination\n- **Payment**: Payment terms, pricing, invoicing, late fees\n- **IP Rights**: Ownership, licensing, usage rights\n- **Confidentiality**: NDA terms, confidentiality obligations\n- **Compliance**: Regulatory compliance, legal standards\n- **Warranties**: Warranties, representations, disclaimers\n- **Indemnification**: Indemnification clauses, hold harmless\n\n## Use Cases\n\n- **Contract Review**: Pre-signature contract analysis\n- **NDA Assessment**: Evaluate confidentiality agreements\n- **MSA Evaluation**: Master service agreement review\n- **Policy Compliance**: Check policies against regulations\n- **IP Due Diligence**: Assess IP ownership and licensing\n- **Risk Assessment**: Evaluate legal risks in documents\n\n## Integration\n\n- **LangGraph Service**: http://localhost:6200/legal-department\n- **SSE Streaming**: Real-time progress updates\n- **Document Storage**: Supabase storage bucket (legal-documents)\n- **Observability**: Full event tracking and audit trail"}'::JSONB,

    -- Endpoint (required for API agents)
    -- 10 minute timeout (600000ms) to accommodate slow local models (Ollama/sovereign mode)
    '{"url": "http://localhost:6200/legal-department", "method": "POST", "timeout": 600000}'::JSONB,

    -- LLM config (null for API agents - LangGraph manages internally)
    NULL,

    -- Metadata with LangGraph configuration and forwardConverse flag
    '{
        "provider": "langgraph",
        "framework": "langgraph",
        "langgraphWorkflow": "legal-department",
        "forwardConverse": true,
        "hasCustomUI": false,
        "features": [
            "multi-agent-routing",
            "clo-routing",
            "specialist-agents",
            "synthesis",
            "multimodal-input",
            "ocr-support",
            "risk-assessment",
            "sse-streaming"
        ],
        "agents": {
            "clo": {
                "name": "Chief Legal Officer",
                "role": "routing-and-synthesis",
                "responsibilities": ["intake", "routing", "synthesis", "executive-summary"]
            },
            "contractSpecialist": {
                "name": "Contract Specialist",
                "role": "specialist-analysis",
                "focus": ["contracts", "terms", "obligations", "payment", "termination"]
            },
            "complianceSpecialist": {
                "name": "Compliance Specialist",
                "role": "specialist-analysis",
                "focus": ["regulations", "compliance", "gdpr", "ccpa", "industry-standards"]
            },
            "ipSpecialist": {
                "name": "IP Specialist",
                "role": "specialist-analysis",
                "focus": ["intellectual-property", "patents", "trademarks", "licensing", "ownership"]
            }
        },
        "supportedDocumentTypes": [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "text/plain"
        ],
        "supportedJurisdictions": [
            "US",
            "UK",
            "EU",
            "CA"
        ],
        "analysisDepths": {
            "quick": {
                "estimatedTime": "5-10 minutes",
                "description": "High-level review with key risk flags"
            },
            "standard": {
                "estimatedTime": "15-30 minutes",
                "description": "Comprehensive analysis with recommendations"
            },
            "comprehensive": {
                "estimatedTime": "30-60 minutes",
                "description": "Deep dive with all specialists and detailed action plan"
            }
        },
        "defaultLLM": {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "description": "High-capability model for legal analysis"
        },
        "executionCapabilities": {
            "canConverse": true,
            "canPlan": true,
            "canBuild": true,
            "requiresHumanGate": false
        },
        "streaming": {
            "enabled": true,
            "eventTypes": [
                "intake_started",
                "intake_completed",
                "routing_started",
                "routing_completed",
                "specialist_started",
                "specialist_progress",
                "specialist_completed",
                "synthesis_started",
                "synthesis_completed",
                "deliverable_ready"
            ]
        },
        "storage": {
            "bucket": "legal-documents",
            "documentRetention": "7-years",
            "encryptionEnabled": true
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
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
    endpoint = EXCLUDED.endpoint,
    llm_config = EXCLUDED.llm_config,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    agent_exists BOOLEAN;
    is_api BOOLEAN;
    has_endpoint BOOLEAN;
    has_routing BOOLEAN;
BEGIN
    -- Check if agent exists
    SELECT EXISTS(
        SELECT 1 FROM public.agents
        WHERE slug = 'legal-department'
        AND agent_type = 'api'
    ) INTO agent_exists;

    -- Check if it's api type
    SELECT agent_type = 'api'
    INTO is_api
    FROM public.agents
    WHERE slug = 'legal-department';

    -- Check if it has endpoint
    SELECT endpoint IS NOT NULL
    INTO has_endpoint
    FROM public.agents
    WHERE slug = 'legal-department';

    -- Check if metadata has routing config
    SELECT metadata ? 'agents'
    INTO has_routing
    FROM public.agents
    WHERE slug = 'legal-department';

    IF NOT agent_exists THEN
        RAISE EXCEPTION 'Legal Department AI agent was not created successfully';
    END IF;

    IF NOT is_api THEN
        RAISE EXCEPTION 'Legal Department AI agent type is not api';
    END IF;

    IF NOT has_endpoint THEN
        RAISE EXCEPTION 'Legal Department AI agent missing endpoint';
    END IF;

    IF NOT has_routing THEN
        RAISE EXCEPTION 'Legal Department AI agent metadata missing routing config';
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Legal Department AI Agent Registered Successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Slug: legal-department';
    RAISE NOTICE 'Type: api (LangGraph multi-agent workflow)';
    RAISE NOTICE 'Department: legal';
    RAISE NOTICE 'Organizations: demo-org, global';
    RAISE NOTICE 'Endpoint: http://localhost:6200/legal-department';
    RAISE NOTICE 'Forward CONVERSE: true';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Multi-Agent Architecture:';
    RAISE NOTICE '  - CLO Agent (routing & synthesis)';
    RAISE NOTICE '  - Contract Specialist Agent';
    RAISE NOTICE '  - Compliance Specialist Agent';
    RAISE NOTICE '  - IP Specialist Agent';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Features:';
    RAISE NOTICE '  - Multimodal input (PDF, images, text)';
    RAISE NOTICE '  - OCR support for scanned documents';
    RAISE NOTICE '  - Risk assessment and recommendations';
    RAISE NOTICE '  - SSE streaming for real-time updates';
    RAISE NOTICE '================================================';
END $$;
