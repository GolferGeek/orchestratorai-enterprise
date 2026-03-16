import { Test, TestingModule } from '@nestjs/testing';
import { LLMGenerationService } from './llm-generation.service';
import { DATABASE_SERVICE } from '@/database';
import { CIDAFMService } from '../cidafm/cidafm.service';
import { RunMetadataService } from '../run-metadata.service';
import { ProviderConfigService } from '../provider-config.service';
import { PIIService } from '../pii/pii.service';
import { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import { PatternRedactionService } from '../pii/pattern-redaction.service';
import { LocalModelStatusService } from '../local-model-status.service';
import { LocalLLMService } from '../local-llm.service';
import { BlindedLLMService } from '../blinded-llm.service';
import { LLMServiceFactory } from './llm-service-factory';
import { ModelConfigurationService } from '../config/model-configuration.service';
import { ExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';

describe('LLMGenerationService', () => {
  let service: LLMGenerationService;
  let module: TestingModule;
  let llmServiceFactory: jest.Mocked<LLMServiceFactory>;
  let dictionaryPseudonymizerService: jest.Mocked<DictionaryPseudonymizerService>;
  let patternRedactionService: jest.Mocked<PatternRedactionService>;
  let _piiService: jest.Mocked<PIIService>;

  const mockExecutionContext: ExecutionContext = {
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: NIL_UUID,
    planId: NIL_UUID,
    deliverableId: NIL_UUID,
    agentSlug: 'test-agent',
    agentType: 'api',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        LLMGenerationService,
        {
          provide: DATABASE_SERVICE,
          useValue: {
            from: jest.fn(),
          },
        },
        {
          provide: CIDAFMService,
          useValue: {
            processRequest: jest.fn(),
          },
        },
        {
          provide: RunMetadataService,
          useValue: {
            insertCompletedUsage: jest.fn(),
          },
        },
        {
          provide: ProviderConfigService,
          useValue: {
            getProviderConfig: jest.fn(),
          },
        },
        {
          provide: PIIService,
          useValue: {
            checkPolicy: jest.fn().mockResolvedValue({
              metadata: {
                piiDetected: false,
                showstopperDetected: false,
                detectionResults: {
                  totalMatches: 0,
                  flaggedMatches: [],
                  showstopperMatches: [],
                  dataTypesSummary: {},
                  severityBreakdown: {
                    showstopper: 0,
                    warning: 0,
                    info: 0,
                  },
                },
                policyDecision: {
                  allowed: true,
                  blocked: false,
                  violations: [],
                  reasoningPath: [],
                  appliedFor: 'external',
                },
                userMessage: {
                  summary: 'No PII detected',
                  details: [],
                  actionsTaken: [],
                  isBlocked: false,
                },
                processingFlow: 'no-pii',
                processingSteps: [],
                timestamps: {},
              },
            }),
          },
        },
        {
          provide: DictionaryPseudonymizerService,
          useValue: {
            pseudonymizeText: jest.fn().mockResolvedValue({
              originalText: 'test message',
              pseudonymizedText: 'test message',
              mappings: [],
              processingTimeMs: 10,
            }),
            reversePseudonyms: jest.fn().mockResolvedValue({
              originalText: 'test response',
              reversalCount: 0,
            }),
          },
        },
        {
          provide: PatternRedactionService,
          useValue: {
            redactPatterns: jest.fn().mockResolvedValue({
              redactedText: 'test message',
              mappings: [],
              redactionCount: 0,
              processingTimeMs: 5,
            }),
            reverseRedactions: jest.fn().mockResolvedValue({
              originalText: 'test response',
              reversalCount: 0,
            }),
          },
        },
        {
          provide: LocalModelStatusService,
          useValue: {
            isModelAvailable: jest.fn(),
          },
        },
        {
          provide: LocalLLMService,
          useValue: {
            generateResponse: jest.fn(),
          },
        },
        {
          provide: BlindedLLMService,
          useValue: {
            createBlindedLLM: jest.fn().mockReturnValue({
              invoke: jest.fn().mockResolvedValue({
                content: 'mocked response',
              }),
            }),
          },
        },
        {
          provide: LLMServiceFactory,
          useValue: {
            generateResponse: jest.fn().mockResolvedValue({
              content: 'test response',
              metadata: {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                requestId: 'req-123',
                timestamp: new Date().toISOString(),
                usage: {
                  inputTokens: 10,
                  outputTokens: 20,
                  totalTokens: 30,
                  cost: 0.001,
                },
                timing: {
                  startTime: Date.now(),
                  endTime: Date.now() + 1000,
                  duration: 1000,
                },
                status: 'completed',
              },
            }),
          },
        },
        {
          provide: ModelConfigurationService,
          useValue: {
            isGlobal: jest.fn().mockReturnValue(true),
            getGlobalDefault: jest.fn().mockReturnValue({
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              parameters: {
                temperature: 0.7,
                maxTokens: 2000,
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LLMGenerationService>(LLMGenerationService);
    llmServiceFactory = module.get(LLMServiceFactory);
    dictionaryPseudonymizerService = module.get(DictionaryPseudonymizerService);
    patternRedactionService = module.get(PatternRedactionService);
    _piiService = module.get(PIIService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResponse', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateResponse(null as any, 'system', 'user'),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should require provider and model in ExecutionContext', async () => {
      const invalidContext = { ...mockExecutionContext, provider: null };
      await expect(
        service.generateResponse(invalidContext as any, 'system', 'user'),
      ).rejects.toThrow('ExecutionContext must contain provider and model');
    });

    it('should process PII for external providers', async () => {
      await service.generateResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
      );

      expect(
        dictionaryPseudonymizerService.pseudonymizeText,
      ).toHaveBeenCalled();
      expect(patternRedactionService.redactPatterns).toHaveBeenCalled();
    });

    it('should skip PII processing for Ollama', async () => {
      const ollamaContext = { ...mockExecutionContext, provider: 'ollama' };
      await service.generateResponse(
        ollamaContext,
        'system prompt',
        'user message',
      );

      expect(
        dictionaryPseudonymizerService.pseudonymizeText,
      ).not.toHaveBeenCalled();
      expect(patternRedactionService.redactPatterns).not.toHaveBeenCalled();
    });

    it('should skip PII processing when quick=true', async () => {
      await service.generateResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
        {
          quick: true,
          executionContext: mockExecutionContext,
        },
      );

      expect(
        dictionaryPseudonymizerService.pseudonymizeText,
      ).not.toHaveBeenCalled();
    });

    it('should call LLM service factory with correct parameters', async () => {
      await service.generateResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
      );

      expect(llmServiceFactory.generateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
        expect.objectContaining({
          systemPrompt: 'system prompt',
          userMessage: 'test message', // processed message
          options: expect.objectContaining({
            executionContext: mockExecutionContext,
          }),
        }),
      );
    });

    it('should reverse PII processing in response', async () => {
      dictionaryPseudonymizerService.pseudonymizeText.mockResolvedValueOnce({
        originalText: 'user message',
        pseudonymizedText: 'pseudonymized message',
        mappings: [
          {
            originalValue: 'John',
            pseudonym: 'PERSON_1',
            dataType: 'name',
            category: 'person',
          },
        ],
        processingTimeMs: 10,
      });

      await service.generateResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
      );

      expect(
        dictionaryPseudonymizerService.reversePseudonyms,
      ).toHaveBeenCalled();
    });

    it('should return LLMResponse', async () => {
      const result = await service.generateResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
      );

      expect(result).toMatchObject({
        content: expect.any(String),
        metadata: expect.objectContaining({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
        }),
      });
    });
  });

  describe('generateUnifiedResponse', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateUnifiedResponse(null as any, {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          systemPrompt: 'system',
          userMessage: 'user',
        }),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should validate provider', async () => {
      await expect(
        service.generateUnifiedResponse(mockExecutionContext, {
          provider: 'invalid-provider',
          model: 'gpt-3.5-turbo',
          systemPrompt: 'system',
          userMessage: 'user',
        }),
      ).rejects.toThrow('Unsupported provider');
    });

    it('should process PII for external providers', async () => {
      await service.generateUnifiedResponse(mockExecutionContext, {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        systemPrompt: 'system',
        userMessage: 'user',
      });

      expect(
        dictionaryPseudonymizerService.pseudonymizeText,
      ).toHaveBeenCalled();
    });

    it('should skip PII for Ollama', async () => {
      await service.generateUnifiedResponse(mockExecutionContext, {
        provider: 'ollama',
        model: 'llama2',
        systemPrompt: 'system',
        userMessage: 'user',
      });

      expect(
        dictionaryPseudonymizerService.pseudonymizeText,
      ).not.toHaveBeenCalled();
    });

    it('should return string when includeMetadata=false', async () => {
      const result = await service.generateUnifiedResponse(
        mockExecutionContext,
        {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          systemPrompt: 'system',
          userMessage: 'user',
          options: {
            includeMetadata: false,
            executionContext: mockExecutionContext,
          },
        },
      );

      expect(typeof result).toBe('string');
    });

    it('should return LLMResponse when includeMetadata=true', async () => {
      const result = await service.generateUnifiedResponse(
        mockExecutionContext,
        {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          systemPrompt: 'system',
          userMessage: 'user',
          options: {
            includeMetadata: true,
            executionContext: mockExecutionContext,
          },
        },
      );

      expect(result).toMatchObject({
        content: expect.any(String),
        metadata: expect.any(Object),
      });
    });
  });

  describe('generateResponseWithHistory', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateResponseWithHistory(
          null as any,
          'system',
          [],
          'current',
        ),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should handle conversation history', async () => {
      const mockLLM = {
        invoke: jest.fn().mockResolvedValue({
          content: 'response with history',
        }),
      };

      const blindedLLMService =
        module.get<BlindedLLMService>(BlindedLLMService);
      (blindedLLMService.createBlindedLLM as jest.Mock).mockReturnValueOnce(
        mockLLM,
      );

      const result = await service.generateResponseWithHistory(
        mockExecutionContext,
        'system prompt',
        [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
        'how are you?',
      );

      expect(result).toBe('response with history');
      expect(mockLLM.invoke).toHaveBeenCalled();
    });
  });

  describe('generateSystemResponse', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateSystemResponse(
          null as any,
          'test-operation' as any,
          'system',
          'user',
        ),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should use model configuration defaults', async () => {
      const mockLLM = {
        invoke: jest.fn().mockResolvedValue({
          content: 'system response',
        }),
      };
      jest
        .spyOn(service as any, 'createCustomLangGraphLLM')
        .mockReturnValue(mockLLM);

      const result = await service.generateSystemResponse(
        mockExecutionContext,
        'test-operation' as any,
        'system prompt',
        'user message',
      );

      expect(result).toBe('system response');
    });
  });

  describe('generateUserContentResponse', () => {
    it('should require ExecutionContext', async () => {
      await expect(
        service.generateUserContentResponse(null as any, 'system', 'user', {
          providerName: 'openai',
          modelName: 'gpt-3.5-turbo',
        }),
      ).rejects.toThrow('ExecutionContext is required');
    });

    it('should validate user preferences', async () => {
      await expect(
        service.generateUserContentResponse(
          mockExecutionContext,
          'system',
          'user',
          {} as any,
        ),
      ).rejects.toThrow('User preferences must include a valid providerName');
    });

    it('should return formatted response with usage metrics', async () => {
      const result = await service.generateUserContentResponse(
        mockExecutionContext,
        'system prompt',
        'user message',
        {
          providerName: 'openai',
          modelName: 'gpt-3.5-turbo',
          temperature: 0.7,
          maxTokens: 2000,
        },
      );

      expect(result).toMatchObject({
        content: expect.any(String),
        usage: expect.objectContaining({
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
        }),
        costCalculation: expect.objectContaining({
          totalCost: expect.any(Number),
        }),
        llmMetadata: expect.objectContaining({
          providerName: 'openai',
          modelName: 'gpt-3.5-turbo',
        }),
      });
    });
  });
});
