import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import { LLMHttpClientService } from './llm-http-client.service';

const planeResponse = {
  content: '{"ok":true}',
  metadata: {
    provider: 'ollama',
    model: 'qwen3:8b',
    requestId: 'req-42',
    timestamp: '2026-09-26T00:00:00.000Z',
    usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12, cost: 0 },
    timing: { startTime: 0, endTime: 1, duration: 1 },
    status: 'completed' as const,
  },
};

describe('LLMHttpClientService', () => {
  it('returns the plane request id and the provider/model that served the call', async () => {
    const generateResponse = jest.fn().mockResolvedValue(planeResponse);
    const client = new LLMHttpClientService({
      generateResponse,
    } as unknown as LLMServiceProvider);
    const context = Object.freeze(createMockExecutionContext());

    const result = await client.callLLM({
      context,
      systemMessage: 'system',
      userMessage: 'user',
      responseFormat: 'json',
    });

    expect(result.requestId).toBe('req-42');
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('qwen3:8b');
    const options = generateResponse.mock.calls[0][2];
    expect(options.responseFormat).toBe('json');
    expect(options.executionContext).toBe(context);
  });

  it('propagates plane errors', async () => {
    const client = new LLMHttpClientService({
      generateResponse: jest.fn().mockRejectedValue(new Error('backend down')),
    } as unknown as LLMServiceProvider);

    await expect(
      client.callLLM({
        context: Object.freeze(createMockExecutionContext()),
        userMessage: 'user',
      }),
    ).rejects.toThrow('backend down');
  });
});
