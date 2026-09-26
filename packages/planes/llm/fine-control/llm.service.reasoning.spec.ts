import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ObservabilityEventsService,
  ObservabilityWebhookService,
} from '@orchestratorai/planes/observability';
import type { LLMGenerationService } from './services/llm-generation.service';
import type { LLMImageService } from './services/llm-image.service';
import type { LLMVideoService } from './services/llm-video.service';
import type { ModelConfigurationService } from './config/model-configuration.service';
import type { ModelsService } from './models/models.service';
import type { ProvidersService } from './providers/providers.service';
import type { LLMServiceFactory } from './services/llm-service-factory';
import type { LLMResponse } from './services/llm-interfaces';
import { LLMService } from './llm.service';

const context: ExecutionContext = Object.freeze({
  orgSlug: 'engineering',
  userId: '00000000-0000-4000-a000-000000000001',
  conversationId: '00000000-0000-4000-a000-000000000002',
  agentSlug: 'incident-postmortem',
  agentType: 'workflow',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
});

const response: LLMResponse = {
  content: 'draft',
  metadata: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    requestId: 'req-real',
    timestamp: '2026-09-26T00:00:00.000Z',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    timing: { startTime: 0, endTime: 1, duration: 1 },
    status: 'completed',
  },
};

function makeService(generateResponse: jest.Mock): LLMService {
  return new LLMService(
    { generateResponse } as unknown as LLMGenerationService,
    {} as unknown as LLMImageService,
    {} as unknown as LLMVideoService,
    {} as unknown as ModelConfigurationService,
    {} as unknown as ObservabilityWebhookService,
    { push: jest.fn().mockResolvedValue(undefined) } as unknown as ObservabilityEventsService,
    {} as unknown as ModelsService,
    {} as unknown as ProvidersService,
    {} as unknown as LLMServiceFactory,
  );
}

describe('LLMService.callLLMWithReasoning for non-Ollama providers', () => {
  it('asks for metadata and returns the real response', async () => {
    const generateResponse = jest.fn().mockResolvedValue(response);
    const service = makeService(generateResponse);

    const result = await service.callLLMWithReasoning('system', 'user', {
      executionContext: context,
    });

    expect(result.metadata.requestId).toBe('req-real');
    const options = generateResponse.mock.calls[0][3];
    expect(options.includeMetadata).toBe(true);
    expect(options.executionContext).toBe(context);
  });

  it('refuses a bare string instead of inventing metadata', async () => {
    const generateResponse = jest.fn().mockResolvedValue('draft');
    const service = makeService(generateResponse);

    await expect(
      service.callLLMWithReasoning('system', 'user', {
        executionContext: context,
      }),
    ).rejects.toThrow('returned a string');
  });
});
