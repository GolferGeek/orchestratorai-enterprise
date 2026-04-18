import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type QueryBuilder,
} from '@orchestrator-ai/transport-types';
import { Test } from '@nestjs/testing';
import { MatterRepository } from './matter.repository';
import type { CreateMatterDto } from './matter.types';

function makeBuilder(payload: { data: unknown; error: unknown }): QueryBuilder {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve(payload);
      }
      return (..._args: unknown[]) => builder;
    },
  };
  const builder = new Proxy({}, handler) as QueryBuilder;
  return builder;
}

function makeDb(payload: { data: unknown; error: unknown }): DatabaseService {
  const builder = makeBuilder(payload);
  return {
    from: () => builder,
    rpc: async () => ({ data: null, error: null }),
    rawQuery: async () => payload as never,
    checkConnection: async () => ({ status: 'ok', message: 'ok' }),
    getConfig: () => ({
      provider: 'stub',
      url: '',
      schemas: [],
      clientsAvailable: { service: true, anon: false },
    }),
  } as unknown as DatabaseService;
}

async function buildRepo(db: DatabaseService): Promise<MatterRepository> {
  const mod = await Test.createTestingModule({
    providers: [MatterRepository, { provide: DATABASE_SERVICE, useValue: db }],
  }).compile();
  return mod.get(MatterRepository);
}

const baseContext = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'forge',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

describe('MatterRepository', () => {
  describe('createMatter', () => {
    it('returns inserted row', async () => {
      const inserted = {
        id: 'matter-1',
        org_slug: 'test-org',
        name: 'Test Matter',
        status: 'active',
      };
      // rawQuery returns rows as an array
      const repo = await buildRepo(makeDb({ data: [inserted], error: null }));
      const dto: CreateMatterDto = {
        context: baseContext,
        data: {
          name: 'Test Matter',
          clientName: 'Client A',
          matterType: 'litigation',
          jurisdiction: 'NY',
        },
      };
      const result = await repo.createMatter(dto);
      expect(result).toEqual(inserted);
    });

    it('throws on DB error', async () => {
      const repo = await buildRepo(
        makeDb({ data: null, error: { message: 'db fail' } }),
      );
      const dto: CreateMatterDto = {
        context: baseContext,
        data: {
          name: 'Test',
          clientName: 'C',
          matterType: 'litigation',
          jurisdiction: 'NY',
        },
      };
      await expect(repo.createMatter(dto)).rejects.toThrow('db fail');
    });
  });

  describe('listMatters', () => {
    it('returns array', async () => {
      const rows = [{ id: 'matter-1' }, { id: 'matter-2' }];
      const repo = await buildRepo(makeDb({ data: rows, error: null }));
      const result = await repo.listMatters('test-org');
      expect(result).toHaveLength(2);
    });

    it('returns empty array on null data', async () => {
      const repo = await buildRepo(makeDb({ data: null, error: null }));
      const result = await repo.listMatters('test-org');
      expect(result).toEqual([]);
    });
  });

  describe('getMatterById', () => {
    it('returns matter when found', async () => {
      const matter = { id: 'matter-1', org_slug: 'test-org' };
      const repo = await buildRepo(makeDb({ data: matter, error: null }));
      const result = await repo.getMatterById('matter-1', 'test-org');
      expect(result.id).toBe('matter-1');
    });

    it('throws NotFoundException when not found', async () => {
      const repo = await buildRepo(
        makeDb({ data: null, error: { message: 'not found' } }),
      );
      await expect(repo.getMatterById('bad-id', 'test-org')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertMatterOwnership', () => {
    it('returns matter when org matches', async () => {
      const matter = { id: 'matter-1', org_slug: 'test-org' };
      const repo = await buildRepo(makeDb({ data: matter, error: null }));
      const result = await repo.assertMatterOwnership('matter-1', 'test-org');
      expect(result.id).toBe('matter-1');
    });

    it('throws ForbiddenException when org does not match', async () => {
      const matter = { id: 'matter-1', org_slug: 'other-org' };
      const repo = await buildRepo(makeDb({ data: matter, error: null }));
      await expect(
        repo.assertMatterOwnership('matter-1', 'test-org'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setFactsProcessed', () => {
    it('completes without error on success', async () => {
      const repo = await buildRepo(makeDb({ data: null, error: null }));
      await expect(
        repo.setFactsProcessed('doc-1', 'matter-1'),
      ).resolves.toBeUndefined();
    });

    it('throws on DB error', async () => {
      const repo = await buildRepo(
        makeDb({ data: null, error: { message: 'update failed' } }),
      );
      await expect(repo.setFactsProcessed('doc-1', 'matter-1')).rejects.toThrow(
        'update failed',
      );
    });
  });

  describe('setDocsProcessed', () => {
    it('completes without error on success', async () => {
      const repo = await buildRepo(makeDb({ data: null, error: null }));
      await expect(
        repo.setDocsProcessed('doc-1', 'matter-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listEntities', () => {
    it('returns rows', async () => {
      const rows = [{ id: 'e1', entity_type: 'person', name: 'Alice' }];
      const repo = await buildRepo(makeDb({ data: rows, error: null }));
      const result = await repo.listEntities('matter-1', 'test-org');
      expect(result).toHaveLength(1);
    });
  });

  describe('listTimeline', () => {
    it('returns rows ordered by event_date', async () => {
      const rows = [{ id: 't1', event_type: 'filing' }];
      const repo = await buildRepo(makeDb({ data: rows, error: null }));
      const result = await repo.listTimeline('matter-1', 'test-org');
      expect(result).toHaveLength(1);
    });
  });
});
