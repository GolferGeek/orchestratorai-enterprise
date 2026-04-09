/**
 * ExternalFamilyRunner unit tests
 *
 * Tests A2A forward request construction, successful response parsing,
 * JSON-RPC error propagation, and missing endpoint guard.
 */

import { ExternalFamilyRunner } from './external-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';
import { of } from 'rxjs';

const mockDefinition: AgentDefinition = {
  id: 'def-4',
  slug: 'remote-agent',
  name: 'Remote Agent',
  agentType: 'external',
  status: 'active',
  outputType: 'text',
  endpoint: 'https://remote.example.com/invoke',
};

const successA2AResponse = {
  jsonrpc: '2.0',
  id: 'req-1',
  result: {
    success: true,
    output: {
      content: 'Response from remote agent',
      outputType: 'text',
      metadata: { source: 'remote' },
    },
  },
};

function buildHttpResponse(data: unknown, status = 200) {
  return of({
    status,
    data,
    headers: {},
    config: {},
    statusText: 'OK',
    request: {},
  });
}

describe('ExternalFamilyRunner', () => {
  let runner: ExternalFamilyRunner;
  let mockHttpService: { request: jest.Mock };

  beforeEach(() => {
    mockHttpService = {
      request: jest.fn().mockReturnValue(buildHttpResponse(successA2AResponse)),
    };

    runner = new ExternalFamilyRunner(mockHttpService as never);
  });

  describe('invoke — happy path', () => {
    it('sends A2A JSON-RPC 2.0 request and extracts InvokeOutput from result', async () => {
      const context = createMockExecutionContext({ agentSlug: 'remote-agent' });
      const data = { content: 'forward this' };

      const output = await runner.invoke(mockDefinition, context, data);

      const call = mockHttpService.request.mock.calls[0]?.[0];
      expect(call?.url).toBe('https://remote.example.com/invoke');
      expect(call?.data?.jsonrpc).toBe('2.0');
      expect(call?.data?.method).toBe('invoke');
      expect(call?.data?.params?.context).toEqual(context);

      expect(output.content).toBe('Response from remote agent');
      expect(output.outputType).toBe('text');
      expect(output.metadata?.forwardedFrom).toBe('remote-agent');
    });
  });

  describe('invoke — error paths', () => {
    it('throws when endpoint is missing from definition', async () => {
      const defNoEndpoint: AgentDefinition = {
        ...mockDefinition,
        endpoint: undefined,
      };
      const context = createMockExecutionContext();

      await expect(
        runner.invoke(defNoEndpoint, context, { content: 'test' }),
      ).rejects.toThrow('missing endpoint');
    });

    it('throws when remote returns a JSON-RPC error', async () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: 'req-1',
        error: { code: -32603, message: 'Remote agent internal error' },
      };
      mockHttpService.request.mockReturnValueOnce(
        buildHttpResponse(errorResponse),
      );
      const context = createMockExecutionContext();

      await expect(
        runner.invoke(mockDefinition, context, { content: 'test' }),
      ).rejects.toThrow('Remote agent internal error');
    });

    it('throws when HTTP response is non-200', async () => {
      mockHttpService.request.mockReturnValueOnce(
        buildHttpResponse({ error: 'gateway timeout' }, 504),
      );
      const context = createMockExecutionContext();

      await expect(
        runner.invoke(mockDefinition, context, { content: 'test' }),
      ).rejects.toThrow('HTTP 504');
    });
  });
});
