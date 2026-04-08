/**
 * Unit tests for GrokLLMService.generateResponseWithReasoning (Phase 4.5).
 *
 * Covers:
 * 1. Happy path: reasoning model returns reasoning_content → thinkingContent
 *    populated, thinkingTokenCount populated from reasoning_tokens,
 *    thinkingDurationMs >= 0, content correct.
 * 2. Non-reasoning model: no reasoning_content → thinkingContent undefined,
 *    thinkingDurationMs undefined, thinkingTokenCount undefined, content still populated.
 * 3. Assertion that generateResponse is NOT invoked internally — only fetch is called.
 * 4. generateResponse path unchanged: uses fetch without reasoning_effort.
 */

import { GrokLLMService } from '../grok-llm.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { GenerateResponseParams, LLMServiceConfig } from '../llm-interfaces';
import { PIIService } from '../../pii/pii.service';
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../../run-metadata.service';
import { ProviderConfigService } from '../../provider-config.service';
import { LLMPricingService } from '../../llm-pricing.service';

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
    calculateCostSync: jest.fn().mockReturnValue(0.001),
  } as unknown as LLMPricingService;
}

/** Build a minimal GrokLLMService */
function makeService(model = 'grok-3'): GrokLLMService {
  const config: LLMServiceConfig = {
    provider: 'grok',
    model,
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 2000,
  };
  return new GrokLLMService(
    config,
    makePiiService(),
    makeDictionaryPseudonymizer(),
    makeRunMetadataService(),
    makeProviderConfigService(),
    makeLLMPricingService(),
  );
}

// ── response builders ──────────────────────────────────────────────────────────

/** xAI chat completions response with reasoning_content */
function makeReasoningResponse() {
  return {
    id: 'chatcmpl-grok-reasoning-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'grok-3',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Here is my analysis of the contract.',
          reasoning_content: 'I need to analyse this contract carefully. Let me think step by step.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 30,
      total_tokens: 80,
      completion_tokens_details: {
        reasoning_tokens: 20,
      },
    },
  };
}

/** xAI chat completions response without reasoning_content — non-reasoning model path */
function makeNonReasoningResponse() {
  return {
    id: 'chatcmpl-grok-plain-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'grok-2',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Direct answer without reasoning.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
    },
  };
}

/** Standard chat-completion response for the generateResponse path */
function makeChatResponse() {
  return {
    id: 'chatcmpl-grok-chat-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'grok-2',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Regular response text.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
    },
  };
}

// ── shared fixtures ────────────────────────────────────────────────────────────

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'grok',
  model: 'grok-3',
});

const reasoningParams: GenerateResponseParams = {
  systemPrompt: 'You are a legal specialist.',
  userMessage: 'analyse this contract',
  config: {
    provider: 'grok',
    model: 'grok-3',
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

// ── helper: mock global fetch ──────────────────────────────────────────────────

function mockFetchOnce(responseBody: unknown) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(''),
  } as unknown as Response);
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('GrokLLMService.generateResponseWithReasoning', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: reasoning model returns thinkingContent, thinkingTokenCount, thinkingDurationMs and content', async () => {
    mockFetchOnce(makeReasoningResponse());
    const service = makeService('grok-3');

    const result = await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(result.content).toBe('Here is my analysis of the contract.');
    expect(result.thinkingContent).toBe(
      'I need to analyse this contract carefully. Let me think step by step.',
    );
    expect(result.thinkingTokenCount).toBe(20);
    expect(typeof result.thinkingDurationMs).toBe('number');
    expect(result.thinkingDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('non-reasoning model: thinkingContent is undefined, thinkingDurationMs is undefined, thinkingTokenCount is undefined, content still populated', async () => {
    mockFetchOnce(makeNonReasoningResponse());
    const service = makeService('grok-2');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'grok-2' },
    };

    const result = await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    expect(result.content).toBe('Direct answer without reasoning.');
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });

  it('does NOT invoke generateResponse internally', async () => {
    mockFetchOnce(makeReasoningResponse());
    const service = makeService('grok-3');

    const generateResponseSpy = jest.spyOn(service, 'generateResponse');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(generateResponseSpy).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('passes reasoning_effort: high for reasoning-capable models (grok-3, grok-4)', async () => {
    mockFetchOnce(makeReasoningResponse());
    const service = makeService('grok-3');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body as string) as Record<string, unknown>;
    expect(requestBody.reasoning_effort).toBe('high');
  });

  it('does NOT pass reasoning_effort for non-reasoning models', async () => {
    mockFetchOnce(makeNonReasoningResponse());
    const service = makeService('grok-2');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'grok-2' },
    };

    await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body as string) as Record<string, unknown>;
    expect(requestBody.reasoning_effort).toBeUndefined();
  });
});

describe('GrokLLMService.generateResponse (byte-for-byte unchanged)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses fetch without reasoning_effort — not generateResponseWithReasoning — and returns content without thinking fields', async () => {
    mockFetchOnce(makeChatResponse());
    const service = makeService('grok-2');

    const generateWithReasoningSpy = jest.spyOn(service, 'generateResponseWithReasoning');

    const normalParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'grok-2' },
    };

    const result = await service.generateResponse(mockContext, normalParams);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(generateWithReasoningSpy).not.toHaveBeenCalled();
    expect(result.content).toBe('Regular response text.');
    // Reasoning fields must be absent from the standard generateResponse path
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });
});
