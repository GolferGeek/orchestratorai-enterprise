-- =============================================================================
-- MASTER SEED FILE
-- =============================================================================
-- Orchestrator AI v2-start database seed data
-- All seed data consolidated in correct order
-- Created: Phase 1 - Agent Infrastructure
-- =============================================================================

-- =============================================================================
-- ORGANIZATIONS SEED DATA
-- =============================================================================
-- Demo organizations for v2-start testing and development
-- =============================================================================

-- Insert all organizations
INSERT INTO public.organizations (slug, name, description, url, settings) VALUES
  ('demo-org', 'Demo Organization', 'Default demonstration organization for Orchestrator AI v2-start', 'https://orchestratorai.io', '{"theme": "light", "features": ["context-agents", "api-agents", "external-agents"]}'::jsonb),
  ('orchestratorai', 'OrchestratorAI', 'Main Orchestrator AI organization', 'https://orchestratorai.io', '{}'::jsonb),
  ('golfergeek', 'GolferGeek', 'GolferGeek development organization', NULL, '{}'::jsonb),
  ('hiverarchy', 'Hiverarchy', 'Hiverarchy partner organization', NULL, '{}'::jsonb),
  ('law-firm', 'Law Firm', 'Demo law firm organization', NULL, '{}'::jsonb),
  ('finance-firm', 'Finance Firm', 'Demo finance firm organization', NULL, '{}'::jsonb),
  ('manufacturing-firm', 'Manufacturing Firm', 'Demo manufacturing firm organization', NULL, '{}'::jsonb),
  ('marketing-firm', 'Marketing Firm', 'Demo marketing firm organization', NULL, '{}'::jsonb),
  ('my-org', 'My Organization', 'Generic test organization', NULL, '{}'::jsonb),
  ('*', 'All Organizations', 'Special organization representing access to all organizations (superadmin)', NULL, '{}'::jsonb),
  ('all', 'All Organizations', 'Special organization for global agent access', NULL, '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  url = EXCLUDED.url,
  settings = EXCLUDED.settings,
  updated_at = NOW();

-- =============================================================================
-- AUTH USERS SEED DATA
-- =============================================================================
-- Passwords: DemoUser123!, Admin123!, GolferGeek123!
-- Note: Empty strings for token columns to avoid Supabase auth NULL scan errors

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) VALUES
  ('493101fa-8892-4de4-a0f9-daf43afdca1f', '00000000-0000-0000-0000-000000000000', 'demo.user@orchestratorai.io',
   crypt('DemoUser123!', gen_salt('bf')), NOW(),
   '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Demo User"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', '', '', '', '', ''),
  ('739b2b8b-0bb1-4894-b5ba-8698c8cd071a', '00000000-0000-0000-0000-000000000000', 'admin@orchestratorai.io',
   crypt('Admin123!', gen_salt('bf')), NOW(),
   '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "Admin User"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', '', '', '', '', ''),
  ('618f3960-a8be-4c67-855f-aae4130699b8', '00000000-0000-0000-0000-000000000000', 'golfergeek@orchestratorai.io',
   crypt('GolferGeek123!', gen_salt('bf')), NOW(),
   '{"provider": "email", "providers": ["email"]}'::jsonb, '{"display_name": "GolferGeek"}'::jsonb,
   'authenticated', 'authenticated', NOW(), NOW(), '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  confirmation_token = EXCLUDED.confirmation_token,
  recovery_token = EXCLUDED.recovery_token,
  email_change_token_new = EXCLUDED.email_change_token_new,
  email_change_token_current = EXCLUDED.email_change_token_current,
  email_change = EXCLUDED.email_change,
  phone_change = EXCLUDED.phone_change,
  phone_change_token = EXCLUDED.phone_change_token,
  reauthentication_token = EXCLUDED.reauthentication_token,
  updated_at = NOW();

-- =============================================================================
-- RBAC ROLES SEED DATA
-- =============================================================================

INSERT INTO authz.rbac_roles (id, name, description, permissions) VALUES
  ('c4f9a1ab-18bf-4622-a793-ff69ac071519', 'super-admin', 'Super administrator with full access to all organizations',
   ARRAY['*:*']::TEXT[]),
  ('bd9b27af-c78c-4490-b69e-01624488b420', 'admin', 'Organization administrator',
   ARRAY['org:manage', 'users:manage', 'agents:*', 'conversations:*', 'settings:*']::TEXT[]),
  ('aebbc0e1-6ba1-4c30-a606-3fa5979d9fb4', 'manager', 'Team manager with elevated permissions',
   ARRAY['agents:read', 'agents:create', 'agents:update', 'conversations:*', 'users:read']::TEXT[]),
  ('8854d99f-9c5b-4805-afe2-0ee6ca8261e2', 'member', 'Standard organization member',
   ARRAY['agents:read', 'conversations:read', 'conversations:create']::TEXT[]),
  ('733bbaf9-124f-4779-b629-f00c69ef35cb', 'viewer', 'Read-only access',
   ARRAY['agents:read', 'conversations:read']::TEXT[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- =============================================================================
-- USER ORG ROLE ASSIGNMENTS
-- =============================================================================

INSERT INTO authz.rbac_user_org_roles (user_id, organization_slug, role_id) VALUES
  -- GolferGeek: super-admin for * (all orgs), plus explicit orgs
  ('618f3960-a8be-4c67-855f-aae4130699b8', '*', 'c4f9a1ab-18bf-4622-a793-ff69ac071519'),
  ('618f3960-a8be-4c67-855f-aae4130699b8', 'orchestratorai', 'c4f9a1ab-18bf-4622-a793-ff69ac071519'),
  ('618f3960-a8be-4c67-855f-aae4130699b8', 'demo-org', 'c4f9a1ab-18bf-4622-a793-ff69ac071519'),
  ('618f3960-a8be-4c67-855f-aae4130699b8', 'golfergeek', 'c4f9a1ab-18bf-4622-a793-ff69ac071519'),
  -- Admin: admin for orchestratorai and demo-org
  ('739b2b8b-0bb1-4894-b5ba-8698c8cd071a', 'orchestratorai', 'bd9b27af-c78c-4490-b69e-01624488b420'),
  ('739b2b8b-0bb1-4894-b5ba-8698c8cd071a', 'demo-org', 'bd9b27af-c78c-4490-b69e-01624488b420'),
  -- Demo user: member of demo-org
  ('493101fa-8892-4de4-a0f9-daf43afdca1f', 'demo-org', '8854d99f-9c5b-4805-afe2-0ee6ca8261e2')
ON CONFLICT DO NOTHING;

-- Verify organizations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'demo-org') THEN
    RAISE EXCEPTION 'Failed to seed demo-org organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'orchestratorai') THEN
    RAISE EXCEPTION 'Failed to seed orchestratorai organization';
  END IF;

  RAISE NOTICE 'Successfully seeded organizations, users, and RBAC data';
END $$;

-- =============================================================================
-- AGENTS SEED DATA
-- =============================================================================
-- Demo agents for v2-start testing and development
-- Phase 1: Blog Post Writer (context agent)
-- =============================================================================

-- =============================================================================
-- BLOG POST WRITER - Context Agent
-- =============================================================================
-- Fully defined context agent for creating SEO-optimized blog posts
-- This is our reference implementation for v2-start
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
  -- Basic identifiers
  'blog-post-writer',
  ARRAY['demo-org']::TEXT[],
  'Blog Post Writer',
  'AI-powered blog post creation agent that generates high-quality, SEO-optimized content. Supports various tones, lengths, and formats with built-in keyword optimization and readability analysis.',
  '1.0.0',
  'context',
  'marketing',
  ARRAY['content-creation', 'seo', 'writing', 'marketing', 'blog']::TEXT[],

  -- Input/Output Schema
  '{
    "input": {
      "type": "object",
      "required": ["topic", "targetAudience"],
      "properties": {
        "topic": {
          "type": "string",
          "description": "The main topic or subject of the blog post"
        },
        "targetAudience": {
          "type": "string",
          "description": "The intended audience for the blog post (e.g., developers, marketers, business owners)"
        },
        "tone": {
          "type": "string",
          "enum": ["professional", "casual", "technical", "conversational", "authoritative"],
          "default": "professional",
          "description": "The writing tone and style to use"
        },
        "length": {
          "type": "string",
          "enum": ["short", "medium", "long"],
          "default": "medium",
          "description": "Target length: short (500-800 words), medium (800-1500 words), long (1500-2500 words)"
        },
        "keywords": {
          "type": "array",
          "items": {"type": "string"},
          "description": "SEO keywords to naturally incorporate into the content"
        },
        "includeHeadings": {
          "type": "boolean",
          "default": true,
          "description": "Whether to include H2/H3 headings for structure"
        },
        "includeIntro": {
          "type": "boolean",
          "default": true,
          "description": "Whether to include an engaging introduction"
        },
        "includeConclusion": {
          "type": "boolean",
          "default": true,
          "description": "Whether to include a summary conclusion with CTA"
        },
        "customInstructions": {
          "type": "string",
          "description": "Additional specific requirements or instructions"
        }
      }
    },
    "output": {
      "type": "object",
      "required": ["title", "content", "metadata"],
      "properties": {
        "title": {
          "type": "string",
          "description": "SEO-optimized blog post title"
        },
        "content": {
          "type": "string",
          "description": "Full blog post content in markdown format"
        },
        "excerpt": {
          "type": "string",
          "description": "Brief excerpt or meta description (150-160 characters)"
        },
        "metadata": {
          "type": "object",
          "properties": {
            "wordCount": {
              "type": "number",
              "description": "Total word count of the content"
            },
            "readingTime": {
              "type": "number",
              "description": "Estimated reading time in minutes"
            },
            "headings": {
              "type": "array",
              "items": {"type": "string"},
              "description": "List of H2/H3 headings used"
            },
            "keywordsUsed": {
              "type": "array",
              "items": {"type": "string"},
              "description": "Keywords successfully incorporated"
            },
            "seoScore": {
              "type": "number",
              "minimum": 0,
              "maximum": 100,
              "description": "Self-assessed SEO quality score"
            }
          }
        },
        "suggestions": {
          "type": "array",
          "items": {"type": "string"},
          "description": "Optional suggestions for improvement or follow-up topics"
        }
      }
    }
  }'::jsonb,

  -- Capabilities (includes plan/build for mode support)
  ARRAY[
    'blog-writing',
    'content-generation',
    'seo-optimization',
    'keyword-integration',
    'tone-adaptation',
    'audience-targeting',
    'content-structuring',
    'meta-description-creation',
    'plan',
    'build'
  ]::TEXT[],

  -- Context (System Prompt)
  'You are an expert blog post writer and content strategist specializing in creating engaging, SEO-optimized content.

## Your Core Competencies

1. **Content Creation Excellence**
   - Write clear, engaging, and well-structured blog posts
   - Adapt writing style to match specified tone and audience
   - Create compelling introductions that hook readers
   - Develop logical flow with smooth transitions between sections
   - Write actionable conclusions with effective CTAs

2. **SEO Optimization**
   - Naturally incorporate target keywords without keyword stuffing
   - Create SEO-friendly titles (50-60 characters ideal)
   - Write compelling meta descriptions (150-160 characters)
   - Use proper heading hierarchy (H1, H2, H3)
   - Maintain optimal keyword density (1-2%)

3. **Audience Understanding**
   - Tailor content complexity to target audience expertise level
   - Use appropriate examples and analogies for the audience
   - Address audience pain points and interests
   - Match vocabulary and terminology to reader familiarity

## Writing Process

1. **Analyze Requirements**
   - Understand the topic, audience, and goals
   - Note tone, length, and keyword requirements
   - Consider custom instructions carefully

2. **Structure Planning**
   - Create engaging title with primary keyword
   - Outline H2/H3 headings for logical flow
   - Plan keyword placement naturally throughout

3. **Content Creation**
   - Write compelling introduction (hook + context + preview)
   - Develop body sections with clear headings
   - Include examples, data, or case studies when relevant
   - Write actionable conclusion with CTA

4. **Quality Assurance**
   - Verify all keywords are naturally incorporated
   - Check reading level matches target audience
   - Ensure proper heading hierarchy
   - Validate word count meets requirements
   - Calculate reading time (avg 200-250 words/minute)

## Output Format

Always structure your response as valid JSON matching the output schema:

```json
{
  "title": "SEO-Optimized Title Here",
  "content": "# Main Title\n\n## Introduction\n\nContent here...",
  "excerpt": "Compelling 150-160 character summary...",
  "metadata": {
    "wordCount": 1234,
    "readingTime": 5,
    "headings": ["Introduction", "Main Point 1", "Conclusion"],
    "keywordsUsed": ["keyword1", "keyword2"],
    "seoScore": 85
  },
  "suggestions": ["Follow-up topic idea 1", "Improvement suggestion 2"]
}
```

## Quality Standards

- **Accuracy**: Ensure factual accuracy; avoid making claims you cannot support
- **Originality**: Create unique content; never plagiarize
- **Readability**: Use clear language, short paragraphs, and active voice
- **Value**: Provide actionable insights and practical takeaways
- **SEO**: Optimize without sacrificing readability or user experience

## Tone Guidelines

- **Professional**: Authoritative yet approachable, data-driven, industry-focused
- **Casual**: Friendly and conversational, relatable examples, lighter tone
- **Technical**: Detailed and precise, technical terminology, code examples when relevant
- **Conversational**: Direct address (you/your), storytelling, personal anecdotes
- **Authoritative**: Expert voice, research-backed, comprehensive coverage

Remember: Your goal is to create content that ranks well in search engines while genuinely helping and engaging readers. Quality content that serves the audience always wins.',

  -- LLM Configuration
  '{
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "parameters": {
      "temperature": 0.7,
      "maxTokens": 4000,
      "topP": 0.9
    }
  }'::jsonb,

  -- Metadata (includes mode_profile and execution_capabilities for BUILD mode support)
  '{
    "author": "Orchestrator AI Team",
    "license": "PROPRIETARY",
    "documentation_url": "https://docs.orchestratorai.io/agents/blog-post-writer",
    "mode_profile": "full",
    "execution_capabilities": {
      "can_converse": true,
      "can_plan": true,
      "can_build": true
    },
    "version_history": [
      {
        "version": "1.0.0",
        "date": "2025-01-20",
        "changes": "Initial release for v2-start"
      }
    ],
    "usage_examples": [
      {
        "description": "Technical blog post for developers",
        "input": {
          "topic": "Introduction to GraphQL",
          "targetAudience": "developers",
          "tone": "technical",
          "length": "medium",
          "keywords": ["GraphQL", "API", "REST", "query language"]
        }
      },
      {
        "description": "Marketing blog for business owners",
        "input": {
          "topic": "Benefits of AI in Customer Service",
          "targetAudience": "business owners",
          "tone": "professional",
          "length": "long",
          "keywords": ["AI", "customer service", "automation", "efficiency"]
        }
      }
    ],
    "performance_notes": "Optimized for content quality over speed. Average response time: 15-30 seconds for medium-length posts.",
    "limitations": [
      "Cannot access real-time data or current events without external tools",
      "May require fact-checking for highly specialized or emerging topics",
      "Does not automatically generate images or media assets"
    ]
  }'::jsonb
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
  llm_config = EXCLUDED.llm_config,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- =============================================================================
-- HR POLICY AGENT - RAG Runner Agent
-- =============================================================================
-- RAG-based agent that queries the hr-policy knowledge base collection
-- Answers questions about HR policies, benefits, procedures, etc.
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
  -- Basic identifiers
  'hr-policy-agent',
  ARRAY['demo-org', 'orchestratorai']::TEXT[],
  'HR Policy Assistant',
  'AI-powered HR assistant that answers questions about company policies, benefits, procedures, and employee guidelines using the HR knowledge base.',
  '1.0.0',
  'rag-runner',
  'hr',
  ARRAY['hr', 'policy', 'benefits', 'employee', 'knowledge-base', 'rag']::TEXT[],

  -- Input/Output Schema
  '{
    "input": {
      "type": "object",
      "required": ["question"],
      "properties": {
        "question": {
          "type": "string",
          "description": "The HR-related question to answer"
        }
      }
    },
    "output": {
      "type": "object",
      "required": ["message"],
      "properties": {
        "message": {
          "type": "string",
          "description": "The answer to the HR question"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "document": {"type": "string"},
              "score": {"type": "number"},
              "excerpt": {"type": "string"}
            }
          },
          "description": "Source documents used to answer the question"
        }
      }
    }
  }'::jsonb,

  -- Capabilities
  ARRAY[
    'hr-policy-lookup',
    'benefits-information',
    'procedure-guidance',
    'employee-handbook',
    'plan',
    'build'
  ]::TEXT[],

  -- Context (System Prompt)
  'You are an HR Policy Assistant that helps employees find information about company policies, benefits, and procedures.

## Your Role

You answer questions by searching the HR knowledge base and providing accurate, helpful information based on official company documents.

## Guidelines

1. **Accuracy First**: Only answer based on the information provided in the retrieved documents. Do not make up policies or procedures.

2. **Clear Explanations**: Explain policies in clear, easy-to-understand language while remaining accurate to the source material.

3. **Cite Sources**: When possible, mention which document or policy the information comes from (e.g., "According to the Employee Handbook...").

4. **Limitations**: If the knowledge base does not contain information to answer a question, clearly state that and suggest contacting HR directly.

5. **Confidentiality**: Do not share information that should only be accessed by specific roles or individuals.

6. **Helpful Tone**: Be friendly and professional. Remember that HR questions can be sensitive topics for employees.

## Common Topics

- PTO and leave policies
- Benefits enrollment and options
- Expense reimbursement procedures
- Code of conduct
- Performance review process
- Onboarding procedures
- Remote work policies

## Response Format

Always provide clear, concise answers. If citing multiple policies or documents, organize the information logically.',

  -- LLM Configuration (default to local Ollama gpt-oss:20b for sovereign use)
  '{
    "provider": "ollama",
    "model": "gpt-oss:20b",
    "parameters": {
      "temperature": 0.3,
      "maxTokens": 2000,
      "topP": 0.9
    }
  }'::jsonb,

  -- Metadata (includes RAG configuration)
  '{
    "author": "Orchestrator AI Team",
    "license": "PROPRIETARY",
    "mode_profile": "full",
    "execution_capabilities": {
      "can_converse": true,
      "can_plan": true,
      "can_build": true
    },
    "rag_config": {
      "collection_slug": "hr-policy",
      "top_k": 5,
      "similarity_threshold": 0.6,
      "no_results_message": "I could not find information about that in the HR knowledge base. Please contact HR directly for assistance.",
      "no_access_message": "I do not have access to the HR knowledge base. Please contact HR directly."
    },
    "version_history": [
      {
        "version": "1.0.0",
        "date": "2025-01-24",
        "changes": "Initial release - RAG-based HR policy assistant"
      }
    ]
  }'::jsonb
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
  llm_config = EXCLUDED.llm_config,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- Verify agents
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE slug = 'blog-post-writer') THEN
    RAISE EXCEPTION 'Failed to seed blog-post-writer agent';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE slug = 'hr-policy-agent') THEN
    RAISE EXCEPTION 'Failed to seed hr-policy-agent';
  END IF;

  RAISE NOTICE 'Successfully seeded 2 agents: blog-post-writer, hr-policy-agent';
END $$;

-- =============================================================================
-- LLM PROVIDERS SEED DATA
-- =============================================================================

INSERT INTO public.llm_providers (name, display_name, api_base_url, is_local, is_active) VALUES
  ('ollama', 'Ollama (Local)', 'http://localhost:11434', true, true),
  ('anthropic', 'Anthropic', 'https://api.anthropic.com', false, true),
  ('openai', 'OpenAI', 'https://api.openai.com', false, true),
  ('google', 'Google AI', 'https://generativelanguage.googleapis.com', false, true),
  ('xai', 'xAI (Grok)', 'https://api.x.ai', false, true)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  api_base_url = EXCLUDED.api_base_url,
  is_local = EXCLUDED.is_local,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- LLM MODELS SEED DATA
-- =============================================================================

-- Ollama local models (marked as loaded)
-- Note: speed_tier 'very-fast' maps to routing tier 'ultra-fast' in local-model-status.service.ts
-- gpt-oss:20b is the default model for sovereign/internal use
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_local, is_currently_loaded, is_active) VALUES
  ('gpt-oss:20b', 'ollama', 'GPT-OSS 20B', 'text-generation', 32768, 8192, 'medium', true, true, true),
  ('llama3.2:1b', 'ollama', 'Llama 3.2 1B', 'text-generation', 8192, 4096, 'very-fast', true, true, true),
  ('llama3.2:3b', 'ollama', 'Llama 3.2 3B', 'text-generation', 8192, 4096, 'very-fast', true, true, true),
  ('llama3.2:latest', 'ollama', 'Llama 3.2 Latest', 'text-generation', 8192, 4096, 'fast', true, true, true),
  ('qwen3:8b', 'ollama', 'Qwen 3 8B', 'text-generation', 32768, 8192, 'fast', true, true, true),
  ('deepseek-r1:latest', 'ollama', 'DeepSeek R1', 'text-generation', 32768, 8192, 'medium', true, true, true),
  ('qwq:latest', 'ollama', 'QwQ', 'text-generation', 32768, 8192, 'medium', true, true, true),
  ('nomic-embed-text:latest', 'ollama', 'Nomic Embed Text', 'embedding', 8192, 768, 'fast', true, true, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  speed_tier = EXCLUDED.speed_tier,
  is_currently_loaded = EXCLUDED.is_currently_loaded,
  is_active = EXCLUDED.is_active;

-- Anthropic models
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_local, is_currently_loaded, is_active) VALUES
  ('claude-sonnet-4-5-20250514', 'anthropic', 'Claude Sonnet 4.5', 'text-generation', 200000, 8192, 'fast', false, false, true),
  ('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet', 'text-generation', 200000, 8192, 'fast', false, false, true),
  ('claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku', 'text-generation', 200000, 8192, 'very-fast', false, false, true),
  ('claude-3-opus-20240229', 'anthropic', 'Claude 3 Opus', 'text-generation', 200000, 4096, 'slow', false, false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  speed_tier = EXCLUDED.speed_tier,
  is_active = EXCLUDED.is_active;

-- OpenAI models
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_local, is_currently_loaded, is_active) VALUES
  ('gpt-4o', 'openai', 'GPT-4o', 'text-generation', 128000, 4096, 'fast', false, false, true),
  ('gpt-4o-mini', 'openai', 'GPT-4o Mini', 'text-generation', 128000, 4096, 'very-fast', false, false, true),
  ('gpt-4-turbo', 'openai', 'GPT-4 Turbo', 'text-generation', 128000, 4096, 'medium', false, false, true),
  ('o1-preview', 'openai', 'o1 Preview', 'text-generation', 128000, 32768, 'slow', false, false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  speed_tier = EXCLUDED.speed_tier,
  is_active = EXCLUDED.is_active;

-- Google models
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_local, is_currently_loaded, is_active) VALUES
  ('gemini-2.0-flash', 'google', 'Gemini 2.0 Flash', 'text-generation', 1000000, 8192, 'very-fast', false, false, true),
  ('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro', 'text-generation', 2000000, 8192, 'fast', false, false, true),
  ('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash', 'text-generation', 1000000, 8192, 'very-fast', false, false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  speed_tier = EXCLUDED.speed_tier,
  is_active = EXCLUDED.is_active;

-- xAI models
INSERT INTO public.llm_models (model_name, provider_name, display_name, model_type, context_window, max_output_tokens, speed_tier, is_local, is_currently_loaded, is_active) VALUES
  ('grok-2', 'xai', 'Grok 2', 'text-generation', 128000, 8192, 'fast', false, false, true),
  ('grok-2-mini', 'xai', 'Grok 2 Mini', 'text-generation', 128000, 8192, 'very-fast', false, false, true)
ON CONFLICT (model_name, provider_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  speed_tier = EXCLUDED.speed_tier,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- FINAL VERIFICATION
-- =============================================================================

DO $$
DECLARE
  org_count INTEGER;
  agent_count INTEGER;
  provider_count INTEGER;
  model_count INTEGER;
BEGIN
  -- Count seeded records
  SELECT COUNT(*) INTO org_count FROM public.organizations;
  SELECT COUNT(*) INTO agent_count FROM public.agents;
  SELECT COUNT(*) INTO provider_count FROM public.llm_providers;
  SELECT COUNT(*) INTO model_count FROM public.llm_models;

  -- Report results
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Database seeding completed successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Organizations seeded: %', org_count;
  RAISE NOTICE 'Agents seeded: %', agent_count;
  RAISE NOTICE 'LLM Providers seeded: %', provider_count;
  RAISE NOTICE 'LLM Models seeded: %', model_count;
  RAISE NOTICE '================================================';

  -- Validate minimum expected data
  IF org_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 organization, found %', org_count;
  END IF;

  IF agent_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 agent, found %', agent_count;
  END IF;

  IF provider_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 LLM provider, found %', provider_count;
  END IF;

  IF model_count < 1 THEN
    RAISE EXCEPTION 'Expected at least 1 LLM model, found %', model_count;
  END IF;

  RAISE NOTICE 'All validations passed ✓';
END $$;
