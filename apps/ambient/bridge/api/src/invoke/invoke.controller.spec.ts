/**
 * BridgeInvokeController unit tests
 *
 * Tests POST /invoke returns JSON-RPC 2.0 response and routes
 * through BridgeDispatchService for both inbound and outbound.
 */

import { BridgeInvokeController } from './invoke.controller';
import { BridgeDispatchService } from './bridge-dispatch.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type { A2AInvokeRequest, InvokeOutput } from '@orchestrator-ai/transport-types';

const mockOutput: InvokeOutput = {
  content: 'bridged response',
  outputType: 'text',
};

function buildRequest(metadata?: Record<string, unknown>): A2AInvokeRequest {
  return {
    jsonrpc: '2.0',
    id: 'bridge-req-1',
    method: 'invoke',
    params: {
      context: createMockExecutionContext({ agentSlug: 'external-partner-agent' }),
      data: { content: 'hello from external' },
      metadata,
    },
  };
}

describe('BridgeInvokeController', () => {
  let controller: BridgeInvokeController;
  let dispatch: jest.Mocked<Pick<BridgeDispatchService, 'invoke'>>;

  beforeEach(() => {
    dispatch = { invoke: jest.fn().mockResolvedValue(mockOutput) };
    controller = new BridgeInvokeController(dispatch as unknown as BridgeDispatchService);
  });

  describe('invoke — happy path (inbound)', () => {
    it('returns JSON-RPC 2.0 success response for inbound request', async () => {
      const request = buildRequest({ direction: 'inbound' });
      const response = await controller.invoke(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('bridge-req-1');
      expect('result' in response).toBe(true);

      if ('result' in response) {
        expect(response.result.success).toBe(true);
        expect(response.result.output).toEqual(mockOutput);
      }
    });
  });

  describe('invoke — happy path (outbound)', () => {
    it('passes outbound direction metadata to dispatch service', async () => {
      const request = buildRequest({ direction: 'outbound', targetAgentId: 'partner-abc' });
      await controller.invoke(request);

      expect(dispatch.invoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ direction: 'outbound', targetAgentId: 'partner-abc' }),
      );
    });
  });

  describe('invoke — missing params', () => {
    it('returns INVALID_PARAMS when context or data is missing', async () => {
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
    it('returns INTERNAL_ERROR with bridge_invocation_failed errorType', async () => {
      dispatch.invoke.mockRejectedValueOnce(new Error('Internal agent compose returned HTTP 502'));
      const request = buildRequest();

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect((response.error.data as Record<string, unknown>)?.errorType).toBe('bridge_invocation_failed');
      }
    });
  });
});
