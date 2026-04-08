/**
 * Unit tests for GoogleLLMService.generateResponseWithReasoning (Phase 4.5).
 *
 * Covers:
 * 1. Happy path: reasoning model with thought parts → thinkingContent populated,
 *    thinkingTokenCount populated from thoughtsTokenCount, thinkingDurationMs >= 0.
 * 2. Non-reasoning model / no thought parts → thinking fields undefined, content still populated.
 * 3. Assertion that generateResponse is NOT invoked internally.
 * 4. generateResponse path still works unchanged.
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { GoogleLLMService } from '../google-llm.service';
import type { GenerateResponseParams, LLMServiceConfig } from '../llm-interfaces';
import { PIIService } from '../../pii/pii.service';
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../../run-metadata.service';
import { ProviderConfigService } from '../../provider-config.service';
import { LLMPricingService } from '../../llm-pricing.service';

// ── Mock the Google SDK module-wide ───────────────────────────────────────────

const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
  FinishReason: {
    STOP: 'STOP',
    MAX_TOKENS: 'MAX_TOKENS',
    SAFETY: 'SAFETY',
    RECITATION: 'RECITATION',
    OTHER: 'OTHER',
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

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

/** Build a minimal GoogleLLMService wired to the module-level mockGenerateContent */
function makeService(model = 'gemini-2.5-pro'): GoogleLLMService {
  const config: LLMServiceConfig = {
    provider: 'google',
    model,
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 2000,
  };
  return new GoogleLLMService(
    config,
    makePiiService(),
    makeDictionaryPseudonymizer(),
    makeRunMetadataService(),
    makeProviderConfigService(),
    makeLLMPricingService(),
  );
}

// ── response builders ──────────────────────────────────────────────────────────

/**
 * Gemini reasoning response: candidates[0].content.parts contains a thought
 * part followed by a regular text part.
 */
function makeReasoningResponse() {
  return {
    response: {
      text: () => 'Here is my analysis of the contract.',
      usageMetadata: {
        promptTokenCount: 50,
        candidatesTokenCount: 30,
        totalTokenCount: 80,
        thoughtsTokenCount: 512,
      },
      candidates: [
        {
          finishReason: 'STOP',
          safetyRatings: [],
          content: {
            parts: [
              { thought: true, text: 'I need to analyse this contract carefully.' },
              { text: 'Here is my analysis of the contract.' },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Non-reasoning Gemini response: no thought parts.
 */
function makeNonReasoningResponse() {
  return {
    response: {
      text: () => 'Direct answer without thinking.',
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 10,
        totalTokenCount: 30,
      },
      candidates: [
        {
          finishReason: 'STOP',
          safetyRatings: [],
          content: {
            parts: [
              { text: 'Direct answer without thinking.' },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Standard response for the generateResponse path (uses response.text()).
 */
function makeChatResponse() {
  return {
    response: {
      text: () => 'Regular chat response.',
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 10,
        totalTokenCount: 30,
      },
      candidates: [
        {
          finishReason: 'STOP',
          safetyRatings: [],
        },
      ],
    },
  };
}

// ── shared fixtures ────────────────────────────────────────────────────────────

const mockContext = createMockExecutionContext({
  userId: 'user-1',
  provider: 'google',
  model: 'gemini-2.5-pro',
});

const reasoningParams: GenerateResponseParams = {
  systemPrompt: 'You are a legal specialist.',
  userMessage: 'analyse this contract',
  config: {
    provider: 'google',
    model: 'gemini-2.5-pro',
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

describe('GoogleLLMService.generateResponseWithReasoning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: reasoning model with thought parts returns thinkingContent, thinkingTokenCount, thinkingDurationMs and content', async () => {
    mockGenerateContent.mockResolvedValue(makeReasoningResponse());
    const service = makeService('gemini-2.5-pro');

    const result = await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(result.content).toBe('Here is my analysis of the contract.');
    expect(result.thinkingContent).toBe('I need to analyse this contract carefully.');
    expect(result.thinkingTokenCount).toBe(512);
    expect(typeof result.thinkingDurationMs).toBe('number');
    expect(result.thinkingDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('non-reasoning model: no thought parts → thinkingContent, thinkingTokenCount, thinkingDurationMs all undefined; content still populated', async () => {
    mockGenerateContent.mockResolvedValue(makeNonReasoningResponse());
    const service = makeService('gemini-1.5-flash');

    const nonReasoningParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'gemini-1.5-flash' },
    };

    const result = await service.generateResponseWithReasoning(mockContext, nonReasoningParams);

    expect(result.content).toBe('Direct answer without thinking.');
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });

  it('does NOT invoke generateResponse internally — only generateContent is called', async () => {
    mockGenerateContent.mockResolvedValue(makeReasoningResponse());
    const service = makeService('gemini-2.5-pro');

    const generateResponseSpy = jest.spyOn(service, 'generateResponse');

    await service.generateResponseWithReasoning(mockContext, reasoningParams);

    expect(generateResponseSpy).not.toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

describe('GoogleLLMService.generateResponse (byte-for-byte unchanged)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses generateContent directly — not generateResponseWithReasoning — and returns content without thinking fields', async () => {
    mockGenerateContent.mockResolvedValue(makeChatResponse());
    const service = makeService('gemini-1.5-flash');

    const generateWithReasoningSpy = jest.spyOn(service, 'generateResponseWithReasoning');

    const normalParams: GenerateResponseParams = {
      ...reasoningParams,
      config: { ...reasoningParams.config, model: 'gemini-1.5-flash' },
    };

    const result = await service.generateResponse(mockContext, normalParams);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(generateWithReasoningSpy).not.toHaveBeenCalled();
    expect(result.content).toBe('Regular chat response.');
    // Reasoning fields must be absent from the standard generateResponse path
    expect(result.thinkingContent).toBeUndefined();
    expect(result.thinkingDurationMs).toBeUndefined();
    expect(result.thinkingTokenCount).toBeUndefined();
  });
});
