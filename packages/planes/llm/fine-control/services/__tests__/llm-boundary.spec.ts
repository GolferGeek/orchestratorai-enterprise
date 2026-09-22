import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  createMockExecutionContext,
} from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE } from '@/database';
import { LLMGenerationService } from '../llm-generation.service';
import { LLMServiceFactory } from '../llm-service-factory';
import { LLMResponse } from '../llm-interfaces';
import { CIDAFMService } from '../../cidafm/cidafm.service';
import { RunMetadataService } from '../../run-metadata.service';
import { ProviderConfigService } from '../../provider-config.service';
import { PIIService } from '../../pii/pii.service';
import { PiiBoundaryService } from '../../pii/pii-boundary.service';
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { PatternRedactionService } from '../../pii/pattern-redaction.service';
import { LocalModelStatusService } from '../../local-model-status.service';
import { LocalLLMService } from '../../local-llm.service';
import { ModelConfigurationService } from '../../config/model-configuration.service';

/**
 * The before/after layer.
 *
 * The architecture these tests defend: everything that matters happens around
 * the provider call, and the provider call itself is trivial. A backend is one
 * method; it must never carry privacy or accounting logic of its own.
 *
 * That invariant has been broken twice, both times silently:
 *   - `generateUnifiedResponse` drifted and lost its redaction stage, so the
 *     main chat path pseudonymized but never redacted.
 *   - OpenRouter was registered as a plane beside this service rather than a
 *     backend beneath it, so selecting it removed the layer altogether.
 *
 * Hence the parameterisation over both entry points and over the backend the
 * factory hands back: neither should be able to change the answer.
 *
 * See docs/architecture/llm-boundary.md.
 */
describe('LLM before/after boundary', () => {
  let service: LLMGenerationService;
  let dictionary: jest.Mocked<DictionaryPseudonymizerService>;
  let redaction: jest.Mocked<PatternRedactionService>;
  let factory: { generateResponse: jest.Mock };
  let piiService: { checkPolicy: jest.Mock };

  let callOrder: string[];

  const context: ExecutionContext = createMockExecutionContext({
    orgSlug: 'acme',
    userId: 'user-1',
    conversationId: 'conv-1',
    agentSlug: 'support-agent',
    provider: 'openrouter',
    model: 'anthropic/claude-3.5-sonnet',
  });

  const RAW = 'Email Jane Roe at jane@acme.test';
  const PSEUDONYMIZED = 'Email PERSON_1 at jane@acme.test';
  const REDACTED = 'Email PERSON_1 at [EMAIL_REDACTED]';

  const cleanPolicy = {
    metadata: {
      piiDetected: true,
      detectionResults: {
        totalMatches: 2,
        flaggedMatches: [
          {
            value: 'Jane Roe',
            dataType: 'name',
            severity: 'warning',
            confidence: 1,
            startIndex: 6,
            endIndex: 14,
            pattern: 'name',
          },
          {
            value: 'jane@acme.test',
            dataType: 'email',
            severity: 'warning',
            confidence: 1,
            startIndex: 18,
            endIndex: 32,
            pattern: 'Email Address',
          },
        ],
        dataTypesSummary: {},
        severityBreakdown: { showstopper: 0, warning: 2, info: 0 },
      },
      policyDecision: { allowed: true, blocked: false, violations: [] },
      userMessage: {
        summary: '',
        details: [],
        actionsTaken: [],
        isBlocked: false,
      },
      processingFlow: 'pseudonymized',
      processingSteps: [],
      timestamps: { detectionStart: Date.now() },
    },
  };

  const blockingPolicy = {
    metadata: {
      ...cleanPolicy.metadata,
      showstopperDetected: true,
      policyDecision: {
        allowed: false,
        blocked: true,
        blockingReason: 'showstopper-pii',
        violations: ['showstopper-pii'],
      },
      userMessage: {
        summary: 'Blocked: this message contains a Social Security Number.',
        details: [],
        actionsTaken: [],
        isBlocked: true,
      },
      processingFlow: 'showstopper-blocked',
    },
  };

  const providerReply = (content: string): LLMResponse => ({
    content,
    metadata: {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      timing: { startTime: 0, endTime: 1, duration: 1 },
      status: 'completed',
    },
  });

  beforeEach(async () => {
    callOrder = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMGenerationService,
        PiiBoundaryService,
        { provide: DATABASE_SERVICE, useValue: {} },
        { provide: CIDAFMService, useValue: {} },
        {
          provide: RunMetadataService,
          useValue: {
            createRunMetadata: jest.fn(),
            updateRunMetadata: jest.fn(),
          },
        },
        { provide: ProviderConfigService, useValue: {} },
        {
          provide: PIIService,
          useValue: { checkPolicy: jest.fn().mockResolvedValue(cleanPolicy) },
        },
        {
          provide: DictionaryPseudonymizerService,
          useValue: {
            pseudonymizeText: jest.fn(async (text: string) => {
              callOrder.push('pseudonymize');
              return {
                originalText: text,
                pseudonymizedText: PSEUDONYMIZED,
                mappings: [
                  {
                    originalValue: 'Jane Roe',
                    pseudonym: 'PERSON_1',
                    dataType: 'name',
                    category: 'general',
                  },
                ],
                processingTimeMs: 1,
              };
            }),
            reversePseudonyms: jest.fn(async () => {
              callOrder.push('un-pseudonymize');
              return {
                originalText: RAW,
                reversalCount: 1,
                processingTimeMs: 1,
              };
            }),
          },
        },
        {
          provide: PatternRedactionService,
          useValue: {
            redactPatterns: jest.fn(async (text: string) => {
              callOrder.push(`redact:${text}`);
              return {
                originalText: text,
                redactedText: REDACTED,
                mappings: [
                  {
                    originalValue: 'jane@acme.test',
                    redactedValue: '[EMAIL_REDACTED]',
                    dataType: 'email',
                    startIndex: 18,
                    endIndex: 32,
                    patternName: 'Email Address',
                  },
                ],
                processingTimeMs: 1,
                redactionCount: 1,
              };
            }),
            reverseRedactions: jest.fn(async () => {
              callOrder.push('un-redact');
              return {
                originalText: PSEUDONYMIZED,
                reversalCount: 1,
                processingTimeMs: 1,
              };
            }),
          },
        },
        { provide: LocalModelStatusService, useValue: {} },
        { provide: LocalLLMService, useValue: {} },
        {
          provide: LLMServiceFactory,
          useValue: {
            generateResponse: jest.fn(async () => {
              callOrder.push('provider');
              return providerReply(REDACTED);
            }),
          },
        },
        { provide: ModelConfigurationService, useValue: {} },
      ],
    }).compile();

    service = module.get(LLMGenerationService);
    dictionary = module.get(DictionaryPseudonymizerService);
    redaction = module.get(PatternRedactionService);
    factory = module.get(LLMServiceFactory);
    piiService = module.get(PIIService);
  });

  const sentToProvider = (): string =>
    factory.generateResponse.mock.calls[0]![1].userMessage;

  describe.each([
    [
      'generateResponse',
      (svc: LLMGenerationService) =>
        svc.generateResponse(context, 'You are helpful.', RAW, {
          includeMetadata: true,
          executionContext: context,
        }),
    ],
    [
      'generateUnifiedResponse',
      (svc: LLMGenerationService) =>
        svc.generateUnifiedResponse(context, {
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          systemPrompt: 'You are helpful.',
          userMessage: RAW,
          options: { includeMetadata: true, executionContext: context },
        }),
    ],
  ])('%s', (_name, invoke) => {
    it('pseudonymizes, then redacts, then makes the call', async () => {
      await invoke(service);

      expect(callOrder.slice(0, 3)).toEqual([
        'pseudonymize',
        // Redaction must see the ALREADY pseudonymized text — that is what
        // lets a pattern catch what the dictionary missed.
        `redact:${PSEUDONYMIZED}`,
        'provider',
      ]);
    });

    it('the backend never sees the raw PII', async () => {
      await invoke(service);

      expect(sentToProvider()).toBe(REDACTED);
      expect(sentToProvider()).not.toContain('Jane Roe');
      expect(sentToProvider()).not.toContain('jane@acme.test');
    });

    it('reverses redactions before pseudonyms on the way back', async () => {
      await invoke(service);

      expect(callOrder.slice(3)).toEqual(['un-redact', 'un-pseudonymize']);
    });

    it('restores the original values in the returned content', async () => {
      const result = (await invoke(service)) as LLMResponse;

      expect(result.content).toBe(RAW);
    });

    it('hands the backend the PII record for usage accounting', async () => {
      await invoke(service);

      // This is what fills the llm_usage privacy columns via
      // BaseLLMService.trackUsage. Without it the badge shows in chat but the
      // LLM admin stays blank.
      const passedOptions = factory.generateResponse.mock.calls[0]![1].options;
      expect(passedOptions.piiMetadata).toBeDefined();
      expect(passedOptions.dictionaryMappings).toHaveLength(1);
    });

    it('attaches a privacy summary with counts but no values', async () => {
      const result = (await invoke(service)) as LLMResponse;
      const privacy = result.metadata.privacy;

      expect(privacy).toMatchObject({
        piiDetected: true,
        pseudonymCount: 1,
        redactionCount: 1,
        status: 'applied',
        routing: 'external',
        reversed: true,
      });

      const serialized = JSON.stringify(privacy);
      expect(serialized).not.toContain('Jane Roe');
      expect(serialized).not.toContain('jane@acme.test');
      expect(serialized).not.toContain('PERSON_1');
    });

    it('refuses showstopper PII without making the call', async () => {
      piiService.checkPolicy.mockResolvedValue(blockingPolicy);

      const result = (await invoke(service)) as LLMResponse;

      expect(factory.generateResponse).not.toHaveBeenCalled();
      expect(result.error?.code).toBe('PII_POLICY_BLOCKED');
      expect(result.metadata.privacy).toMatchObject({ status: 'blocked' });
      expect(result.content).toBe(blockingPolicy.metadata.userMessage.summary);
    });
  });

  describe('the backend is irrelevant to the guarantee', () => {
    // Every vendor reachable through the factory. The boundary runs above the
    // factory, so the answer must not depend on which one is selected.
    it.each([
      ['openai', 'gpt-4'],
      ['anthropic', 'claude-3-5-sonnet'],
      ['google', 'gemini-2.0-flash'],
      ['grok', 'grok-2'],
      ['xai', 'grok-2'],
      ['openrouter', 'anthropic/claude-3.5-sonnet'],
      ['ollama-cloud', 'llama3'],
    ])('sanitizes before calling %s', async (provider, model) => {
      await service.generateUnifiedResponse(context, {
        provider,
        model,
        systemPrompt: 'You are helpful.',
        userMessage: RAW,
        options: { includeMetadata: true, executionContext: context },
      });

      expect(sentToProvider()).toBe(REDACTED);
    });
  });

  describe('local providers', () => {
    it('bypasses the boundary — nothing leaves the building', async () => {
      const localContext = createMockExecutionContext({
        ...context,
        provider: 'ollama',
        model: 'llama3',
      });

      const result = (await service.generateUnifiedResponse(localContext, {
        provider: 'ollama',
        model: 'llama3',
        systemPrompt: 'You are helpful.',
        userMessage: RAW,
        options: { includeMetadata: true, executionContext: localContext },
      })) as LLMResponse;

      expect(dictionary.pseudonymizeText).not.toHaveBeenCalled();
      expect(redaction.redactPatterns).not.toHaveBeenCalled();
      expect(sentToProvider()).toBe(RAW);
      expect(result.metadata.privacy).toMatchObject({
        routing: 'local',
        status: 'none',
      });
    });
  });

  describe('quick bypass', () => {
    it('skips the boundary when the caller opts out', async () => {
      await service.generateResponse(context, 'You are helpful.', RAW, {
        includeMetadata: true,
        executionContext: context,
        quick: true,
      });

      expect(dictionary.pseudonymizeText).not.toHaveBeenCalled();
      expect(redaction.redactPatterns).not.toHaveBeenCalled();
      expect(sentToProvider()).toBe(RAW);
    });
  });
});
