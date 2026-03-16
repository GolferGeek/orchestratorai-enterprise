import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    // Reset env to known defaults
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;

    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimiterService],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAllowed()', () => {
    it('should allow the first request from a new key', () => {
      expect(service.isAllowed('agent-new')).toBe(true);
    });

    it('should allow requests up to the max limit', () => {
      const config = service.getWindowConfig();
      for (let i = 0; i < config.maxRequests; i++) {
        expect(service.isAllowed('agent-limit')).toBe(true);
      }
    });

    it('should deny the request when max limit is exceeded', () => {
      const config = service.getWindowConfig();
      for (let i = 0; i < config.maxRequests; i++) {
        service.isAllowed('agent-over');
      }
      expect(service.isAllowed('agent-over')).toBe(false);
    });

    it('should track different keys independently', () => {
      const config = service.getWindowConfig();
      // Exhaust limit for agent-a
      for (let i = 0; i < config.maxRequests; i++) {
        service.isAllowed('agent-a');
      }
      expect(service.isAllowed('agent-a')).toBe(false);
      // agent-b should still be allowed
      expect(service.isAllowed('agent-b')).toBe(true);
    });
  });

  describe('getRemainingRequests()', () => {
    it('should return the full limit for a key that has not made any requests', () => {
      const config = service.getWindowConfig();
      expect(service.getRemainingRequests('fresh-agent')).toBe(config.maxRequests);
    });

    it('should decrement as requests are made', () => {
      const config = service.getWindowConfig();
      service.isAllowed('agent-decr');
      service.isAllowed('agent-decr');
      expect(service.getRemainingRequests('agent-decr')).toBe(config.maxRequests - 2);
    });

    it('should not go below zero', () => {
      const config = service.getWindowConfig();
      // Exhaust the window
      for (let i = 0; i <= config.maxRequests + 5; i++) {
        service.isAllowed('agent-floor');
      }
      expect(service.getRemainingRequests('agent-floor')).toBe(0);
    });
  });

  describe('getWindowConfig()', () => {
    it('should return the default window of 60000ms', () => {
      expect(service.getWindowConfig().windowMs).toBe(60000);
    });

    it('should return the default max requests of 100', () => {
      expect(service.getWindowConfig().maxRequests).toBe(100);
    });
  });
});
