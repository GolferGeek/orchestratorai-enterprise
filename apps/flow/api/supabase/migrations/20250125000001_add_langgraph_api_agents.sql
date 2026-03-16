-- =============================================================================
-- LANGGRAPH API AGENTS
-- =============================================================================
-- Migration to add Data Analyst and Extended Post Writer API agents
-- These wrap LangGraph endpoints for Phase 5 testing
-- Created: 2025-11-25
-- =============================================================================

-- =============================================================================
-- DATA ANALYST AGENT - API Agent wrapping LangGraph
-- =============================================================================
-- Tool-calling agent that queries databases using natural language
-- Endpoints: POST /data-analyst/analyze, GET /data-analyst/status/:threadId
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
  metadata
) VALUES (
  'data-analyst',
  ARRAY['demo-org']::TEXT[],
  'Data Analyst',
  'LangGraph-powered data analyst agent that uses natural language to query databases, list tables, describe schemas, and generate SQL queries with comprehensive result summaries.',
  '1.0.0',
  'api',
  'analytics',
  ARRAY['data-analysis', 'sql', 'database', 'langgraph', 'tool-calling']::TEXT[],

  -- Input/Output Schema
  '{
    "input": {
      "type": "object",
      "required": ["question"],
      "properties": {
        "question": {
          "type": "string",
          "description": "Natural language question about the data"
        },
        "userId": {
          "type": "string",
          "description": "User ID for tracking"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "description": "Task ID for the analysis session (used as thread ID)"
        },
        "status": {
          "type": "string",
          "description": "Current status of the analysis"
        },
        "tablesDiscovered": {
          "type": "array",
          "items": {"type": "string"},
          "description": "List of database tables discovered"
        },
        "sqlGenerated": {
          "type": "string",
          "description": "Generated SQL query"
        },
        "queryResults": {
          "type": "object",
          "description": "Results from SQL execution"
        },
        "summary": {
          "type": "string",
          "description": "Natural language summary of the analysis"
        }
      }
    }
  }'::JSONB,

  -- Capabilities
  ARRAY['database-query', 'sql-generation', 'schema-analysis', 'data-summarization']::TEXT[],

  -- Context (markdown as JSONB)
  '{"markdown": "# Data Analyst Agent\n\nA LangGraph-powered agent that analyzes databases using natural language queries.\n\n## Capabilities\n- **Schema Discovery**: Lists and describes database tables\n- **SQL Generation**: Generates SQL from natural language using Ollama/SQLCoder\n- **Query Execution**: Executes read-only SQL queries safely\n- **Result Summarization**: Provides clear summaries of query results\n\n## Flow\n1. User asks a question about data\n2. Agent discovers relevant tables\n3. Agent describes table schemas\n4. Agent generates SQL query\n5. Agent executes query (read-only)\n6. Agent summarizes results\n\n## Safety\n- All SQL queries are read-only (SELECT only)\n- Query execution is sandboxed\n- Results are validated before returning"}'::JSONB,

  -- Endpoint configuration (API agent)
  '{
    "url": "http://localhost:6200/data-analyst/analyze",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "timeout": 120000,
    "responseTransform": {
      "content": "$.data.summary",
      "metadata": {
        "taskId": "$.data.threadId",
        "status": "$.data.status",
        "tablesDiscovered": "$.data.tablesDiscovered",
        "sqlGenerated": "$.data.sqlGenerated",
        "queryResults": "$.data.queryResults"
      }
    }
  }'::JSONB,

  -- LLM config (null for API agents - uses LangGraph internal LLM)
  NULL,

  -- Metadata
  '{
    "provider": "langgraph",
    "langgraphEndpoint": "http://localhost:6200",
    "features": ["tool-calling", "checkpointing"],
    "statusEndpoint": "/data-analyst/status/{threadId}",
    "historyEndpoint": "/data-analyst/history/{threadId}",
    "execution_capabilities": {
      "can_converse": true,
      "can_plan": false,
      "can_build": true,
      "requires_human_gate": false
    }
  }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
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
-- EXTENDED POST WRITER AGENT - API Agent wrapping LangGraph with HITL
-- =============================================================================
-- HITL agent that generates blog posts, SEO descriptions, and social posts
-- Pauses for human review before finalizing
-- Endpoints: POST /extended-post-writer/generate, POST /extended-post-writer/resume/:threadId
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
  metadata
) VALUES (
  'extended-post-writer',
  ARRAY['demo-org']::TEXT[],
  'Extended Post Writer',
  'LangGraph-powered content generation agent with Human-in-the-Loop (HITL) approval. Generates blog posts, SEO descriptions, and social media posts, then pauses for human review before finalizing.',
  '1.0.0',
  'api',
  'marketing',
  ARRAY['content-creation', 'blog', 'seo', 'social-media', 'langgraph', 'hitl']::TEXT[],

  -- Input/Output Schema
  '{
    "input": {
      "type": "object",
      "required": ["topic"],
      "properties": {
        "topic": {
          "type": "string",
          "description": "Topic for content generation"
        },
        "tone": {
          "type": "string",
          "enum": ["professional", "casual", "technical", "conversational"],
          "default": "professional",
          "description": "Writing tone"
        },
        "userId": {
          "type": "string",
          "description": "User ID for tracking"
        }
      }
    },
    "output": {
      "type": "object",
      "properties": {
        "taskId": {
          "type": "string",
          "description": "Task ID for the content generation session (used as thread ID)"
        },
        "status": {
          "type": "string",
          "enum": ["started", "generating", "hitl_waiting", "completed", "rejected", "failed"],
          "description": "Current workflow status"
        },
        "hitlPending": {
          "type": "boolean",
          "description": "Whether human approval is pending"
        },
        "generatedContent": {
          "type": "object",
          "properties": {
            "blogPost": {"type": "string"},
            "seoDescription": {"type": "string"},
            "socialPosts": {"type": "array", "items": {"type": "string"}}
          },
          "description": "Generated content awaiting review"
        },
        "finalContent": {
          "type": "object",
          "description": "Final approved/edited content after HITL"
        }
      }
    }
  }'::JSONB,

  -- Capabilities
  ARRAY['content-generation', 'blog-writing', 'seo-optimization', 'social-media', 'human-in-the-loop']::TEXT[],

  -- Context (markdown as JSONB)
  '{"markdown": "# Extended Post Writer Agent\n\nA LangGraph-powered content generation agent with Human-in-the-Loop (HITL) approval workflow.\n\n## Capabilities\n- **Blog Post Generation**: Creates comprehensive blog posts on any topic\n- **SEO Description**: Generates optimized meta descriptions\n- **Social Media Posts**: Creates multiple social media posts for different platforms\n- **HITL Approval**: Pauses for human review before finalizing content\n\n## HITL Workflow\n1. User provides topic and preferences\n2. Agent generates all content types\n3. Workflow pauses with `hitl_waiting` status\n4. Human reviews content in approval modal\n5. Human can:\n   - **Approve**: Accept content as-is\n   - **Edit**: Modify content then approve\n   - **Reject**: Reject and provide feedback\n6. Workflow completes with final content\n\n## Resume Actions\n- `approve`: Accept generated content\n- `edit`: Accept with modifications (provide editedContent)\n- `reject`: Reject content (provide feedback)\n\n## Endpoints\n- `POST /extended-post-writer/generate` - Start generation\n- `POST /extended-post-writer/resume/:threadId` - Resume with decision\n- `GET /extended-post-writer/status/:threadId` - Check status"}'::JSONB,

  -- Endpoint configuration (API agent)
  '{
    "url": "http://localhost:6200/extended-post-writer/generate",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "timeout": 120000,
    "responseTransform": {
      "content": "$.data.generatedContent.blogPost",
      "metadata": {
        "taskId": "$.data.threadId",
        "status": "$.data.status",
        "hitlPending": "$.data.hitlPending",
        "generatedContent": "$.data.generatedContent",
        "finalContent": "$.data.finalContent"
      }
    }
  }'::JSONB,

  -- LLM config (null for API agents - uses LangGraph internal LLM)
  NULL,

  -- Metadata
  '{
    "provider": "langgraph",
    "langgraphEndpoint": "http://localhost:6200",
    "features": ["hitl", "checkpointing", "content-generation"],
    "hitlEnabled": true,
    "resumeEndpoint": "/extended-post-writer/resume/{threadId}",
    "statusEndpoint": "/extended-post-writer/status/{threadId}",
    "historyEndpoint": "/extended-post-writer/history/{threadId}",
    "execution_capabilities": {
      "can_converse": true,
      "can_plan": false,
      "can_build": true,
      "requires_human_gate": true
    }
  }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
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

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Successfully created/updated LangGraph API agents: data-analyst, extended-post-writer';
END $$;
