/**
 * Forge API Service
 *
 * HTTP client for the Forge API (port 6200). Handles all communication
 * with complex LangGraph agent endpoints: marketing-swarm, legal-department,
 * cad-agent, risk-runner, predictor.
 *
 * Three-layer architecture:
 *   Component (view) → Store (Pinia) → THIS SERVICE (HTTP) → Forge API (port 6200)
 *
 * ExecutionContext is always passed whole — never constructed here.
 */
import axios, { type AxiosInstance } from 'axios';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// Forge API base URL — port 6200 in dev, proxied in prod
const FORGE_API_BASE_URL =
  import.meta.env.VITE_FORGE_API_URL ||
  `http://localhost:${import.meta.env.VITE_FORGE_API_PORT || '6200'}`;

class ForgeApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: FORGE_API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Attach auth token from storage on every request
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  // ─── Marketing Swarm ────────────────────────────────────────────────────────

  async startMarketingSwarm(prompt: string, context: ExecutionContext) {
    const response = await this.client.post('/marketing-swarm/run', {
      prompt,
      context,
    });
    return response.data;
  }

  async getMarketingSwarmTask(taskId: string, context: ExecutionContext) {
    const response = await this.client.get(`/marketing-swarm/tasks/${taskId}`, {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  async listMarketingSwarmTasks(context: ExecutionContext) {
    const response = await this.client.get('/marketing-swarm/tasks', {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  getMarketingSwarmStreamUrl(taskId: string): string {
    return `${FORGE_API_BASE_URL}/marketing-swarm/tasks/${taskId}/stream`;
  }

  // ─── Legal Department ───────────────────────────────────────────────────────

  async submitLegalRequest(
    request: string,
    documentContent: string | null,
    context: ExecutionContext,
  ) {
    const response = await this.client.post('/legal-department/analyze', {
      request,
      documentContent,
      context,
    });
    return response.data;
  }

  async getLegalTask(taskId: string, context: ExecutionContext) {
    const response = await this.client.get(`/legal-department/tasks/${taskId}`, {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  async approveLegalHitl(taskId: string, approved: boolean, context: ExecutionContext) {
    const response = await this.client.post(`/legal-department/tasks/${taskId}/hitl`, {
      approved,
      context,
    });
    return response.data;
  }

  getLegalStreamUrl(taskId: string): string {
    return `${FORGE_API_BASE_URL}/legal-department/tasks/${taskId}/stream`;
  }

  // ─── CAD Agent ──────────────────────────────────────────────────────────────

  async startCadGeneration(
    prompt: string,
    parameters: Record<string, unknown>,
    context: ExecutionContext,
  ) {
    const response = await this.client.post('/cad-agent/generate', {
      prompt,
      parameters,
      context,
    });
    return response.data;
  }

  async getCadTask(taskId: string, context: ExecutionContext) {
    const response = await this.client.get(`/cad-agent/tasks/${taskId}`, {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  getCadStreamUrl(taskId: string): string {
    return `${FORGE_API_BASE_URL}/cad-agent/tasks/${taskId}/stream`;
  }

  // ─── Risk Runner ─────────────────────────────────────────────────────────────

  async runRiskAnalysis(
    subject: string,
    dimensions: string[],
    context: ExecutionContext,
  ) {
    const response = await this.client.post('/risk-runner/analyze', {
      subject,
      dimensions,
      context,
    });
    return response.data;
  }

  async getRiskAnalysisTask(taskId: string, context: ExecutionContext) {
    const response = await this.client.get(`/risk-runner/tasks/${taskId}`, {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  getRiskStreamUrl(taskId: string): string {
    return `${FORGE_API_BASE_URL}/risk-runner/tasks/${taskId}/stream`;
  }

  // ─── Predictor ───────────────────────────────────────────────────────────────

  async runPrediction(
    instrument: string,
    parameters: Record<string, unknown>,
    context: ExecutionContext,
  ) {
    const response = await this.client.post('/predictor/run', {
      instrument,
      parameters,
      context,
    });
    return response.data;
  }

  async getPredictionTask(taskId: string, context: ExecutionContext) {
    const response = await this.client.get(`/predictor/tasks/${taskId}`, {
      params: { orgSlug: context.orgSlug },
    });
    return response.data;
  }

  getPredictorStreamUrl(taskId: string): string {
    return `${FORGE_API_BASE_URL}/predictor/tasks/${taskId}/stream`;
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  async health() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const forgeApiService = new ForgeApiService();
