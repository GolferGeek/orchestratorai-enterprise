/**
 * Providers Models Service
 *
 * Returns providers and models from the active LLM plane.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  LLM_SERVICE,
  type LLMServiceProvider,
} from '@orchestratorai/planes/llm';

export interface ProviderRow {
  name: string;
  display_name: string;
  is_active: boolean;
  is_local: boolean;
  api_base_url?: string;
}

export interface ModelRow {
  model_name: string;
  provider_name: string;
  display_name: string;
  model_type: string;
  capabilities?: string[];
  is_active: boolean;
  is_local: boolean;
  model_tier?: string;
  context_window?: number;
  max_output_tokens?: number;
}

export interface LLMProviderDto {
  name: string;
  displayName: string;
  isLocal: boolean;
}

export interface LLMModelDto {
  modelName: string;
  providerName: string;
  displayName: string;
  modelType: string;
  isLocal: boolean;
}

export interface ProvidersModelsResponse {
  providers: LLMProviderDto[];
  models: LLMModelDto[];
}

@Injectable()
export class ProvidersModelsService {
  private readonly logger = new Logger(ProvidersModelsService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  async fetchProvidersAndModels(
    modelType?: string,
  ): Promise<ProvidersModelsResponse> {
    const modelRows = await this.llmService.listModels({ modelType });
    const providerRows = await this.llmService.listProviders();
    const activeProviderNames = new Set(
      modelRows.map((model) => model.providerName),
    );
    const providers = providerRows
      .filter((provider) => activeProviderNames.has(provider.name))
      .map((provider) => ({
        name: provider.name,
        displayName: provider.displayName,
        isLocal: modelRows
          .filter((model) => model.providerName === provider.name)
          .every((model) => model.isLocal === true),
      }));
    const models = modelRows.map((model) => ({
      modelName: model.id,
      providerName: model.providerName,
      displayName: model.name,
      modelType: model.modelType,
      isLocal: model.isLocal === true,
    }));

    this.logger.debug(
      `Resolved ${models.length} ${modelType ?? 'all'} model(s) across ${providers.length} provider(s)`,
    );

    return { providers, models };
  }
}
