import type { DatabaseService, QueryResult } from '../database.interface';
import { PostgresDatabaseJobQueueService } from '../postgres-database-job-queue.service';

const queue = { schema: 'workflows', table: 'runs' };

function makeService(result: QueryResult) {
  const rawQuery = jest.fn().mockResolvedValue(result);
  const service = new PostgresDatabaseJobQueueService({
    rawQuery,
  } as unknown as DatabaseService);
  return { service, rawQuery };
}

describe('PostgresDatabaseJobQueueService', () => {
  describe('claimNext', () => {
    it('claims with SKIP LOCKED and returns the row', async () => {
      const row = { id: 'run-1', status: 'running', attempt: 1 };
      const { service, rawQuery } = makeService({ data: [row], error: null });

      const claimed = await service.claimNext({
        queue,
        workerId: 'worker-a',
        leaseSeconds: 60,
      });

      expect(claimed).toEqual(row);
      const [sql, params] = rawQuery.mock.calls[0];
      expect(sql).toContain('"workflows"."runs"');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain("status = 'queued'");
      expect(params).toEqual(['worker-a', 60]);
    });

    it('returns null when nothing is queued', async () => {
      const { service } = makeService({ data: [], error: null });
      await expect(
        service.claimNext({ queue, workerId: 'w', leaseSeconds: 30 }),
      ).resolves.toBeNull();
    });

    it('rejects identifiers that are not plain names', async () => {
      const { service, rawQuery } = makeService({ data: [], error: null });
      await expect(
        service.claimNext({
          queue: { schema: 'workflows', table: 'runs; drop table x' },
          workerId: 'w',
          leaseSeconds: 30,
        }),
      ).rejects.toThrow('Invalid job queue identifier');
      expect(rawQuery).not.toHaveBeenCalled();
    });

    it('rejects a non-positive lease', async () => {
      const { service } = makeService({ data: [], error: null });
      await expect(
        service.claimNext({ queue, workerId: 'w', leaseSeconds: 0 }),
      ).rejects.toThrow('leaseSeconds must be a positive integer');
    });

    it('propagates database errors', async () => {
      const { service } = makeService({
        data: null,
        error: { message: 'relation "workflows.runs" does not exist' },
      });
      await expect(
        service.claimNext({ queue, workerId: 'w', leaseSeconds: 30 }),
      ).rejects.toThrow('does not exist');
    });
  });

  describe('heartbeat', () => {
    it('is true only while the worker still holds the row', async () => {
      const held = makeService({ data: [{ id: 'run-1' }], error: null });
      await expect(
        held.service.heartbeat(queue, 'run-1', 'worker-a', 60),
      ).resolves.toBe(true);
      expect(held.rawQuery.mock.calls[0][1]).toEqual(['run-1', 'worker-a', 60]);

      const lost = makeService({ data: [], error: null });
      await expect(
        lost.service.heartbeat(queue, 'run-1', 'worker-a', 60),
      ).resolves.toBe(false);
    });
  });

  describe('reclaimExpired', () => {
    it('groups reclaimed rows by their new status', async () => {
      const { service } = makeService({
        data: [
          { id: 'a', status: 'queued' },
          { id: 'b', status: 'failed' },
          { id: 'c', status: 'canceled' },
        ],
        error: null,
      });
      await expect(service.reclaimExpired(queue)).resolves.toEqual({
        requeued: ['a'],
        failed: ['b'],
        canceled: ['c'],
      });
    });

    it('refuses an unexpected status rather than dropping it', async () => {
      const { service } = makeService({
        data: [{ id: 'a', status: 'running' }],
        error: null,
      });
      await expect(service.reclaimExpired(queue)).rejects.toThrow(
        'Unexpected reclaimed status',
      );
    });
  });
});
