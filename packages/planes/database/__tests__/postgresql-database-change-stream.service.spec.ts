import { ConfigService } from '@nestjs/config';
import type { Notification, PoolClient } from 'pg';
import { PostgresqlDatabaseChangeStreamService } from '../postgresql-database-change-stream.service';

const poolQuery = jest.fn();
const poolEnd = jest.fn();
const clientQuery = jest.fn();
const clientRelease = jest.fn();
const listeners = new Map<string, (...args: unknown[]) => void>();
const client = {
  query: clientQuery,
  release: clientRelease,
  on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    listeners.set(event, handler);
    return client;
  }),
} as unknown as PoolClient;

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn(async () => client),
    query: poolQuery,
    end: poolEnd,
  })),
}));

describe('PostgresqlDatabaseChangeStreamService', () => {
  let service: PostgresqlDatabaseChangeStreamService;

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regprocedure')) {
        return { rows: [{ available: true }] };
      }
      if (sql.includes('FROM pg_trigger')) {
        return { rows: [{ available: true }] };
      }
      return { rows: [] };
    });
    service = new PostgresqlDatabaseChangeStreamService({
      get: jest.fn((key: string) =>
        key === 'POSTGRESQL_URL'
          ? 'postgresql://test:test@localhost:5432/test'
          : undefined,
      ),
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await service.close();
  });

  it('subscribes through LISTEN and dispatches captured database events', async () => {
    const handler = jest.fn();
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          schema_name: 'public',
          table_name: 'orders',
          event_type: 'INSERT',
          new_record: { id: 'order-1' },
          old_record: null,
        },
      ],
    });

    const unsubscribe = await service.subscribe(
      { schema: 'public', table: 'orders', events: ['INSERT'] },
      handler,
    );

    expect(clientQuery).toHaveBeenCalledWith(
      'LISTEN orchestratorai_database_changes',
    );
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    const notificationHandler = listeners.get('notification');
    expect(notificationHandler).toBeDefined();
    notificationHandler?.({
      channel: 'orchestratorai_database_changes',
      payload: '42',
    } as Notification);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith({
      schema: 'public',
      table: 'orders',
      eventType: 'INSERT',
      new: { id: 'order-1' },
      old: null,
    });

    await unsubscribe();
  });

  it('fails when the capture migration is missing', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regprocedure')) {
        return { rows: [{ available: false }] };
      }
      return { rows: [] };
    });

    await expect(
      service.subscribe(
        { schema: 'public', table: 'orders', events: ['INSERT'] },
        jest.fn(),
      ),
    ).rejects.toThrow('Apply the GCP/PostgreSQL migrations');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects unsupported event names before opening a connection', async () => {
    await expect(
      service.subscribe(
        {
          schema: 'public',
          table: 'orders',
          events: ['TRUNCATE' as 'INSERT'],
        },
        jest.fn(),
      ),
    ).rejects.toThrow("Invalid PostgreSQL database change event 'TRUNCATE'");
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
