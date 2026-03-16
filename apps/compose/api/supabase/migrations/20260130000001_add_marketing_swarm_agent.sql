-- =============================================================================
-- ADD MARKETING SWARM API AGENT AND SEED DATA
-- =============================================================================
-- Registers marketing-swarm as an API agent that wraps the LangGraph workflow
-- Also seeds content types, marketing agents, and LLM configurations
-- This data was previously in seed files but never migrated to the database
-- Created: 2026-01-30
-- =============================================================================

-- =============================================================================
-- 1. MARKETING SWARM API AGENT (public.agents)
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
    metadata
) VALUES (
    'marketing-swarm',
    ARRAY['marketing']::TEXT[],
    'Marketing Swarm',
    'Multi-agent marketing content generation system. Uses multiple writer agents to create drafts, editor agents for review cycles, and evaluator agents to score outputs. Compares different LLM and personality combinations.',
    '1.0.0',
    'api',
    'marketing',
    ARRAY['content-creation', 'multi-agent', 'swarm', 'marketing', 'langgraph']::TEXT[],

    -- Input/Output Schema
    '{
        "input": {
            "type": "object",
            "required": ["contentTypeSlug", "promptData", "config"],
            "properties": {
                "contentTypeSlug": {
                    "type": "string",
                    "description": "Slug of the content type to generate (e.g., blog-post, linkedin-post)"
                },
                "promptData": {
                    "type": "object",
                    "description": "Answers to the 8-question interview guiding content creation",
                    "properties": {
                        "topic": { "type": "string" },
                        "audience": { "type": "string" },
                        "goal": { "type": "string" },
                        "keyPoints": { "type": "array", "items": { "type": "string" } },
                        "tone": { "type": "string" },
                        "constraints": { "type": "string" },
                        "examples": { "type": "string" },
                        "additionalContext": { "type": "string" }
                    }
                },
                "config": {
                    "type": "object",
                    "description": "Selected agents and LLM configurations",
                    "properties": {
                        "writers": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "agentSlug": { "type": "string" },
                                    "llmConfigIds": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "editors": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "agentSlug": { "type": "string" },
                                    "llmConfigIds": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "evaluators": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "agentSlug": { "type": "string" },
                                    "llmConfigIds": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "maxEditCycles": {
                            "type": "integer",
                            "default": 3,
                            "minimum": 1,
                            "maximum": 5
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
                    "description": "UUID of the swarm task for tracking"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "running", "completed", "failed"],
                    "description": "Current status of the swarm execution"
                },
                "progress": {
                    "type": "object",
                    "properties": {
                        "total": { "type": "integer" },
                        "completed": { "type": "integer" },
                        "percentage": { "type": "number" }
                    }
                },
                "outputs": {
                    "type": "array",
                    "description": "Generated content outputs with evaluations",
                    "items": {
                        "type": "object",
                        "properties": {
                            "outputId": { "type": "string" },
                            "writerAgent": { "type": "string" },
                            "writerLlm": { "type": "string" },
                            "editorAgent": { "type": "string" },
                            "editorLlm": { "type": "string" },
                            "content": { "type": "string" },
                            "editCycles": { "type": "integer" },
                            "averageScore": { "type": "number" },
                            "evaluations": { "type": "array" }
                        }
                    }
                },
                "rankedResults": {
                    "type": "array",
                    "description": "Outputs ranked by weighted evaluation scores"
                }
            }
        }
    }'::JSONB,

    -- Capabilities
    ARRAY['content-generation', 'multi-agent-orchestration', 'iterative-editing', 'content-evaluation', 'llm-comparison']::TEXT[],

    -- Context (JSONB with markdown content)
    '{"markdown": "# Marketing Swarm Agent\n\nA sophisticated multi-agent system for generating high-quality marketing content through collaboration and competition.\n\n## How It Works\n\n1. **Configuration**: Select content type, provide prompts, choose writer/editor/evaluator agents with LLM configurations\n2. **Writing Phase**: Multiple writer agents generate initial drafts in parallel (or sequentially for local LLMs)\n3. **Editing Phase**: Each draft is reviewed by selected editors (up to 5 revision cycles until approved)\n4. **Evaluation Phase**: All approved outputs are scored by evaluator agents\n5. **Ranking**: Outputs are ranked by weighted evaluation scores\n\n## Key Features\n\n- **Personality + LLM Separation**: Same agent personality can use different LLMs for comparison\n- **Multiplicative Combinations**: Writers x Editors x LLMs = comprehensive content exploration\n- **Iterative Refinement**: Edit cycles continue until editor approves or max cycles reached\n- **Full Audit Trail**: Every draft, revision, and evaluation is stored for analysis\n- **Reconnection Support**: Resume viewing progress from database state\n\n## Custom UI\n\nThis agent has a custom UI at `/agents/{org}/marketing-swarm` that provides:\n- Interactive configuration wizard\n- Real-time progress dashboard with agent cards\n- Side-by-side content comparison\n- Detailed audit trail viewer\n\n## SSE Progress Events\n\nThe agent streams progress via SSE messages:\n- `queue_built`: Initial execution plan ready\n- `step_started`: Agent beginning work\n- `step_completed`: Agent finished with results\n- `edit_cycle_added`: New revision cycle needed\n- `phase_changed`: Major workflow phase transition\n- `error`: Something went wrong"}'::JSONB,

    -- Endpoint configuration (API agent calling LangGraph)
    '{
        "url": "http://localhost:6200/marketing-swarm/execute",
        "method": "POST",
        "headers": {
            "Content-Type": "application/json"
        },
        "timeout": 7200000,
        "responseTransform": {
            "content": "$.message",
            "metadata": {
                "taskId": "$.taskId",
                "status": "$.status",
                "progress": "$.progress"
            }
        }
    }'::JSONB,

    -- Metadata
    '{
        "provider": "langgraph",
        "langgraphEndpoint": "http://localhost:6200",
        "features": ["multi-agent", "swarm", "sse-streaming", "custom-ui"],
        "hasCustomUI": true,
        "customUIComponent": "marketing-swarm",
        "statusEndpoint": "/marketing-swarm/status/{taskId}",
        "interaction_mode": "dashboard",
        "dashboardType": "custom",
        "execution_capabilities": {
            "can_converse": false,
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
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- 2. MARKETING CONTENT TYPES (marketing.content_types)
-- =============================================================================

-- Blog Post
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'blog-post',
    'marketing',
    'Blog Post',
    'Long-form blog content for company websites and content marketing',
    'You are writing a blog post. Focus on:
- Engaging introduction that hooks the reader
- Clear structure with headers and subheaders
- Actionable insights and practical advice
- Natural, conversational tone
- Strong call-to-action at the end
- SEO-friendly without keyword stuffing
- Length: 800-1500 words'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- LinkedIn Post
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'linkedin-post',
    'marketing',
    'LinkedIn Post',
    'Professional social media content for LinkedIn',
    'You are writing a LinkedIn post. Focus on:
- Hook in the first line (this shows before "see more")
- Professional but personable tone
- Use line breaks for readability
- Include a clear point or lesson
- End with engagement prompt (question or call-to-action)
- Optional: relevant hashtags (3-5 max)
- Length: 150-300 words (under 3000 characters)'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Twitter/X Thread
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'twitter-thread',
    'marketing',
    'Twitter/X Thread',
    'Multi-tweet thread for Twitter/X',
    'You are writing a Twitter/X thread. Focus on:
- First tweet must hook and stand alone
- Number each tweet (1/, 2/, etc.)
- Each tweet under 280 characters
- Build narrative across tweets
- Use simple, punchy language
- Final tweet: summary + CTA
- 5-10 tweets total
- Avoid hashtags mid-thread (save for last tweet)'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Email Newsletter
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'email-newsletter',
    'marketing',
    'Email Newsletter',
    'Email newsletter content for subscribers',
    'You are writing an email newsletter. Focus on:
- Compelling subject line (include it first)
- Preview text that complements subject
- Personal greeting and warm opening
- One main topic or theme
- Scannable format with short paragraphs
- Clear CTA button text
- P.S. line for secondary message
- Length: 300-600 words'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Product Description
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'product-description',
    'marketing',
    'Product Description',
    'E-commerce product descriptions',
    'You are writing a product description. Focus on:
- Headline that captures key benefit
- Lead with benefits, support with features
- Use sensory and emotional language
- Address customer pain points
- Include specifications naturally
- Social proof mentions if relevant
- Urgency/scarcity if appropriate
- Length: 150-300 words'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Landing Page Copy
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'landing-page',
    'marketing',
    'Landing Page Copy',
    'Conversion-focused landing page content',
    'You are writing landing page copy. Focus on:
- Hero headline: clear value proposition
- Subheadline: expand on the promise
- Problem/agitation section
- Solution introduction
- Benefits (3-5 bullet points)
- Social proof section
- FAQ anticipation
- Strong CTA (button text + supporting copy)
- Use sections/headers for structure'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Press Release
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'press-release',
    'marketing',
    'Press Release',
    'Official press release announcements',
    'You are writing a press release. Focus on:
- Headline: newsworthy and specific
- Dateline: City, State - Date
- Lead paragraph: who, what, when, where, why
- Body: supporting details and quotes
- Include placeholder for executive quote
- Company boilerplate at end
- Contact information section
- Keep factual and objective
- Length: 400-600 words
- AP style preferred'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- Case Study
INSERT INTO marketing.content_types (slug, organization_slug, name, description, system_context)
VALUES (
    'case-study',
    'marketing',
    'Case Study',
    'Customer success story and case study',
    'You are writing a case study. Focus on:
- Title: Result-focused headline
- Executive summary (2-3 sentences)
- The Challenge section
- The Solution section
- Implementation highlights
- Results with specific metrics
- Customer quote placeholder
- Key takeaways
- CTA: how readers can get similar results
- Length: 600-1000 words'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_context = EXCLUDED.system_context,
    updated_at = NOW();

-- =============================================================================
-- 3. WRITER AGENTS (marketing.agents)
-- =============================================================================

-- Creative Writer
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-creative',
    'marketing',
    'writer',
    'Creative Writer',
    '{
        "system_context": "You are a creative marketing writer who excels at storytelling and emotional connection. Your writing is vivid, engaging, and memorable. You use metaphors, analogies, and narrative techniques to make content compelling.",
        "style_guidelines": [
            "Use storytelling and narrative arcs",
            "Create emotional hooks and connections",
            "Employ vivid, sensory language",
            "Take creative risks with structure",
            "Make abstract concepts concrete through stories"
        ],
        "strengths": ["storytelling", "emotional appeal", "creativity", "memorability"],
        "weaknesses": ["may sacrifice clarity for creativity", "can be too flowery"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Technical Writer
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-technical',
    'marketing',
    'writer',
    'Technical Writer',
    '{
        "system_context": "You are a technical marketing writer who excels at explaining complex topics clearly. Your writing is precise, well-researched, and authoritative. You use data, examples, and logical structure to educate readers.",
        "style_guidelines": [
            "Lead with clarity and precision",
            "Use data and statistics effectively",
            "Break down complex concepts step-by-step",
            "Include relevant examples and use cases",
            "Maintain authoritative but accessible tone"
        ],
        "strengths": ["clarity", "accuracy", "expertise", "educational value"],
        "weaknesses": ["may be too dry", "can over-explain"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Conversational Writer
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-conversational',
    'marketing',
    'writer',
    'Conversational Writer',
    '{
        "system_context": "You are a conversational marketing writer who writes like you are talking to a friend. Your writing is warm, relatable, and easy to read. You use casual language, rhetorical questions, and personal touches.",
        "style_guidelines": [
            "Write like you are talking to a friend",
            "Use contractions and casual language",
            "Ask rhetorical questions to engage",
            "Include personal anecdotes and you language",
            "Keep sentences short and punchy"
        ],
        "strengths": ["relatability", "readability", "engagement", "accessibility"],
        "weaknesses": ["may lack authority", "can be too informal"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Persuasive Writer
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'writer-persuasive',
    'marketing',
    'writer',
    'Persuasive Writer',
    '{
        "system_context": "You are a persuasive marketing writer who excels at driving action. Your writing uses psychological triggers, urgency, and compelling arguments. You focus on benefits, objection handling, and strong calls-to-action.",
        "style_guidelines": [
            "Lead with the strongest benefit",
            "Use power words and action verbs",
            "Address objections proactively",
            "Create urgency without being pushy",
            "End with clear, compelling CTAs"
        ],
        "strengths": ["conversion focus", "urgency", "objection handling", "CTA strength"],
        "weaknesses": ["may seem salesy", "can overuse urgency tactics"]
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 4. EDITOR AGENTS (marketing.agents)
-- =============================================================================

-- Clarity Editor
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-clarity',
    'marketing',
    'editor',
    'Clarity Editor',
    '{
        "system_context": "You are an editor focused on clarity and readability. You simplify complex sentences, eliminate jargon, and ensure the message is crystal clear. You value conciseness and accessibility.",
        "review_focus": [
            "Simplify complex sentences",
            "Remove unnecessary jargon",
            "Ensure logical flow",
            "Improve readability scores",
            "Make key points unmistakable"
        ],
        "approval_criteria": "Approve when the content is clear, concise, and easy to understand at a glance. Reject if there are confusing passages or unclear messages.",
        "feedback_style": "Direct and specific, pointing to exact sentences that need work"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Brand Voice Editor
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-brand',
    'marketing',
    'editor',
    'Brand Voice Editor',
    '{
        "system_context": "You are an editor focused on brand consistency and voice. You ensure content matches the brand tone, values, and messaging guidelines. You catch off-brand language and reinforce brand identity.",
        "review_focus": [
            "Ensure consistent brand voice",
            "Check tone appropriateness",
            "Verify messaging alignment",
            "Maintain brand personality",
            "Flag off-brand language"
        ],
        "approval_criteria": "Approve when the content feels authentically on-brand and maintains consistent voice throughout. Reject if tone shifts or brand voice is inconsistent.",
        "feedback_style": "Explains how specific phrases align or conflict with brand guidelines"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Engagement Editor
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-engagement',
    'marketing',
    'editor',
    'Engagement Editor',
    '{
        "system_context": "You are an editor focused on audience engagement and hooks. You strengthen openings, add intrigue, and ensure content captures and maintains attention. You think about scroll-stopping power.",
        "review_focus": [
            "Strengthen opening hooks",
            "Add pattern interrupts",
            "Improve engagement triggers",
            "Enhance emotional resonance",
            "Optimize for attention spans"
        ],
        "approval_criteria": "Approve when the content would make you stop scrolling and read to the end. Reject if the opening is weak or attention wanders.",
        "feedback_style": "Enthusiastic about what works, specific about what could hook harder"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- SEO Editor
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'editor-seo',
    'marketing',
    'editor',
    'SEO Editor',
    '{
        "system_context": "You are an editor focused on search optimization without sacrificing quality. You ensure content is discoverable while remaining valuable to readers. You balance keywords with natural writing.",
        "review_focus": [
            "Natural keyword integration",
            "Header structure for SEO",
            "Meta description quality",
            "Internal linking opportunities",
            "Readability for search"
        ],
        "approval_criteria": "Approve when content is well-optimized without feeling keyword-stuffed. Reject if SEO compromises readability or natural flow.",
        "feedback_style": "Suggests specific optimizations with search intent reasoning"
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 5. EVALUATOR AGENTS (marketing.agents)
-- =============================================================================

-- Quality Evaluator
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-quality',
    'marketing',
    'evaluator',
    'Quality Evaluator',
    '{
        "system_context": "You evaluate content quality holistically. You assess writing craft, message clarity, audience fit, and overall effectiveness. You provide balanced, actionable scores.",
        "evaluation_criteria": {
            "writing_craft": "Grammar, style, flow, and polish",
            "message_clarity": "Is the main point clear and memorable?",
            "audience_fit": "Does it speak to the target audience?",
            "effectiveness": "Will it achieve its marketing goal?"
        },
        "scoring_approach": "Balanced assessment across all criteria, looking for strengths and weaknesses",
        "score_anchors": {
            "1-3": "Needs significant work, major issues",
            "4-5": "Below average, notable problems",
            "6-7": "Good, solid work with minor issues",
            "8-9": "Excellent, publication-ready",
            "10": "Exceptional, best-in-class"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Conversion Evaluator
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-conversion',
    'marketing',
    'evaluator',
    'Conversion Evaluator',
    '{
        "system_context": "You evaluate content for conversion potential. You assess persuasiveness, CTA strength, objection handling, and likelihood to drive action. You think like a conversion rate optimizer.",
        "evaluation_criteria": {
            "hook_strength": "Does it grab attention immediately?",
            "value_proposition": "Is the benefit clear and compelling?",
            "objection_handling": "Are concerns addressed?",
            "cta_effectiveness": "Is the call-to-action strong?"
        },
        "scoring_approach": "Focused on whether this content would convert, with emphasis on persuasive elements",
        "score_anchors": {
            "1-3": "Unlikely to convert, weak persuasion",
            "4-5": "Low conversion potential, missing key elements",
            "6-7": "Decent conversion potential, could improve",
            "8-9": "Strong conversion potential, well-crafted",
            "10": "Highly compelling, would definitely convert"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- Creativity Evaluator
INSERT INTO marketing.agents (slug, organization_slug, role, name, personality)
VALUES (
    'evaluator-creativity',
    'marketing',
    'evaluator',
    'Creativity Evaluator',
    '{
        "system_context": "You evaluate content for creativity and originality. You assess uniqueness, memorable elements, creative risks, and standout potential. You value bold choices over safe mediocrity.",
        "evaluation_criteria": {
            "originality": "Is this fresh or formulaic?",
            "memorability": "Will readers remember this?",
            "creative_risk": "Does it take interesting chances?",
            "standout_factor": "Would this stand out in a feed?"
        },
        "scoring_approach": "Rewards creative risks and penalizes generic, template-like content",
        "score_anchors": {
            "1-3": "Generic, forgettable, template-like",
            "4-5": "Safe, unremarkable, seen before",
            "6-7": "Some creative elements, mostly solid",
            "8-9": "Creative, memorable, stands out",
            "10": "Brilliant, innovative, award-worthy"
        }
    }'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    personality = EXCLUDED.personality,
    updated_at = NOW();

-- =============================================================================
-- 6. AGENT LLM CONFIGURATIONS (marketing.agent_llm_configs)
-- =============================================================================

-- Writers with multiple LLM options
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Creative Writer
    ('writer-creative', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('writer-creative', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('writer-creative', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Technical Writer
    ('writer-technical', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('writer-technical', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('writer-technical', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Conversational Writer
    ('writer-conversational', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('writer-conversational', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('writer-conversational', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Persuasive Writer
    ('writer-persuasive', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('writer-persuasive', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('writer-persuasive', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- Editors with multiple LLM options
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Clarity Editor
    ('editor-clarity', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('editor-clarity', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('editor-clarity', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Brand Voice Editor
    ('editor-brand', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('editor-brand', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('editor-brand', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Engagement Editor
    ('editor-engagement', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('editor-engagement', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('editor-engagement', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- SEO Editor
    ('editor-seo', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('editor-seo', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('editor-seo', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- Evaluators with multiple LLM options
INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
VALUES
    -- Quality Evaluator
    ('evaluator-quality', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('evaluator-quality', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('evaluator-quality', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Conversion Evaluator
    ('evaluator-conversion', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('evaluator-conversion', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('evaluator-conversion', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true),

    -- Creativity Evaluator
    ('evaluator-creativity', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', true, false),
    ('evaluator-creativity', 'openai', 'gpt-4o', 'GPT-4o', false, false),
    ('evaluator-creativity', 'ollama', 'llama3.2', 'Llama 3.2 (Local)', false, true)
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_default = EXCLUDED.is_default,
    is_local = EXCLUDED.is_local;

-- =============================================================================
-- 7. OLLAMA CLOUD MODELS FOR ALL AGENTS
-- =============================================================================
-- Add Ollama Cloud models (from public.llm_models) to all marketing agents

INSERT INTO marketing.agent_llm_configs (agent_slug, llm_provider, llm_model, display_name, is_default, is_local)
SELECT
  a.slug,
  'ollama',
  m.model_name,
  m.display_name,
  false,
  false  -- cloud models are NOT local
FROM marketing.agents a
CROSS JOIN (
  SELECT model_name, display_name
  FROM public.llm_models
  WHERE provider_name = 'ollama' AND model_tier = 'cloud'
) m
ON CONFLICT (agent_slug, llm_provider, llm_model) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_local = EXCLUDED.is_local;

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
DECLARE
  cloud_config_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO cloud_config_count
    FROM marketing.agent_llm_configs
    WHERE llm_provider = 'ollama' AND is_local = false;

    RAISE NOTICE 'Successfully registered marketing-swarm API agent and seed data:';
    RAISE NOTICE '  - 1 API agent (marketing-swarm)';
    RAISE NOTICE '  - 8 content types';
    RAISE NOTICE '  - 4 writer agents';
    RAISE NOTICE '  - 4 editor agents';
    RAISE NOTICE '  - 3 evaluator agents';
    RAISE NOTICE '  - 33+ agent LLM configurations (including % Ollama Cloud configs)', cloud_config_count;
END $$;
