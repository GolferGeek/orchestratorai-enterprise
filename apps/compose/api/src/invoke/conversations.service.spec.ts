/**
 * ConversationsService unit tests
 *
 * Tests fetchForUser: DB query, field mapping (snake_case → camelCase),
 * default field values, error propagation, and empty result handling.
 */

import { ConversationsService } from './conversations.service';
import type { ConversationRecord } from './conversations.service';

const baseRow: Record<string, unknown> = {
  id: 'conv-1',
  agent_name: 'blog-writer',
  agent_type: 'context',
  organization_slug: 'acme',
  started_at: '2026-04-18T10:00:00.000Z',
  last_active_at: '2026-04-18T11:00:00.000Z',
  message_count: 5,
};

/** Build a fluent DB query mock that resolves with a canned result. */
function buildQueryBuilder(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const builder: Record<string, jest.Mock> = {};
  builder['select'] = jest.fn().mockReturnValue(builder);
  builder['eq'] = jest.fn().mockReturnValue(builder);
  builder['order'] = jest.fn().mockResolvedValue(result);
  return builder;
}

describe('ConversationsService', () => {
  let service: ConversationsService;
  let mockDb: { from: jest.Mock };

  beforeEach(() => {
    mockDb = { from: jest.fn() };
    service = new ConversationsService(mockDb as never);
  });

  describe('fetchForUser — happy path', () => {
    it('queries conversations table filtered by user_id ordered by last_active_at desc', async () => {
      const builder = buildQueryBuilder({ data: [baseRow], error: null });
      mockDb.from.mockReturnValue(builder);

      await service.fetchForUser('user-abc');

      expect(mockDb.from).toHaveBeenCalledWith(null, 'conversations');
      expect(builder['select']).toHaveBeenCalledWith(
        'id, agent_name, agent_type, organization_slug, started_at, last_active_at, message_count',
      );
      expect(builder['eq']).toHaveBeenCalledWith('user_id', 'user-abc');
      expect(builder['order']).toHaveBeenCalledWith('last_active_at', {
        ascending: false,
      });
    });

    it('maps snake_case DB columns to camelCase ConversationRecord fields', async () => {
      const builder = buildQueryBuilder({ data: [baseRow], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result).toHaveLength(1);
      const record = result[0] as ConversationRecord;
      expect(record.id).toBe('conv-1');
      expect(record.agentName).toBe('blog-writer');
      expect(record.agentType).toBe('context');
      expect(record.organizationSlug).toBe('acme');
      expect(record.startedAt).toBe('2026-04-18T10:00:00.000Z');
      expect(record.lastActiveAt).toBe('2026-04-18T11:00:00.000Z');
      expect(record.messageCount).toBe(5);
    });

    it('returns multiple records preserving order', async () => {
      const row2 = { ...baseRow, id: 'conv-2', agent_name: 'rag-agent' };
      const builder = buildQueryBuilder({ data: [baseRow, row2], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('conv-1');
      expect(result[1]?.id).toBe('conv-2');
    });

    it('returns empty array when DB returns no rows', async () => {
      const builder = buildQueryBuilder({ data: [], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result).toEqual([]);
    });

    it('returns empty array when data is null (no rows)', async () => {
      const builder = buildQueryBuilder({ data: null, error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result).toEqual([]);
    });
  });

  describe('fetchForUser — default values on partial rows', () => {
    it('defaults agentType to "context" when agent_type is missing', async () => {
      const partialRow = { ...baseRow, agent_type: undefined };
      const builder = buildQueryBuilder({ data: [partialRow], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result[0]?.agentType).toBe('context');
    });

    it('defaults organizationSlug to "global" when organization_slug is missing', async () => {
      const partialRow = { ...baseRow, organization_slug: undefined };
      const builder = buildQueryBuilder({ data: [partialRow], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result[0]?.organizationSlug).toBe('global');
    });

    it('defaults messageCount to 0 when message_count is missing', async () => {
      const partialRow = { ...baseRow, message_count: undefined };
      const builder = buildQueryBuilder({ data: [partialRow], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result[0]?.messageCount).toBe(0);
    });

    it('defaults agentName to empty string when agent_name is missing', async () => {
      const partialRow = { ...baseRow, agent_name: undefined };
      const builder = buildQueryBuilder({ data: [partialRow], error: null });
      mockDb.from.mockReturnValue(builder);

      const result = await service.fetchForUser('user-abc');

      expect(result[0]?.agentName).toBe('');
    });
  });

  describe('fetchForUser — error propagation', () => {
    it('throws when DB returns an error', async () => {
      const builder = buildQueryBuilder({
        data: null,
        error: { message: 'relation "conversations" does not exist' },
      });
      mockDb.from.mockReturnValue(builder);

      await expect(service.fetchForUser('user-abc')).rejects.toThrow(
        'Failed to fetch conversations: relation "conversations" does not exist',
      );
    });

    it('error message includes the original DB error message', async () => {
      const builder = buildQueryBuilder({
        data: null,
        error: { message: 'permission denied', code: '42501' },
      });
      mockDb.from.mockReturnValue(builder);

      await expect(service.fetchForUser('user-abc')).rejects.toThrow(
        'permission denied',
      );
    });
  });
});
