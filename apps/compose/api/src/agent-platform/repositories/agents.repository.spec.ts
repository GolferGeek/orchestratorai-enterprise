import { AgentsRepository } from './agents.repository';
import { DatabaseService } from '@/database';

const createDbMock = () => {
  const fromMock = jest.fn();
  const db = { from: fromMock } as unknown as DatabaseService;
  return { fromMock, db };
};

describe('AgentsRepository', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const sampleAgent = {
    id: '123',
    organization_slug: ['my-org'],
    slug: 'marketing_swarm',
    name: 'Marketing Swarm',
    display_name: 'Marketing Swarm',
    description: 'desc',
    agent_type: 'context',
    department: 'marketing',
    tags: [],
    io_schema: {},
    capabilities: [],
    mode_profile: 'full_cycle',
    version: '1.0.0',
    status: 'active',
    yaml: 'yaml: true',
    agent_card: { protocol: 'a2a' },
    context: { prompt: 'hi' },
    endpoint: null,
    llm_config: null,
    metadata: {},
    config: { capabilities: [] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('upserts agents with conflict on slug', async () => {
    const { fromMock, db } = createDbMock();

    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: sampleAgent, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const upsert = jest.fn().mockReturnValue({ select });

    fromMock.mockReturnValue({ upsert });

    const repo = new AgentsRepository(db);
    const result = await repo.upsert({
      organization_slug: ['my-org'],
      slug: 'marketing_swarm',
      name: 'Marketing Swarm',
      description: 'desc',
      agent_type: 'context',
      department: 'marketing',
      io_schema: {},
      capabilities: [],
      context: 'yaml: true',
    });

    expect(fromMock).toHaveBeenCalledWith(null, 'agents');
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'marketing_swarm' }),
      ]),
      { onConflict: 'slug' },
    );
    expect(result).toEqual(sampleAgent);
  });

  it('returns null when agent missing for slug', async () => {
    const { fromMock, db } = createDbMock();
    const queryChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    fromMock.mockReturnValue(queryChain);

    const repo = new AgentsRepository(db);
    const result = await repo.findBySlug('demo', 'missing');

    expect(queryChain.eq).toHaveBeenCalledWith('slug', 'missing');
    // Now uses or() for organization filtering
    expect(queryChain.or).toHaveBeenCalledWith(
      'organization_slug.cs.{demo},organization_slug.cs.{global}',
    );
    expect(result).toBeNull();
  });

  it('lists agents by organization', async () => {
    const { fromMock, db } = createDbMock();
    interface QueryChain {
      select: jest.Mock;
      eq: jest.Mock;
      is: jest.Mock;
      contains: jest.Mock;
      or: jest.Mock;
      order: jest.Mock;
      data: (typeof sampleAgent)[];
      error: null;
    }
    const listChain: QueryChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      data: [sampleAgent],
      error: null,
    };

    listChain.order = jest
      .fn()
      .mockResolvedValue({ data: [sampleAgent], error: null });

    fromMock.mockReturnValue(listChain);

    const repo = new AgentsRepository(db);
    // When organizationSlug is null, or() is called for global agents
    const result = await repo.listByOrganization(null);

    // Verify or() was called since organizationSlug is null (for global agents)
    expect(listChain.or).toHaveBeenCalledWith(
      'organization_slug.is.null,organization_slug.eq.{},organization_slug.cs.{global}',
    );
    expect(listChain.contains).not.toHaveBeenCalled();
    expect(result).toEqual([sampleAgent]);
  });

  it('deletes agent by slug', async () => {
    const { fromMock, db } = createDbMock();
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const deleteFn: jest.Mock = jest.fn(() => ({ eq: eqMock }));

    fromMock.mockReturnValue({ delete: deleteFn });

    const repo = new AgentsRepository(db);
    await repo.deleteBySlug('test-agent');

    expect(deleteFn).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('slug', 'test-agent');
  });
});
