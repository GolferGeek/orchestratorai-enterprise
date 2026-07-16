/**
 * Admin API Service
 * HTTP client for Admin-owned agent registry calls through the unified platform API.
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
  createdAt: string;
  updatedAt: string;
}

interface AgentListApiResponse {
  agents: AgentRegistryEntry[];
  sources: string[];
}

export interface AgentDetail {
  agent: AgentRegistryEntry;
  source: string;
}

class AdminApiService {
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
}

export const adminApiService = new AdminApiService();
