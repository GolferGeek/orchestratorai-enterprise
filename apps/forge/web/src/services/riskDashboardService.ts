/**
 * Risk Dashboard A2A Service
 *
 * Handles A2A dashboard mode calls for the risk analysis system.
 * Uses dashboard mode to fetch and manage risk entities.
 *
 * IMPORTANT: This service uses A2A dashboard mode, NOT REST endpoints.
 * All data access is through POST /invoke (invoke contract)
 */

import { useAuthStore } from '@/stores/rbacStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useLLMPreferencesStore } from '@/stores/llmPreferencesStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  RiskScope,
  RiskSubject,
  RiskDimension,
  RiskDimensionContext,
  RiskAssessment,
  RiskCompositeScore,
  ActiveCompositeScoreView,
  RiskDebate,
  RiskDebateContext,
  RiskAlert,
  UnacknowledgedAlertView,
  RiskLearning,
  PendingLearningView,
  RiskEvaluation,
  DashboardStats,
  DashboardActionResponse,
  AnalyzeSubjectResponse,
  CreateSubjectRequest,
  UpdateSubjectRequest,
  // Feature 1: Score History
  ScoreHistoryEntry,
  ScoreTrend,
  // Feature 2: Subject Comparison
  SubjectComparison,
  ComparisonSet,
  // Feature 4: Heatmap
  HeatmapData,
  // Feature 5: Executive Summary
  ExecutiveSummary,
  // Feature 6: Portfolio Aggregate
  PortfolioAggregate,
  RiskDistribution,
  DimensionContribution,
  // Feature 7: Correlation
  CorrelationMatrix,
  // Feature 8: PDF Reports
  Report,
  ReportConfig,
  // Feature 9: Scenario Analysis
  Scenario,
  ScenarioResult,
  // Feature 10: Monte Carlo Simulation
  Simulation,
  SimulationParameters,
  DimensionDistribution,
  // Feature 11: Live Data Integration
  DataSource,
  DataSourceType,
  DataSourceStatus,
  FetchHistoryRecord,
  FetchResult,
  DataSourceHealthSummary,
  DimensionMapping,
  DataSourceSubjectFilter,
  SourceConfig,
} from '@/types/risk-agent';

const API_BASE_URL = getSecureApiBaseUrl();

// Default agent slug for risk analysis
const DEFAULT_AGENT_SLUG = 'investment-risk-agent';

// ============================================================================
// DASHBOARD REQUEST/RESPONSE PAYLOAD TYPES
// ============================================================================

interface DashboardRequestPayload {
  action: string;
  params?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  pagination?: { page?: number; pageSize?: number };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class RiskDashboardService {
  private currentAgentSlug: string = DEFAULT_AGENT_SLUG;
  private currentOrgSlug: string | null = null;
  private authStore: ReturnType<typeof useAuthStore> | null = null;
  // Dashboard conversation ID - set once per session to avoid creating multiple conversations
  private dashboardConversationId: string | null = null;

  /**
   * Set the agent slug for dashboard requests
   * Call this before making dashboard requests when switching agents
   */
  setAgentSlug(agentSlug: string): void {
    this.currentAgentSlug = agentSlug;
  }

  /**
   * Set the organization slug for dashboard requests
   * Call this to override the organization from URL query params
   */
  setOrgSlug(orgSlug: string | null): void {
    this.currentOrgSlug = orgSlug;
  }

  /**
   * Set the dashboard conversation ID for this session
   * This prevents creating multiple conversations for parallel dashboard calls
   * Call this once when the dashboard mounts
   */
  setDashboardConversationId(conversationId: string): void {
    this.dashboardConversationId = conversationId;
  }

  /**
   * Get or generate a dashboard conversation ID
   * Returns existing ID if set, otherwise generates a new one
   */
  getDashboardConversationId(): string {
    if (!this.dashboardConversationId) {
      this.dashboardConversationId = crypto.randomUUID();
    }
    return this.dashboardConversationId;
  }

  /**
   * Reset the dashboard conversation ID (e.g., when switching agents)
   */
  resetDashboardConversationId(): void {
    this.dashboardConversationId = null;
  }

  /**
   * Get the current agent slug, falling back to default
   */
  private getAgentSlug(): string {
    return this.currentAgentSlug || DEFAULT_AGENT_SLUG;
  }

  private getAuthStore(): ReturnType<typeof useAuthStore> {
    if (!this.authStore) {
      this.authStore = useAuthStore();
    }
    return this.authStore;
  }

  private getOrgSlug(): string {
    // Priority: explicit org slug > auth store current org
    // Explicit org slug is set when viewing an agent from a specific org (e.g., super-user)
    if (this.currentOrgSlug && this.currentOrgSlug !== '*') {
      return this.currentOrgSlug;
    }

    const authOrg = this.getAuthStore().currentOrganization;
    if (authOrg && authOrg !== '*') {
      return authOrg;
    }

    // Default org for finance dashboards
    return 'finance';
  }

  private getAuthHeaders(): Record<string, string> {
    const token = this.getAuthStore().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getContext(taskIdOverride?: string): ExecutionContext {
    const contextStore = useExecutionContextStore();
    const llmStore = useLLMPreferencesStore();
    const authStore = this.getAuthStore();

    // Always build a dashboard-specific context with the correct agent slug.
    // Do NOT inherit from executionContextStore — it may hold a stale context
    // from a previous conversation (e.g., Legal Department), causing the API
    // to route dashboard requests to the wrong agent.
    const orgSlug = this.getOrgSlug();
    const userId = authStore.user?.id || '';

    // Get provider/model from multiple sources in priority order:
    // 1. Execution context store (if initialized)
    // 2. LLM preferences store (set via LLM selector modal)
    // 3. Hardcoded defaults
    const provider =
      contextStore.contextOrNull?.provider ||
      llmStore.selectedProvider ||
      'ollama';
    const model =
      contextStore.contextOrNull?.model ||
      llmStore.selectedModel ||
      'qwen3:8b';

    // Use the dashboard conversation ID to avoid creating multiple conversations per session
    return {
      orgSlug,
      userId,
      conversationId: this.getDashboardConversationId(),
      taskId: taskIdOverride || crypto.randomUUID(),
      planId: '00000000-0000-0000-0000-000000000000',
      deliverableId: '00000000-0000-0000-0000-000000000000',
      // agentSlug must match the registered capability name for invoke routing
      agentSlug: 'risk-runner',
      agentType: 'risk',
      provider,
      model,
    };
  }

  private async executeDashboardRequest<T>(
    action: string,
    params?: Record<string, unknown>,
    filters?: Record<string, unknown>,
    pagination?: { page?: number; pageSize?: number }
  ): Promise<DashboardActionResponse<T>> {
    const endpoint = `${API_BASE_URL}/invoke`;

    const payload: DashboardRequestPayload = {
      action,
      params,
      filters,
      pagination,
    };

    const request = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'invoke',
      params: {
        context: this.getContext(),
        data: {
          content: {
            mode: 'dashboard',
            action,
            payload,
          },
        },
      },
    };

    // Use AbortController with 30 minute timeout for long-running analysis (12 dimensions @ ~2min each)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 minutes

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData?.error?.message || errorData?.message || response.statusText;
      throw new Error(message);
    }

    const data = await response.json();

    console.log('[RiskDashboardService] Raw API response for', action, ':', JSON.stringify(data).substring(0, 500));

    if (data.error) {
      throw new Error(data.error.message || 'Dashboard request failed');
    }

    // API returns JSON-RPC: { jsonrpc, id, result: { success, output: { content, outputType }, context } }
    // Risk-runner capability returns output.content = { status, response } — the list data is in response
    // Handle both risk-runner format (result.output.content.response) and legacy (result.payload.content)
    const rawResult = data.result;
    const outputContent = rawResult?.output?.content;
    const responsePayload = outputContent?.response ?? outputContent ?? data.payload ?? rawResult?.payload ?? rawResult ?? {};
    // For risk-runner: output.content.response is the actual data (array of scopes/subjects/dimensions)
    // For legacy: responsePayload.content holds the data
    const content = outputContent?.response ?? responsePayload?.content ?? null;
    console.log('[RiskDashboardService] Extracted payload for', action, ':', JSON.stringify(responsePayload).substring(0, 500));
    return {
      success: data.success ?? data.result?.success ?? true,
      content,
      metadata: responsePayload?.metadata ?? outputContent?.metadata ?? null,
    };
  }

  // ==========================================================================
  // SCOPE OPERATIONS
  // ==========================================================================

  async listScopes(filters?: { isActive?: boolean }): Promise<DashboardActionResponse<RiskScope[]>> {
    return this.executeDashboardRequest<RiskScope[]>('scopes.list', undefined, filters);
  }

  async getScope(id: string): Promise<DashboardActionResponse<RiskScope>> {
    return this.executeDashboardRequest<RiskScope>('scopes.get', { id });
  }

  async createScope(params: {
    name: string;
    domain: string;
    description?: string;
    llmConfig?: Record<string, unknown>;
    thresholdConfig?: Record<string, unknown>;
    analysisConfig?: Record<string, unknown>;
  }): Promise<DashboardActionResponse<RiskScope>> {
    return this.executeDashboardRequest<RiskScope>('scopes.create', params);
  }

  async updateScope(
    id: string,
    params: Partial<{
      name: string;
      description: string;
      llmConfig: Record<string, unknown>;
      thresholdConfig: Record<string, unknown>;
      analysisConfig: Record<string, unknown>;
      isActive: boolean;
    }>
  ): Promise<DashboardActionResponse<RiskScope>> {
    return this.executeDashboardRequest<RiskScope>('scopes.update', { id, ...params });
  }

  async deleteScope(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('scopes.delete', { id });
  }

  // ==========================================================================
  // SUBJECT OPERATIONS
  // ==========================================================================

  async listSubjects(filters?: {
    scopeId?: string;
    subjectType?: string;
    isActive?: boolean;
  }): Promise<DashboardActionResponse<RiskSubject[]>> {
    // scopeId must be passed in params for the backend to receive it
    const params = filters?.scopeId ? { scopeId: filters.scopeId } : undefined;
    const remainingFilters = filters ? { subjectType: filters.subjectType, isActive: filters.isActive } : undefined;
    return this.executeDashboardRequest<RiskSubject[]>('subjects.list', params, remainingFilters);
  }

  async getSubject(id: string): Promise<DashboardActionResponse<RiskSubject>> {
    return this.executeDashboardRequest<RiskSubject>('subjects.get', { id });
  }

  async createSubject(params: CreateSubjectRequest): Promise<DashboardActionResponse<RiskSubject>> {
    return this.executeDashboardRequest<RiskSubject>('subjects.create', params as unknown as Record<string, unknown>);
  }

  async updateSubject(
    id: string,
    params: UpdateSubjectRequest
  ): Promise<DashboardActionResponse<RiskSubject>> {
    return this.executeDashboardRequest<RiskSubject>('subjects.update', { id, ...params });
  }

  async deleteSubject(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('subjects.delete', { id });
  }

  // ==========================================================================
  // DIMENSION OPERATIONS
  // ==========================================================================

  async listDimensions(scopeId: string): Promise<DashboardActionResponse<RiskDimension[]>> {
    return this.executeDashboardRequest<RiskDimension[]>('dimensions.list', { scopeId });
  }

  async getDimension(id: string): Promise<DashboardActionResponse<RiskDimension>> {
    return this.executeDashboardRequest<RiskDimension>('dimensions.get', { id });
  }

  async createDimension(params: {
    scopeId: string;
    slug: string;
    name: string;
    description?: string;
    weight: number;
  }): Promise<DashboardActionResponse<RiskDimension>> {
    return this.executeDashboardRequest<RiskDimension>('dimensions.create', params);
  }

  async updateDimension(
    id: string,
    params: Partial<{
      name: string;
      displayName: string;
      description: string;
      weight: number;
      displayOrder: number;
      icon: string;
      color: string;
      isActive: boolean;
    }>
  ): Promise<DashboardActionResponse<RiskDimension>> {
    return this.executeDashboardRequest<RiskDimension>('dimensions.update', { id, ...params });
  }

  async deleteDimension(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('dimensions.delete', { id });
  }

  // ==========================================================================
  // DIMENSION CONTEXT OPERATIONS
  // ==========================================================================

  async listDimensionContexts(dimensionId: string): Promise<DashboardActionResponse<RiskDimensionContext[]>> {
    return this.executeDashboardRequest<RiskDimensionContext[]>('dimension-contexts.list', { dimensionId });
  }

  async getActiveDimensionContext(dimensionId: string): Promise<DashboardActionResponse<RiskDimensionContext>> {
    return this.executeDashboardRequest<RiskDimensionContext>('dimension-contexts.get-active', { dimensionId });
  }

  async createDimensionContext(params: {
    dimensionId: string;
    analysisPrompt: string;
    outputSchema?: Record<string, unknown>;
    examples?: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }>;
  }): Promise<DashboardActionResponse<RiskDimensionContext>> {
    return this.executeDashboardRequest<RiskDimensionContext>('dimension-contexts.create', params);
  }

  // ==========================================================================
  // COMPOSITE SCORE OPERATIONS
  // ==========================================================================

  async listCompositeScores(filters?: {
    scopeId?: string;
    minScore?: number;
    maxScore?: number;
  }): Promise<DashboardActionResponse<ActiveCompositeScoreView[]>> {
    return this.executeDashboardRequest<ActiveCompositeScoreView[]>('composite-scores.list', undefined, filters);
  }

  async getCompositeScore(id: string): Promise<DashboardActionResponse<RiskCompositeScore>> {
    return this.executeDashboardRequest<RiskCompositeScore>('composite-scores.get', { id });
  }

  async getCompositeScoreBySubject(subjectId: string): Promise<DashboardActionResponse<RiskCompositeScore>> {
    return this.executeDashboardRequest<RiskCompositeScore>('composite-scores.get-by-subject', { subjectId });
  }

  async getCompositeScoreHistory(
    subjectId: string,
    pagination?: { page?: number; pageSize?: number }
  ): Promise<DashboardActionResponse<RiskCompositeScore[]>> {
    return this.executeDashboardRequest<RiskCompositeScore[]>(
      'composite-scores.history',
      { subjectId },
      undefined,
      pagination
    );
  }

  // ==========================================================================
  // ASSESSMENT OPERATIONS
  // ==========================================================================

  async listAssessments(filters?: {
    subjectId?: string;
    dimensionId?: string;
  }): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.executeDashboardRequest<RiskAssessment[]>('assessments.list', undefined, filters);
  }

  async getAssessment(id: string): Promise<DashboardActionResponse<RiskAssessment>> {
    return this.executeDashboardRequest<RiskAssessment>('assessments.get', { id });
  }

  async getAssessmentsBySubject(subjectId: string): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.executeDashboardRequest<RiskAssessment[]>('assessments.get-by-subject', { subjectId });
  }

  async getAssessmentsByTask(taskId: string): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.executeDashboardRequest<RiskAssessment[]>('assessments.get-by-task', { taskId });
  }

  // ==========================================================================
  // DEBATE OPERATIONS
  // ==========================================================================

  async listDebates(subjectId: string): Promise<DashboardActionResponse<RiskDebate[]>> {
    return this.executeDashboardRequest<RiskDebate[]>('debates.list', { subjectId });
  }

  async getDebate(id: string): Promise<DashboardActionResponse<RiskDebate>> {
    return this.executeDashboardRequest<RiskDebate>('debates.get', { id });
  }

  async getLatestDebate(subjectId: string): Promise<DashboardActionResponse<RiskDebate>> {
    return this.executeDashboardRequest<RiskDebate>('debates.get-latest', { subjectId });
  }

  async triggerDebate(
    subjectId: string,
    options?: { taskId?: string }
  ): Promise<DashboardActionResponse<RiskDebate>> {
    // Use the context-aware method to pass taskId for SSE progress tracking
    return this.executeDashboardRequestWithContext<RiskDebate>(
      'debates.trigger',
      { subjectId },
      options?.taskId,
    );
  }

  // ==========================================================================
  // DEBATE CONTEXT OPERATIONS
  // ==========================================================================

  async listDebateContexts(scopeId: string): Promise<DashboardActionResponse<RiskDebateContext[]>> {
    return this.executeDashboardRequest<RiskDebateContext[]>('debates.contexts.list', { scopeId });
  }

  async getDebateContext(scopeId: string, role: 'blue' | 'red' | 'arbiter'): Promise<DashboardActionResponse<RiskDebateContext>> {
    return this.executeDashboardRequest<RiskDebateContext>('debates.contexts.get', { scopeId, role });
  }

  async createDebateContext(params: {
    scopeId: string;
    role: 'blue' | 'red' | 'arbiter';
    systemPrompt: string;
    outputSchema?: Record<string, unknown>;
    isActive?: boolean;
  }): Promise<DashboardActionResponse<RiskDebateContext>> {
    return this.executeDashboardRequest<RiskDebateContext>('debates.contexts.create', params);
  }

  async updateDebateContext(
    id: string,
    params: { systemPrompt?: string; outputSchema?: Record<string, unknown>; isActive?: boolean }
  ): Promise<DashboardActionResponse<RiskDebateContext>> {
    return this.executeDashboardRequest<RiskDebateContext>('debates.contexts.update', { id, ...params });
  }

  // ==========================================================================
  // ALERT OPERATIONS
  // ==========================================================================

  async listAlerts(filters?: {
    scopeId?: string;
    subjectId?: string;
    severity?: 'info' | 'warning' | 'critical';
    unacknowledgedOnly?: boolean;
  }): Promise<DashboardActionResponse<UnacknowledgedAlertView[]>> {
    return this.executeDashboardRequest<UnacknowledgedAlertView[]>('alerts.list', undefined, filters);
  }

  async getAlert(id: string): Promise<DashboardActionResponse<RiskAlert>> {
    return this.executeDashboardRequest<RiskAlert>('alerts.get', { id });
  }

  async acknowledgeAlert(id: string, notes?: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('alerts.acknowledge', { id, notes });
  }

  async getAlertCounts(): Promise<DashboardActionResponse<{ critical: number; warning: number; info: number }>> {
    return this.executeDashboardRequest<{ critical: number; warning: number; info: number }>('alerts.counts');
  }

  async getAlertWithContext(alertId: string): Promise<DashboardActionResponse<{
    alert: RiskAlert;
    context: {
      assessment?: {
        dimension_slug: string;
        dimension_name: string;
        score: number;
        confidence: number;
        reasoning?: string;
        signals?: Array<{ description: string; impact: string }>;
        evidence?: string;
      };
      previousAssessment?: {
        score: number;
        reasoning?: string;
        signals?: Array<{ description: string; impact: string }>;
      };
    };
  }>> {
    return this.executeDashboardRequest('alerts.getWithContext', { alertId });
  }

  // ==========================================================================
  // LEARNING OPERATIONS
  // ==========================================================================

  async listLearnings(filters?: {
    scopeId?: string;
    dimensionId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'applied';
  }): Promise<DashboardActionResponse<PendingLearningView[]>> {
    return this.executeDashboardRequest<PendingLearningView[]>('learnings.list', undefined, filters);
  }

  async getLearning(id: string): Promise<DashboardActionResponse<RiskLearning>> {
    return this.executeDashboardRequest<RiskLearning>('learnings.get', { id });
  }

  async approveLearning(id: string, notes?: string): Promise<DashboardActionResponse<RiskLearning>> {
    return this.executeDashboardRequest<RiskLearning>('learnings.approve', { id, notes });
  }

  async rejectLearning(id: string, notes?: string): Promise<DashboardActionResponse<RiskLearning>> {
    return this.executeDashboardRequest<RiskLearning>('learnings.reject', { id, notes });
  }

  async applyLearning(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('learnings.apply', { id });
  }

  // ==========================================================================
  // EVALUATION OPERATIONS
  // ==========================================================================

  async listEvaluations(subjectId: string): Promise<DashboardActionResponse<RiskEvaluation[]>> {
    return this.executeDashboardRequest<RiskEvaluation[]>('evaluations.list', { subjectId });
  }

  async getEvaluation(id: string): Promise<DashboardActionResponse<RiskEvaluation>> {
    return this.executeDashboardRequest<RiskEvaluation>('evaluations.get', { id });
  }

  async createEvaluation(params: {
    subjectId: string;
    compositeScoreId: string;
    evaluationWindow: string;
    actualOutcome: {
      timestamp: string;
      value: number | string;
      source?: string;
      notes?: string;
    };
  }): Promise<DashboardActionResponse<RiskEvaluation>> {
    return this.executeDashboardRequest<RiskEvaluation>('evaluations.create', params);
  }

  // ==========================================================================
  // ANALYSIS OPERATIONS
  // ==========================================================================

  async analyzeSubject(
    subjectId: string,
    options?: { forceRefresh?: boolean; includeDebate?: boolean; taskId?: string }
  ): Promise<DashboardActionResponse<AnalyzeSubjectResponse>> {
    // Route to subjects.analyze (subject handler's analyze action)
    // Backend expects 'id' parameter, not 'subjectId'
    // If taskId is provided, use it for the context so SSE can track progress
    return this.executeDashboardRequestWithContext<AnalyzeSubjectResponse>(
      'subjects.analyze',
      { id: subjectId, forceRefresh: options?.forceRefresh, includeDebate: options?.includeDebate },
      options?.taskId,
    );
  }

  /**
   * Execute a dashboard request with a specific taskId for tracking
   */
  private async executeDashboardRequestWithContext<T>(
    action: string,
    params?: Record<string, unknown>,
    taskIdOverride?: string,
  ): Promise<DashboardActionResponse<T>> {
    const endpoint = `${API_BASE_URL}/invoke`;

    const payload: DashboardRequestPayload = {
      action,
      params,
    };

    const request = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'invoke',
      params: {
        context: this.getContext(taskIdOverride),
        data: {
          content: {
            mode: 'dashboard',
            action,
            payload,
          },
        },
      },
    };

    // Use AbortController with 30 minute timeout for long-running analysis (12 dimensions @ ~2min each)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 minutes

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || errorData?.message || response.statusText;
      throw new Error(message);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Dashboard request failed');
    }

    // Risk-runner returns output.content = { status, response } — the data is in response
    const rawResult = data.result;
    const outputContent = rawResult?.output?.content;
    const responsePayload = outputContent?.response ?? outputContent ?? data.payload ?? rawResult?.payload ?? rawResult ?? {};
    const content = outputContent?.response ?? responsePayload?.content ?? null;
    return {
      success: data.success ?? data.result?.success ?? true,
      content,
      metadata: responsePayload?.metadata ?? outputContent?.metadata ?? null,
    };
  }

  async analyzeScope(
    scopeId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<DashboardActionResponse<{ analyzed: number; successful: number; failed: number }>> {
    // Route to scopes.analyze (scope handler's analyze action)
    // Backend expects 'id' parameter, not 'scopeId'
    return this.executeDashboardRequest<{ analyzed: number; successful: number; failed: number }>(
      'scopes.analyze',
      { id: scopeId, ...options }
    );
  }

  async triggerBatchAnalysis(): Promise<DashboardActionResponse<{
    analyzed: number;
    successful: number;
    failed: number;
    scopesProcessed: number;
    duration: number;
  }>> {
    return this.executeDashboardRequest('analysis.batch');
  }

  async getAnalysisStatus(): Promise<DashboardActionResponse<{ isProcessing: boolean; lastRun?: string }>> {
    return this.executeDashboardRequest('analysis.status');
  }

  // ==========================================================================
  // DASHBOARD STATISTICS
  // ==========================================================================

  async getDashboardStats(scopeId?: string): Promise<DashboardActionResponse<DashboardStats>> {
    return this.executeDashboardRequest<DashboardStats>('dashboard.stats', scopeId ? { scopeId } : undefined);
  }

  async getSubjectDetail(subjectId: string): Promise<DashboardActionResponse<{
    subject: RiskSubject;
    compositeScore: RiskCompositeScore | null;
    assessments: RiskAssessment[];
    debate: RiskDebate | null;
    alerts: RiskAlert[];
    evaluations: RiskEvaluation[];
  }>> {
    return this.executeDashboardRequest('dashboard.subject-detail', { subjectId });
  }

  // ==========================================================================
  // SCORE HISTORY OPERATIONS (Feature 1)
  // ==========================================================================

  async getScoreHistory(
    subjectId: string,
    days: number = 30,
    limit: number = 100
  ): Promise<DashboardActionResponse<ScoreHistoryEntry[]>> {
    return this.executeDashboardRequest<ScoreHistoryEntry[]>('analytics.score-history', {
      subjectId,
      days,
      limit,
    });
  }

  async getScoreTrends(scopeId: string): Promise<DashboardActionResponse<ScoreTrend[]>> {
    return this.executeDashboardRequest<ScoreTrend[]>('analytics.score-trends', { scopeId });
  }

  async getScopeScoreHistory(
    scopeId: string,
    days: number = 30
  ): Promise<DashboardActionResponse<{
    subjectId: string;
    subjectName: string;
    subjectIdentifier: string;
    scores: { score: number; confidence: number; change: number; createdAt: string }[];
  }[]>> {
    return this.executeDashboardRequest('analytics.scope-score-history', { scopeId, days });
  }

  // ==========================================================================
  // HEATMAP OPERATIONS (Feature 4)
  // ==========================================================================

  async getHeatmapData(
    scopeId: string,
    riskLevel?: 'critical' | 'high' | 'medium' | 'low'
  ): Promise<DashboardActionResponse<HeatmapData>> {
    return this.executeDashboardRequest<HeatmapData>('analytics.heatmap', {
      scopeId,
      riskLevel,
    });
  }

  // ==========================================================================
  // PORTFOLIO AGGREGATE OPERATIONS (Feature 6)
  // ==========================================================================

  async getPortfolioAggregate(scopeId: string): Promise<DashboardActionResponse<PortfolioAggregate>> {
    return this.executeDashboardRequest<PortfolioAggregate>('analytics.portfolio-aggregate', { scopeId });
  }

  async getRiskDistribution(scopeId: string): Promise<DashboardActionResponse<RiskDistribution[]>> {
    return this.executeDashboardRequest<RiskDistribution[]>('analytics.risk-distribution', { scopeId });
  }

  async getDimensionContributions(scopeId: string): Promise<DashboardActionResponse<DimensionContribution[]>> {
    return this.executeDashboardRequest<DimensionContribution[]>('analytics.dimension-contributions', { scopeId });
  }

  // ==========================================================================
  // CORRELATION OPERATIONS (Feature 7)
  // ==========================================================================

  async getCorrelationMatrix(scopeId: string): Promise<DashboardActionResponse<CorrelationMatrix>> {
    return this.executeDashboardRequest<CorrelationMatrix>('analytics.correlations', { scopeId });
  }

  // ==========================================================================
  // SUBJECT COMPARISON OPERATIONS (Feature 2)
  // ==========================================================================

  async compareSubjects(subjectIds: string[]): Promise<DashboardActionResponse<SubjectComparison>> {
    return this.executeDashboardRequest<SubjectComparison>('analytics.compare-subjects', { subjectIds });
  }

  async saveComparison(params: {
    scopeId: string;
    name: string;
    subjectIds: string[];
  }): Promise<DashboardActionResponse<ComparisonSet>> {
    return this.executeDashboardRequest<ComparisonSet>('analytics.save-comparison', params);
  }

  async listComparisons(scopeId: string): Promise<DashboardActionResponse<ComparisonSet[]>> {
    return this.executeDashboardRequest<ComparisonSet[]>('analytics.list-comparisons', { scopeId });
  }

  async deleteComparison(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('analytics.delete-comparison', { id });
  }

  /**
   * Generate AI insights for a subject comparison
   * Note: This is a placeholder that returns a not-implemented response
   * The CompareModal has fallback logic to generate basic insights locally
   */
  async generateComparisonInsights(_params: {
    subjectIds: string[];
    subjectSummary: string;
    dimensionSummary: string;
  }): Promise<DashboardActionResponse<{
    summary: string;
    keyDifferences: string[];
    recommendations: string[];
  }>> {
    // Return not-implemented for now - the modal has fallback logic
    return {
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'AI insights not yet implemented' },
    };
  }

  // ==========================================================================
  // EXECUTIVE SUMMARY OPERATIONS (Feature 5)
  // ==========================================================================

  async generateExecutiveSummary(params: {
    scopeId: string;
    summaryType?: 'daily' | 'weekly' | 'ad-hoc';
    forceRefresh?: boolean;
    taskId?: string;
  }): Promise<DashboardActionResponse<ExecutiveSummary>> {
    // Use the context-aware method to pass taskId for SSE progress tracking
    return this.executeDashboardRequestWithContext<ExecutiveSummary>(
      'advanced-analytics.generate-summary',
      { scopeId: params.scopeId, summaryType: params.summaryType, forceRefresh: params.forceRefresh },
      params.taskId,
    );
  }

  async getLatestSummary(scopeId: string): Promise<DashboardActionResponse<ExecutiveSummary | null>> {
    return this.executeDashboardRequest<ExecutiveSummary | null>('advanced-analytics.get-latest-summary', { scopeId });
  }

  async listSummaries(params: {
    scopeId: string;
    limit?: number;
    summaryType?: string;
  }): Promise<DashboardActionResponse<ExecutiveSummary[]>> {
    return this.executeDashboardRequest<ExecutiveSummary[]>('advanced-analytics.list-summaries', params);
  }

  // ==========================================================================
  // SCENARIO ANALYSIS OPERATIONS (Feature 9)
  // ==========================================================================

  async runScenario(params: {
    scopeId: string;
    name: string;
    adjustments: Array<{ dimensionSlug: string; adjustment: number }>;
  }): Promise<DashboardActionResponse<ScenarioResult>> {
    return this.executeDashboardRequest<ScenarioResult>('advanced-analytics.run-scenario', params);
  }

  async saveScenario(params: {
    scopeId: string;
    name: string;
    description?: string;
    adjustments: Array<{ dimensionSlug: string; adjustment: number }>;
    results?: ScenarioResult;
    isTemplate?: boolean;
  }): Promise<DashboardActionResponse<Scenario>> {
    return this.executeDashboardRequest<Scenario>('advanced-analytics.save-scenario', params);
  }

  async listScenarios(params: {
    scopeId: string;
    includeTemplates?: boolean;
  }): Promise<DashboardActionResponse<Scenario[]>> {
    return this.executeDashboardRequest<Scenario[]>('advanced-analytics.list-scenarios', params);
  }

  async getScenario(id: string): Promise<DashboardActionResponse<Scenario>> {
    return this.executeDashboardRequest<Scenario>('advanced-analytics.get-scenario', { id });
  }

  async deleteScenario(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('advanced-analytics.delete-scenario', { id });
  }

  async getScenarioTemplates(): Promise<DashboardActionResponse<Scenario[]>> {
    return this.executeDashboardRequest<Scenario[]>('advanced-analytics.get-scenario-templates', {});
  }

  // ==========================================================================
  // PDF REPORT OPERATIONS (Feature 8)
  // ==========================================================================

  async generateReport(params: {
    scopeId: string;
    title: string;
    reportType?: 'comprehensive' | 'executive' | 'detailed';
    config?: Partial<ReportConfig>;
  }): Promise<DashboardActionResponse<Report>> {
    return this.executeDashboardRequest<Report>('advanced-analytics.generate-report', params);
  }

  async getReport(id: string): Promise<DashboardActionResponse<Report>> {
    return this.executeDashboardRequest<Report>('advanced-analytics.get-report', { id });
  }

  async listReports(params: {
    scopeId: string;
    limit?: number;
    status?: string;
  }): Promise<DashboardActionResponse<Report[]>> {
    return this.executeDashboardRequest<Report[]>('advanced-analytics.list-reports', params);
  }

  async deleteReport(id: string): Promise<DashboardActionResponse<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>('advanced-analytics.delete-report', { id });
  }

  async refreshDownloadUrl(id: string): Promise<DashboardActionResponse<{ downloadUrl: string; expiresAt: string }>> {
    return this.executeDashboardRequest<{ downloadUrl: string; expiresAt: string }>('advanced-analytics.refresh-download-url', { id });
  }

  // ==========================================================================
  // MONTE CARLO SIMULATION OPERATIONS (Feature 10)
  // ==========================================================================

  async runSimulation(params: {
    scopeId: string;
    name: string;
    parameters: SimulationParameters;
    iterations?: number;
    subjectId?: string;
    description?: string;
  }): Promise<DashboardActionResponse<Simulation>> {
    return this.executeDashboardRequest<Simulation>('simulations.run-simulation', params);
  }

  async getSimulation(simulationId: string): Promise<DashboardActionResponse<Simulation>> {
    return this.executeDashboardRequest<Simulation>('simulations.get-simulation', { simulationId });
  }

  async listSimulations(params: {
    scopeId: string;
    subjectId?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  }): Promise<DashboardActionResponse<Simulation[]>> {
    return this.executeDashboardRequest<Simulation[]>('simulations.list-simulations', params);
  }

  async deleteSimulation(simulationId: string): Promise<DashboardActionResponse<{ deleted: boolean }>> {
    return this.executeDashboardRequest<{ deleted: boolean }>('simulations.delete-simulation', { simulationId });
  }

  async getDistributionTemplates(): Promise<DashboardActionResponse<Record<string, DimensionDistribution>>> {
    return this.executeDashboardRequest<Record<string, DimensionDistribution>>('simulations.get-distribution-templates', {});
  }

  // ==========================================================================
  // DATA SOURCE OPERATIONS (Feature 11)
  // ==========================================================================

  async createDataSource(params: {
    scopeId: string;
    name: string;
    description?: string;
    sourceType: DataSourceType;
    config: SourceConfig;
    schedule?: string;
    dimensionMapping?: Record<string, DimensionMapping>;
    subjectFilter?: DataSourceSubjectFilter;
    autoReanalyze?: boolean;
    reanalyzeThreshold?: number;
  }): Promise<DashboardActionResponse<DataSource>> {
    return this.executeDashboardRequest<DataSource>('data-sources.create-source', params);
  }

  async getDataSource(dataSourceId: string): Promise<DashboardActionResponse<DataSource>> {
    return this.executeDashboardRequest<DataSource>('data-sources.get-source', { dataSourceId });
  }

  async listDataSources(params: {
    scopeId: string;
    status?: DataSourceStatus;
    sourceType?: DataSourceType;
    limit?: number;
    offset?: number;
  }): Promise<DashboardActionResponse<DataSource[]>> {
    return this.executeDashboardRequest<DataSource[]>('data-sources.list-sources', params);
  }

  async updateDataSource(params: {
    dataSourceId: string;
    name?: string;
    description?: string;
    config?: SourceConfig;
    schedule?: string;
    dimensionMapping?: Record<string, DimensionMapping>;
    subjectFilter?: DataSourceSubjectFilter;
    autoReanalyze?: boolean;
    reanalyzeThreshold?: number;
    status?: 'active' | 'paused' | 'disabled';
  }): Promise<DashboardActionResponse<DataSource>> {
    return this.executeDashboardRequest<DataSource>('data-sources.update-source', params);
  }

  async deleteDataSource(dataSourceId: string): Promise<DashboardActionResponse<{ deleted: boolean }>> {
    return this.executeDashboardRequest<{ deleted: boolean }>('data-sources.delete-source', { dataSourceId });
  }

  async fetchDataSource(dataSourceId: string): Promise<DashboardActionResponse<FetchResult>> {
    return this.executeDashboardRequest<FetchResult>('data-sources.fetch-source', { dataSourceId });
  }

  async getFetchHistory(params: {
    dataSourceId: string;
    limit?: number;
  }): Promise<DashboardActionResponse<FetchHistoryRecord[]>> {
    return this.executeDashboardRequest<FetchHistoryRecord[]>('data-sources.get-fetch-history', params);
  }

  async getDataSourceHealthSummary(scopeId: string): Promise<DashboardActionResponse<DataSourceHealthSummary>> {
    return this.executeDashboardRequest<DataSourceHealthSummary>('data-sources.get-health-summary', { scopeId });
  }

  async getSourcesDueForFetch(): Promise<DashboardActionResponse<DataSource[]>> {
    return this.executeDashboardRequest<DataSource[]>('data-sources.get-due-sources', {});
  }
}

// Export singleton instance
export const riskDashboardService = new RiskDashboardService();
