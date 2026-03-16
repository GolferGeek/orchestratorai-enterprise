import { Test, TestingModule } from '@nestjs/testing';
import { LlmAnalyticsService } from './llm-analytics.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

describe('LlmAnalyticsService', () => {
  let service: LlmAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAnalyticsService,
        {
          provide: DATABASE_SERVICE,
          useValue: {
            from: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              then: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
            rawQuery: jest.fn().mockResolvedValue({ data: [], error: null }),
          },
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
    const result = await service.getModels();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getCosts should return array', async () => {
    const result = await service.getCosts();
    expect(Array.isArray(result)).toBe(true);
  });
});
