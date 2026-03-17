-- Agent Table V2 Migration
-- Step 3-2: Add output_type and status, remove io_schema and capabilities
--
-- This migration evolves the agents table for the v2 invoke contract:
-- - output_type: explicit typed output declaration (text, markdown, json, image, video, audio)
-- - status: agent lifecycle management (draft, active, disabled, archived)
-- - io_schema: removed (v2 uses typed outputs, not heavyweight schemas)
-- - capabilities: removed (discovery is handled by CapabilityCard, not agent table)
-- - version: removed (framework-era lifecycle field)

-- Step 1: Add new columns
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS output_type TEXT NOT NULL DEFAULT 'text'
    CHECK (output_type IN ('text', 'markdown', 'json', 'image', 'video', 'audio', 'artifact-ref')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'disabled', 'archived'));

-- Step 2: Drop constraints that reference rag-runner/orchestrator (will be re-added for v2)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_has_endpoint;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_has_llm;
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_context_no_endpoint;

-- Step 3: Normalize existing rag-runner and orchestrator to v2 types
UPDATE public.agents SET agent_type = 'rag' WHERE agent_type = 'rag-runner';
UPDATE public.agents SET agent_type = 'context' WHERE agent_type = 'orchestrator';

-- Step 4: Add new agent_type CHECK constraint for v2 families
ALTER TABLE public.agents
  ADD CONSTRAINT agents_agent_type_check
    CHECK (agent_type IN ('context', 'rag', 'api', 'external', 'media', 'langgraph', 'prediction', 'risk'));

-- Step 4: Remove framework-era columns
-- io_schema was a heavyweight JSON schema not needed with typed outputs
ALTER TABLE public.agents DROP COLUMN IF EXISTS io_schema;
-- capabilities array replaced by CapabilityCard discovery model
ALTER TABLE public.agents DROP COLUMN IF EXISTS capabilities;
-- version was a semantic versioning field from the framework-era lifecycle
ALTER TABLE public.agents DROP COLUMN IF EXISTS version;

-- Step 5: Drop constraints that reference removed concepts
-- The old orchestrator type is no longer a Compose family
-- (langgraph stays for Forge-hosted agents)
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_api_no_llm;

-- Step 6: Add index on status for common queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON public.agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_output_type ON public.agents (output_type);

COMMENT ON COLUMN public.agents.output_type IS 'V2: Declared output type for invoke contract (text, markdown, json, image, video, audio, artifact-ref)';
COMMENT ON COLUMN public.agents.status IS 'V2: Agent lifecycle status (draft, active, disabled, archived)';
