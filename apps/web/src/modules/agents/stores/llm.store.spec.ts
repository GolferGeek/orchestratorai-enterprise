import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));
vi.mock('@/services/tokenStorageService', () => ({
  tokenStorage: { getAccessToken },
}));

import { useLLMStore } from './llm.store';

const catalog = {
  providers: [
    { name: 'openrouter', displayName: 'OpenRouter', isLocal: false },
    { name: 'anthropic', displayName: 'Anthropic', isLocal: false },
  ],
  models: [
    {
      modelName: 'openrouter/auto',
      providerName: 'openrouter',
      displayName: 'Use best model',
      modelType: 'text-generation',
      isLocal: false,
    },
    {
      modelName: 'anthropic/claude-sonnet-4',
      providerName: 'anthropic',
      displayName: 'Claude Sonnet 4',
      modelType: 'text-generation',
      isLocal: false,
    },
  ],
};

describe('LLM store best-model selection', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentOrganization', 'acme');
    getAccessToken.mockResolvedValue('access-token');
    setActivePinia(createPinia());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => catalog,
      }),
    );
  });

  it('defaults text agents to OpenRouter Auto Router', async () => {
    const store = useLLMStore();

    await store.loadForAgentType('context');

    expect(store.useBestModel).toBe(true);
    expect(store.selectedProvider).toBe('openrouter');
    expect(store.selectedModel).toBe('openrouter/auto');
    expect(localStorage.getItem('llm_use_best_model')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/api/invoke/providers-models?model_type=text-generation',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-organization-slug': 'acme',
        }),
      }),
    );
  });

  it('persists an explicit opt-out and keeps the chooser selection', async () => {
    const store = useLLMStore();
    await store.loadForAgentType('context');

    store.setUseBestModel(false);
    store.setProvider('anthropic');
    store.setModel('anthropic/claude-sonnet-4');

    expect(store.useBestModel).toBe(false);
    expect(store.selectedProvider).toBe('anthropic');
    expect(store.selectedModel).toBe('anthropic/claude-sonnet-4');
    expect(localStorage.getItem('llm_use_best_model')).toBe('false');
  });
});
