import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { DATABASE_SERVICE } from '@/database';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { LLMServiceFactory } from '../llm-service-factory';
import { PIIService } from '../../pii/pii.service';
import { DictionaryPseudonymizerService } from '../../pii/dictionary-pseudonymizer.service';
import { RunMetadataService } from '../../run-metadata.service';
import { ProviderConfigService } from '../../provider-config.service';
import { LLMPricingService } from '../../llm-pricing.service';
import { OpenRouterClient } from '../../../openrouter/openrouter.client';

/**
 * Startup verification that every backend can actually record usage.
 *
 * `llm_usage.provider_name` is a foreign key onto `llm_providers(name)`. A
 * backend with no row cannot insert, and that failure is swallowed twice on
 * the way out — so the model call succeeds, the user sees a normal answer, and
 * the accounting row simply never exists. Every commercial provider was in
 * that state for months while nobody noticed.
 *
 * The check converts that silence into a refusal to boot.
 */
describe('LLMServiceFactory provider registration check', () => {
  const ALL_BACKENDS = [
    'openai',
    'anthropic',
    'google',
    'ollama',
    'xai',
    'openrouter',
  ];

  const build = async (
    dbResult: { data: unknown; error: { message: string } | null },
  ): Promise<LLMServiceFactory> => {
    const select = jest.fn().mockResolvedValue(dbResult);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMServiceFactory,
        {
          provide: DATABASE_SERVICE,
          useValue: { from: jest.fn(() => ({ select })) },
        },
        { provide: PIIService, useValue: {} },
        { provide: DictionaryPseudonymizerService, useValue: {} },
        { provide: RunMetadataService, useValue: {} },
        { provide: ProviderConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        {
          provide: LLMPricingService,
          useValue: { loadPricingCache: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ObservabilityEventsService, useValue: {} },
        { provide: OpenRouterClient, useValue: {} },
      ],
    }).compile();

    return module.get(LLMServiceFactory);
  };

  const rows = (names: string[]) => ({
    data: names.map((name) => ({ name })),
    error: null,
  });

  it('starts when every backend is registered', async () => {
    const factory = await build(rows(ALL_BACKENDS));

    await expect(factory.onModuleInit()).resolves.toBeUndefined();
  });

  it('refuses to start when a backend has no row', async () => {
    // The state the platform was actually in: only ollama registered.
    const factory = await build(rows(['ollama']));

    await expect(factory.onModuleInit()).rejects.toThrow(
      /have no llm_providers row: openai, anthropic, google, xai, openrouter/,
    );
  });

  it('names the specific backend that is missing', async () => {
    // The state a new backend lands in when its migration is forgotten.
    const factory = await build(
      rows(ALL_BACKENDS.filter((n) => n !== 'openrouter')),
    );

    await expect(factory.onModuleInit()).rejects.toThrow(/openrouter/);
  });

  it('points at the fix rather than just the symptom', async () => {
    const factory = await build(rows(['ollama']));

    await expect(factory.onModuleInit()).rejects.toThrow(
      /register_llm_providers\.sql/,
    );
  });

  it('refuses to start when registration cannot be verified at all', async () => {
    // Not an assumption either way: an unanswerable database means usage
    // recording cannot be trusted, and it will surface elsewhere regardless.
    const factory = await build({
      data: null,
      error: { message: 'connection refused' },
    });

    await expect(factory.onModuleInit()).rejects.toThrow(
      /Unable to verify LLM provider registration: connection refused/,
    );
  });

  it('tolerates extra rows for providers the factory does not route to', async () => {
    // llm_providers may carry historical or planned entries; only the
    // backends in providerMap have to be present.
    const factory = await build(rows([...ALL_BACKENDS, 'azure_foundry']));

    await expect(factory.onModuleInit()).resolves.toBeUndefined();
  });
});
