import apiService from './apiService';

export interface GlobalModelConfig {
  provider?: string;
  model?: string;
  parameters?: Record<string, unknown>;
  default?: { provider: string; model: string; parameters?: Record<string, unknown> };
  localOnly?: { provider: string; model: string; parameters?: Record<string, unknown> };
}

export async function fetchGlobalModelConfig() {
  const data = await apiService.get('/system/model-config/global');
  return data;
}

export async function updateGlobalModelConfig(config: GlobalModelConfig) {
  const data = await apiService.put('/system/model-config/global', { config });
  return data;
}

