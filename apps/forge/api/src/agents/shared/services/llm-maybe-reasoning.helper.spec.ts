/**
 * Unit tests for callLLMMaybeWithReasoning helper (Phase 4).
 *
 * Verifies the two routing paths:
 *   1. When the client has callLLMWithReasoning → routes there.
 *   2. When the client does NOT have callLLMWithReasoning → falls back to callLLM.
 */
import { callLLMMaybeWithReasoning } from './llm-maybe-reasoning.helper';
import type {
  LLMHttpClientService,
  LLMCallRequest,
  LLMCallResponse,
} from './llm-http-client.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'ollama',
  model: 'gemma3:4b',
});

const request: LLMCallRequest = {
  context: mockContext,
  systemMessage: 'sys',
  userMessage: 'hello',
  callerName: 'legal-department:contract-agent',
};

const baseResponse: LLMCallResponse = { text: 'output' };
const reasoningResponse: LLMCallResponse = {
  text: 'output with thinking',
  thinkingContent: 'I am thinking hard',
  thinkingDurationMs: 1200,
  thinkingTokenCount: undefined,
};

describe('callLLMMaybeWithReasoning', () => {
  it('routes to callLLMWithReasoning when it exists on the client', async () => {
    const mockClient = {
      callLLM: jest
        .fn<Promise<LLMCallResponse>, [LLMCallRequest]>()
        .mockResolvedValue(baseResponse),
      callLLMWithReasoning: jest
        .fn<Promise<LLMCallResponse>, [LLMCallRequest]>()
        .mockResolvedValue(reasoningResponse),
    } as unknown as LLMHttpClientService;

    const result = await callLLMMaybeWithReasoning(mockClient, request);

    expect(mockClient.callLLMWithReasoning).toHaveBeenCalledWith(request);
    expect(mockClient.callLLM).not.toHaveBeenCalled();
    expect(result).toBe(reasoningResponse);
    expect(result.thinkingContent).toBe('I am thinking hard');
  });

  it('falls back to callLLM when callLLMWithReasoning is absent', async () => {
    // Client without the optional method (simulates non-Ollama providers before Phase 4.5)
    const mockClient = {
      callLLM: jest
        .fn<Promise<LLMCallResponse>, [LLMCallRequest]>()
        .mockResolvedValue(baseResponse),
      // no callLLMWithReasoning
    } as unknown as LLMHttpClientService;

    const result = await callLLMMaybeWithReasoning(mockClient, request);

    expect(mockClient.callLLM).toHaveBeenCalledWith(request);
    expect(result).toBe(baseResponse);
    expect(result.thinkingContent).toBeUndefined();
  });
});
