/**
 * Unit tests for OpenAILLMService.generateResponseWithReasoning (Phase 4.5).
 *
 * Covers:
 * 1. Happy path: reasoning model returns output array with reasoning + message items.
 *    Asserts thinkingContent, thinkingTokenCount, thinkingDurationMs >= 0, content correct.
 * 2. Non-reasoning model: no reasoning items in response → thinkingContent undefined,
 *    content still populated.
 * 3. Assertion that this.openai.chat.completions.create is NOT called — only
 *    this.openai.responses.create is used.
 * 4. generateResponse unchanged: a minimal test that generateResponse still uses
 *    the chat.completions.create path.
 */

import { OpenAILLMService } from '../openai-llm.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { GenerateResponseParams } from '../llm-interfaces';
import { PIIService } from '../../pii/pii.service';
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../../run-metadata.service';
import { ProviderConfigService } from '../../provider-config.service';
import { LLMPricingService } from '../../llm-pricing.service';
import type { LLMServiceConfig } from '../llm-interfaces';

// ── mock factories ─────────────────────────────────────────────────────────────

function makePiiService(): PIIService {
  return {
    processPII: jest.fn().mockResolvedValue({
      processedText: 'analyse this contract',
      wasModified: false,
      replacements: [],
    }),
  } as unknown as PIIService;
}

function makeDictionaryPseudonymizer(): DictionaryPseudonymizerService {
  return {
    pseudonymize: jest.fn().mockResolvedValue({
      processedText: 'analyse this contract',
      wasModified: false,
      replacements: [],
    }),
  } as unknown as DictionaryPseudonymizerService;
}

function makeRunMetadataService(): RunMetadataService {
  return {
    insertCompletedUsage: jest.fn().mockResolvedValue(undefined),
    insertStartedUsage: jest.fn().mockResolvedValue(undefined),
    updateUsageStatus: jest.fn().mockResolvedValue(undefined),
  } as unknown as RunMetadataService;
}

function makeProviderConfigService(): ProviderConfigService {
  return {
    getProviderConfig: jest.fn().mockResolvedValue({}),
  } as unknown as ProviderConfigService;
}

function makeLLMPricingService(): LLMPricingService {
  return {
    calculateCost: jest.fn().mockReturnValue(0.001),
  } as unknown as LLMPricingService;
}

/** Build a mock OpenAI client with both chat.completions.create and responses.create */
function makeOpenAIClient(responsesCreateResult: unknown) {
  return {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
    responses: {
      create: jest.fn().mockResolvedValue(responsesCreateResult),
    },
    images: {
      generate: jest.fn(),
    },
  };
}

/** Build a minimal OpenAILLMService with a mocked openai client */
function makeService(
  mockOpenAI: ReturnType<typeof makeOpenAIClient>,
  model = 'o3-mini',
): OpenAILLMService {
  const config: LLMServiceConfig = {
    provider: 'openai',
    model,
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 2000,
  };
  const service = new OpenAILLMService(
    config,
    makePiiService(),
    makeDictionaryPseudonymizer(),
    makeRunMetadataService(),
    makeProviderConfigService(),
    makeLLMPricingService(),
  );
  // Inject the mock client directly
  (service as unknown as { openai: unknown }).openai = mockOpenAI;
  return service;
}

// ── response builders ──────────────────────────────────────────────────────────

function makeReasoningResponse() {
  return {
    output: [
      {
        type: 'reasoning',
        id: 'rs-1',
        summary: [
          { type: 'summary_text', text: 'I need to think about this.' },
          { type: 'summary_text', text: ' More analysis needed.' },
        ],
      },
      {
        type: 'message',
        id: 'msg-1',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: 'Here is my final answer.', annotations: [] },
        ],
      },
    ],
    usage: {
      input_tokens: 50,
      output_tokens: 30,
      total_tokens: 80,
      output_tokens_details: {
        reasoning_tokens: 20,
      },
      input_tokens_details: { cached_tokens: 0 },
    },
  };
}

function makeNonReasoningResponse() {
  return {
    output: [
      {
        type: 'message',
        id: 'msg-2',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: 'Direct answer without reasoning.', annotations: [] },
        ],
      },
    ],
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      total_tokens: 30,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
      input_tokens_details: { cached_tokens: 0 },
    },
  };
}

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'openai',
  model: 'o3-mini',
});

const reasoningParams: GenerateResponseParams = {
  systemPrompt: 'You are a legal specialist.',
  userMessage: 'analyse this contract',
  config: {
    provider: 'openai',
    model: 'o3-mini',
    apiKey: 'test-key',
    temperature: 0.4,
    maxTokens: 3000,
  },
  options: {
    temperature: 0.4,
    maxTokens: 3000,
    callerName: 'legal-department:contract-agent',
    callerType: 'langgraph',
    executionContext: mockContext,
  },
};

// ── tests ──────────────────────────────────────────────────────────────────────

describe('OpenAILLMService.generateResponseWithReasoning', () => {
  it('happy path: reasoning model returns thinkingContent, thinkingTokenCount, thinkingDurationMs and content', async () => {
    const mockOpenAI = makeOpenAIClient(makeReasoningResponse());
    const service = makeService(mockOpenAI, 'o3-mini');

    const result = await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(result.content).toBe('Here is my final answer.');
    expect(result.thinkingContent).toBe('I need to think about this. More analysis needed.');
    expect(typeof result.thinkingDurationMs).toBe('number');
    expect(result.thinkingDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.thinkingTokenCount).toBe(20);
  });

  it('non-reasoning model: thinkingContent is undefined, content still populated', async () => {
    const mockOpenAI = makeOpenAIClient(makeNonReasoningResponse());
    const service = makeService(mockOpenAI, 'gpt-4o');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'gpt-4o' },
    };

    const result = await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    expect(result.content).toBe('Direct answer without reasoning.');
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });

  it('only calls this.openai.responses.create — never chat.completions.create', async () => {
    const mockOpenAI = makeOpenAIClient(makeReasoningResponse());
    const service = makeService(mockOpenAI, 'o3-mini');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(1);
    expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
  });

  it('passes reasoning param for reasoning-capable models (o1, o3, o4, gpt-5 prefixes)', async () => {
    const mockOpenAI = makeOpenAIClient(makeReasoningResponse());
    const service = makeService(mockOpenAI, 'o3-mini');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    const callArgs = (mockOpenAI.responses.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.reasoning).toBeDefined();
    expect((callArgs.reasoning as Record<string, unknown>).effort).toBe('medium');
  });

  it('does NOT pass reasoning param for non-reasoning models', async () => {
    const mockOpenAI = makeOpenAIClient(makeNonReasoningResponse());
    const service = makeService(mockOpenAI, 'gpt-4o');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'gpt-4o' },
    };

    await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    const callArgs = (mockOpenAI.responses.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.reasoning).toBeUndefined();
  });
});

describe('OpenAILLMService.generateResponse (byte-for-byte unchanged)', () => {
  it('uses chat.completions.create — not responses.create', async () => {
    const chatCompletionResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Regular response text.' },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
      system_fingerprint: null,
    };

    const mockOpenAI = makeOpenAIClient(undefined);
    (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue(chatCompletionResponse);

    const service = makeService(mockOpenAI, 'gpt-4o');

    const normalParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'gpt-4o' },
    };

    const result = await service.generateResponse(mockContext, normalParams);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(mockOpenAI.responses.create).not.toHaveBeenCalled();
    expect(result.content).toBe('Regular response text.');
    // Reasoning fields must be absent
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });
});
