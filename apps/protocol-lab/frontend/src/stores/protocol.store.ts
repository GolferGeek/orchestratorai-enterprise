import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProtocolConfig, ProtocolPreset } from '../types';
import { PROTOCOL_PRESETS } from '../types';
import { useApi } from '../composables/useApi';

export const useProtocolStore = defineStore('protocol', () => {
  const { protocolApi } = useApi();

  const currentConfig = ref<ProtocolConfig>({
    discovery: 'well-known',
    transport: 'http-rest',
    negotiation: 'capability-card',
    identity: 'local-keys',
    payment: 'mock',
    wallet: 'local-keypair',
    trust: 'allowlist',
    encryption: 'none',
    resilience: 'retry',
    observability: 'file-log',
    orchestration: 'pipeline',
    audit: 'hash-chain',
  });

  const presets = ref<ProtocolPreset[]>(PROTOCOL_PRESETS);
  const drawerOpen = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchConfig() {
    loading.value = true;
    error.value = null;
    try {
      const config = await protocolApi.get<ProtocolConfig>('/api/protocol/config');
      currentConfig.value = config;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateConfig(partial: Partial<ProtocolConfig>) {
    loading.value = true;
    error.value = null;
    try {
      const updated = await protocolApi.put<ProtocolConfig>('/api/protocol/config', {
        ...currentConfig.value,
        ...partial,
      });
      currentConfig.value = updated;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchPresets() {
    try {
      const result = await protocolApi.get<ProtocolPreset[]>('/api/protocol/presets');
      presets.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  function selectPreset(presetId: string) {
    const preset = presets.value.find((p) => p.id === presetId);
    if (preset) {
      updateConfig(preset.config);
    }
  }

  const testResults = ref<Record<string, any>>({});
  const testingLayer = ref<string | null>(null);

  async function testLayer(layer: string) {
    testingLayer.value = layer;
    testResults.value[layer] = null;
    try {
      const result = await protocolApi.post<any>(`/api/protocol/test/${layer}`);
      testResults.value[layer] = result;
    } catch (e) {
      testResults.value[layer] = {
        layer,
        provider: currentConfig.value[layer as keyof typeof currentConfig.value],
        success: false,
        result: { error: e instanceof Error ? e.message : String(e) },
        durationMs: 0,
      };
    } finally {
      testingLayer.value = null;
    }
  }

  async function fetchProviders() {
    try {
      return await protocolApi.get<Record<string, string[]>>('/api/protocol/providers');
    } catch {
      return null;
    }
  }

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value;
  }

  return {
    currentConfig,
    presets,
    drawerOpen,
    loading,
    error,
    testResults,
    testingLayer,
    fetchConfig,
    updateConfig,
    fetchPresets,
    selectPreset,
    testLayer,
    fetchProviders,
    toggleDrawer,
  };
});
