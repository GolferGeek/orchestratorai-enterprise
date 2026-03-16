import { Test, TestingModule } from '@nestjs/testing';
import { ObservabilityService } from './observability.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

describe('ObservabilityService', () => {
  let service: ObservabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
        {
          provide: DATABASE_SERVICE,
          useValue: {
            from: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              or: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              then: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
            rawQuery: jest.fn().mockResolvedValue({ data: [], error: null }),
          },
        },
      ],
    }).compile();

    service = module.get<ObservabilityService>(ObservabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getMetrics should return flat metrics shape', async () => {
    const result = await service.getMetrics();
    expect(result).toHaveProperty('totalEventsLast24h');
    expect(result).toHaveProperty('errorCountLast24h');
    expect(result).toHaveProperty('topProducts');
  });
});
