/**
 * Providers Models Service
 *
 * Queries the llm_providers and llm_models tables and returns
 * active providers and models, optionally filtered by model_type.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@orchestrator-ai/transport-types';

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

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async fetchProvidersAndModels(
    modelType?: string,
  ): Promise<ProvidersModelsResponse> {
    // Query active models, optionally filtered by model_type
    let modelsQuery = this.db
      .from(null, 'llm_models')
      .select('model_name,provider_name,display_name,model_type,is_local')
      .eq('is_active', true);

    if (modelType) {
      modelsQuery = modelsQuery.eq('model_type', modelType);
    }

    const modelsResult: { data: unknown; error: unknown } = await modelsQuery;

    if (modelsResult.error) {
      this.logger.error(
        `Failed to fetch llm_models: ${JSON.stringify(modelsResult.error)}`,
      );
      throw new Error('Failed to fetch LLM models from database');
    }

    const modelRows = (
      Array.isArray(modelsResult.data) ? modelsResult.data : []
    ) as ModelRow[];

    // Collect the provider names present in the model results
    const activeProviderNames = new Set(modelRows.map((m) => m.provider_name));

    // Query active providers
    const providersResult: { data: unknown; error: unknown } = await this.db
      .from(null, 'llm_providers')
      .select('name,display_name,is_local')
      .eq('is_active', true);

    if (providersResult.error) {
      this.logger.error(
        `Failed to fetch llm_providers: ${JSON.stringify(providersResult.error)}`,
      );
      throw new Error('Failed to fetch LLM providers from database');
    }

    const providerRows = (
      Array.isArray(providersResult.data) ? providersResult.data : []
    ) as ProviderRow[];

    // Only return providers that have at least one model in the result set
    const providers: LLMProviderDto[] = providerRows
      .filter((p) => activeProviderNames.has(p.name))
      .map((p) => ({
        name: p.name,
        displayName: p.display_name,
        isLocal: p.is_local,
      }));

    const models: LLMModelDto[] = modelRows.map((m) => ({
      modelName: m.model_name,
      providerName: m.provider_name,
      displayName: m.display_name,
      modelType: m.model_type,
      isLocal: m.is_local,
    }));

    return { providers, models };
  }
}
