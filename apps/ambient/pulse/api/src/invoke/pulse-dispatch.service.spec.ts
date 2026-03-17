/**
 * PulseDispatchService unit tests
 *
 * Tests handler registration and dispatch by agentSlug, observability
 * event emission, and error for unregistered handlers.
 */

import { PulseDispatchService } from './pulse-dispatch.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { ExecutionContext, InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';

const mockOutput: InvokeOutput = {
  content: { result: 'predictions generated' },
  outputType: 'json',
};

function buildObservability() {
  return { emitInvocationEvent: jest.fn().mockResolvedValue(undefined) };
}

describe('PulseDispatchService', () => {
  let service: PulseDispatchService;
  let observability: ReturnType<typeof buildObservability>;

  beforeEach(() => {
    observability = buildObservability();
    service = new PulseDispatchService(observability as never);
  });

  describe('registerHandler + invoke', () => {
    it('dispatches to the registered handler by agentSlug', async () => {
      const handler = jest.fn<Promise<InvokeOutput>, [ExecutionContext, InvokeData, Record<string, unknown> | undefined]>(
        async () => mockOutput,
      );
      service.registerHandler('predictor', handler);

      const context = createMockExecutionContext({ agentSlug: 'predictor', agentType: 'system' });
      const data: InvokeData = { content: { action: 'run' } };

      const output = await service.invoke(context, data);

      expect(handler).toHaveBeenCalledWith(context, data, undefined);
      expect(output).toEqual(mockOutput);
    });

    it('emits invocation.started and invocation.completed with sourceApp pulse', async () => {
      service.registerHandler('predictor', async () => mockOutput);
      const context = createMockExecutionContext({ agentSlug: 'predictor', agentType: 'system' });

      await service.invoke(context, { content: {} });

      const calls = observability.emitInvocationEvent.mock.calls;
      expect(calls[0]?.[1]?.type).toBe('invocation.started');
      expect(calls[0]?.[1]?.sourceApp).toBe('pulse');
      expect(calls[1]?.[1]?.type).toBe('invocation.completed');
    });
  });

  describe('invoke — unregistered handler', () => {
    it('throws and emits invocation.failed when no handler is registered', async () => {
      const context = createMockExecutionContext({ agentSlug: 'ghost-processor', agentType: 'system' });

      await expect(service.invoke(context, { content: {} })).rejects.toThrow(
        'No Pulse handler for: ghost-processor',
      );

      const calls = observability.emitInvocationEvent.mock.calls;
      expect(calls[1]?.[1]?.type).toBe('invocation.failed');
    });
  });
});
