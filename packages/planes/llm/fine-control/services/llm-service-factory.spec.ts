import type { HttpService } from '@nestjs/axios';
import type { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@/database';
import type { OpenRouterClient } from '../../openrouter/openrouter.client';
import type { PIIService } from '../pii/pii.service';
import type { DictionaryPseudonymizerService } from '../pii/dictionary-pseudonymizer.service';
import type { RunMetadataService } from '../run-metadata.service';
import type { ProviderConfigService } from '../provider-config.service';
import type { LLMPricingService } from '../llm-pricing.service';
import type { BaseLLMService } from './base-llm.service';
import type {
  GenerateResponseParams,
  LLMResponse,
  LLMServiceConfig,
} from './llm-interfaces';
import { LLMServiceFactory } from './llm-service-factory';

const context: ExecutionContext = Object.freeze({
  orgSlug: 'finance',
  userId: '00000000-0000-4000-a000-000000000001',
  conversationId: '00000000-0000-4000-a000-000000000002',
  agentSlug: 'invoice-review',
  agentType: 'workflow',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
});

const response: LLMResponse = {
  content: '{"ok":true}',
  metadata: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    requestId: 'req-1',
    timestamp: '2026-09-26T00:00:00.000Z',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    timing: { startTime: 0, endTime: 1, duration: 1 },
    status: 'completed',
  },
};

function makeFactory(): LLMServiceFactory {
  return new LLMServiceFactory(
    {} as unknown as PIIService,
    {} as unknown as DictionaryPseudonymizerService,
    {} as unknown as RunMetadataService,
    {} as unknown as ProviderConfigService,
    {} as unknown as HttpService,
    {} as unknown as LLMPricingService,
    {} as unknown as ObservabilityEventsService,
    {} as unknown as OpenRouterClient,
    {} as unknown as DatabaseService,
  );
}

function params(responseFormat?: 'json'): GenerateResponseParams {
  const config: LLMServiceConfig = {
    provider: context.provider,
    model: context.model,
  };
  return {
    systemPrompt: 'system',
    userMessage: 'user',
    config,
    options: { executionContext: context, responseFormat },
  };
}

describe('LLMServiceFactory.generateResponse responseFormat', () => {
  function backend(supportsJson: boolean) {
    const generateResponse = jest.fn().mockResolvedValue(response);
    return {
      generateResponse,
      service: {
        supportsJsonResponseFormat: supportsJson,
        generateResponse,
      } as unknown as BaseLLMService,
    };
  }

  it('refuses a JSON request to a backend without a JSON mode', async () => {
    const factory = makeFactory();
    const { service, generateResponse } = backend(false);
    jest.spyOn(factory, 'createService').mockResolvedValue(service);

    await expect(
      factory.generateResponse(params('json').config, params('json')),
    ).rejects.toThrow('does not support responseFormat "json"');
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it('passes a JSON request to a backend with a JSON mode', async () => {
    const factory = makeFactory();
    const { service, generateResponse } = backend(true);
    jest.spyOn(factory, 'createService').mockResolvedValue(service);

    await factory.generateResponse(params('json').config, params('json'));

    expect(generateResponse).toHaveBeenCalledTimes(1);
  });

  it('does not constrain plain requests', async () => {
    const factory = makeFactory();
    const { service, generateResponse } = backend(false);
    jest.spyOn(factory, 'createService').mockResolvedValue(service);

    await factory.generateResponse(params().config, params());

    expect(generateResponse).toHaveBeenCalledTimes(1);
  });
});
