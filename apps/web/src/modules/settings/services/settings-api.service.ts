/**
 * Settings API Service
 * HTTP client for settings-owned screens backed by admin-only API modules.
 */
import axios, { AxiosInstance, AxiosError } from 'axios';

// ===================== Types =====================

// LLM Analytics

export interface LlmUsageSummary {
  product: string;
  model: string;
  provider: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  periodStart: string;
  periodEnd: string;
}

export interface LlmUsageRow {
  id: string;
  /** llm_usage has no org_slug column yet — always null for now. */
  orgSlug: string | null;
  agentName: string | null;
  /** Parsed workflow slug (the part before the first colon, or the full agentName when no colon). */
  workflowSlug: string | null;
  /** Parsed node name (the part after the first colon; null when no colon present). */
  nodeName: string | null;
  providerName: string | null;
  modelName: string | null;
  conversationId: string | null;
  userId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  hasReasoning: boolean;
  thinkingDurationMs: number | null;
  thinkingTokenCount: number | null;
  createdAt: string;
}

export interface LlmUsageListFilters {
  orgSlug?: string;
  agentName?: string;
  provider?: string;
  model?: string;
  from?: string;
  to?: string;
  hasReasoning?: boolean;
  limit?: number;
  offset?: number;
}

export interface LlmUsageReasoning {
  thinkingContent: string;
  thinkingDurationMs: number | null;
  thinkingTokenCount: number | null;
}

export interface LlmModel {
  id: string;
  slug: string;
  provider: string;
  displayName: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  contextWindow: number;
  enabled: boolean;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface CreateLlmModelRequest {
  slug: string;
  provider: string;
  displayName: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  contextWindow: number;
  enabled: boolean;
}

export interface UpdateLlmModelRequest {
  displayName?: string;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  contextWindow?: number;
  enabled?: boolean;
}

export interface LlmCostEntry {
  product: string;
  orgSlug: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  date: string;
}

export interface LlmCostSummary {
  product: string;
  orgSlug: string;
  model: string;
  totalEstimatedCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// Observability

export interface ObservabilityEvent {
  id: string;
  eventType: string;
  product: string;
  orgSlug: string;
  userId: string | null;
  agentSlug: string | null;
  conversationId: string | null;
  severity: 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ObservabilityMetrics {
  totalEventsLast24h: number;
  errorCountLast24h: number;
  warnCountLast24h: number;
  topProducts: Array<{ product: string; eventCount: number }>;
  topErrorMessages: Array<{ message: string; count: number }>;
}

export interface ObservabilityEventsQuery {
  product?: string;
  severity?: 'info' | 'warn' | 'error';
  search?: string;
  limit?: number;
  offset?: number;
}

// Database

export interface DatabaseHealth {
  status: string;
  message: string;
  checkedAt: string;
}

export interface DatabaseConfig {
  provider: string;
  url: string;
  schemas: string[];
  clientsAvailable: { service: boolean; anon: boolean };
  checkedAt: string;
}

export interface DatabaseTable {
  schema: string;
  name: string;
  rowCount: number;
}

export interface DatabaseMigration {
  name: string;
  executedAt: string;
  success: boolean;
}

// ===================== Settings API Client =====================

class SettingsApiService {
  private client: AxiosInstance;

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

  // ===================== LLM Analytics =====================

  async getLlmUsage(params?: {
    product?: string;
    model?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LlmUsageSummary[]> {
    const res = await this.client.get<LlmUsageSummary[]>('/llm/usage', { params });
    return res.data;
  }

  async getLlmModels(): Promise<LlmModel[]> {
    const res = await this.client.get<LlmModel[]>('/llm/models');
    return res.data;
  }

  async createLlmModel(request: CreateLlmModelRequest): Promise<LlmModel> {
    const res = await this.client.post<LlmModel>('/llm/models', request);
    return res.data;
  }

  async updateLlmModel(
    provider: string,
    slug: string,
    request: UpdateLlmModelRequest,
  ): Promise<LlmModel> {
    const res = await this.client.patch<LlmModel>(
      `/llm/models/${encodeURIComponent(provider)}/${encodeURIComponent(slug)}`,
      request,
    );
    return res.data;
  }

  async listLlmUsage(filters?: LlmUsageListFilters): Promise<LlmUsageRow[]> {
    const res = await this.client.get<LlmUsageRow[]>('/llm/usage/list', { params: filters });
    return res.data;
  }

  async getLlmUsageReasoning(id: string): Promise<LlmUsageReasoning> {
    const res = await this.client.get<LlmUsageReasoning>(`/llm/usage/${encodeURIComponent(id)}/reasoning`);
    return res.data;
  }

  async getLlmCosts(params?: {
    product?: string;
    orgSlug?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LlmCostSummary[]> {
    const res = await this.client.get<LlmCostSummary[]>('/llm/costs', { params });
    return res.data;
  }

  // ===================== Observability =====================

  async getObservabilityMetrics(): Promise<ObservabilityMetrics> {
    const res = await this.client.get<ObservabilityMetrics>('/observability/metrics');
    return res.data;
  }

  async getObservabilityEvents(query?: ObservabilityEventsQuery): Promise<ObservabilityEvent[]> {
    const res = await this.client.get<ObservabilityEvent[]>('/observability/events', {
      params: query,
    });
    return res.data;
  }

  // ===================== Database =====================

  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const res = await this.client.get<DatabaseHealth>('/database/health');
    return res.data;
  }

  async getDatabaseConfig(): Promise<DatabaseConfig> {
    const res = await this.client.get<DatabaseConfig>('/database/config');
    return res.data;
  }

  async getDatabaseTables(): Promise<{ tables: DatabaseTable[]; totalCount: number }> {
    const res = await this.client.get<{ tables: DatabaseTable[]; totalCount: number }>(
      '/database/tables',
    );
    return res.data;
  }

  async getDatabaseMigrations(): Promise<{ migrations: DatabaseMigration[] }> {
    const res = await this.client.get<{ migrations: DatabaseMigration[] }>(
      '/database/migrations',
    );
    return res.data;
  }

}

export const settingsApiService = new SettingsApiService();
