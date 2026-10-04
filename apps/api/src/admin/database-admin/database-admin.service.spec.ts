import type { DatabaseService } from '@orchestratorai/planes/database';
import { DatabaseAdminService } from './database-admin.service';

describe('DatabaseAdminService', () => {
  it('reads migration history from the deployment ledger', async () => {
    const rawQuery = jest.fn(async () => ({
      data: [{ filename: '20261001140000_media_bucket.sql', applied_at: new Date('2026-10-01T19:41:39.560Z') }],
      error: null,
    }));
    const service = new DatabaseAdminService({ rawQuery } as unknown as DatabaseService);
    await expect(service.getMigrations()).resolves.toEqual({
      migrations: [{ name: '20261001140000_media_bucket.sql', executedAt: '2026-10-01T19:41:39.560Z', success: true }],
    });
    expect(rawQuery.mock.calls[0]).toEqual([expect.stringContaining('FROM public.deployment_migrations')]);
  });

  it('reports a failed query instead of an empty history', async () => {
    const service = new DatabaseAdminService({ rawQuery: async () => ({ data: null, error: { message: 'relation does not exist' } }) } as unknown as DatabaseService);
    await expect(service.getMigrations()).rejects.toThrow('Failed to query migrations: relation does not exist');
  });
});
