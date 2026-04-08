/**
 * Unit tests for AnthropicLLMService.generateResponseWithReasoning (Phase 4.5).
 *
 * Covers:
 * 1. Happy path: reasoning model returns thinking + text blocks → thinkingContent
 *    populated, thinkingTokenCount undefined (Anthropic does not expose per-block
 *    token counts), thinkingDurationMs >= 0, content correct.
 * 2. Non-reasoning model: no thinking blocks → thinkingContent undefined,
 *    thinkingDurationMs undefined, content still populated.
 * 3. Assertion that `generateResponse` is NOT invoked internally.
 * 4. `generateResponse` path still works unchanged (uses messages.create directly).
 */

import { AnthropicLLMService } from '../anthropic-llm.service';
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

/** Build a mock Anthropic client whose messages.create returns the given value */
function makeAnthropicClient(messagesCreateResult: unknown) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue(messagesCreateResult),
    },
  };
}

/** Build a minimal AnthropicLLMService with the mocked client injected */
function makeService(
  mockClient: ReturnType<typeof makeAnthropicClient>,
  model = 'claude-sonnet-4-20250514',
): AnthropicLLMService {
  const config: LLMServiceConfig = {
    provider: 'anthropic',
    model,
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 2000,
  };
  const service = new AnthropicLLMService(
    config,
    makePiiService(),
    makeDictionaryPseudonymizer(),
    makeRunMetadataService(),
    makeProviderConfigService(),
    makeLLMPricingService(),
  );
  // Inject the mock client directly, bypassing the real Anthropic SDK constructor
  (service as unknown as { anthropic: unknown }).anthropic = mockClient;
  return service;
}

// ── response builders ──────────────────────────────────────────────────────────

/** Anthropic extended-thinking response with a thinking block + text block */
function makeReasoningResponse() {
  return {
    id: 'msg_reasoning_1',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'thinking',
        thinking: 'I need to analyse this contract carefully.',
      },
      {
        type: 'text',
        text: 'Here is my analysis of the contract.',
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 50,
      output_tokens: 30,
    },
  };
}

/** Anthropic response with no thinking block — non-reasoning model path */
function makeNonReasoningResponse() {
  return {
    id: 'msg_plain_1',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'Direct answer without thinking.',
      },
    ],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 20,
      output_tokens: 10,
    },
  };
}

/** Standard chat-completion response for generateResponse path */
function makeChatResponse() {
  return {
    id: 'msg_chat_1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Regular chat response.' }],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    usage: { input_tokens: 20, output_tokens: 10 },
  };
}

// ── shared fixtures ────────────────────────────────────────────────────────────

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
});

const reasoningParams: GenerateResponseParams = {
  systemPrompt: 'You are a legal specialist.',
  userMessage: 'analyse this contract',
  config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
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

describe('AnthropicLLMService.generateResponseWithReasoning', () => {
  it('happy path: reasoning model returns thinkingContent, thinkingDurationMs and content; thinkingTokenCount is undefined', async () => {
    const mockClient = makeAnthropicClient(makeReasoningResponse());
    const service = makeService(mockClient, 'claude-sonnet-4-20250514');

    const result = await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(result.content).toBe('Here is my analysis of the contract.');
    expect(result.thinkingContent).toBe('I need to analyse this contract carefully.');
    // thinkingTokenCount is always undefined for Anthropic (no per-block token split)
    expect(result.thinkingTokenCount).toBeUndefined();
    expect(typeof result.thinkingDurationMs).toBe('number');
    expect(result.thinkingDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('non-reasoning model: thinkingContent is undefined, thinkingDurationMs is undefined, content still populated', async () => {
    const mockClient = makeAnthropicClient(makeNonReasoningResponse());
    const service = makeService(mockClient, 'claude-3-5-sonnet-20241022');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'claude-3-5-sonnet-20241022' },
    };

    const result = await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    expect(result.content).toBe('Direct answer without thinking.');
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });

  it('does NOT invoke generateResponse internally — only messages.create is called', async () => {
    const mockClient = makeAnthropicClient(makeReasoningResponse());
    const service = makeService(mockClient, 'claude-sonnet-4-20250514');

    const generateResponseSpy = jest.spyOn(service, 'generateResponse');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(generateResponseSpy).not.toHaveBeenCalled();
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });

  it('passes thinking param for reasoning-capable models (claude-opus-4, claude-sonnet-4, claude-3-7-sonnet)', async () => {
    const mockClient = makeAnthropicClient(makeReasoningResponse());
    const service = makeService(mockClient, 'claude-sonnet-4-20250514');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    const callArgs = (mockClient.messages.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['thinking']).toBeDefined();
    expect((callArgs['thinking'] as Record<string, unknown>).type).toBe('enabled');
    expect((callArgs['thinking'] as Record<string, unknown>).budget_tokens).toBe(8000);
  });

  it('does NOT pass thinking param for non-reasoning models', async () => {
    const mockClient = makeAnthropicClient(makeNonReasoningResponse());
    const service = makeService(mockClient, 'claude-3-5-sonnet-20241022');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'claude-3-5-sonnet-20241022' },
    };

    await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    const callArgs = (mockClient.messages.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['thinking']).toBeUndefined();
  });
});

describe('AnthropicLLMService.generateResponse (byte-for-byte unchanged)', () => {
  it('uses messages.create directly — not generateResponseWithReasoning', async () => {
    const mockClient = makeAnthropicClient(makeChatResponse());
    const service = makeService(mockClient, 'claude-3-5-sonnet-20241022');

    const generateWithReasoningSpy = jest.spyOn(service, 'generateResponseWithReasoning');

    const normalParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'claude-3-5-sonnet-20241022' },
    };

    const result = await service.generateResponse(mockContext, normalParams);

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    expect(generateWithReasoningSpy).not.toHaveBeenCalled();
    expect(result.content).toBe('Regular chat response.');
    // Reasoning fields must be absent from the standard generateResponse path
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });
});
