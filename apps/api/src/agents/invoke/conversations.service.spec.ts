import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

interface DatabaseMock {
  from: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  single: jest.Mock;
  delete: jest.Mock;
}

function databaseMock(): DatabaseMock {
  const database: DatabaseMock = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    single: jest.fn(),
    delete: jest.fn(),
  };
  database.from.mockReturnValue(database);
  database.select.mockReturnValue(database);
  database.eq.mockReturnValue(database);
  database.delete.mockReturnValue(database);
  return database;
}

describe('ConversationsService ownership and parsing', () => {
  let database: DatabaseMock;
  let service: ConversationsService;

  beforeEach(() => {
    database = databaseMock();
    service = new ConversationsService(database as never);
  });

  it('scopes the conversation list to both user and organization', async () => {
    database.order.mockResolvedValueOnce({ data: [], error: null });

    await service.fetchForUser('user-1', 'acme');

    expect(database.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(database.eq).toHaveBeenCalledWith('organization_slug', 'acme');
  });

  it('allows super-admin list scope without adding an organization predicate', async () => {
    database.order.mockResolvedValueOnce({ data: [], error: null });

    await service.fetchForUser('user-1', '*');

    expect(database.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(database.eq).not.toHaveBeenCalledWith('organization_slug', '*');
  });

  it('normalizes PostgreSQL Date values at the database-plane boundary', async () => {
    database.order.mockResolvedValueOnce({
      data: [
        {
          id: 'conversation-1',
          agent_name: 'context-agent',
          agent_type: 'context',
          organization_slug: 'acme',
          started_at: new Date('2026-08-06T12:00:00.000Z'),
          last_active_at: new Date('2026-08-06T12:01:00.000Z'),
          message_count: 2,
          primary_work_product_type: null,
          primary_work_product_id: null,
          metadata: {},
        },
      ],
      error: null,
    });

    await expect(service.fetchForUser('user-1', 'acme')).resolves.toEqual([
      expect.objectContaining({
        startedAt: '2026-08-06T12:00:00.000Z',
        lastActiveAt: '2026-08-06T12:01:00.000Z',
      }),
    ]);
  });

  it('checks conversation ownership before loading messages', async () => {
    database.single.mockResolvedValueOnce({
      data: { id: 'conversation-1' },
      error: null,
    });
    database.order.mockResolvedValueOnce({
      data: [
        {
          id: 'message-1',
          role: 'assistant',
          content: 'hello',
          output_type: 'markdown',
          metadata: '{"tokensUsed":12}',
          attachments: '[{"filename":"brief.pdf","mimeType":"application/pdf"}]',
          created_at: '2026-08-06T10:00:00.000Z',
        },
      ],
      error: null,
    });

    const messages = await service.fetchMessagesForUser(
      'conversation-1',
      'user-1',
      'acme',
    );

    expect(database.eq).toHaveBeenCalledWith('id', 'conversation-1');
    expect(database.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(database.eq).toHaveBeenCalledWith('organization_slug', 'acme');
    expect(messages).toEqual([
      {
        id: 'message-1',
        role: 'assistant',
        content: 'hello',
        outputType: 'markdown',
        metadata: { tokensUsed: 12 },
        attachments: [
          { filename: 'brief.pdf', mimeType: 'application/pdf' },
        ],
        createdAt: '2026-08-06T10:00:00.000Z',
      },
    ]);
  });

  it('returns not found without querying messages when the user does not own the conversation', async () => {
    database.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    await expect(
      service.fetchMessagesForUser('conversation-1', 'other-user', 'acme'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(database.order).not.toHaveBeenCalled();
  });

  it('propagates ownership query failures instead of presenting them as not found', async () => {
    database.single.mockResolvedValueOnce({
      data: null,
      error: { code: '08006', message: 'database unavailable' },
    });

    await expect(
      service.fetchMessagesForUser('conversation-1', 'user-1', 'acme'),
    ).rejects.toThrow('database unavailable');
  });

  it('fails loudly when persisted metadata is malformed', async () => {
    database.single.mockResolvedValueOnce({
      data: { id: 'conversation-1' },
      error: null,
    });
    database.order.mockResolvedValueOnce({
      data: [
        {
          id: 'message-1',
          role: 'assistant',
          content: 'hello',
          output_type: 'text',
          metadata: '{not-json',
          attachments: null,
          created_at: '2026-08-06T10:00:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      service.fetchMessagesForUser('conversation-1', 'user-1', 'acme'),
    ).rejects.toThrow('malformed metadata');
  });

  it('deletes only after resolving an owned conversation and keeps all scope predicates', async () => {
    database.single.mockResolvedValueOnce({
      data: { id: 'conversation-1' },
      error: null,
    });
    database.eq.mockImplementation(() => database);
    const deletionResult = Promise.resolve({ error: null });
    database.eq
      .mockReturnValueOnce(database)
      .mockReturnValueOnce(database)
      .mockReturnValueOnce(database)
      .mockReturnValueOnce(database)
      .mockReturnValueOnce(database)
      .mockReturnValueOnce(deletionResult);

    await service.deleteForUser('conversation-1', 'user-1', 'acme');

    expect(database.delete).toHaveBeenCalled();
    expect(database.eq).toHaveBeenCalledWith('id', 'conversation-1');
    expect(database.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(database.eq).toHaveBeenCalledWith('organization_slug', 'acme');
  });
});
