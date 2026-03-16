/**
 * LLM Preferences Store
 *
 * Manages LLM model selection preferences for complex agent dashboards.
 * State only — no async calls.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLLMPreferencesStore = defineStore('llm-preferences', () => {
  const selectedProvider = ref<string>('');
  const selectedModel = ref<string>('');
  const agentRequiresLocalModel = ref<boolean>(false);

  function setProvider(provider: string) {
    selectedProvider.value = provider;
  }

  function setModel(model: string) {
    selectedModel.value = model;
  }

  function setAgentRequiresLocalModel(requires: boolean) {
    agentRequiresLocalModel.value = requires;
  }

  function setPreferences(provider: string, model: string) {
    selectedProvider.value = provider;
    selectedModel.value = model;
  }

  return {
    selectedProvider,
    selectedModel,
    agentRequiresLocalModel,
    setProvider,
    setModel,
    setAgentRequiresLocalModel,
    setPreferences,
  };
});
