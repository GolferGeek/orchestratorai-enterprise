/**
 * InvokeController unit tests
 *
 * Tests POST /invoke JSON-RPC 2.0 response shape, missing params guard,
 * and error propagation from the dispatch service.
 */

import { InvokeController } from './invoke.controller';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { ProvidersModelsService } from './providers-models.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type { A2AInvokeRequest, InvokeOutput } from '@orchestrator-ai/transport-types';

function buildRequest(overrides?: Partial<A2AInvokeRequest>): A2AInvokeRequest {
  return {
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'invoke',
    params: {
      context: createMockExecutionContext(),
      data: { content: 'hello' },
    },
    ...overrides,
  };
}

const mockOutput: InvokeOutput = {
  content: 'response text',
  outputType: 'text',
  metadata: { agentSlug: 'test-agent' },
};

describe('InvokeController', () => {
  let controller: InvokeController;
  let dispatch: jest.Mocked<Pick<InvokeDispatchService, 'invoke' | 'invokeStream'>>;
  let providersModels: jest.Mocked<Pick<ProvidersModelsService, 'fetchProvidersAndModels'>>;

  beforeEach(() => {
    dispatch = {
      invoke: jest.fn().mockResolvedValue(mockOutput),
      invokeStream: jest.fn().mockResolvedValue(undefined),
    };

    providersModels = {
      fetchProvidersAndModels: jest.fn().mockResolvedValue({ providers: [], models: [] }),
    };

    controller = new InvokeController(
      dispatch as unknown as InvokeDispatchService,
      {} as never, // AgentDefinitionService (not tested here)
      providersModels as unknown as ProvidersModelsService,
      { fetchForUser: jest.fn().mockResolvedValue([]) } as never, // ConversationsService
      { from: jest.fn() } as never, // DatabaseService (not tested here)
    );
  });

  describe('invoke — happy path', () => {
    it('returns JSON-RPC 2.0 success response with output', async () => {
      const request = buildRequest();
      const response = await controller.invoke(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-1');
      expect('result' in response).toBe(true);

      if ('result' in response) {
        expect(response.result.success).toBe(true);
        expect(response.result.output).toEqual(mockOutput);
        expect(response.result.context).toEqual(request.params.context);
      }
    });

    it('passes context, data, and metadata to dispatch service', async () => {
      const context = createMockExecutionContext({ agentSlug: 'my-agent' });
      const data = { content: 'query text' };
      const metadata = { hint: 'streaming' };
      const request: A2AInvokeRequest = {
        jsonrpc: '2.0',
        id: 42,
        method: 'invoke',
        params: { context, data, metadata },
      };

      await controller.invoke(request);

      expect(dispatch.invoke).toHaveBeenCalledWith(context, data, metadata);
    });
  });

  describe('invoke — missing params', () => {
    it('returns INVALID_PARAMS error when context is missing', async () => {
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
      expect(dispatch.invoke).not.toHaveBeenCalled();
    });
  });

  describe('invoke — dispatch error', () => {
    it('returns INTERNAL_ERROR response when dispatch throws', async () => {
      dispatch.invoke.mockRejectedValueOnce(new Error('Agent not found: unknown-agent'));
      const request = buildRequest();

      const response = await controller.invoke(request);

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(response.error.message).toContain('Agent not found');
      }
    });
  });
});
