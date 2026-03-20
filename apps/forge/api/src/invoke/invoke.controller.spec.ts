/**
 * ForgeInvokeController unit tests
 *
 * Tests POST /invoke routes to capability registry, returns proper
 * JSON-RPC 2.0 responses, and handles registry errors.
 */

import { ForgeInvokeController } from './invoke.controller';
import { CapabilityRegistryService } from './capability-registry.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type { A2AInvokeRequest, InvokeOutput } from '@orchestrator-ai/transport-types';

const mockOutput: InvokeOutput = {
  content: 'capability result',
  outputType: 'json',
  metadata: { capability: 'marketing-swarm' },
};

function buildRequest(overrides?: Partial<A2AInvokeRequest>): A2AInvokeRequest {
  return {
    jsonrpc: '2.0',
    id: 'forge-req-1',
    method: 'invoke',
    params: {
      context: createMockExecutionContext({ agentSlug: 'marketing-swarm' }),
      data: { content: { action: 'generate' } },
    },
    ...overrides,
  };
}

describe('ForgeInvokeController', () => {
  let controller: ForgeInvokeController;
  let registry: jest.Mocked<Pick<CapabilityRegistryService, 'invoke' | 'invokeStream'>>;

  beforeEach(() => {
    registry = {
      invoke: jest.fn().mockResolvedValue(mockOutput),
      invokeStream: jest.fn().mockResolvedValue(undefined),
    };

    controller = new ForgeInvokeController(registry as unknown as CapabilityRegistryService);
  });

  describe('invoke — happy path', () => {
    it('routes to registry and returns JSON-RPC 2.0 success response', async () => {
      const request = buildRequest();
      const response = await controller.invoke(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('forge-req-1');
      expect('result' in response).toBe(true);

      if ('result' in response) {
        expect(response.result.success).toBe(true);
        expect(response.result.output).toEqual(mockOutput);
      }
    });

    it('passes context, data, metadata to registry', async () => {
      const context = createMockExecutionContext({ agentSlug: 'data-analyst' });
      const data = { content: { query: 'top 10 products' } };
      const metadata = { priority: 'high' };
      const request: A2AInvokeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'invoke',
        params: { context, data, metadata },
      };

      await controller.invoke(request);

      expect(registry.invoke).toHaveBeenCalledWith(context, data, metadata);
    });
  });

  describe('invoke — missing params', () => {
    it('returns INVALID_PARAMS when context is missing', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'req-2',
        method: 'invoke' as const,
        params: { data: { content: 'test' } } as never,
      };

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INVALID_PARAMS);
      }
    });
  });

  describe('invoke — registry error', () => {
    it('returns INTERNAL_ERROR when registry throws', async () => {
      registry.invoke.mockRejectedValueOnce(new Error('Unknown capability: ghost-capability'));
      const request = buildRequest();

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(response.error.message).toContain('Unknown capability');
      }
    });
  });
});
