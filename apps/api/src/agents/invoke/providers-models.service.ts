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
  /**
   * What the "pick your provider" dropdown lists. This is the VENDOR
   * (anthropic, openai, google), not the service we route through — going
   * through OpenRouter, every model would otherwise collapse into one entry
   * and the dropdown would be useless.
   */
  name: string;
  displayName: string;
  isLocal: boolean;
}

export interface LLMModelDto {
  modelName: string;
  /**
   * The SERVICE to route through. This is what the caller must put in
   * ExecutionContext.provider — not the vendor below. For an OpenRouter model
   * it is 'openrouter', and the model id alone is enough to reach the vendor.
   */
  providerName: string;
  /** Who made the model. Groups this row under a provider in the picker. */
  vendor: string;
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

    // The provider dropdown is derived from the models themselves, grouped by
    // vendor. Deriving it means it can never list a provider with nothing
    // behind it, and a newly synced vendor appears without anyone registering
    // it anywhere.
    //
    // Falls back to the routing service when a model has no vendor recorded —
    // locally hosted models predate the distinction and are their own vendor
    // for practical purposes.
    const vendorOf = (model: (typeof modelRows)[number]): string =>
      model.vendor?.trim() || model.providerName;

    const vendors = [...new Set(modelRows.map(vendorOf))].sort();
    const providers = vendors.map((vendor) => ({
      name: vendor,
      displayName: this.displayNameFor(vendor),
      isLocal: modelRows
        .filter((model) => vendorOf(model) === vendor)
        .every((model) => model.isLocal === true),
    }));

    const models = modelRows.map((model) => ({
      modelName: model.id,
      // Routing key — goes into ExecutionContext.provider.
      providerName: model.providerName,
      // Grouping key — matches a provider entry above.
      vendor: vendorOf(model),
      displayName: model.name,
      modelType: model.modelType,
      isLocal: model.isLocal === true,
    }));

    this.logger.debug(
      `Resolved ${models.length} ${modelType ?? 'all'} model(s) across ${providers.length} vendor(s)`,
    );

    return { providers, models };
  }

  /** Vendors whose display name is not simply the slug title-cased. */
  private static readonly VENDOR_DISPLAY_NAMES: Record<string, string> = {
    openai: 'OpenAI',
    xai: 'xAI',
    ai21: 'AI21',
    deepseek: 'DeepSeek',
    mistralai: 'Mistral AI',
    'meta-llama': 'Meta',
    nvidia: 'NVIDIA',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
  };

  private displayNameFor(vendor: string): string {
    return (
      ProvidersModelsService.VENDOR_DISPLAY_NAMES[vendor.toLowerCase()] ??
      vendor.charAt(0).toUpperCase() + vendor.slice(1)
    );
  }
}
