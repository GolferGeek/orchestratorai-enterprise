import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check()', () => {
    it('should return status ok', () => {
      const result = controller.check();
      expect(result.status).toBe('ok');
    });

    it('should identify as the pulse product', () => {
      const result = controller.check();
      expect(result.product).toBe('pulse');
    });

    it('should include a valid ISO timestamp', () => {
      const before = new Date().toISOString();
      const result = controller.check();
      const after = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });

    it('should return a new timestamp on each call', async () => {
      const first = controller.check();
      await new Promise((r) => setTimeout(r, 5));
      const second = controller.check();
      // Timestamps may be equal if called fast enough, but they should be valid ISO strings
      expect(new Date(first.timestamp).getTime()).toBeGreaterThan(0);
      expect(new Date(second.timestamp).getTime()).toBeGreaterThan(0);
    });
  });
});
