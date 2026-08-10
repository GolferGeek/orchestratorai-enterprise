import { describe, expect, it, vi, beforeEach } from 'vitest';
import { llmService } from './llmService';

vi.mock('@/shared/services/api-client', () => ({
  platformApiClient: {
    get: vi.fn(),
  },
}));

import { platformApiClient } from '@/shared/services/api-client';

describe('marketing llmService model defaults', () => {
  beforeEach(() => {
    vi.mocked(platformApiClient.get).mockResolvedValue({
      providers: [
        { name: 'anthropic', displayName: 'Anthropic', isLocal: false },
        { name: 'openai', displayName: 'OpenAI', isLocal: false },
      ],
      models: [
        {
          modelName: 'anthropic/claude-sonnet-4.6',
          providerName: 'anthropic',
          displayName: 'Claude Sonnet 4.6',
          modelType: 'text-generation',
          isLocal: false,
        },
        {
          modelName: 'anthropic/claude-sonnet-4.6:batch',
          providerName: 'anthropic',
          displayName: 'Claude Sonnet 4.6 (batch)',
          modelType: 'text-generation',
          isLocal: false,
        },
        {
          modelName: 'openai/gpt-4o',
          providerName: 'openai',
          displayName: 'GPT-4o',
          modelType: 'text-generation',
          isLocal: false,
        },
      ],
    });
  });

  it('exposes bare model ids that match agent/demo defaults', async () => {
    const models = await llmService.getModels();
    expect(models.map((model) => model.id)).toEqual([
      'claude-sonnet-4.6',
      'gpt-4o',
    ]);
  });

  it('resolves dash-version Anthropic defaults onto catalog models', async () => {
    const models = await llmService.getModels();
    const resolved = llmService.resolveModel(
      'anthropic',
      'claude-sonnet-4-6',
      models,
    );
    expect(resolved?.id).toBe('claude-sonnet-4.6');
    expect(resolved?.catalogId).toBe('anthropic/claude-sonnet-4.6');
  });

  it('resolves OpenAI gpt-4o defaults onto catalog models', async () => {
    const models = await llmService.getModels();
    const resolved = llmService.resolveModel('openai', 'gpt-4o', models);
    expect(resolved?.id).toBe('gpt-4o');
  });
});
