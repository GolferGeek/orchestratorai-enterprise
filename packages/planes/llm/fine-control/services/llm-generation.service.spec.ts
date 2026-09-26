import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@/database';
import type { CIDAFMService } from '../cidafm/cidafm.service';
import type { RunMetadataService } from '../run-metadata.service';
import type { ProviderConfigService } from '../provider-config.service';
import type { PIIService } from '../pii/pii.service';
import type { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import type { PatternRedactionService } from '../pii/pattern-redaction.service';
import type { PiiBoundaryService } from '../pii/pii-boundary.service';
import type { LocalModelStatusService } from '../local-model-status.service';
import type { LocalLLMService } from '../local-llm.service';
import type { ModelConfigurationService } from '../config/model-configuration.service';
import type { LLMServiceFactory } from './llm-service-factory';
import type { GenerateResponseParams, LLMResponse } from './llm-interfaces';
import { LLMGenerationService } from './llm-generation.service';

const llmResponse: LLMResponse = {
  content: '{"ok":true}',
  metadata: {
    provider: 'ollama',
    model: 'qwen3:8b',
    requestId: 'req-1',
    timestamp: '2026-09-26T00:00:00.000Z',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    timing: { startTime: 0, endTime: 1, duration: 1 },
    status: 'completed',
  },
};

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return Object.freeze({
    orgSlug: 'finance',
    userId: '00000000-0000-4000-a000-000000000001',
    conversationId: '00000000-0000-4000-a000-000000000002',
    agentSlug: 'invoice-review',
    agentType: 'workflow',
    provider: 'ollama',
    model: 'qwen3:8b',
    ...overrides,
  });
}

describe('LLMGenerationService', () => {
  let factoryGenerate: jest.Mock<Promise<LLMResponse>, [unknown, GenerateResponseParams]>;
  let service: LLMGenerationService;

  beforeEach(() => {
    factoryGenerate = jest.fn().mockResolvedValue(llmResponse);
    const piiBoundary = {
      apply: jest.fn(async ({ userMessage }: { userMessage: string }) => ({
        processedUserMessage: userMessage,
        piiMetadata: null,
        dictionaryMappings: [],
        blocked: false,
      })),
      restore: jest.fn(async (response: LLMResponse) => response),
      buildBlockedResponse: jest.fn(),
    };
    service = new LLMGenerationService(
      {} as unknown as DatabaseService,
      {} as unknown as CIDAFMService,
      {} as unknown as RunMetadataService,
      {} as unknown as ProviderConfigService,
      {} as unknown as PIIService,
      {} as unknown as DictionaryPseudonymizerService,
      {} as unknown as PatternRedactionService,
      {} as unknown as LocalModelStatusService,
      {} as unknown as LocalLLMService,
      { generateResponse: factoryGenerate } as unknown as LLMServiceFactory,
      {} as unknown as ModelConfigurationService,
      piiBoundary as unknown as PiiBoundaryService,
    );
  });

  describe('sovereign mode', () => {
    it('rejects an explicit cloud provider even when the context names ollama', async () => {
      const context = makeContext({ sovereignMode: true, provider: 'ollama' });

      await expect(
        service.generateUnifiedResponse(context, {
          provider: 'openai',
          model: 'gpt-4.1',
          systemPrompt: 'system',
          userMessage: 'user',
          options: { executionContext: context },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(factoryGenerate).not.toHaveBeenCalled();
    });

    it('allows an explicit ollama provider under sovereign mode', async () => {
      const context = makeContext({ sovereignMode: true, provider: 'ollama' });

      await service.generateUnifiedResponse(context, {
        provider: 'ollama',
        model: 'qwen3:8b',
        systemPrompt: 'system',
        userMessage: 'user',
        options: { executionContext: context },
      });

      expect(factoryGenerate).toHaveBeenCalledTimes(1);
    });

    it('rejects a cloud context provider on the context-driven path', async () => {
      const context = makeContext({ sovereignMode: true, provider: 'anthropic' });

      await expect(
        service.generateResponse(context, 'system', 'user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(factoryGenerate).not.toHaveBeenCalled();
    });
  });

  describe('responseFormat', () => {
    it('reaches the backend on the context-driven path', async () => {
      const context = makeContext();

      await service.generateResponse(context, 'system', 'user', {
        executionContext: context,
        responseFormat: 'json',
      });

      const params = factoryGenerate.mock.calls[0][1];
      expect(params.options.responseFormat).toBe('json');
    });

    it('reaches the backend on the explicit provider path', async () => {
      const context = makeContext();

      await service.generateUnifiedResponse(context, {
        provider: 'ollama',
        model: 'qwen3:8b',
        systemPrompt: 'system',
        userMessage: 'user',
        options: { executionContext: context, responseFormat: 'json' },
      });

      const params = factoryGenerate.mock.calls[0][1];
      expect(params.options.responseFormat).toBe('json');
    });
  });
});
