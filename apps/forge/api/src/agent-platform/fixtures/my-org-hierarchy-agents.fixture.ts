import { AgentRecord } from '../interfaces/agent.interface';

const EPOCH = '1970-01-01T00:00:00.000Z';

type Descriptor = Record<string, unknown>;

interface AgentFixture {
  descriptor: Descriptor;
  record: AgentRecord;
}

const mkRecord = (
  slug: string,
  displayName: string,
  description: string,
  agentType: string,
  descriptor: Descriptor,
  overrides: Partial<AgentRecord> = {},
): AgentRecord => {
  const metadataObj = descriptor.metadata as
    | Record<string, unknown>
    | undefined;
  const tags = Array.isArray(metadataObj?.tags)
    ? (metadataObj.tags as string[])
    : [];

  return {
    organization_slug: ['my-org'],
    slug,
    name: displayName,
    description,
    agent_type: agentType as 'context' | 'api' | 'external',
    department: 'hiverarchy',
    version: '0.1.0',
    tags,
    capabilities: (descriptor.capabilities as string[]) || [],
    context: JSON.stringify(descriptor, null, 2), // Store descriptor as markdown-formatted JSON
    io_schema: {},
    endpoint: null,
    llm_config: null,
    metadata: {
      mode_profile: 'specialist_full',
      status: 'active',
      supported_modes: ['converse', 'plan', 'build'],
      streaming: { enabled: true },
    },
    created_at: EPOCH,
    updated_at: EPOCH,
    ...overrides,
  };
};

const baseCommunication = {
  input_modes: ['text/plain'],
  output_modes: ['text/markdown', 'application/json'],
};

const orchestratorDescriptor: Descriptor = {
  metadata: {
    name: 'hiverarchy-orchestrator',
    displayName: 'Hiverarchy Orchestrator',
    description:
      'Coordinates Hiverarchy publishing workflow for my-org ideas, delegating to specialists and recording progress.',
    version: '0.1.0',
    type: 'orchestrator',
    tags: ['my-org', 'orchestrator', 'publishing'],
  },
  capabilities: ['converse', 'plan', 'build', 'delegate', 'hiverarchy_sync'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: true,
      supports_build: true,
      supports_orchestration: true,
    },
    prompt_prefix:
      'You manage the my-org Hiverarchy publishing pipeline. Delegate work, coordinate hand-offs, and capture updates for Supabase.',
  },
  skills: [
    {
      id: 'delegation',
      name: 'Delegate specialists',
      description:
        'Assigns specialist agents appropriate tasks and tracks completion.',
      tags: ['coordination'],
      input_modes: ['text/plain'],
      output_modes: ['application/json'],
    },
    {
      id: 'status-tracking',
      name: 'Track Hiverarchy status',
      description:
        'Maintains a summary of Hiverarchy publishing progress across agents.',
      tags: ['status'],
      input_modes: ['text/plain'],
      output_modes: ['text/markdown'],
    },
  ],
  prompts: {
    system:
      'You are the Hiverarchy orchestrator for my-org. Coordinate specialist agents to transform a content idea into a published blog post. Maintain a checklist, capture deliverables, and surface blockers for human review.',
    plan: 'Draft a phase-by-phase plan covering research, topic hierarchy, outlining, drafting, editing, imagery, human review, and Supabase updates. Each phase must list owner, inputs, and outputs.',
    build:
      'Summarize current progress across the publishing pipeline (what is done, in progress, and pending human action).',
    human:
      'Describe what approval or input the human reviewer must provide to continue the orchestration.',
  },
  context: {
    plan_rubric: {
      required_sections: ['Context', 'Phases', 'Risks', 'Next Steps'],
      default_phase_labels: [
        'Research',
        'Hierarchy Design',
        'Outline',
        'Drafting',
        'Editing',
        'Imagery',
        'Human Review',
        'Publish Updates',
      ],
    },
  },
};

const researcherDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-researcher',
    displayName: 'Hiverarchy Researcher',
    description:
      'Generates structured research packets (facts, sources, stats) for the Hiverarchy publishing workflow.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['research', 'my-org'],
  },
  capabilities: ['converse', 'plan', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: true,
      supports_build: true,
    },
    prompt_prefix:
      'You are an expert researcher. Expand prompts into source-backed notes, quotes, and statistics that downstream agents can trust.',
  },
  skills: [
    {
      id: 'source-discovery',
      name: 'Discover sources',
      tags: ['research'],
      input_modes: ['text/plain'],
      output_modes: ['application/json'],
    },
    {
      id: 'note-synthesis',
      name: 'Synthesize notes',
      tags: ['analysis'],
      input_modes: ['text/plain'],
      output_modes: ['text/markdown'],
    },
  ],
  prompts: {
    system:
      'You produce structured research packets for Hiverarchy publishing. Include source URLs and key takeaways.',
    plan: 'List the research steps you will take (queries, sources, validation).',
    build:
      'Return a research packet in JSON with sections for facts, quotes, statistics, source links, and suggested supporting media.',
  },
};

const childTopicDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-child-builder',
    displayName: 'Hiverarchy Child Topic Builder',
    description:
      'Transforms research into a hierarchical set of child topics for the Hiverarchy taxonomy.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['hierarchy', 'taxonomy'],
  },
  capabilities: ['plan', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: false,
      supports_plan: true,
      supports_build: true,
    },
    prompt_prefix:
      'You design hierarchical topic structures. Use research inputs plus existing taxonomy hints to create parent/child nodes.',
  },
  prompts: {
    system:
      'Produce a hierarchy of child topics that support the main blog idea. Include node slugs, titles, and brief rationales.',
    build:
      'Return JSON: {"nodes": [{"slug", "title", "summary", "parentSlug"}]} covering primary and supporting topics.',
  },
};

const outlinerDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-outliner',
    displayName: 'Hiverarchy Outliner',
    description:
      'Creates a full outline using the parent idea, research notes, and generated child topics.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['outline', 'structure'],
  },
  capabilities: ['converse', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You craft engaging outlines with sections, talking points, CTAs, and suggested assets.',
  },
  prompts: {
    system:
      'Build an outline with numbered sections, subsections, key talking points, and recommended visuals or CTAs.',
    build:
      'Return Markdown with section headings, bullet points, and notes referencing research sources where appropriate.',
  },
};

const writerDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-writer',
    displayName: 'Hiverarchy Writer',
    description:
      'Drafts the full blog post using the outline, research, and child topic hierarchy.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['writing'],
  },
  capabilities: ['converse', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You are an informal yet knowledgeable writer crafting posts for my-org. Follow the provided outline exactly.',
  },
  prompts: {
    system:
      'Write a blog post that follows the outline structure, weaving in research facts and recommended CTAs. Tone: informal, confident, helpful.',
    build:
      'Return Markdown for the full post, including headings, body paragraphs, callouts, and references.',
  },
};

const editorDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-editor',
    displayName: 'Hiverarchy Editor',
    description:
      'Reviews drafts, ensures structure/voice requirements, and produces a polished version with notes.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['editing'],
  },
  capabilities: ['converse', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You edit drafts for flow, consistency, and brand voice. Provide change notes when adjustments are made.',
  },
  prompts: {
    system:
      'Review the draft. Ensure tone is informal but authoritative, structure follows outline, and transitions are smooth.',
    build:
      'Return a JSON object `{ "cleanDraft": "...", "changeNotes": ["..."] }` summarizing edits.',
  },
};

const imageDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-hiverarchy-image-generator',
    displayName: 'Hiverarchy Image Generator',
    description:
      'Creates or selects an appropriate hero image for the blog post and stores metadata.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['imagery', 'creative'],
  },
  capabilities: ['build'],
  communication: {
    input_modes: ['text/plain'],
    output_modes: ['application/json'],
  },
  configuration: {
    execution_capabilities: {
      supports_converse: false,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You prepare visual concepts for the blog post using AI imagery or curated assets.',
  },
  prompts: {
    system:
      'Propose or generate an image that complements the blog post. Include alt text and storage instructions.',
    build:
      'Return JSON `{ "imageUrl": "...", "altText": "...", "credit": "..." }`.',
  },
};

const supabaseEnvContext = {
  myOrgConfig: {
    supabaseUrlEnv: 'HIVERARCHY_SUPABASE_URL',
    supabaseAnonKeyEnv: 'HIVERARCHY_SUPABASE_ANON_KEY',
  },
};

const supabaseUpdateDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-supabase-update',
    displayName: 'Supabase Post Updater',
    description:
      'Updates the main post record in Hiverarchy with the approved content.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['supabase', 'update'],
  },
  capabilities: ['build'],
  communication: {
    input_modes: ['application/json'],
    output_modes: ['application/json'],
  },
  configuration: {
    execution_capabilities: {
      supports_converse: false,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You update the parent post in Supabase with finalized content and metadata.',
  },
  prompts: {
    system:
      'Receive the final content payload and write it to Supabase. Return confirmation with record IDs.',
    build:
      'Return JSON `{ "status": "updated", "postId": "..." }` or an error summary.',
  },
  context: supabaseEnvContext,
};

const supabaseChildDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-supabase-child-create',
    displayName: 'Supabase Child Idea Creator',
    description:
      'Creates child post stubs (idea-only) for each hierarchy node.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['supabase', 'create'],
  },
  capabilities: ['build'],
  communication: {
    input_modes: ['application/json'],
    output_modes: ['application/json'],
  },
  configuration: {
    execution_capabilities: {
      supports_converse: false,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You insert child idea posts in Supabase based on the hierarchy produced earlier.',
  },
  prompts: {
    system:
      'Create stub records for each child topic. Each should contain title, parent references, and idea notes.',
    build: 'Return JSON `{ "created": [postId, ...] }`.',
  },
  context: supabaseEnvContext,
};

const supabaseListDescriptor: Descriptor = {
  metadata: {
    name: 'my-org-supabase-idea-list',
    displayName: 'Supabase Idea List',
    description: 'Lists idea-only posts awaiting orchestration.',
    version: '0.1.0',
    type: 'specialist',
    tags: ['supabase', 'list'],
  },
  capabilities: ['converse', 'build'],
  communication: baseCommunication,
  configuration: {
    execution_capabilities: {
      supports_converse: true,
      supports_plan: false,
      supports_build: true,
    },
    prompt_prefix:
      'You retrieve idea-only posts from Supabase and present them for orchestration scheduling.',
  },
  prompts: {
    system:
      'List ideas that are ready to become full posts. Include IDs, titles, and priority metadata.',
    build:
      'Return Markdown table summarizing the next ideas (ID, title, priority, lastUpdated).',
  },
  context: supabaseEnvContext,
};

export const myOrgHierarchyAgentFixtures: AgentFixture[] = [
  {
    descriptor: orchestratorDescriptor,
    record: mkRecord(
      'hiverarchy-orchestrator',
      'Hiverarchy Orchestrator',
      'Coordinates my-org Hiverarchy publishing workflow.',
      'context',
      orchestratorDescriptor,
      {
        metadata: {
          mode_profile: 'orchestrator_full',
          status: 'active',
          supported_modes: ['converse', 'plan', 'build'],
          streaming: { enabled: true },
          orchestrator: true,
        },
      },
    ),
  },
  {
    descriptor: researcherDescriptor,
    record: mkRecord(
      'hiverarchy-researcher',
      'Hiverarchy Researcher',
      'Generates source-backed research packets for Hiverarchy.',
      'context',
      researcherDescriptor,
    ),
  },
  {
    descriptor: childTopicDescriptor,
    record: mkRecord(
      'hiverarchy-child-builder',
      'Hiverarchy Child Topic Builder',
      'Creates hierarchical child topics for Hiverarchy.',
      'context',
      childTopicDescriptor,
    ),
  },
  {
    descriptor: outlinerDescriptor,
    record: mkRecord(
      'hiverarchy-outliner',
      'Hiverarchy Outliner',
      'Builds outlines using research and child topics.',
      'context',
      outlinerDescriptor,
    ),
  },
  {
    descriptor: writerDescriptor,
    record: mkRecord(
      'hiverarchy-writer',
      'Hiverarchy Writer',
      'Drafts the full blog post.',
      'context',
      writerDescriptor,
    ),
  },
  {
    descriptor: editorDescriptor,
    record: mkRecord(
      'hiverarchy-editor',
      'Hiverarchy Editor',
      'Edits drafts for tone and structure.',
      'context',
      editorDescriptor,
    ),
  },
  {
    descriptor: imageDescriptor,
    record: mkRecord(
      'hiverarchy-image-generator',
      'Hiverarchy Image Generator',
      'Produces supporting imagery for posts.',
      'context',
      imageDescriptor,
    ),
  },
  {
    descriptor: supabaseUpdateDescriptor,
    record: mkRecord(
      'supabase-post-update',
      'Supabase Post Updater',
      'Writes finalized content to Hiverarchy.',
      'context',
      supabaseUpdateDescriptor,
      {
        metadata: {
          mode_profile: 'specialist_full',
          status: 'active',
          supported_modes: ['build'],
          streaming: { enabled: false },
          agent_category: 'tool',
          myOrgConfig: {
            supabaseUrlEnv: 'HIVERARCHY_SUPABASE_URL',
            supabaseAnonKeyEnv: 'HIVERARCHY_SUPABASE_ANON_KEY',
          },
        },
      },
    ),
  },
  {
    descriptor: supabaseChildDescriptor,
    record: mkRecord(
      'supabase-child-create',
      'Supabase Child Creator',
      'Creates child idea posts in Hiverarchy.',
      'context',
      supabaseChildDescriptor,
      {
        metadata: {
          mode_profile: 'specialist_full',
          status: 'active',
          supported_modes: ['build'],
          streaming: { enabled: false },
          agent_category: 'tool',
          myOrgConfig: {
            supabaseUrlEnv: 'HIVERARCHY_SUPABASE_URL',
            supabaseAnonKeyEnv: 'HIVERARCHY_SUPABASE_ANON_KEY',
          },
        },
      },
    ),
  },
  {
    descriptor: supabaseListDescriptor,
    record: mkRecord(
      'supabase-idea-list',
      'Supabase Idea List',
      'Lists idea-only posts ready for orchestration.',
      'context',
      supabaseListDescriptor,
      {
        metadata: {
          mode_profile: 'specialist_full',
          status: 'active',
          supported_modes: ['converse', 'build'],
          streaming: { enabled: true },
          agent_category: 'tool',
          myOrgConfig: {
            supabaseUrlEnv: 'HIVERARCHY_SUPABASE_URL',
            supabaseAnonKeyEnv: 'HIVERARCHY_SUPABASE_ANON_KEY',
          },
        },
      },
    ),
  },
];

export const myOrgHierarchyAgentRecords: AgentRecord[] =
  myOrgHierarchyAgentFixtures.map((fixture) => fixture.record);
