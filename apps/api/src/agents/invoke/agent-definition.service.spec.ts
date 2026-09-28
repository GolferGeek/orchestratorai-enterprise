import { AgentDefinitionService } from './agent-definition.service';

const baseRow: Record<string, unknown> = {
  slug: 'context-agent',
  name: 'Context Agent',
  version: '1.0.0',
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

  it('does not expose workflows — they are a code registry, not agent rows', () => {
    // listWorkflows() used to query the agents table filtered by a hardcoded
    // slug set, which is why marketing-swarm needed a row describing an agent
    // no runner could execute. Workflows now register themselves in
    // WorkflowRegistry and this service has no opinion about them.
    expect(
      (service as unknown as Record<string, unknown>).listWorkflows,
    ).toBeUndefined();
  });

  it('rejects malformed metadata instead of defaulting an agent to active', async () => {
    database.from.mockReturnValue(
      query({ data: { ...baseRow, metadata: {} }, error: null }),
    );

    await expect(service.resolve('context-agent', 'acme')).rejects.toThrow(
      'agent.metadata.status',
    );
  });

  describe('a2a agents and outbound auth', () => {
    const resolveRow = (row: Record<string, unknown>) => {
      database.from.mockReturnValue(query({ data: { ...baseRow, ...row }, error: null }));
      return service.resolve('context-agent', 'acme');
    };
    const a2a = (target: Record<string, unknown>) => ({ agent_type: 'a2a', metadata: { status: 'active', a2a: { target } } });

    it('reads agent and workflow targets', async () => {
      expect((await resolveRow(a2a({ kind: 'agent', agentSlug: 'finance-policy-assistant' })))?.a2a?.target).toEqual({ kind: 'agent', agentSlug: 'finance-policy-assistant' });
      expect((await resolveRow(a2a({ kind: 'workflow', workflowSlug: 'invoice-review', input: { mode: 'x' }, textField: 'note' })))?.a2a?.target).toEqual({
        kind: 'workflow',
        workflowSlug: 'invoice-review',
        input: { mode: 'x' },
        textField: 'note',
      });
    });

    it('reads an ambient target and a remote A2A target', async () => {
      expect((await resolveRow(a2a({ kind: 'ambient', event: 'invoice.received' })))?.a2a).toEqual({
        target: { kind: 'ambient', event: 'invoice.received' },
        callers: 'any',
      });
      const remote = await resolveRow(a2a({ kind: 'a2a', cardUrl: 'https://partner.example/.well-known/agent-card.json', auth: { type: 'bearer', secret: 'PARTNER_TOKEN' } }));
      expect(remote?.agentType).toBe('a2a');
      expect(remote?.a2a?.target).toEqual({
        kind: 'a2a',
        cardUrl: 'https://partner.example/.well-known/agent-card.json',
        auth: { type: 'bearer', secret: 'PARTNER_TOKEN' },
      });
    });

    it('fails on load for a missing or unknown target, a bad event name, or an http card', async () => {
      await expect(resolveRow({ agent_type: 'a2a', metadata: { status: 'active' } })).rejects.toThrow('agent.metadata.a2a');
      await expect(resolveRow(a2a({ kind: 'webhook', url: 'x' }))).rejects.toThrow('"ambient", "agent", "workflow" or "a2a"');
      await expect(resolveRow(a2a({ kind: 'agent', agentSlug: 'Bad Slug' }))).rejects.toThrow('lowercase slug');
      await expect(resolveRow(a2a({ kind: 'workflow', workflowSlug: 'invoice-review', input: [] }))).rejects.toThrow('input');
      await expect(resolveRow(a2a({ kind: 'ambient', event: 'Invoice Received' }))).rejects.toThrow('lowercase');
      await expect(resolveRow(a2a({ kind: 'a2a', cardUrl: 'http://partner.example/card' }))).rejects.toThrow('https');
    });

    it('refuses a token stored on the agent: auth only names a secret', async () => {
      await expect(resolveRow(a2a({ kind: 'a2a', cardUrl: 'https://p.example/c', auth: { type: 'bearer', token: 'abc' } }))).rejects.toThrow('config provider');
      await expect(
        resolveRow({ agent_type: 'api', endpoint: { url: 'https://api.example/x', auth: { type: 'basic', secret: 'S' } } }),
      ).rejects.toThrow('"bearer" or "apikey"');
      expect((await resolveRow({ agent_type: 'api', endpoint: { url: 'https://api.example/x', auth: { type: 'apikey', secret: 'S', header: 'X-Key' } } }))?.outboundAuth).toEqual({
        type: 'apikey',
        secret: 'S',
        header: 'X-Key',
      });
    });

    it('reads who may call an A2A agent: any registered caller, or an allowlist of https cards', async () => {
      const row = (callers: unknown) => ({ agent_type: 'a2a', metadata: { status: 'active', a2a: { target: { kind: 'ambient', event: 'x' }, callers } } });
      expect((await resolveRow(row('any')))?.a2a?.callers).toBe('any');
      expect((await resolveRow(row({ allow: ['https://p.example/card'] })))?.a2a?.callers).toEqual({ allow: ['https://p.example/card'] });
      await expect(resolveRow(row({ allow: [] }))).rejects.toThrow("'any' or { allow");
      await expect(resolveRow(row({ allow: ['http://p.example/card'] }))).rejects.toThrow('https card URL');
    });

    it('no longer knows the external family', async () => {
      database.from.mockReturnValue(query({ data: { ...baseRow, agent_type: 'external' }, error: null }));
      expect(await service.resolve('context-agent', 'acme')).toBeNull();
    });
  });
});
