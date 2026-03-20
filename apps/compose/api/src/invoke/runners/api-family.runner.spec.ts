/**
 * ApiFamilyRunner unit tests
 *
 * Tests HTTP call to external API, raw response path (no LLM),
 * LLM formatting path when definition.context is present, and
 * missing endpoint error.
 */

import { ApiFamilyRunner } from './api-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';
import { of } from 'rxjs';

const mockDefinition: AgentDefinition = {
  id: 'def-3',
  slug: 'weather-api',
  name: 'Weather API Agent',
  agentType: 'api',
  status: 'active',
  outputType: 'json',
  endpoint: 'https://api.example.com/weather',
};

function buildHttpResponse(data: unknown, status = 200) {
  return of({ status, data, headers: {}, config: {}, statusText: 'OK', request: {} });
}

describe('ApiFamilyRunner', () => {
  let runner: ApiFamilyRunner;
  let mockHttpService: { request: jest.Mock };
  let mockLlmService: { generateUnifiedResponse: jest.Mock };

  beforeEach(() => {
    mockHttpService = {
      request: jest.fn().mockReturnValue(buildHttpResponse({ result: 'Sunny, 72°F' })),
    };
    mockLlmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue({
        content: 'The weather is sunny and 72°F.',
        metadata: {},
      }),
    };

    runner = new ApiFamilyRunner(mockHttpService as never, mockLlmService as never);
  });

  describe('invoke — raw API response (no LLM)', () => {
    it('calls external endpoint and returns api content without LLM when no context', async () => {
      const context = createMockExecutionContext({ agentSlug: 'weather-api' });
      const data = { content: 'current weather' };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/weather',
          method: 'POST',
        }),
      );
      expect(mockLlmService.generateUnifiedResponse).not.toHaveBeenCalled();
      expect(output.metadata?.endpoint).toBe('https://api.example.com/weather');
    });
  });

  describe('invoke — LLM formatting path', () => {
    it('processes API response through LLM when definition.context is set', async () => {
      const defWithContext: AgentDefinition = {
        ...mockDefinition,
        context: 'You are a weather assistant. Format the API data for the user.',
        outputType: 'text',
      };
      const context = createMockExecutionContext();

      const output = await runner.invoke(defWithContext, context, { content: 'weather?' });

      expect(mockLlmService.generateUnifiedResponse).toHaveBeenCalled();
      expect(output.content).toBe('The weather is sunny and 72°F.');
    });
  });

  describe('invoke — error path', () => {
    it('throws when endpoint is missing from definition', async () => {
      const defNoEndpoint: AgentDefinition = { ...mockDefinition, endpoint: undefined };
      const context = createMockExecutionContext();

      await expect(runner.invoke(defNoEndpoint, context, { content: 'test' })).rejects.toThrow(
        'missing endpoint',
      );
    });

    it('throws when external API returns non-200 status', async () => {
      mockHttpService.request.mockReturnValueOnce(
        buildHttpResponse({ error: 'Service unavailable' }, 503),
      );
      const context = createMockExecutionContext();

      await expect(runner.invoke(mockDefinition, context, { content: 'test' })).rejects.toThrow(
        'status 503',
      );
    });
  });
});
