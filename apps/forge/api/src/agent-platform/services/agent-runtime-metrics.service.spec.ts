import { AgentRuntimeMetricsService } from './agent-runtime-metrics.service';

describe('AgentRuntimeMetricsService', () => {
  let service: AgentRuntimeMetricsService;

  beforeEach(() => {
    service = new AgentRuntimeMetricsService();
  });

  describe('record', () => {
    it('should record a successful metric sample', () => {
      service.record('llm', 'test-agent', true, 100, 200);

      const snapshot = service.snapshot();
      expect(snapshot['llm:test-agent']).toBeDefined();
      expect(snapshot['llm:test-agent']?.total).toBe(1);
      expect(snapshot['llm:test-agent']?.failures).toBe(0);
    });

    it('should record a failed metric sample', () => {
      service.record('api', 'test-agent', false, 100, 500);

      const snapshot = service.snapshot();
      expect(snapshot['api:test-agent']).toBeDefined();
      expect(snapshot['api:test-agent']?.total).toBe(1);
      expect(snapshot['api:test-agent']?.failures).toBe(1);
    });

    it('should record multiple samples for same agent', () => {
      service.record('external', 'agent-1', true, 100, 200);
      service.record('external', 'agent-1', true, 150, 200);
      service.record('external', 'agent-1', false, 200, 500);

      const snapshot = service.snapshot();
      expect(snapshot['external:agent-1']?.total).toBe(3);
      expect(snapshot['external:agent-1']?.failures).toBe(1);
    });

    it('should limit samples to 200 per key', () => {
      for (let i = 0; i < 250; i++) {
        service.record('llm', 'test-agent', true, 100, 200);
      }

      const snapshot = service.snapshot();
      expect(snapshot['llm:test-agent']?.total).toBe(200);
    });

    it('should record samples for different agents separately', () => {
      service.record('llm', 'agent-1', true, 100, 200);
      service.record('llm', 'agent-2', true, 150, 200);
      service.record('api', 'agent-1', false, 200, 500);

      const snapshot = service.snapshot();
      expect(snapshot['llm:agent-1']?.total).toBe(1);
      expect(snapshot['llm:agent-2']?.total).toBe(1);
      expect(snapshot['api:agent-1']?.total).toBe(1);
    });
  });

  describe('snapshot', () => {
    beforeEach(() => {
      service.record('llm', 'agent-1', true, 100, 200);
      service.record('llm', 'agent-1', true, 200, 200);
      service.record('llm', 'agent-1', false, 300, 500);
      service.record('api', 'agent-2', true, 50, 200);
      service.record('external', 'agent-3', false, 500, 500);
    });

    it('should return all metrics when no filters applied', () => {
      const snapshot = service.snapshot();

      expect(Object.keys(snapshot)).toHaveLength(3);
      expect(snapshot['llm:agent-1']).toBeDefined();
      expect(snapshot['api:agent-2']).toBeDefined();
      expect(snapshot['external:agent-3']).toBeDefined();
    });

    it('should filter by transport kind', () => {
      const snapshot = service.snapshot('llm');

      expect(Object.keys(snapshot)).toHaveLength(1);
      expect(snapshot['llm:agent-1']).toBeDefined();
      expect(snapshot['llm:agent-1']?.total).toBe(3);
    });

    it('should filter by agent slug', () => {
      const snapshot = service.snapshot(undefined, 'agent-1');

      expect(Object.keys(snapshot)).toHaveLength(1);
      expect(snapshot['llm:agent-1']).toBeDefined();
    });

    it('should filter by both kind and slug', () => {
      const snapshot = service.snapshot('llm', 'agent-1');

      expect(Object.keys(snapshot)).toHaveLength(1);
      expect(snapshot['llm:agent-1']).toBeDefined();
    });

    it('should calculate average duration correctly', () => {
      const snapshot = service.snapshot('llm', 'agent-1');

      // (100 + 200 + 300) / 3 = 200
      expect(snapshot['llm:agent-1']?.avgMs).toBe(200);
    });

    it('should calculate p95 correctly', () => {
      const service2 = new AgentRuntimeMetricsService();
      // Record 100 samples with durations 1-100
      for (let i = 1; i <= 100; i++) {
        service2.record('llm', 'agent-1', true, i, 200);
      }

      const snapshot = service2.snapshot('llm', 'agent-1');

      // p95 at index 94 (95% of 100 - 1) should be 95ms
      expect(snapshot['llm:agent-1']?.p95Ms).toBe(95);
    });

    it('should include last status', () => {
      const snapshot = service.snapshot('llm', 'agent-1');

      expect(snapshot['llm:agent-1']?.lastStatus).toBe(500);
    });

    it('should count failures correctly', () => {
      const snapshot = service.snapshot('llm', 'agent-1');

      expect(snapshot['llm:agent-1']?.failures).toBe(1);
      expect(snapshot['llm:agent-1']?.total).toBe(3);
    });

    it('should return empty object when no metrics match filters', () => {
      const snapshot = service.snapshot('llm', 'non-existent');

      expect(Object.keys(snapshot)).toHaveLength(0);
    });

    it('should handle edge case with single sample', () => {
      const service2 = new AgentRuntimeMetricsService();
      service2.record('llm', 'agent-1', true, 150, 200);

      const snapshot = service2.snapshot();

      expect(snapshot['llm:agent-1']?.total).toBe(1);
      expect(snapshot['llm:agent-1']?.avgMs).toBe(150);
      expect(snapshot['llm:agent-1']?.p95Ms).toBe(150);
    });
  });
});
