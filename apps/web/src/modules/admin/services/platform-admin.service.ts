/**
 * Platform Admin Service
 * HTTP client for Admin-owned agent registry routes through the unified platform API.
 */
import axios, { AxiosError, AxiosInstance } from 'axios';

export interface AgentRegistryEntry {
  slug: string;
  name: string;
  description: string;
  agentType: string;
  product: string;
  orgSlug: string;
  config: Record<string, unknown>;
  /** The model the agent runs on, when it has one. */
  llmConfig: { provider: string; model: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentListApiResponse {
  agents: AgentRegistryEntry[];
  sources: string[];
}

/** A model from the catalog, as the model picker lists it. */
export interface CatalogModel {
  modelName: string;
  /** The service the call goes through (ExecutionContext.provider). */
  providerName: string;
  /** Who made the model; the picker groups by it. */
  vendor: string;
  displayName: string;
  modelType: string;
  isLocal: boolean;
  pricePerImage?: number;
  /** A video model's cheapest price per second. */
  pricePerSecond?: number;
}

export type CatalogModelType = 'text-generation' | 'image-generation' | 'video-generation';

export interface AgentDetail {
  agent: AgentRegistryEntry;
  source: string;
}

class PlatformAdminService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      config.headers['x-organization-slug'] = '*';
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new Event('auth:session-expired'));
        }
        return Promise.reject(error);
      },
    );
  }

  async getAgents(params?: { product?: string }): Promise<AgentRegistryEntry[]> {
    const res = await this.client.get<AgentListApiResponse>('/agents', { params });
    return res.data.agents;
  }

  async getAgentDetail(slug: string): Promise<AgentDetail> {
    const res = await this.client.get<AgentDetail>(`/agents/${slug}`);
    return res.data;
  }

  /** The catalog's active models of one type (served under /invoke, not /admin). */
  async getCatalogModels(modelType: CatalogModelType): Promise<CatalogModel[]> {
    const res = await this.client.get<{ models: CatalogModel[] }>('/invoke/providers-models', {
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
      params: { model_type: modelType },
    });
    return res.data.models;
  }

  /** Point an agent at a catalog model; the API refuses one that makes the wrong thing. */
  async setAgentModel(slug: string, provider: string, model: string): Promise<AgentRegistryEntry> {
    const res = await this.client.put<AgentRegistryEntry>(`/agents/${slug}/model`, { provider, model });
    return res.data;
  }

  /** Refresh the catalog from OpenRouter (an admin of every organization only). */
  async refreshModelCatalog(): Promise<{ models: number; vendors: string[]; deactivated: number }> {
    const res = await this.client.post<{ models: number; vendors: string[]; deactivated: number }>('/llm/models/sync');
    return res.data;
  }
}

/** What the API said went wrong, for a message on the page. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export const platformAdminService = new PlatformAdminService();
