-- =============================================================================
-- AGENTS TABLE
-- =============================================================================
-- Normalized agent configuration for Orchestrator AI v2
-- Single source of truth - NO agent JSON files
-- Supports: Context agents, API agents, External A2A agents
-- Created: Phase 1 - Agent Infrastructure
-- =============================================================================

-- Create agents table
CREATE TABLE IF NOT EXISTS public.agents (
  -- Primary identifier (globally unique slug)
  slug TEXT PRIMARY KEY,

  -- Multi-tenant organization membership (array supports multi-org agents)
  organization_slug TEXT[] NOT NULL DEFAULT ARRAY['demo-org']::TEXT[],

  -- Basic metadata
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- Agent type (mutually exclusive)
  agent_type TEXT NOT NULL CHECK (agent_type IN ('context', 'api', 'external')),

  -- Department/category for organization
  department TEXT NOT NULL,

  -- Tags for discovery and filtering
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- =============================================================================
  -- CORE AGENT DEFINITION
  -- =============================================================================

  -- Input/Output schema (defines agent's interface)
  -- Required for all agent types
  -- Example: {"input": {"type": "object", "properties": {...}}, "output": {...}}
  io_schema JSONB NOT NULL,

  -- Capabilities (what the agent can do)
  -- Required for all agent types
  -- Example: ["blog-writing", "seo-optimization", "content-generation"]
  capabilities TEXT[] NOT NULL,

  -- Context/Prompt (dual purpose based on agent_type)
  -- For context agents: System prompt / instructions
  -- For API agents: Prompt enhancement / request template
  -- For external agents: Documentation / usage notes
  -- Required for all agent types
  context TEXT NOT NULL,

  -- =============================================================================
  -- AGENT-TYPE-SPECIFIC CONFIGURATION
  -- =============================================================================

  -- Endpoint configuration (for API and external agents only)
  -- Null for context agents
  -- JSONB structure:
  -- {
  --   "url": "http://localhost:8000/webhook",
  --   "method": "POST",
  --   "headers": {"Content-Type": "application/json"},
  --   "authentication": {
  --     "type": "bearer|api-key|basic",
  --     "config": {...}
  --   },
  --   "request_transform": "template for request body",
  --   "response_transform": "jq filter for response extraction",
  --   "status_webhook": "${ORCHESTRATOR_WEBHOOK_STATUS_URL}"
  -- }
  endpoint JSONB,

  -- LLM configuration (for context agents only)
  -- Null for API and external agents
  -- JSONB structure:
  -- {
  --   "provider": "anthropic|openai|google|ollama",
  --   "model": "claude-3-5-sonnet-20241022",
  --   "parameters": {
  --     "temperature": 0.7,
  --     "maxTokens": 4000,
  --     "topP": 1.0
  --   }
  -- }
  llm_config JSONB,

  -- =============================================================================
  -- OPTIONAL EXTENDED METADATA
  -- =============================================================================

  -- Additional agent metadata (optional, flexible)
  -- Example: {"author": "John Doe", "license": "MIT", "documentation_url": "https://..."}
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

-- Ensure endpoint is null for context agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_no_endpoint
  CHECK (agent_type != 'context' OR endpoint IS NULL);

-- Ensure endpoint is not null for API and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_has_endpoint
  CHECK (agent_type = 'context' OR endpoint IS NOT NULL);

-- Ensure llm_config is null for API and external agents
ALTER TABLE public.agents ADD CONSTRAINT agents_api_no_llm
  CHECK (agent_type = 'context' OR llm_config IS NULL);

-- Ensure llm_config is not null for context agents
ALTER TABLE public.agents ADD CONSTRAINT agents_context_has_llm
  CHECK (agent_type != 'context' OR llm_config IS NOT NULL);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookups
CREATE INDEX IF NOT EXISTS idx_agents_organization_slug ON public.agents USING GIN(organization_slug);
CREATE INDEX IF NOT EXISTS idx_agents_department ON public.agents(department);
CREATE INDEX IF NOT EXISTS idx_agents_agent_type ON public.agents(agent_type);

-- Discovery and filtering
CREATE INDEX IF NOT EXISTS idx_agents_tags ON public.agents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON public.agents USING GIN(capabilities);

-- JSONB queries
CREATE INDEX IF NOT EXISTS idx_agents_io_schema ON public.agents USING GIN(io_schema);
CREATE INDEX IF NOT EXISTS idx_agents_endpoint ON public.agents USING GIN(endpoint);
CREATE INDEX IF NOT EXISTS idx_agents_llm_config ON public.agents USING GIN(llm_config);
CREATE INDEX IF NOT EXISTS idx_agents_metadata ON public.agents USING GIN(metadata);

-- Common sorting
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON public.agents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_name ON public.agents(name);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on agents table
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read agents in their organizations
-- Note: This assumes user-organization membership tracking
-- Will be expanded in future phases when user management is implemented
CREATE POLICY "Users can read agents in their organizations"
  ON public.agents
  FOR SELECT
  USING (true); -- Temporarily allow all reads until user management is implemented

-- Policy: Service role has full access (currently disabled - auth schema not in this DB)
-- CREATE POLICY "Service role has full access to agents"
--   ON public.agents
--   FOR ALL
--   USING (auth.role() = 'service_role');

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Attach trigger to agents table (reuses function from organizations migration)
CREATE TRIGGER set_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.agents IS 'Normalized agent configurations - single source of truth (no JSON files)';
COMMENT ON COLUMN public.agents.slug IS 'Globally unique identifier (e.g., "blog-post-writer", "hr-onboarding-agent")';
COMMENT ON COLUMN public.agents.organization_slug IS 'Array of organization slugs this agent belongs to (supports multi-org)';
COMMENT ON COLUMN public.agents.name IS 'Human-readable agent name';
COMMENT ON COLUMN public.agents.description IS 'Detailed description of agent purpose and capabilities';
COMMENT ON COLUMN public.agents.version IS 'Semantic version of agent configuration';
COMMENT ON COLUMN public.agents.agent_type IS 'Type of agent: context (LLM-based), api (webhook/HTTP), external (A2A protocol)';
COMMENT ON COLUMN public.agents.department IS 'Department or category for organization (e.g., "marketing", "hr", "engineering")';
COMMENT ON COLUMN public.agents.tags IS 'Array of tags for discovery and filtering';
COMMENT ON COLUMN public.agents.io_schema IS 'JSON schema defining input and output structure for agent interface';
COMMENT ON COLUMN public.agents.capabilities IS 'Array of capability identifiers describing what agent can do';
COMMENT ON COLUMN public.agents.context IS 'Dual purpose: system prompt (context agents) or prompt enhancement (API agents)';
COMMENT ON COLUMN public.agents.endpoint IS 'API endpoint configuration with authentication (API/external agents only)';
COMMENT ON COLUMN public.agents.llm_config IS 'LLM provider and parameters (context agents only)';
COMMENT ON COLUMN public.agents.metadata IS 'Flexible extended metadata (author, license, docs, etc.)';
COMMENT ON COLUMN public.agents.created_at IS 'Timestamp when agent was created';
COMMENT ON COLUMN public.agents.updated_at IS 'Timestamp when agent was last updated (auto-maintained by trigger)';
