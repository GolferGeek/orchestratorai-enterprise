import { PipelineTracer } from './pipeline-tracer';
import { PipelineTrace } from './types';

describe('PipelineTracer', () => {
  describe('constructor', () => {
    it('sets source, target, and method from options', () => {
      const tracer = new PipelineTracer({
        source: 'research-hub',
        target: 'market-pulse',
        method: 'research.query',
      });

      const trace = tracer.complete('msg-001');

      expect(trace.source).toBe('research-hub');
      expect(trace.target).toBe('market-pulse');
      expect(trace.method).toBe('research.query');
    });

    it('generates a traceId when none is provided', () => {
      const tracer = new PipelineTracer({
        source: 'a',
        target: 'b',
        method: 'test.method',
      });

      expect(tracer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('uses provided traceId when supplied', () => {
      const traceId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const tracer = new PipelineTracer({
        source: 'a',
        target: 'b',
        method: 'test.method',
        traceId,
      });

      expect(tracer.id).toBe(traceId);
    });
  });

  describe('addStep()', () => {
    it('adds a step with auto-incrementing step number', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({ label: 'Step A', layer: 'identity', provider: 'oauth-jwt', data: { foo: 'bar' } });
      tracer.addStep({ label: 'Step B', layer: 'encryption', provider: 'envelope', data: { baz: 1 } });

      const trace = tracer.complete('msg-002');

      expect(trace.steps[0].step).toBe(1);
      expect(trace.steps[1].step).toBe(2);
    });

    it('sets a timestamp on each step', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({ label: 'Step A', layer: 'transport', provider: 'http-rest', data: {} });

      const trace = tracer.complete('msg-003');

      expect(trace.steps[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('defaults durationMs to 0 when not provided', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({ label: 'Step A', layer: 'trust', provider: 'allowlist', data: { ok: true } });

      const trace = tracer.complete('msg-004');

      expect(trace.steps[0].durationMs).toBe(0);
    });

    it('uses provided durationMs when supplied', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({
        label: 'Step A',
        layer: 'trust',
        provider: 'allowlist',
        data: {},
        durationMs: 42,
      });

      const trace = tracer.complete('msg-005');

      expect(trace.steps[0].durationMs).toBe(42);
    });
  });

  describe('trace()', () => {
    it('executes the async function and captures its result as step data', async () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      const result = await tracer.trace(
        'After Signing',
        'identity',
        'oauth-jwt',
        async () => ({ signed: true, payload: 'abc' }),
      );

      expect(result).toEqual({ signed: true, payload: 'abc' });

      const trace = tracer.complete('msg-006');
      expect(trace.steps[0].data).toEqual({ signed: true, payload: 'abc' });
      expect(trace.steps[0].label).toBe('After Signing');
      expect(trace.steps[0].layer).toBe('identity');
      expect(trace.steps[0].provider).toBe('oauth-jwt');
    });

    it('measures the duration of the async function', async () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      await tracer.trace('Timed Step', 'transport', 'http-rest', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { done: true };
      });

      const trace = tracer.complete('msg-007');
      expect(trace.steps[0].durationMs).toBeGreaterThanOrEqual(10);
    });

    it('attaches optional metadata to the step', async () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      await tracer.trace(
        'Trust Check',
        'trust',
        'reputation',
        async () => ({ trusted: true }),
        { trustScore: 0.95, trustLevel: 'high' },
      );

      const trace = tracer.complete('msg-008');
      expect(trace.steps[0].metadata?.trustScore).toBe(0.95);
      expect(trace.steps[0].metadata?.trustLevel).toBe('high');
    });
  });

  describe('traceSync()', () => {
    it('executes the sync function and captures its result as step data', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      const result = tracer.traceSync(
        'Raw Payload',
        'transport',
        'a2a-jsonrpc',
        () => ({ jsonrpc: '2.0', method: 'test', id: '1' }),
      );

      expect(result).toEqual({ jsonrpc: '2.0', method: 'test', id: '1' });

      const trace = tracer.complete('msg-009');
      expect(trace.steps[0].data).toEqual({ jsonrpc: '2.0', method: 'test', id: '1' });
    });

    it('measures the duration of the sync function', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.traceSync('Sync Step', 'identity', 'local-keys', () => ({ computed: true }));

      const trace = tracer.complete('msg-010');
      expect(trace.steps[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('complete()', () => {
    it('returns a PipelineTrace with all required fields populated', () => {
      const tracer = new PipelineTracer({
        source: 'research-hub',
        target: 'market-pulse',
        method: 'market.analyze',
        traceId: 'fixed-trace-id-0000-0000-000000000001',
      });

      tracer.addStep({ label: 'Raw', layer: 'transport', provider: 'http-rest', data: { msg: 'hello' } });

      const trace: PipelineTrace = tracer.complete('msg-011');

      expect(trace.traceId).toBe('fixed-trace-id-0000-0000-000000000001');
      expect(trace.messageId).toBe('msg-011');
      expect(trace.source).toBe('research-hub');
      expect(trace.target).toBe('market-pulse');
      expect(trace.method).toBe('market.analyze');
      expect(trace.steps).toHaveLength(1);
      expect(trace.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(trace.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof trace.totalDurationMs).toBe('number');
      expect(trace.providersUsed).toEqual(['http-rest']);
    });

    it('reports totalDurationMs as elapsed time since construction', async () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      await new Promise(resolve => setTimeout(resolve, 15));

      const trace = tracer.complete('msg-012');
      expect(trace.totalDurationMs).toBeGreaterThanOrEqual(15);
    });
  });

  describe('providersUsed deduplication', () => {
    it('returns each provider only once even if used in multiple steps', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({ label: 'Step 1', layer: 'identity', provider: 'oauth-jwt', data: {} });
      tracer.addStep({ label: 'Step 2', layer: 'transport', provider: 'http-rest', data: {} });
      tracer.addStep({ label: 'Step 3', layer: 'identity', provider: 'oauth-jwt', data: {} });
      tracer.addStep({ label: 'Step 4', layer: 'transport', provider: 'http-rest', data: {} });

      const trace = tracer.complete('msg-013');

      expect(trace.providersUsed).toHaveLength(2);
      expect(trace.providersUsed).toContain('oauth-jwt');
      expect(trace.providersUsed).toContain('http-rest');
    });
  });

  describe('stepCount', () => {
    it('returns 0 before any steps are added', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });
      expect(tracer.stepCount).toBe(0);
    });

    it('increments as steps are added', () => {
      const tracer = new PipelineTracer({ source: 'a', target: 'b', method: 'm' });

      tracer.addStep({ label: 'A', layer: 'x', provider: 'p1', data: {} });
      expect(tracer.stepCount).toBe(1);

      tracer.addStep({ label: 'B', layer: 'x', provider: 'p2', data: {} });
      expect(tracer.stepCount).toBe(2);
    });
  });
});
