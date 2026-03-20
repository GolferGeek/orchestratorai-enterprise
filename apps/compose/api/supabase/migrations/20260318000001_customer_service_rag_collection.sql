-- =============================================================================
-- Customer Service RAG Collection + Seed Documents
-- =============================================================================
-- Creates the customer-service RAG collection (org: global) and seeds 8
-- knowledge-base documents. Also updates the customer-service agent from
-- langgraph to rag type with the new collection.
-- =============================================================================

SET search_path TO rag_data, public;

-- =============================================================================
-- 1. Create the customer-service RAG collection
-- =============================================================================
INSERT INTO rag_data.rag_collections (
    organization_slug, name, slug, description,
    embedding_model, embedding_dimensions, chunk_size, chunk_overlap,
    status, complexity_type, created_at, updated_at
)
VALUES (
    'global',
    'Customer Service Knowledge Base',
    'customer-service',
    'OrchestratorAI platform knowledge base for customer service agents. Covers product overview, pricing, use cases, and contact information.',
    'nomic-embed-text', 768, 1000, 200,
    'active', 'basic',
    NOW(), NOW()
)
ON CONFLICT (slug, organization_slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    updated_at = NOW();

-- =============================================================================
-- 2. Seed 8 knowledge-base documents
-- Note: Documents are inserted without embeddings. The RAG runner will find
-- them via keyword search if no vector embeddings exist yet. To generate
-- embeddings, upload the documents through the RAG UI or run the ingestion
-- pipeline pointing at these document records.
-- =============================================================================

DO $$
DECLARE
    v_collection_id UUID;
BEGIN
    -- Resolve collection ID
    SELECT id INTO v_collection_id
    FROM rag_data.rag_collections
    WHERE slug = 'customer-service' AND organization_slug = 'global';

    IF v_collection_id IS NULL THEN
        RAISE EXCEPTION 'customer-service collection not found after insert';
    END IF;

    -- Skip document seeding if documents already exist for this collection
    -- (makes the migration idempotent)
    IF NOT EXISTS (SELECT 1 FROM rag_data.rag_documents WHERE collection_id = v_collection_id) THEN

    -- -------------------------------------------------------------------------
    -- Document 1: product-overview
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'product-overview.txt', 'txt', 512,
        'completed', 1, 120,
        'OrchestratorAI is an enterprise AI agent platform that lets organizations build, deploy, and manage AI agents at scale. The platform supports multi-model AI with providers including OpenAI (GPT-4o, o3), Anthropic (Claude Sonnet, Claude Opus), Google (Gemini), and Ollama for local/private model hosting. OrchestratorAI products include: Compose for simple composable agents (context, RAG, API, external, and media families), Forge for complex LangGraph agents with human-in-the-loop capabilities, Flow for team productivity (tasks, notes, sprints), and Admin for organization management. The platform is built for enterprises that need sovereign AI — the ability to run models on their own infrastructure without data leaving their environment.',
        '{"title": "OrchestratorAI Product Overview", "category": "product"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 2: agent-types
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'agent-types.txt', 'txt', 640,
        'completed', 1, 150,
        'OrchestratorAI supports six agent families. Context agents are the simplest: they use a system prompt with an LLM to answer questions directly. RAG (Retrieval-Augmented Generation) agents search a vector knowledge base before calling the LLM, making them ideal for grounding responses in specific documents. API agents call external HTTP APIs and format the results. External agents use the A2A (Agent-to-Agent) protocol to integrate with third-party AI systems. Media agents generate images and video using generative AI models. LangGraph agents (available in the Forge product) support complex multi-step workflows with conditional logic, state machines, and human-in-the-loop approval steps. Each agent type returns a typed output (text, markdown, JSON, image, video, audio, or artifact reference) so the UI can render it correctly.',
        '{"title": "Agent Types and Families", "category": "product"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 3: pricing-tiers
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'pricing-tiers.txt', 'txt', 480,
        'completed', 1, 110,
        'OrchestratorAI offers four pricing tiers. Free Trial: 14-day trial with up to 2 agents and limited model access, no credit card required. Starter: $49 per month, includes up to 10 agents, all five Compose agent families, standard model access, and email support. Professional: $199 per month, includes unlimited agents, all products (Compose, Forge, Flow), priority support, and team collaboration features. Enterprise: custom pricing, includes sovereign mode (self-hosted models, no data leaving your infrastructure), dedicated support, SLA guarantees, custom integrations, and volume discounts. Annual billing is available with a 20% discount on monthly rates. Contact hello@orchestrator-ai.com for Enterprise quotes.',
        '{"title": "Pricing Tiers", "category": "pricing"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 4: use-cases
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'use-cases.txt', 'txt', 560,
        'completed', 1, 130,
        'OrchestratorAI is used across many business functions. Customer Service: deploy RAG agents grounded in your product knowledge base to handle customer questions 24/7. Sales Enablement: build agents that help sales reps prepare for calls, research prospects, and draft outreach. Knowledge Base: create Q&A agents over internal wikis, runbooks, and policy documents. Document Processing: use LangGraph agents to extract, classify, and route documents through approval workflows. Legal Assistant: deploy RAG agents over contracts and case law to help legal teams research faster. HR Assistant: build agents that answer employee questions about policies, benefits, and onboarding. Marketing Content: use context agents to generate blog posts, social copy, and campaign briefs at scale. Data Analysis: connect API agents to your data warehouse to generate natural-language summaries of business metrics.',
        '{"title": "Use Cases", "category": "use-cases"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 5: getting-started
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'getting-started.txt', 'txt', 420,
        'completed', 1, 100,
        'Getting started with OrchestratorAI is straightforward. Step 1: Sign up at orchestratorai.io and start your free 14-day trial — no credit card required. Step 2: Open the Compose product from the navigation shell. Step 3: Click "New Agent" and choose your agent type — start with a Context agent if you just want a simple LLM-powered assistant. Step 4: Configure your system prompt to give the agent its persona and instructions, then select your preferred LLM model. Step 5: Test your agent in the conversation view — type a message and see the response. Step 6: When you are happy with the behavior, the agent is ready to share or embed. For RAG agents, you also need to upload documents to a collection before the agent can search them. For API agents, you supply the endpoint URL and authentication details. Support is available at support@orchestrator-ai.com.',
        '{"title": "Getting Started Guide", "category": "onboarding"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 6: scheduling-a-demo
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'scheduling-a-demo.txt', 'txt', 320,
        'completed', 1, 75,
        'To schedule a demo of OrchestratorAI, visit orchestratorai.io/demo and use the booking calendar to pick a time that works for you. Demo sessions are 30 minutes and are conducted via video call. You can also email hello@orchestrator-ai.com with your preferred times and a brief description of your use case, and our team will reach out within one business day. For enterprise prospects with complex requirements, we offer custom demo sessions that can be tailored to your specific industry and technology stack. We also run monthly public webinars — sign up at orchestratorai.io to be notified of upcoming dates.',
        '{"title": "Scheduling a Demo", "category": "sales"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 7: faq
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'faq.txt', 'txt', 880,
        'completed', 1, 210,
        'Frequently Asked Questions about OrchestratorAI. Q: What AI models are supported? A: We support OpenAI (GPT-4o, o3, GPT-4o-mini), Anthropic (Claude Sonnet 4.5, Claude Opus), Google (Gemini 2.5 Pro, Gemini 2.0 Flash), and Ollama for local models. Q: Can I use local models? A: Yes. With Ollama integration you can run models like Llama 3, Qwen, and Mistral entirely on your own hardware. In Enterprise sovereign mode, no data leaves your infrastructure. Q: How does sovereign mode work? A: Sovereign mode routes all LLM calls to your self-hosted models (via Ollama or Azure OpenAI on your subscription), stores all data in your own database, and prevents any telemetry from leaving your environment. Q: What is the difference between Compose and Forge? A: Compose is for simple single-action agents using one of five standard families (context, RAG, API, external, media). Forge is for complex multi-step agents built with LangGraph, supporting conditional workflows and human approval steps. Q: Is there an API? A: Yes. Every agent exposes a JSON-RPC 2.0 invoke endpoint. You can call your agents programmatically or via our Bridge product for A2A integrations. Q: How does pricing work? A: You pay a flat monthly fee per tier (Free Trial, Starter at $49, Professional at $199, or Enterprise at custom pricing). LLM costs from third-party providers (OpenAI, Anthropic, etc.) are billed separately through your own API keys.',
        '{"title": "Frequently Asked Questions", "category": "faq"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    -- -------------------------------------------------------------------------
    -- Document 8: contact-information
    -- -------------------------------------------------------------------------
    INSERT INTO rag_data.rag_documents (
        collection_id, organization_slug, filename, file_type, file_size,
        status, chunk_count, token_count, content, metadata, created_at, updated_at
    ) VALUES (
        v_collection_id, 'global',
        'contact-information.txt', 'txt', 280,
        'completed', 1, 65,
        'OrchestratorAI contact information. General inquiries: hello@orchestrator-ai.com. Technical support: support@orchestrator-ai.com. Phone: 763-220-0146. Website: orchestratorai.io. Demo booking: orchestratorai.io/demo. Office hours for phone support are Monday through Friday, 9am to 5pm Central Time. For urgent enterprise support issues, Enterprise customers have a dedicated support channel with SLA-backed response times. You can also reach us on LinkedIn and Twitter/X by searching for OrchestratorAI.',
        '{"title": "Contact Information", "category": "contact"}'::jsonb,
        NOW(), NOW()
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Customer Service RAG Collection seeded';
    RAISE NOTICE 'Collection ID: %', v_collection_id;
    RAISE NOTICE 'Documents inserted: 8';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'NOTE: Embeddings not generated yet.';
    RAISE NOTICE 'Upload docs via RAG UI or run ingestion to enable';
    RAISE NOTICE 'vector search. Keyword search works without embeddings.';
    RAISE NOTICE '================================================';

    END IF; -- end skip-if-documents-exist block

    -- -------------------------------------------------------------------------
    -- Update document_count on collection (always run)
    -- -------------------------------------------------------------------------
    UPDATE rag_data.rag_collections
    SET document_count = (
        SELECT COUNT(*) FROM rag_data.rag_documents
        WHERE collection_id = v_collection_id
    ),
    updated_at = NOW()
    WHERE id = v_collection_id;

END $$;

-- =============================================================================
-- 3. Add collection_slug, output_type, and status columns to agents table
--    (read by agent-definition.service.ts but not yet in the schema)
-- =============================================================================
ALTER TABLE public.agents
    ADD COLUMN IF NOT EXISTS collection_slug TEXT,
    ADD COLUMN IF NOT EXISTS output_type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- =============================================================================
-- 4. Update customer-service agent: switch from langgraph to rag
-- =============================================================================

-- First drop constraints that prevent mixing types freely
-- (rag type is a superset of context — needs llm_config, no endpoint)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;

-- Recreate to allow 'rag' type alongside existing types
-- Cumulative set: context, api, external, rag-runner, orchestrator, media, langgraph, prediction, risk, rag
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
    CHECK (agent_type = ANY (ARRAY['context', 'api', 'external', 'rag-runner', 'rag', 'orchestrator', 'langgraph', 'prediction', 'media', 'risk']::text[]));

-- endpoint is null for context, rag, rag-runner, langgraph, prediction, risk, orchestrator, and media agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_no_endpoint
    CHECK (agent_type NOT IN ('context', 'rag', 'rag-runner') OR endpoint IS NULL);

-- endpoint required for api and external agents only
ALTER TABLE public.agents ADD CONSTRAINT agents_api_has_endpoint
    CHECK (agent_type IN ('context', 'rag', 'rag-runner', 'orchestrator', 'langgraph', 'prediction', 'media', 'risk') OR endpoint IS NOT NULL);

-- llm_config is null for api and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_no_llm
    CHECK (agent_type IN ('context', 'rag', 'rag-runner', 'orchestrator', 'langgraph', 'prediction', 'media', 'risk') OR llm_config IS NULL);

-- llm_config required for context, rag, and rag-runner agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_has_llm
    CHECK (agent_type NOT IN ('context', 'rag', 'rag-runner') OR llm_config IS NOT NULL);

UPDATE public.agents
SET
    agent_type = 'rag',
    collection_slug = 'customer-service',
    organization_slug = ARRAY['global'],
    status = 'active',
    output_type = 'text',
    context = 'You are a friendly, knowledgeable customer service representative for OrchestratorAI. Answer questions using the provided context. Be concise and helpful. If you don''t know the answer, say so honestly and suggest contacting support. Never make up information.',
    tags = ARRAY['customer-service', 'voice', 'text', 'support', 'rag'],
    llm_config = '{"model": "claude-sonnet-4-6", "provider": "anthropic", "parameters": {"temperature": 0.7, "maxTokens": 1000}}'::jsonb,
    updated_at = NOW()
WHERE slug = 'customer-service';

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'customer-service agent updated';
    RAISE NOTICE 'agent_type: rag';
    RAISE NOTICE 'collection_slug: customer-service';
    RAISE NOTICE 'organization_slug: [global]';
    RAISE NOTICE 'Added columns: collection_slug, output_type, status';
    RAISE NOTICE '================================================';
END $$;
