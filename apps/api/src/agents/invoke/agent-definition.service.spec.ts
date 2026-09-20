import { AgentDefinitionService } from './agent-definition.service';

const baseRow: Record<string, unknown> = {
  slug: 'context-agent',
  name: 'Context Agent',
  description: 'A safe context agent',
  agent_type: 'context',
  metadata: { status: 'active' },
  context: 'Answer safely.',
  organization_slug: ['acme'],
};

function query(result: {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
}) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    contains: jest.fn(),
    single: jest.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.contains.mockReturnValue(builder);
  builder.single.mockResolvedValue(result);
  return builder;
}

function listQuery(result: {
  data: unknown;
  error: { message?: string } | null;
}) {
  const builder = {
    select: jest.fn(),
    contains: jest.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.contains.mockResolvedValue(result);
  return builder;
}

describe('AgentDefinitionService hardening', () => {
  const database = { from: jest.fn() };
  let service: AgentDefinitionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentDefinitionService(database as never);
  });

  it('resolves an organization-scoped definition', async () => {
    database.from.mockReturnValue(query({ data: baseRow, error: null }));

    await expect(
      service.resolve('context-agent', 'acme'),
    ).resolves.toMatchObject({
      slug: 'context-agent',
      agentType: 'context',
      orgSlug: 'acme',
    });
  });

  it('uses the global definition only when the organization lookup has no row', async () => {
    database.from
      .mockReturnValueOnce(
        query({
          data: null,
          error: { code: 'PGRST116', message: 'no rows' },
        }),
      )
      .mockReturnValueOnce(
        query({
          data: { ...baseRow, organization_slug: ['global'] },
          error: null,
        }),
      );

    await expect(
      service.resolve('context-agent', 'acme'),
    ).resolves.toMatchObject({
      orgSlug: 'global',
    });
    expect(database.from).toHaveBeenCalledTimes(2);
  });

  it('does not mask an organization query failure with a global lookup', async () => {
    database.from.mockReturnValue(
      query({
        data: null,
        error: { code: '08006', message: 'database unavailable' },
      }),
    );

    await expect(service.resolve('context-agent', 'acme')).rejects.toThrow(
      'database unavailable',
    );
    expect(database.from).toHaveBeenCalledTimes(1);
  });

  it('propagates a global lookup failure', async () => {
    database.from
      .mockReturnValueOnce(
        query({
          data: null,
          error: { code: 'PGRST116', message: 'no rows' },
        }),
      )
      .mockReturnValueOnce(
        query({
          data: null,
          error: { code: '08006', message: 'global lookup failed' },
        }),
      );

    await expect(service.resolve('context-agent', 'acme')).rejects.toThrow(
      'global lookup failed',
    );
  });

  it('excludes an unknown agent family instead of silently running it as context', async () => {
    database.from.mockReturnValue(
      query({
        data: { ...baseRow, agent_type: 'mystery-runner' },
        error: null,
      }),
    );

    await expect(service.resolve('context-agent', 'acme')).resolves.toBeNull();
  });

  it('reads workflow status from the metadata field defined by the agents schema', async () => {
    const builder = {
      select: jest.fn(),
      in: jest.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.in.mockResolvedValue({
      data: [
        {
          ...baseRow,
          slug: 'marketing-swarm',
          name: 'Marketing Swarm',
          agent_type: 'langgraph',
          metadata: { status: 'active' },
        },
      ],
      error: null,
    });
    database.from.mockReturnValue(builder);

    await expect(service.listWorkflows('*')).resolves.toEqual([
      expect.objectContaining({
        slug: 'marketing-swarm',
        status: 'active',
      }),
    ]);
  });

  it('rejects malformed metadata instead of defaulting an agent to active', async () => {
    database.from.mockReturnValue(
      query({ data: { ...baseRow, metadata: {} }, error: null }),
    );

    await expect(service.resolve('context-agent', 'acme')).rejects.toThrow(
      'agent.metadata.status',
    );
  });

  it('lists HR plus global-scoped legal and image assistants for human-resources', async () => {
    const hrRow = {
      ...baseRow,
      slug: 'hr-assistant',
      name: 'HR Assistant',
      agent_type: 'rag',
      organization_slug: ['human-resources'],
      metadata: {
        status: 'active',
        rag_config: { collection_slug: 'hr-policy' },
      },
    };
    const legalRow = {
      ...baseRow,
      slug: 'legal-policies-agent',
      name: 'Confidentiality Assistant',
      agent_type: 'rag',
      organization_slug: ['legal', 'global'],
      metadata: {
        status: 'active',
        rag_config: { collection_slug: 'law-firm-policies-attributed' },
      },
    };
    const imageRow = {
      ...baseRow,
      slug: 'image-generator',
      name: 'Image Generator',
      agent_type: 'media',
      organization_slug: ['marketing', 'global'],
      metadata: { status: 'active', mediaType: 'image' },
    };
    const infographicRow = {
      ...baseRow,
      slug: 'infographic-agent',
      name: 'Infographic Agent',
      agent_type: 'media',
      organization_slug: ['global'],
      metadata: { status: 'active', mediaType: 'image' },
    };

    database.from
      .mockReturnValueOnce(
        listQuery({
          data: [hrRow],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        listQuery({
          data: [legalRow, imageRow, infographicRow],
          error: null,
        }),
      );

    await expect(service.listAgents('human-resources')).resolves.toEqual([
      expect.objectContaining({
        slug: 'hr-assistant',
        orgSlug: 'human-resources',
        collectionSlug: 'hr-policy',
      }),
      expect.objectContaining({
        slug: 'legal-policies-agent',
        orgSlug: 'legal',
        collectionSlug: 'law-firm-policies-attributed',
      }),
      expect.objectContaining({
        slug: 'image-generator',
        orgSlug: 'marketing',
      }),
      expect.objectContaining({
        slug: 'infographic-agent',
        orgSlug: 'global',
      }),
    ]);
  });

  it('excludes disabled video, workflows, and inactive legal assistants from the picker', async () => {
    database.from
      .mockReturnValueOnce(
        listQuery({
          data: [
            {
              ...baseRow,
              slug: 'legal-contracts-agent',
              name: 'Contracts Assistant',
              agent_type: 'rag',
              organization_slug: ['legal', 'global'],
              metadata: {
                status: 'disabled',
                rag_config: { collection_slug: 'law-contracts-hybrid' },
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        listQuery({
          data: [
            {
              ...baseRow,
              slug: 'video-generator',
              name: 'Video Generator',
              agent_type: 'media',
              organization_slug: ['marketing', 'global'],
              metadata: {
                status: 'disabled',
                hidden: true,
                mediaType: 'video',
              },
            },
            {
              ...baseRow,
              slug: 'marketing-swarm',
              name: 'Marketing Swarm',
              agent_type: 'langgraph',
              organization_slug: ['marketing'],
              metadata: { status: 'active' },
            },
          ],
          error: null,
        }),
      );

    await expect(service.listAgents('human-resources')).resolves.toEqual([]);
  });
});
