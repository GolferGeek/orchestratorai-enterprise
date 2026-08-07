import { PipelinesService } from './pipelines.service';

interface DatabaseMock {
  from: jest.Mock;
  insert: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  single: jest.Mock;
  order: jest.Mock;
}

function databaseMock(): DatabaseMock {
  const database: DatabaseMock = {
    from: jest.fn(),
    insert: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
    order: jest.fn(),
  };
  database.from.mockReturnValue(database);
  database.insert.mockReturnValue(database);
  database.select.mockReturnValue(database);
  database.eq.mockReturnValue(database);
  return database;
}

describe('PipelinesService ownership and persistence', () => {
  let database: DatabaseMock;
  let service: PipelinesService;

  beforeEach(() => {
    database = databaseMock();
    service = new PipelinesService(database as never);
  });

  it('persists owner fields from the complete context capsule', async () => {
    database.single.mockResolvedValueOnce({
      data: {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Research pipeline',
        runners: [{ runnerId: 'context' }],
        created_at: new Date('2026-08-06T12:00:00.000Z'),
      },
      error: null,
    });

    await expect(
      service.save(
        {
          orgSlug: 'acme',
          userId: 'user-1',
          conversationId: 'conversation-1',
          agentSlug: 'pipeline-builder',
          agentType: 'pipeline',
          provider: 'openai',
          model: 'gpt-test',
        },
        { name: 'Research pipeline', runners: [{ runnerId: 'context' }] },
      ),
    ).resolves.toMatchObject({
      id: '10000000-0000-4000-8000-000000000001',
      createdAt: '2026-08-06T12:00:00.000Z',
    });
    expect(database.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_slug: 'acme',
        user_id: 'user-1',
      }),
    );
  });

  it('scopes list queries to authenticated user and concrete organization', async () => {
    database.order.mockResolvedValueOnce({ data: [], error: null });

    await service.list('user-1', 'acme');

    expect(database.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(database.eq).toHaveBeenCalledWith('organization_slug', 'acme');
  });

  it('fails loudly when a stored row violates the pipeline contract', async () => {
    database.order.mockResolvedValueOnce({
      data: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Research pipeline',
          runners: [{ runnerId: 'shell' }],
          created_at: '2026-08-06T12:00:00.000Z',
        },
      ],
      error: null,
    });

    await expect(service.list('user-1', 'acme')).rejects.toThrow(
      'Stored pipeline is invalid',
    );
  });
});
