/**
 * Admin API Service
 * HTTP client for ALL Admin API calls (port 6150).
 * Handles LLM analytics, RAG management, agent registry, observability, and system health.
 *
 * Architecture: Admin Web -> admin-api.service.ts (HTTP) -> Admin API (port 6150) -> Supabase
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { tokenStorage } from './tokenStorageService';

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

// RAG Management

export interface RagCollection {
  id: string;
  name: string;
  description?: string;
  orgSlug: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRagCollectionRequest {
  name: string;
  description?: string;
  orgSlug: string;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  createdAt: string;
}

// Agent Registry

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

// Crawler

export interface CrawlerStats {
  totalSources: number;
  activeSources: number;
  totalArticles: number;
  totalDedup: { exact: number; crossSource: number; fuzzyTitle: number; phraseOverlap: number };
}

export interface CrawlerSource {
  id: string;
  name: string;
  description: string | null;
  url: string;
  sourceType: string;
  crawlFrequencyMinutes: number;
  isActive: boolean;
  isTest: boolean;
  lastCrawlAt: string | null;
  lastCrawlStatus: string | null;
  articleCount: number;
  createdAt: string;
}

export interface CrawlerArticle {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  isDuplicate: boolean;
}

export interface SourceCrawl {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  articlesFound: number;
  articlesNew: number;
  duplicatesExact: number;
  errorMessage: string | null;
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

// System Health

export interface ProductHealthStatus {
  product: string;
  displayName: string;
  apiPort: number | null;
  webPort: number | null;
  apiStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  webStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastCheckedAt: string;
  responseTimeMs: number | null;
  message: string | null;
}

export interface SystemHealthReport {
  checkedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'down';
  products: ProductHealthStatus[];
}

// ===================== Admin API Client =====================

class AdminApiService {
  private client: AxiosInstance;

  constructor() {
    // Requests proxy through Vite dev server via /admin-api prefix to Admin API on port 6150
    this.client = axios.create({
      baseURL: '/admin-api',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const token = tokenStorage.getAccessTokenSync();
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

  async getLlmCosts(params?: {
    product?: string;
    orgSlug?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LlmCostSummary[]> {
    const res = await this.client.get<LlmCostSummary[]>('/llm/costs', { params });
    return res.data;
  }

  // ===================== RAG Management =====================

  async getRagCollections(orgSlug?: string): Promise<RagCollection[]> {
    const params = orgSlug ? { orgSlug } : {};
    const res = await this.client.get<RagCollection[]>('/rag/collections', { params });
    return res.data;
  }

  async createRagCollection(request: CreateRagCollectionRequest): Promise<RagCollection> {
    const res = await this.client.post<RagCollection>('/rag/collections', request);
    return res.data;
  }

  async deleteRagCollection(id: string): Promise<void> {
    await this.client.delete(`/rag/collections/${id}`);
  }

  async getRagCollectionDocuments(collectionId: string): Promise<RagDocument[]> {
    const res = await this.client.get<RagDocument[]>(`/rag/collections/${collectionId}/documents`);
    return res.data;
  }

  async uploadRagDocument(collectionId: string, file: File): Promise<RagDocument> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await this.client.post<RagDocument>(
      `/rag/collections/${collectionId}/documents`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  }

  async deleteRagDocument(collectionId: string, documentId: string): Promise<void> {
    await this.client.delete(`/rag/collections/${collectionId}/documents/${documentId}`);
  }

  // ===================== Agent Registry =====================

  async getAgents(params?: { product?: string }): Promise<AgentRegistryEntry[]> {
    const res = await this.client.get<AgentListApiResponse>('/agents', { params });
    return res.data.agents;
  }

  async getAgentDetail(slug: string): Promise<AgentDetail> {
    const res = await this.client.get<AgentDetail>(`/agents/${slug}`);
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

  // ===================== Crawler =====================

  async getCrawlerStats(): Promise<CrawlerStats> {
    const res = await this.client.get<CrawlerStats>('/crawler/stats');
    return res.data;
  }

  async getCrawlerSources(includeInactive?: boolean): Promise<CrawlerSource[]> {
    const res = await this.client.get<CrawlerSource[]>('/crawler/sources', {
      params: includeInactive !== undefined ? { includeInactive } : {},
    });
    return res.data;
  }

  async getCrawlerSource(id: string): Promise<CrawlerSource> {
    const res = await this.client.get<CrawlerSource>(`/crawler/sources/${id}`);
    return res.data;
  }

  async createCrawlerSource(data: Partial<CrawlerSource>): Promise<CrawlerSource> {
    const res = await this.client.post<CrawlerSource>('/crawler/sources', data);
    return res.data;
  }

  async updateCrawlerSource(id: string, data: Partial<CrawlerSource>): Promise<CrawlerSource> {
    const res = await this.client.patch<CrawlerSource>(`/crawler/sources/${id}`, data);
    return res.data;
  }

  async deleteCrawlerSource(id: string): Promise<void> {
    await this.client.delete(`/crawler/sources/${id}`);
  }

  async getCrawlerSourceCrawls(id: string, limit?: number): Promise<SourceCrawl[]> {
    const res = await this.client.get<SourceCrawl[]>(`/crawler/sources/${id}/crawls`, {
      params: limit !== undefined ? { limit } : {},
    });
    return res.data;
  }

  async getCrawlerSourceArticles(
    id: string,
    params?: { limit?: number; since?: string },
  ): Promise<CrawlerArticle[]> {
    const res = await this.client.get<CrawlerArticle[]>(`/crawler/sources/${id}/articles`, {
      params,
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

  // ===================== System Health =====================

  async getSystemHealth(): Promise<SystemHealthReport> {
    const res = await this.client.get<SystemHealthReport>('/system/health');
    return res.data;
  }
}

export const adminApiService = new AdminApiService();
