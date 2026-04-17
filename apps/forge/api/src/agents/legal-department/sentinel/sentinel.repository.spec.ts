import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import { SentinelRepository } from './sentinel.repository';

function makeDbMock() {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    // Default resolution for terminal calls
    then: undefined as unknown,
  };

  const from = jest.fn().mockReturnValue(chain);
  const rawQuery = jest.fn().mockResolvedValue({ data: [], error: null });

  return { from, rawQuery, chain };
}

describe('SentinelRepository', () => {
  let repo: SentinelRepository;
  let db: ReturnType<typeof makeDbMock>;

  beforeEach(async () => {
    db = makeDbMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentinelRepository,
        { provide: DATABASE_SERVICE, useValue: db },
      ],
    }).compile();

    repo = module.get(SentinelRepository);
  });

  describe('listSources', () => {
    it('queries legal.sentinel_sources with org filter', async () => {
      db.chain.order.mockReturnValue(
        Promise.resolve({ data: [], error: null }),
      );
      await repo.listSources('org-a');
      expect(db.from).toHaveBeenCalledWith('legal', 'sentinel_sources');
      expect(db.chain.eq).toHaveBeenCalledWith('org_slug', 'org-a');
    });
  });

  describe('createSource', () => {
    it('inserts with correct fields via rawQuery', async () => {
      const source = {
        id: 'src-1',
        org_slug: 'org-a',
        name: 'Test',
        source_type: 'rss',
        url: 'https://example.com',
        poll_interval_minutes: 60,
        practice_areas: [],
        jurisdictions: [],
        enabled: true,
        last_polled_at: null,
        last_error: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      db.rawQuery.mockResolvedValueOnce({ data: [source], error: null });
      const result = await repo.createSource('org-a', {
        name: 'Test',
        sourceType: 'rss',
        url: 'https://example.com',
      });
      expect(db.rawQuery).toHaveBeenCalled();
      expect(result.name).toBe('Test');
    });

    it('throws on DB error', async () => {
      db.rawQuery.mockResolvedValueOnce({
        data: null,
        error: { message: 'insert failed' },
      });
      await expect(
        repo.createSource('org-a', {
          name: 'Test',
          sourceType: 'rss',
          url: 'https://example.com',
        }),
      ).rejects.toThrow('createSource failed');
    });
  });

  describe('updateSource', () => {
    it('throws NotFoundException when source not found', async () => {
      db.chain.single.mockResolvedValueOnce({ data: null, error: null });
      await expect(
        repo.updateSource('missing', 'org-a', { enabled: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSignals', () => {
    it('applies filters correctly', async () => {
      // The last .eq() in the chain is the terminal call that gets awaited.
      // Mock the final eq to resolve as a thenable.
      const thenable = {
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
      };
      // After range, the chain is still used for .eq() calls.
      // The last .eq() call must be thenable to resolve the await.
      let eqCallCount = 0;
      db.chain.eq.mockImplementation(() => {
        eqCallCount++;
        // After 3rd eq call (org_slug, source_id, signal_type), return thenable
        if (eqCallCount >= 3) return thenable;
        return db.chain;
      });
      await repo.listSignals('org-a', {
        sourceId: 'src-1',
        signalType: 'enforcement',
      });
      expect(db.chain.eq).toHaveBeenCalledWith('org_slug', 'org-a');
      expect(db.chain.eq).toHaveBeenCalledWith('source_id', 'src-1');
      expect(db.chain.eq).toHaveBeenCalledWith('signal_type', 'enforcement');
    });
  });

  describe('getExistingHashes', () => {
    it('returns empty set for empty input', async () => {
      const result = await repo.getExistingHashes('org-a', []);
      expect(result.size).toBe(0);
    });
  });

  describe('listPortfolio', () => {
    it('queries with active filter', async () => {
      // After order(), the chain needs .eq() which must be thenable
      const thenable = {
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
      };
      // eq is called twice: org_slug then active. Second call is terminal.
      let eqCount = 0;
      db.chain.eq.mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return thenable;
        return db.chain;
      });
      await repo.listPortfolio('org-a', { active: true });
      expect(db.chain.eq).toHaveBeenCalledWith('active', true);
    });
  });

  describe('updateAlertStatus', () => {
    it('sets acknowledged_by and acknowledged_at for acknowledged status', async () => {
      const alert = {
        id: 'alert-1',
        status: 'acknowledged',
        acknowledged_by: 'user-1',
        acknowledged_at: '2026-04-17',
      };
      db.chain.single.mockResolvedValueOnce({ data: alert, error: null });
      const result = await repo.updateAlertStatus(
        'alert-1',
        'org-a',
        'acknowledged',
        'user-1',
      );
      expect(db.chain.update).toHaveBeenCalled();
      expect(result.status).toBe('acknowledged');
    });
  });

  describe('markSignalsProcessed', () => {
    it('skips for empty array', async () => {
      await repo.markSignalsProcessed([]);
      expect(db.from).not.toHaveBeenCalled();
    });
  });

  // ── Pulse Trigger Sync ────────────────────────────────────────────────

  describe('upsertPulseTrigger', () => {
    it('creates trigger with correct cron expression', async () => {
      // For the find query: select→eq→eq→maybeSingle (no existing)
      // Need eq to chain properly for multiple calls
      const findChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      // For the insert query: insert→select→single
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'trigger-1' },
          error: null,
        }),
      };

      let fromCallCount = 0;
      db.from.mockImplementation(() => {
        fromCallCount++;
        return fromCallCount === 1 ? findChain : insertChain;
      });

      const source = {
        id: 'src-1',
        org_slug: 'org-a',
        name: 'Test Source',
        source_type: 'rss' as const,
        url: 'https://example.com/rss',
        poll_interval_minutes: 30,
        practice_areas: [] as string[],
        jurisdictions: [] as string[],
        enabled: true,
        last_polled_at: null,
        last_error: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const result = await repo.upsertPulseTrigger(source);
      expect(result.triggerId).toBe('trigger-1');
      expect(result.created).toBe(true);
      expect(db.from).toHaveBeenCalledWith('ambient', 'triggers');
      // Verify the insert call included the correct cron expression
      const insertCallArg = insertChain.insert.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(insertCallArg).toBeDefined();
      expect(
        (insertCallArg.source_config as { expression: string }).expression,
      ).toBe('*/30 * * * *');
    });

    it('updates existing trigger', async () => {
      // For the find query: select→eq→eq→maybeSingle (found)
      const findChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'existing-trigger' },
          error: null,
        }),
      };
      // For the update query: update→eq
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      let fromCallCount = 0;
      db.from.mockImplementation(() => {
        fromCallCount++;
        return fromCallCount === 1 ? findChain : updateChain;
      });

      const source = {
        id: 'src-1',
        org_slug: 'org-a',
        name: 'Test Source',
        source_type: 'rss' as const,
        url: 'https://example.com/rss',
        poll_interval_minutes: 60,
        practice_areas: [] as string[],
        jurisdictions: [] as string[],
        enabled: true,
        last_polled_at: null,
        last_error: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const result = await repo.upsertPulseTrigger(source);
      expect(result.triggerId).toBe('existing-trigger');
      expect(result.created).toBe(false);
    });
  });

  describe('deletePulseTrigger', () => {
    it('deletes by trigger name pattern', async () => {
      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      // The second .eq() call should resolve as a promise
      let eqCount = 0;
      deleteChain.eq.mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: null, error: null });
        return deleteChain;
      });

      db.from.mockReturnValue(deleteChain);
      await repo.deletePulseTrigger('src-1');
      expect(db.from).toHaveBeenCalledWith('ambient', 'triggers');
      expect(deleteChain.eq).toHaveBeenCalledWith(
        'name',
        'sentinel-ingest:src-1',
      );
      expect(deleteChain.eq).toHaveBeenCalledWith('product', 'pulse');
    });
  });
});
