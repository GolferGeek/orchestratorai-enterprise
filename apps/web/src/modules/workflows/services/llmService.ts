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

class LLMService {
  private async fetchProvidersAndModels(): Promise<ProvidersModelsResponse> {
    return platformApiClient.get<ProvidersModelsResponse>('/invoke/providers-models?model_type=text-generation');
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
    return data.models.map((model) => ({
      id: model.modelName,
      name: model.displayName || model.modelName,
      displayName: model.displayName || model.modelName,
      providerId: model.providerName,
      providerName: model.providerName,
      isActive: true,
      isLocal: model.isLocal,
    }));
  }
}

export const llmService = new LLMService();
