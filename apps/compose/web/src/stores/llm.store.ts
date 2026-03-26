/**
 * LLM Store
 *
 * Manages LLM provider and model selection for Compose.
 * Fetches available providers/models from GET /invoke/providers-models,
 * filtered by agent type (text vs image vs video generation).
 *
 * Selection is persisted to localStorage.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { LLMProvider, LLMModel, ModelType } from '@/types/llm';

const STORAGE_KEY_PROVIDER = 'llm_selected_provider';
const STORAGE_KEY_MODEL = 'llm_selected_model';

// ============================================================================
// Helpers
// ============================================================================

function mapAgentTypeToModelType(agentType: string): ModelType {
  // 'media' agents default to image-generation unless mediaType says otherwise.
  // Callers can use fetchProvidersAndModels(modelType) directly for finer control.
  if (agentType === 'media') {
    return 'image-generation';
  }
  return 'text-generation';
}

const LLM_API_BASE = import.meta.env.VITE_COMPOSE_API_BASE_URL || '';

async function apiFetch<T>(path: string): Promise<T> {
  const token =
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token') ||
    '';

  const response = await fetch(`${LLM_API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `LLM API error ${response.status} ${response.statusText}: ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Store
// ============================================================================

export const useLLMStore = defineStore('llm', () => {
  // ── State ─────────────────────────────────────────────────────────────────

  const providers = ref<LLMProvider[]>([]);
  const models = ref<LLMModel[]>([]);
  const selectedProvider = ref<string>(
    localStorage.getItem(STORAGE_KEY_PROVIDER) ?? '',
  );
  const selectedModel = ref<string>(
    localStorage.getItem(STORAGE_KEY_MODEL) ?? '',
  );
  const loading = ref(false);

  // ── Getters ───────────────────────────────────────────────────────────────

  const currentProvider = computed<LLMProvider | undefined>(() =>
    providers.value.find((p) => p.name === selectedProvider.value),
  );

  const currentModel = computed<LLMModel | undefined>(() =>
    models.value.find((m) => m.modelName === selectedModel.value),
  );

  const modelsForProvider = (providerName: string): LLMModel[] =>
    models.value.filter((m) => m.providerName === providerName);

  const providersWithModels = computed<LLMProvider[]>(() => {
    const withModels = new Set(models.value.map((m) => m.providerName));
    return providers.value.filter((p) => withModels.has(p.name));
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  async function fetchProvidersAndModels(modelType?: ModelType): Promise<void> {
    loading.value = true;

    const url = modelType
      ? `/invoke/providers-models?model_type=${encodeURIComponent(modelType)}`
      : '/invoke/providers-models';

    const data = await apiFetch<{ providers: LLMProvider[]; models: LLMModel[] }>(url)
      .finally(() => {
        loading.value = false;
      });

    providers.value = data.providers;
    models.value = data.models;

    // Auto-select first provider/model if current selection is no longer valid
    if (
      selectedProvider.value &&
      !providers.value.some((p) => p.name === selectedProvider.value)
    ) {
      selectedProvider.value = '';
    }
    if (
      selectedModel.value &&
      !models.value.some((m) => m.modelName === selectedModel.value)
    ) {
      selectedModel.value = '';
    }

    // Auto-select defaults if nothing is selected
    if (!selectedProvider.value && providers.value.length > 0) {
      selectedProvider.value = providers.value[0].name;
    }
    if (!selectedModel.value && models.value.length > 0) {
      const forProvider = modelsForProvider(selectedProvider.value);
      selectedModel.value = (forProvider[0] ?? models.value[0]).modelName;
    }
  }

  function setProvider(name: string): void {
    if (selectedProvider.value !== name) {
      selectedProvider.value = name;
      localStorage.setItem(STORAGE_KEY_PROVIDER, name);
      // Reset model when provider changes
      selectedModel.value = '';
      localStorage.removeItem(STORAGE_KEY_MODEL);
    }
  }

  function setModel(modelName: string): void {
    selectedModel.value = modelName;
    localStorage.setItem(STORAGE_KEY_MODEL, modelName);
  }

  async function loadForAgentType(
    agentType: string,
    mediaType?: 'image' | 'video',
  ): Promise<void> {
    let modelType: ModelType;

    if (agentType === 'media') {
      modelType =
        mediaType === 'video' ? 'video-generation' : 'image-generation';
    } else {
      modelType = mapAgentTypeToModelType(agentType);
    }

    await fetchProvidersAndModels(modelType);
  }

  return {
    // State
    providers,
    models,
    selectedProvider,
    selectedModel,
    loading,

    // Getters
    currentProvider,
    currentModel,
    modelsForProvider,
    providersWithModels,

    // Actions
    fetchProvidersAndModels,
    setProvider,
    setModel,
    loadForAgentType,
  };
});
