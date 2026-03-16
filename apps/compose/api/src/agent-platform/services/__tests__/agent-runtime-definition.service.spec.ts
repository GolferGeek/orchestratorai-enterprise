import { AgentRuntimeDefinitionService } from '../agent-runtime-definition.service';
import type { AgentRecord } from '../../interfaces/agent.interface';
import type { AgentConfigDefinition } from '../../interfaces/agent.interface';
import type { JsonObject } from '@orchestrator-ai/transport-types';
import { dump as yamlDump } from 'js-yaml';

describe('AgentRuntimeDefinitionService', () => {
  const service = new AgentRuntimeDefinitionService();
  const now = new Date().toISOString();

  const createRecord = (overrides: Partial<AgentRecord> = {}): AgentRecord => ({
    slug: 'demo-agent',
    organization_slug: ['demo-org'],
    name: 'Demo Agent',
    description: 'Demo description',
    version: '1.0.0',
    agent_type: 'context',
    department: 'engineering',
    tags: [],
    io_schema: {},
    capabilities: [],
    context: '',
    endpoint: null,
    llm_config: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  });

  it('builds runtime definition with guarded descriptor data', () => {
    const descriptor = {
      metadata: {
        displayName: 'Descriptor Name',
        description: 'Descriptor description',
        provider: 'openai',
        tags: ['descriptor', 'demo'],
      },
      hierarchy: {
        level: 'senior',
        reportsTo: 'orchestrator',
      },
      capabilities: ['plan', 'build'],
      skills: [
        {
          id: 'planning',
          name: 'Planning',
          tags: ['strategy'],
          metadata: {
            confidence: 0.9,
          },
        },
        null,
      ],
      configuration: {
        execution_capabilities: {
          can_plan: false,
          can_build: true,
        },
        timeout_seconds: 120,
      },
      api_configuration: {
        endpoint: 'https://example.com/api',
        method: 'post',
        timeout: 5000,
        headers: {
          'X-Test': 'value',
        },
        authentication: {
          type: 'bearer',
        },
        request_transform: {
          kind: 'template',
        },
        response_transform: {
          kind: 'json',
        },
      },
      prompts: {
        system: 'You are the descriptor system prompt.',
        plan: 'Descriptor plan prompt.',
      },
      context: {
        system_prompt: 'Descriptor context prompt.',
        nested: {
          fromDescriptor: true,
        },
      },
      plan_structure: {
        type: 'object',
        properties: {
          goal: { type: 'string' },
        },
      },
      deliverable_structure: {
        type: 'object',
      },
      io_schema: {
        type: 'object',
        additionalProperties: true,
      },
    } satisfies JsonObject;

    const recordConfig: AgentConfigDefinition = {
      llm: {
        provider: 'anthropic',
        model: 'claude-3-opus',
      },
      execution_capabilities: {
        can_plan: true,
        can_build: true,
      },
      execution_profile: 'autonomous_build',
    };

    const recordContext = {
      fromRecord: true,
      system_prompt: 'Record context prompt.',
    };

    // Embed descriptor as YAML frontmatter in the context field
    const yamlFrontmatter = `---
${yamlDump(descriptor)}---
${JSON.stringify(recordContext)}`;

    const record = createRecord({
      context: yamlFrontmatter,
      metadata: recordConfig,
      // Use descriptor tags by not setting tags on record (empty array is truthy)
      tags: [],
    });

    const definition = service.buildDefinition(record);

    // Metadata displayName comes from record.name, not descriptor
    expect(definition.metadata.displayName).toBe('Demo Agent');
    // Tags come from record if present, otherwise from descriptor
    expect(definition.metadata.tags).toEqual([]);
    // Hierarchy comes from descriptor
    expect(definition.hierarchy?.level).toBe('senior');
    expect(definition.skills).toHaveLength(1);
    expect(definition.skills[0]?.metadata).toEqual({ confidence: 0.9 });

    expect(definition.execution.canPlan).toBe(false);
    expect(definition.execution.timeoutSeconds).toBe(120);

    const transport = definition.transport;

    expect(transport).toBeDefined();
    if (!transport) {
      throw new Error('Expected transport definition to be present');
    }

    expect(transport.api?.endpoint).toBe('https://example.com/api');
    expect(transport.api?.headers).toEqual({ 'X-Test': 'value' });
    expect(transport.api?.authentication).toEqual({ type: 'bearer' });
    expect(transport.api?.requestTransform).toEqual({ kind: 'template' });

    // Context is parsed as { markdown: ..., raw: ... } containing the full context string
    expect(definition.context).toBeDefined();
    expect(definition.context?.markdown).toBe(yamlFrontmatter);
    expect(definition.context?.raw).toBe(yamlFrontmatter);

    expect(definition.prompts.system).toBe(
      'You are the descriptor system prompt.',
    );
    expect(definition.prompts.plan).toBe('Descriptor plan prompt.');

    expect(definition.planStructure).toEqual(descriptor.plan_structure);
    expect(definition.deliverableStructure).toEqual(
      descriptor.deliverable_structure,
    );
    // ioSchema comes from record.io_schema first, which is {} in this case
    expect(definition.ioSchema).toEqual({});
    expect(definition.rawDescriptor).toEqual(descriptor);
  });

  it('falls back to record configuration when descriptor shapes are unsafe', () => {
    const descriptor = {
      context: 'not-an-object',
      configuration: 'invalid',
      api_configuration: ['not', 'an', 'object'],
    } satisfies JsonObject;

    const recordPlan: JsonObject = {
      type: 'object',
      title: 'From Record',
    };

    // Embed descriptor as YAML frontmatter in the context field
    const yamlFrontmatter = `---
${yamlDump(descriptor)}---
Additional context content`;

    const record = createRecord({
      context: yamlFrontmatter,
      metadata: {
        execution_capabilities: {
          can_plan: true,
          can_build: true,
        },
        plan_structure: recordPlan,
      },
    });

    const definition = service.buildDefinition(record);

    // Context is parsed as { markdown: ..., raw: ... } containing the full context string
    expect(definition.context).toBeDefined();
    expect(definition.context?.markdown).toBe(yamlFrontmatter);
    expect(definition.context?.raw).toBe(yamlFrontmatter);
    expect(definition.config).toMatchObject({
      execution_capabilities: {
        can_plan: true,
        can_build: true,
      },
    });
    expect(definition.transport).toBeUndefined();
    expect(definition.planStructure).toEqual(recordPlan);
  });
});
