/**
 * LLM Service
 *
 * Fetches available LLM providers and models from the Forge API.
 * Used by agent dashboard configuration forms (marketing-swarm, cad-agent, legal-department, etc.)
 */
import { authenticatedFetch } from './utils/authenticatedFetch';

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

class LLMService {
  async getProviders(): Promise<LLMProvider[]> {
    const response = await authenticatedFetch('/llm/providers');
    if (!response.ok) {
      throw new Error(`Failed to fetch LLM providers: ${response.status}`);
    }
    const data = await response.json();
    // Map API response shape to frontend interface
    return data.map((p: { name: string; displayName: string; status: string }) => ({
      id: p.name,
      name: p.name,
      displayName: p.displayName,
      isActive: p.status === 'active',
    }));
  }

  async getModels(providerId?: string): Promise<LLMModel[]> {
    const params = providerId ? `?providerId=${providerId}` : '';
    const response = await authenticatedFetch(`/llm/models${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch LLM models: ${response.status}`);
    }
    const data = await response.json();
    // Map API response shape to frontend interface
    return data.map((m: { id: string; name: string; providerName: string; modelType: string; contextWindow?: number; capabilities?: string[]; isLocal?: boolean }) => ({
      id: m.id || m.name,
      name: m.name,
      displayName: m.name,
      providerId: m.providerName,
      providerName: m.providerName,
      contextWindow: m.contextWindow,
      isActive: true,
      isLocal: m.isLocal ?? m.providerName === 'ollama',
      capabilities: m.capabilities,
    }));
  }
}

export const llmService = new LLMService();
