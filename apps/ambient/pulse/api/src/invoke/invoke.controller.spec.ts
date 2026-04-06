/**
 * PulseInvokeController unit tests
 *
 * Tests POST /invoke returns proper JSON-RPC 2.0 response, handles
 * missing params, and surfaces dispatch errors correctly.
 */

import { PulseInvokeController } from './invoke.controller';
import { PulseDispatchService } from './pulse-dispatch.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type { A2AInvokeRequest, InvokeOutput } from '@orchestrator-ai/transport-types';

const mockOutput: InvokeOutput = {
  content: { processed: true, eventsHandled: 5 },
  outputType: 'json',
};

function buildRequest(overrides?: Partial<A2AInvokeRequest>): A2AInvokeRequest {
  return {
    jsonrpc: '2.0',
    id: 'pulse-req-1',
    method: 'invoke',
    params: {
      context: createMockExecutionContext({ agentSlug: 'marketing-swarm', agentType: 'system' }),
      data: { content: { action: 'run' } },
    },
    ...overrides,
  };
}

describe('PulseInvokeController', () => {
  let controller: PulseInvokeController;
  let dispatch: jest.Mocked<Pick<PulseDispatchService, 'invoke'>>;

  beforeEach(() => {
    dispatch = { invoke: jest.fn().mockResolvedValue(mockOutput) };
    controller = new PulseInvokeController(dispatch as unknown as PulseDispatchService);
  });

  describe('invoke — happy path', () => {
    it('returns JSON-RPC 2.0 success response with output from dispatch', async () => {
      const request = buildRequest();
      const response = await controller.invoke(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('pulse-req-1');
      expect('result' in response).toBe(true);

      if ('result' in response) {
        expect(response.result.success).toBe(true);
        expect(response.result.output).toEqual(mockOutput);
      }
    });

    it('passes context, data, and metadata to dispatch', async () => {
      const context = createMockExecutionContext({ agentSlug: 'data-monitor', agentType: 'system' });
      const data = { content: { orgSlug: 'acme', action: 'analyze' } };
      const metadata = { triggeredBy: 'cron' };

      await controller.invoke({
        jsonrpc: '2.0',
        id: 2,
        method: 'invoke',
        params: { context, data, metadata },
      });

      expect(dispatch.invoke).toHaveBeenCalledWith(context, data, metadata);
    });
  });

  describe('invoke — missing params', () => {
    it('returns INVALID_PARAMS when data is missing', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'bad-req',
        method: 'invoke' as const,
        params: { context: createMockExecutionContext() } as never,
      };

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INVALID_PARAMS);
      }
      expect(dispatch.invoke).not.toHaveBeenCalled();
    });
  });

  describe('invoke — dispatch error', () => {
    it('returns INTERNAL_ERROR with pulse_invocation_failed errorType', async () => {
      dispatch.invoke.mockRejectedValueOnce(new Error('No Pulse handler for: unknown-agent'));
      const request = buildRequest();

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect((response.error.data as Record<string, unknown>)?.errorType).toBe('pulse_invocation_failed');
      }
    });
  });
});
