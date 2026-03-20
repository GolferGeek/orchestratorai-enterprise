import { Test, TestingModule } from '@nestjs/testing';
import { LlmAnalyticsService } from './llm-analytics.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

// Build a chainable DB mock that resolves to { data, error } when awaited
const makeChainable = (result: { data: unknown; error: null | { message: string } }) => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'order', 'limit', 'update', 'single'];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  chain['catch'] = (reject: (e: unknown) => unknown) =>
    Promise.resolve(result).catch(reject);
  return chain;
};

describe('LlmAnalyticsService', () => {
  let service: LlmAnalyticsService;
  let mockDb: {
    from: jest.Mock;
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      from: jest.fn().mockReturnValue(makeChainable({ data: [], error: null })),
      rawQuery: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAnalyticsService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<LlmAnalyticsService>(LlmAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getUsage should return array', async () => {
    const result = await service.getUsage();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getModels should return array', async () => {
    // getModels calls Promise.all([db.from(...).select('*'), db.rawQuery(...)])
    // db.from returns a chainable thenable; db.rawQuery returns a promise
    mockDb.from.mockReturnValue(makeChainable({ data: [], error: null }));
    mockDb.rawQuery.mockResolvedValue({ data: [], error: null });

    const result = await service.getModels();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getCosts should return array', async () => {
    const result = await service.getCosts();
    expect(Array.isArray(result)).toBe(true);
  });
});
