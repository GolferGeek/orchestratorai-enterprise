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
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { PatternRedactionService } from '../../pii/pattern-redaction.service';
import { LocalModelStatusService } from '../../local-model-status.service';
import { LocalLLMService } from '../../local-llm.service';
import { ModelConfigurationService } from '../../config/model-configuration.service';

/**
 * The LLM boundary pipeline is the control that keeps customer PII out of
 * third-party providers. These tests pin the two things that are easy to break
 * and silent when broken: the ORDER of the stages, and the fact that BOTH
 * entry points run all of them.
 *
 * `generateUnifiedResponse` — the path the chat runner uses for every
 * text-only message — previously pseudonymized but never redacted. Nothing
 * failed; PII just went out unredacted. Hence the coverage here.
 */
describe('LLM boundary PII pipeline', () => {
  let service: LLMGenerationService;
  let dictionary: jest.Mocked<DictionaryPseudonymizerService>;
  let redaction: jest.Mocked<PatternRedactionService>;
  let factory: jest.Mocked<LLMServiceFactory>;
  let piiService: jest.Mocked<PIIService>;

  /** Records the stage order as the pipeline runs. */
  let callOrder: string[];

  const context: ExecutionContext = createMockExecutionContext({
    orgSlug: 'acme',
    userId: 'user-1',
    conversationId: 'conv-1',
    agentSlug: 'support-agent',
    provider: 'openai',
    model: 'gpt-4',
  });

  const RAW = 'Email Jane Roe at jane@acme.test';
  const PSEUDONYMIZED = 'Email PERSON_1 at jane@acme.test';
  const REDACTED = 'Email PERSON_1 at [EMAIL_REDACTED]';

  const providerReply = (content: string): LLMResponse => ({
    content,
    metadata: {
      provider: 'openai',
      model: 'gpt-4',
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
        { provide: DATABASE_SERVICE, useValue: {} },
        { provide: CIDAFMService, useValue: {} },
        {
          provide: RunMetadataService,
          useValue: { createRunMetadata: jest.fn(), updateRunMetadata: jest.fn() },
        },
        { provide: ProviderConfigService, useValue: {} },
        {
          provide: PIIService,
          useValue: {
            checkPolicy: jest.fn().mockResolvedValue({
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
                userMessage: { summary: '', details: [], actionsTaken: [], isBlocked: false },
                processingFlow: 'pseudonymized',
                processingSteps: [],
                timestamps: { detectionStart: Date.now() },
              },
            }),
          },
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
              return { originalText: RAW, reversalCount: 1, processingTimeMs: 1 };
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
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt: 'You are helpful.',
          userMessage: RAW,
          options: { includeMetadata: true, executionContext: context },
        }),
    ],
  ])('%s', (_name, invoke) => {
    it('pseudonymizes, then redacts, then calls the provider', async () => {
      await invoke(service);

      expect(callOrder.slice(0, 3)).toEqual([
        'pseudonymize',
        // Redaction must run on the ALREADY pseudonymized text, not the raw
        // input — that is what lets a pattern catch what the dictionary missed.
        `redact:${PSEUDONYMIZED}`,
        'provider',
      ]);
    });

    it('sends the fully sanitized text to the provider', async () => {
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

    it('attaches a privacy summary with counts but no values', async () => {
      const result = (await invoke(service)) as LLMResponse;
      const privacy = result.metadata.privacy;

      expect(privacy).toBeDefined();
      expect(privacy).toMatchObject({
        piiDetected: true,
        pseudonymCount: 1,
        redactionCount: 1,
        status: 'applied',
        routing: 'external',
        reversed: true,
      });
      expect(privacy!.dataTypes.sort()).toEqual(['email', 'name']);

      // The summary is persisted on the message row and sent to the browser,
      // so it must not carry anything it is meant to be protecting.
      const serialized = JSON.stringify(privacy);
      expect(serialized).not.toContain('Jane Roe');
      expect(serialized).not.toContain('jane@acme.test');
      expect(serialized).not.toContain('PERSON_1');
    });
  });

  describe('showstopper PII', () => {
    // Showstoppers are excluded from pattern redaction on purpose — they are
    // meant to stop the request, not be quietly masked. If the block is not
    // enforced, the SSN reaches the provider in the clear.
    const blockingPolicy = {
      metadata: {
        piiDetected: true,
        showstopperDetected: true,
        detectionResults: {
          totalMatches: 1,
          flaggedMatches: [
            {
              value: '123-45-6789',
              dataType: 'ssn',
              severity: 'showstopper',
              confidence: 1,
              startIndex: 0,
              endIndex: 11,
              pattern: 'SSN - US Social Security Number',
            },
          ],
          dataTypesSummary: {},
          severityBreakdown: { showstopper: 1, warning: 0, info: 0 },
        },
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
        processingSteps: [],
        timestamps: { detectionStart: Date.now() },
      },
    };

    beforeEach(() => {
      (
        piiService.checkPolicy as jest.Mock
      ).mockResolvedValue(blockingPolicy);
    });

    it.each([
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
            provider: 'openai',
            model: 'gpt-4',
            systemPrompt: 'You are helpful.',
            userMessage: RAW,
            options: { includeMetadata: true, executionContext: context },
          }),
      ],
    ])('%s never calls the provider', async (_name, invoke) => {
      const result = (await invoke(service)) as LLMResponse;

      expect(factory.generateResponse).not.toHaveBeenCalled();
      expect(result.error?.code).toBe('PII_POLICY_BLOCKED');
      expect(result.metadata.status).toBe('error');
      expect(result.metadata.privacy).toMatchObject({ status: 'blocked' });
      // The user gets the policy's own wording, not a stack trace.
      expect(result.content).toBe(blockingPolicy.metadata.userMessage.summary);
    });
  });

  describe('local providers', () => {
    it('bypasses the pipeline entirely for ollama', async () => {
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
      // Nothing left the building, so the raw message is what the model saw.
      expect(sentToProvider()).toBe(RAW);
      expect(result.metadata.privacy).toMatchObject({
        routing: 'local',
        status: 'none',
        pseudonymCount: 0,
        redactionCount: 0,
      });
    });
  });

  describe('quick bypass', () => {
    it('skips the pipeline when the caller opts out', async () => {
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
