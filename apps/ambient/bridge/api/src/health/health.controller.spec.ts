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

    it('should identify as the bridge product', () => {
      const result = controller.check();
      expect(result.product).toBe('bridge');
    });

    it('should return version 0.1.0', () => {
      const result = controller.check();
      expect(result.version).toBe('0.1.0');
    });

    it('should return a valid port number', () => {
      const result = controller.check();
      expect(typeof result.port).toBe('number');
      expect(result.port).toBeGreaterThan(0);
    });

    it('should include a valid ISO timestamp', () => {
      const before = new Date().toISOString();
      const result = controller.check();
      const after = new Date().toISOString();

      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });
  });
});
