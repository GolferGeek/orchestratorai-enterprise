/**
 * LLM Service
 *
 * Fetches available providers and models from the LLM provider plane.
 * Used for populating provider/model selection dropdowns in the UI.
 */

import { apiService } from './apiService';

export interface LLMProvider {
  name: string;
  displayName: string;
  status: string;
}

/** Model info from the LLM provider plane. */
export interface LLMModel {
  /** Model identifier (e.g. "claude-sonnet-4.5") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Provider that serves this model (e.g. "anthropic") */
  providerName: string;
  modelType: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  isLocal?: boolean;
}

/** API response shape — the plane returns these field names */
interface LLMModelApiResponse {
  id: string;
  name: string;
  providerName: string;
  modelType: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  isLocal?: boolean;
}

class LLMService {
  /**
   * Get all active LLM providers from the provider plane.
   */
  async getProviders(): Promise<LLMProvider[]> {
    return apiService.get<LLMProvider[]>('/llm/providers');
  }

  /**
   * Get models from the provider plane, optionally filtered.
   *
   * @param options.provider - Filter by provider name
   * @param options.names    - Comma-separated model ID substrings to match
   */
  async getModels(options?: { provider?: string; names?: string }): Promise<LLMModel[]> {
    const params = new URLSearchParams();
    if (options?.provider) params.set('provider', options.provider);
    if (options?.names) params.set('names', options.names);
    const query = params.toString();
    const url = query ? `/llm/models?${query}` : '/llm/models';
    const raw = await apiService.get<LLMModelApiResponse[]>(url);
    return raw.map((m) => ({
      id: m.id,
      name: m.name,
      providerName: m.providerName,
      modelType: m.modelType,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      isLocal: m.isLocal,
    }));
  }
}

// Export singleton instance
export const llmService = new LLMService();

export default llmService;
