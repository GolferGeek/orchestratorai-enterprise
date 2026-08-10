import { platformApiClient } from '@/shared/services/api-client';

export interface LLMProvider {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isActive: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  displayName: string;
  providerId: string;
  providerName: string;
  /** Full OpenRouter-style catalog id when different from bare id. */
  catalogId: string;
  contextWindow?: number;
  isActive: boolean;
  isLocal?: boolean;
  capabilities?: string[];
}

interface ProvidersModelsResponse {
  providers: { name: string; displayName: string; isLocal: boolean }[];
  models: {
    modelName: string;
    providerName: string;
    displayName: string;
    modelType: string;
    isLocal: boolean;
  }[];
}

/** Agent/demo records may use dash versions; OpenRouter catalog uses dots. */
const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4.6',
  'claude-opus-4-6': 'claude-opus-4.6',
  'claude-sonnet-4-5': 'claude-sonnet-4.5',
  'claude-opus-4-5': 'claude-opus-4.5',
  'claude-haiku-4-5': 'claude-haiku-4.5',
};

function toBareModelId(providerName: string, modelName: string): string {
  const prefix = `${providerName}/`;
  if (modelName.startsWith(prefix)) {
    return modelName.slice(prefix.length);
  }
  return modelName;
}

function candidateModelIds(provider: string, model: string): string[] {
  const normalized = MODEL_ALIASES[model] ?? model;
  const bare = toBareModelId(provider, model);
  const bareNormalized = toBareModelId(provider, normalized);
  return [...new Set([model, normalized, bare, bareNormalized])];
}

class LLMService {
  private async fetchProvidersAndModels(): Promise<ProvidersModelsResponse> {
    return platformApiClient.get<ProvidersModelsResponse>(
      '/invoke/providers-models?model_type=text-generation',
    );
  }

  async getProviders(): Promise<LLMProvider[]> {
    const data = await this.fetchProvidersAndModels();
    return data.providers.map((provider) => ({
      id: provider.name,
      name: provider.name,
      displayName: provider.displayName,
      isActive: true,
    }));
  }

  async getModels(): Promise<LLMModel[]> {
    const data = await this.fetchProvidersAndModels();
    return data.models
      .filter((model) => !model.modelName.includes(':batch'))
      .map((model) => {
        const bareId = toBareModelId(model.providerName, model.modelName);
        return {
          id: bareId,
          name: model.displayName || bareId,
          displayName: model.displayName || bareId,
          providerId: model.providerName,
          providerName: model.providerName,
          catalogId: model.modelName,
          isActive: true,
          isLocal: model.isLocal,
        };
      });
  }

  /**
   * Map an agent/demo provider+model pair onto a model from the active catalog.
   * Returns undefined when the configured default is not available.
   */
  resolveModel(
    provider: string,
    model: string,
    models: LLMModel[],
  ): LLMModel | undefined {
    const candidates = candidateModelIds(provider, model);
    return models.find(
      (entry) =>
        entry.providerName === provider &&
        (candidates.includes(entry.id) ||
          candidates.includes(entry.catalogId) ||
          candidates.includes(toBareModelId(provider, entry.catalogId))),
    );
  }
}

export const llmService = new LLMService();
