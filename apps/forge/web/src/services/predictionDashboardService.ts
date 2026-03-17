/**
 * Prediction Dashboard A2A Service
 *
 * Handles A2A dashboard mode calls for the prediction system.
 * Uses dashboard mode to fetch and manage prediction entities.
 *
 * IMPORTANT: This service uses A2A dashboard mode, NOT REST endpoints.
 * All data access is through POST /invoke (invoke contract)
 */

import { useAuthStore } from '@/stores/rbacStore';
import { useAgentsStore } from '@/stores/agentsStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import type { ExecutionContext, JsonValue } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload, DashboardResponsePayload } from '@/types/forge-types';
import type {
  UniverseListParams,
  UniverseGetParams,
  UniverseCreateParams,
  UniverseUpdateParams,
  UniverseDeleteParams,
  TargetListParams,
  TargetGetParams,
  TargetCreateParams,
  TargetUpdateParams,
  TargetDeleteParams,
  PredictionListParams,
  PredictionGetParams,
  PredictionGetSnapshotParams,
  SourceListParams,
  SourceGetParams,
  SourceCreateParams,
  SourceUpdateParams,
  SourceDeleteParams,
  SourceTestCrawlParams,
  StrategyListParams,
  // Analyst params
  AnalystListParams,
  AnalystCreateParams,
  AnalystUpdateParams,
  // Learning params
  LearningListParams,
  LearningCreateParams,
  LearningUpdateParams,
  // Learning queue params
  LearningQueueListParams,
  LearningQueueRespondParams,
  // Review queue params
  ReviewQueueListParams,
  ReviewQueueRespondParams,
  // Missed opportunity params
  MissedOpportunityListParams,
  // Tool request params
  ToolRequestListParams,
  ToolRequestCreateParams,
  ToolRequestUpdateStatusParams,
  // Entity types
  PredictionUniverse,
  PredictionTarget,
  PriceHistoryPeriod,
  InstrumentPrice,
  PriceHistoryData,
  DailyReportSummary,
  DailyReportRun,
  DailyReportRecommendation,
  TierResult,
  Prediction,
  PredictionSnapshot,
  PredictionDeepDive,
  PredictionSource,
  TestCrawlResult,
  PredictionStrategy,
  PredictionAnalyst,
  PredictionLearning,
  LearningQueueItem,
  ReviewQueueItem,
  AgentModificationType,
  AgentActivityItem,
  ExchangeOutcome,
  ExchangeInitiator,
  LearningExchange,
  ForkComparisonReport,
  LearningSessionResponse,
  AnalystContextVersion,
  MissedOpportunity,
  MissedOpportunityAnalysis,
  ToolRequest,
  LLMCostSummary,
  LLMCostSummaryParams,
  TestScenarioStatus,
  InjectionPoint,
  TestScenarioConfig,
  TestScenarioResults,
  TestScenario,
  TestScenarioSummary,
  TestScenarioListParams,
  TestScenarioCreateParams,
  TestScenarioUpdateParams,
  TestScenarioInjectParams,
  TestScenarioGenerateParams,
  TestScenarioRunTierParams,
  TestScenarioCleanupParams,
  TierRunResult,
  CleanupResult,
  InjectResult,
  GenerateResult,
  TestScenarioExport,
  ReplayTestStatus,
  RollbackDepth,
  ReplayTestResults,
  ReplayTest,
  ReplayTestSummary,
  ReplayAffectedRecords,
  ReplayTestResult,
  ReplayTestCreateParams,
  ReplayTestPreviewParams,
  ReplayTestPreviewResult,
  TestArticle,
  TestArticleListParams,
  TestArticleCreateParams,
  TestArticleUpdateParams,
  TestArticleBulkCreateParams,
  GenerateTestArticleParams,
  TestPriceData,
  TestPriceDataListParams,
  TestPriceDataCreateParams,
  TestPriceDataUpdateParams,
  TestPriceDataBulkCreateParams,
  TestTargetMirror,
  TestTargetMirrorWithTarget,
  TestTargetMirrorListParams,
  TestTargetMirrorCreateParams,
  TestTargetMirrorEnsureParams,
} from '@/types/prediction-agent';

// Re-export entity types and params types so consumers of this service can import them from here
export type {
  // Analyst params
  AnalystListParams,
  AnalystCreateParams,
  AnalystUpdateParams,
  // Learning params
  LearningListParams,
  LearningCreateParams,
  LearningUpdateParams,
  // Learning queue params
  LearningQueueListParams,
  LearningQueueRespondParams,
  // Review queue params
  ReviewQueueListParams,
  ReviewQueueRespondParams,
  // Missed opportunity params
  MissedOpportunityListParams,
  // Tool request params
  ToolRequestListParams,
  ToolRequestCreateParams,
  ToolRequestUpdateStatusParams,
  // Entity types
  PredictionUniverse,
  PredictionTarget,
  PriceHistoryPeriod,
  InstrumentPrice,
  PriceHistoryData,
  DailyReportSummary,
  DailyReportRun,
  DailyReportRecommendation,
  TierResult,
  Prediction,
  PredictionSnapshot,
  PredictionDeepDive,
  PredictionSource,
  TestCrawlResult,
  PredictionStrategy,
  PredictionAnalyst,
  PredictionLearning,
  LearningQueueItem,
  ReviewQueueItem,
  AgentModificationType,
  AgentActivityItem,
  ExchangeOutcome,
  ExchangeInitiator,
  LearningExchange,
  ForkComparisonReport,
  LearningSessionResponse,
  AnalystContextVersion,
  MissedOpportunity,
  MissedOpportunityAnalysis,
  ToolRequest,
  LLMCostSummary,
  LLMCostSummaryParams,
  TestScenarioStatus,
  InjectionPoint,
  TestScenarioConfig,
  TestScenarioResults,
  TestScenario,
  TestScenarioSummary,
  TestScenarioListParams,
  TestScenarioCreateParams,
  TestScenarioUpdateParams,
  TestScenarioInjectParams,
  TestScenarioGenerateParams,
  TestScenarioRunTierParams,
  TestScenarioCleanupParams,
  TierRunResult,
  CleanupResult,
  InjectResult,
  GenerateResult,
  TestScenarioExport,
  ReplayTestStatus,
  RollbackDepth,
  ReplayTestResults,
  ReplayTest,
  ReplayTestSummary,
  ReplayAffectedRecords,
  ReplayTestResult,
  ReplayTestCreateParams,
  ReplayTestPreviewParams,
  ReplayTestPreviewResult,
  TestArticle,
  TestArticleListParams,
  TestArticleCreateParams,
  TestArticleUpdateParams,
  TestArticleBulkCreateParams,
  GenerateTestArticleParams,
  TestPriceData,
  TestPriceDataListParams,
  TestPriceDataCreateParams,
  TestPriceDataUpdateParams,
  TestPriceDataBulkCreateParams,
  TestTargetMirror,
  TestTargetMirrorWithTarget,
  TestTargetMirrorListParams,
  TestTargetMirrorCreateParams,
  TestTargetMirrorEnsureParams,
};

const API_BASE_URL = getSecureApiBaseUrl();



// ============================================================================
// TRANSFORMERS - Convert snake_case API responses to camelCase frontend types
// ============================================================================

interface ApiUniverse {
  id: string;
  name: string;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  description?: string | null;
  organization_slug: string;
  agent_slug: string;
  strategy_id?: string | null;
  llm_config?: Record<string, unknown> | null;
  thresholds?: Record<string, unknown> | null;
  notification_config?: Record<string, unknown>;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

function transformUniverse(api: ApiUniverse): PredictionUniverse {
  const llmConfig = api.llm_config as Record<string, unknown> | null;
  return {
    id: api.id,
    name: api.name,
    domain: api.domain,
    description: api.description ?? undefined,
    organizationSlug: api.organization_slug,
    agentSlug: api.agent_slug,
    strategyId: api.strategy_id ?? undefined,
    llmConfig: llmConfig ? {
      provider: llmConfig.provider as string | undefined,
      model: llmConfig.model as string | undefined,
      tiers: llmConfig.tiers as {
        gold?: { provider: string; model: string };
        silver?: { provider: string; model: string };
        bronze?: { provider: string; model: string };
      } | undefined,
    } : undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function transformUniverses(apis: ApiUniverse[]): PredictionUniverse[] {
  if (!Array.isArray(apis)) {
    console.warn('transformUniverses received non-array:', apis);
    return [];
  }
  return apis.map(transformUniverse);
}

// Target transformer (snake_case API -> camelCase frontend)
interface ApiTarget {
  id: string;
  universe_id: string;
  name: string;
  symbol: string;
  target_type: string;
  context?: string | null;
  llm_config_override?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function transformTarget(api: ApiTarget): PredictionTarget {
  return {
    id: api.id,
    universeId: api.universe_id,
    name: api.name,
    symbol: api.symbol,
    targetType: api.target_type,
    context: api.context ?? undefined,
    llmConfigOverride: api.llm_config_override ?? undefined,
    active: api.is_active,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function transformTargets(apis: ApiTarget[]): PredictionTarget[] {
  if (!Array.isArray(apis)) {
    console.warn('transformTargets received non-array:', apis);
    return [];
  }
  return apis.map(transformTarget);
}

// Source transformer (snake_case API -> camelCase frontend)
interface ApiSource {
  id: string;
  name: string;
  description?: string | null;
  source_type: string;
  url: string;
  scope_level: string;
  domain?: string | null;
  universe_id?: string | null;
  target_id?: string | null;
  crawl_config: Record<string, unknown>;
  auth_config?: Record<string, unknown> | null;
  crawl_frequency_minutes: number;
  is_active: boolean;
  is_test?: boolean;
  last_crawl_at?: string | null;
  last_crawl_status?: string | null;
  last_error?: string | null;
  consecutive_errors?: number;
  created_at: string;
  updated_at: string;
}

function transformSource(api: ApiSource): PredictionSource {
  return {
    id: api.id,
    name: api.name,
    sourceType: api.source_type as 'web' | 'rss' | 'twitter_search' | 'api',
    scopeLevel: api.scope_level as 'runner' | 'domain' | 'universe' | 'target',
    domain: api.domain ?? undefined,
    universeId: api.universe_id ?? undefined,
    targetId: api.target_id ?? undefined,
    crawlConfig: {
      ...api.crawl_config,
      url: api.url, // Include url in crawlConfig for frontend convenience
    },
    authConfig: api.auth_config ?? undefined,
    active: api.is_active,
    lastCrawledAt: api.last_crawl_at ?? undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function transformSources(apis: ApiSource[]): PredictionSource[] {
  if (!Array.isArray(apis)) {
    console.warn('transformSources received non-array:', apis);
    return [];
  }
  return apis.map(transformSource);
}

// Analyst transformer (snake_case API -> camelCase frontend)
interface ApiAnalyst {
  id: string;
  slug: string;
  name: string;
  perspective: string;
  scope_level: string;
  domain?: string | null;
  universe_id?: string | null;
  target_id?: string | null;
  default_weight: number;
  tier_instructions?: {
    gold?: string;
    silver?: string;
    bronze?: string;
  } | null;
  learned_patterns?: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

function transformAnalyst(api: ApiAnalyst): PredictionAnalyst {
  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    perspective: api.perspective,
    scopeLevel: api.scope_level as 'runner' | 'domain' | 'universe' | 'target',
    domain: api.domain ?? undefined,
    universeId: api.universe_id ?? undefined,
    targetId: api.target_id ?? undefined,
    defaultWeight: api.default_weight,
    tierInstructions: api.tier_instructions ?? undefined,
    learnedPatterns: api.learned_patterns ?? undefined,
    active: api.is_enabled,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function transformAnalysts(apis: ApiAnalyst[]): PredictionAnalyst[] {
  if (!Array.isArray(apis)) {
    console.warn('transformAnalysts received non-array:', apis);
    return [];
  }
  return apis.map(transformAnalyst);
}

// ============================================================================
// SERVICE
// ============================================================================

class PredictionDashboardService {
  private defaultAgentSlug = 'us-tech-stocks'; // Default prediction agent
  private currentAgentSlug: string | null = null;
  private currentOrgSlug: string | null = null;
  private authStore: ReturnType<typeof useAuthStore> | null = null;
  // Dashboard conversation ID - set once per session to avoid creating multiple conversations
  private dashboardConversationId: string | null = null;

  /**
   * Set the current agent slug for API calls
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
    return this.currentAgentSlug || this.defaultAgentSlug;
  }

  private getAuthStore(): ReturnType<typeof useAuthStore> {
    if (!this.authStore) {
      this.authStore = useAuthStore();
    }
    return this.authStore;
  }

  private getOrgSlug(): string {
    // Priority: explicit org slug > auth store current org > agent's org from store
    // Explicit org slug is set when viewing an agent from a specific org (e.g., super-user)
    if (this.currentOrgSlug && this.currentOrgSlug !== '*') {
      return this.currentOrgSlug;
    }

    const authOrg = this.getAuthStore().currentOrganization;
    if (authOrg && authOrg !== '*') {
      return authOrg;
    }

    // Look up org from the agent in the agents store
    // Uses currentAgentSlug if set, otherwise falls back to defaultAgentSlug
    // This handles the case where user is in "all orgs" mode but has selected a specific agent
    const effectiveAgentSlug = this.getAgentSlug();
    if (effectiveAgentSlug) {
      const agentsStore = useAgentsStore();
      const agent = agentsStore.availableAgents?.find(
        (a) => a.slug === effectiveAgentSlug || a.name === effectiveAgentSlug
      );
      if (agent?.organizationSlug && agent.organizationSlug !== '*') {
        const orgSlug = Array.isArray(agent.organizationSlug)
          ? agent.organizationSlug[0]
          : agent.organizationSlug;
        if (orgSlug && orgSlug !== '*') {
          return orgSlug;
        }
      }
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

  private getContext(agentSlugOverride?: string): ExecutionContext {
    const authStore = this.getAuthStore();
    const effectiveAgent = agentSlugOverride || this.getAgentSlug();
    const orgSlug = this.getOrgSlug();
    const userId = authStore.user?.id || '';

    // Always build a dashboard-specific context with the correct agent slug.
    // Do NOT inherit from executionContextStore — it may hold a stale context
    // from a previous conversation (e.g., Legal Department), causing the API
    // to route dashboard requests to the wrong agent.
    return {
      orgSlug,
      userId,
      conversationId: this.getDashboardConversationId(),
      // agentSlug must match the registered capability name for invoke routing
      agentSlug: 'predictor',
      agentType: 'prediction',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    };
  }

  private async executeDashboardRequest<T>(
    action: string,
    params?: Record<string, unknown>,
    filters?: Record<string, unknown>,
    pagination?: { page?: number; pageSize?: number },
    agentSlugOverride?: string
  ): Promise<DashboardResponsePayload<T>> {
    const endpoint = `${API_BASE_URL}/invoke`;

    const payload: DashboardRequestPayload = {
      action,
      params: params as unknown as JsonValue | undefined,
      filters,
      pagination,
    };

    const request = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'invoke',
      params: {
        context: this.getContext(agentSlugOverride),
        data: {
          content: {
            mode: 'dashboard',
            action,
            payload,
          },
        },
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData?.error?.message || errorData?.message || response.statusText;
      throw new Error(message);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Dashboard request failed');
    }

    // Handle both old format (result.payload) and invoke format (result.output.content)
    const rawResult = data.result;
    const result = rawResult?.output?.content?.response  // invoke: output.content is the capability response
      || rawResult?.output?.content                       // invoke: fallback to full output.content
      || rawResult?.payload                               // old: result.payload
      || rawResult
      || { content: null };

    // Check for explicit success: false (e.g., dashboard handler returned TaskResponseDto.failure)
    if (result && typeof result === 'object' && 'success' in result && result.success === false) {
      const resultRecord = result as Record<string, unknown>;
      const metadata =
        resultRecord.metadata && typeof resultRecord.metadata === 'object'
          ? (resultRecord.metadata as Record<string, unknown>)
          : undefined;
      const explicitMessage =
        (typeof resultRecord.message === 'string' && resultRecord.message) ||
        (typeof metadata?.reason === 'string' && metadata.reason) ||
        (typeof metadata?.error === 'string' && metadata.error);

      throw new Error(
        explicitMessage || `Dashboard request failed for agent ${agentSlugOverride || this.getAgentSlug()}`
      );
    }

    return result;
  }

  // ==========================================================================
  // UNIVERSE OPERATIONS
  // ==========================================================================

  async listUniverses(
    params?: UniverseListParams
  ): Promise<DashboardResponsePayload<PredictionUniverse[]>> {
    const response = await this.executeDashboardRequest<ApiUniverse[]>(
      'universes.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
    // Transform snake_case API response to camelCase frontend type
    return {
      ...response,
      content: response.content ? transformUniverses(response.content) : ([] as PredictionUniverse[]),
    };
  }

  async getUniverse(
    params: UniverseGetParams
  ): Promise<DashboardResponsePayload<PredictionUniverse>> {
    const response = await this.executeDashboardRequest<ApiUniverse>(
      'universes.get',
      params as unknown as Record<string, unknown>
    );
    // Transform snake_case API response to camelCase frontend type
    return {
      ...response,
      content: response.content ? transformUniverse(response.content) : null!,
    };
  }

  async createUniverse(
    params: UniverseCreateParams
  ): Promise<DashboardResponsePayload<PredictionUniverse>> {
    const response = await this.executeDashboardRequest<ApiUniverse>(
      'universes.create',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformUniverse(response.content) : null!,
    };
  }

  async updateUniverse(
    params: UniverseUpdateParams
  ): Promise<DashboardResponsePayload<PredictionUniverse>> {
    const response = await this.executeDashboardRequest<ApiUniverse>(
      'universes.update',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformUniverse(response.content) : null!,
    };
  }

  async deleteUniverse(
    params: UniverseDeleteParams
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'universes.delete',
      params as unknown as Record<string, unknown>
    );
  }

  // ==========================================================================
  // TARGET OPERATIONS
  // ==========================================================================

  async listTargets(
    params?: TargetListParams
  ): Promise<DashboardResponsePayload<PredictionTarget[]>> {
    // Pass universeId in params (first position) as backend expects it there
    const response = await this.executeDashboardRequest<ApiTarget[]>(
      'targets.list',
      params as unknown as Record<string, unknown> | undefined, // universeId goes in params, not filters
      undefined
    );
    // Transform snake_case API response to camelCase frontend type
    return {
      ...response,
      content: response.content ? transformTargets(response.content) : ([] as PredictionTarget[]),
    };
  }

  async getTarget(
    params: TargetGetParams
  ): Promise<DashboardResponsePayload<PredictionTarget>> {
    const response = await this.executeDashboardRequest<ApiTarget>(
      'targets.get',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformTarget(response.content) : null!,
    };
  }

  async createTarget(
    params: TargetCreateParams
  ): Promise<DashboardResponsePayload<PredictionTarget>> {
    const response = await this.executeDashboardRequest<ApiTarget>(
      'targets.create',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformTarget(response.content) : null!,
    };
  }

  async updateTarget(
    params: TargetUpdateParams
  ): Promise<DashboardResponsePayload<PredictionTarget>> {
    const response = await this.executeDashboardRequest<ApiTarget>(
      'targets.update',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformTarget(response.content) : null!,
    };
  }

  async deleteTarget(
    params: TargetDeleteParams
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'targets.delete',
      params as unknown as Record<string, unknown>
    );
  }

  async getInstrumentPrices(): Promise<InstrumentPrice[]> {
    const response = await this.executeDashboardRequest<Array<{
      id: string;
      symbol: string;
      name: string;
      target_type: string;
      universe_id: string;
      current_price: number | null;
      price_updated_at: string | null;
      change_24h_absolute: number | null;
      change_24h_percent: number | null;
    }>>('targets.prices');

    if (!response.content) return [];

    return response.content.map(p => ({
      id: p.id,
      symbol: p.symbol,
      name: p.name,
      targetType: p.target_type,
      universeId: p.universe_id,
      currentPrice: p.current_price,
      priceUpdatedAt: p.price_updated_at,
      change24hAbsolute: p.change_24h_absolute,
      change24hPercent: p.change_24h_percent,
    }));
  }

  async getTargetPriceHistory(
    targetId: string,
    period: PriceHistoryPeriod = 'day'
  ): Promise<PriceHistoryData | null> {
    const response = await this.executeDashboardRequest<{
      target: {
        id: string;
        symbol: string;
        name: string;
        target_type: string;
        current_price: number | null;
      };
      period: string;
      hours: number;
      snapshots: Array<{
        id: string;
        target_id: string;
        value: number;
        value_type: string;
        source: string;
        created_at: string;
      }>;
      change: {
        start_value: number | null;
        end_value: number | null;
        change_absolute: number | null;
        change_percent: number | null;
      };
    }>('targets.priceHistory', { targetId, period });

    if (!response.content) return null;

    const c = response.content;
    return {
      target: {
        id: c.target.id,
        symbol: c.target.symbol,
        name: c.target.name,
        targetType: c.target.target_type,
        currentPrice: c.target.current_price,
      },
      period: c.period as PriceHistoryPeriod,
      hours: c.hours,
      snapshots: c.snapshots.map(s => ({
        id: s.id,
        targetId: s.target_id,
        value: s.value,
        valueType: s.value_type,
        source: s.source,
        createdAt: s.created_at,
      })),
      change: {
        startValue: c.change.start_value,
        endValue: c.change.end_value,
        changeAbsolute: c.change.change_absolute,
        changePercent: c.change.change_percent,
      },
    };
  }

  // ==========================================================================
  // DAILY REPORT OPERATIONS
  // ==========================================================================

  async runDailyReport(params?: {
    runDate?: string;
    overnightMoveThresholdPct?: number;
  }): Promise<DashboardResponsePayload<{ runId: string }>> {
    return this.executeDashboardRequest<{ runId: string }>(
      'daily-reports.run',
      params as Record<string, unknown> | undefined
    );
  }

  async listDailyReports(limit = 20): Promise<DashboardResponsePayload<DailyReportRun[]>> {
    const response = await this.executeDashboardRequest<Array<{
      id: string;
      org_slug: string;
      agent_slug: string;
      run_date: string;
      status: string;
      summary: DailyReportSummary;
      report_markdown: string;
      report_html: string;
      report_json: Record<string, unknown>;
      created_by: string;
      started_at: string;
      completed_at: string | null;
      created_at: string;
    }>>('daily-reports.list', { limit });

    const rawContent = response.content as unknown;
    const runList = Array.isArray(rawContent)
      ? rawContent
      : (rawContent &&
          typeof rawContent === 'object' &&
          'runs' in rawContent &&
          Array.isArray((rawContent as { runs?: unknown[] }).runs)
        ? ((rawContent as { runs: unknown[] }).runs as Array<{
            id: string;
            org_slug: string;
            agent_slug: string;
            run_date: string;
            status: string;
            summary: DailyReportSummary;
            report_markdown: string;
            report_html: string;
            report_json: Record<string, unknown>;
            created_by: string;
            started_at: string;
            completed_at: string | null;
            created_at: string;
          }>)
        : []);

    return {
      ...response,
      content: runList.map((run) => ({
        id: run.id,
        orgSlug: run.org_slug,
        agentSlug: run.agent_slug,
        runDate: run.run_date,
        status: run.status,
        summary: run.summary,
        reportMarkdown: run.report_markdown,
        reportHtml: run.report_html,
        reportJson: run.report_json,
        createdBy: run.created_by,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      })),
    };
  }

  async getDailyReport(runId: string): Promise<
    DashboardResponsePayload<{
      run: DailyReportRun;
      recommendations: DailyReportRecommendation[];
    }>
  > {
    const response = await this.executeDashboardRequest<{
      run: {
        id: string;
        org_slug: string;
        agent_slug: string;
        run_date: string;
        status: string;
        summary: DailyReportSummary;
        report_markdown: string;
        report_html: string;
        report_json: Record<string, unknown>;
        created_by: string;
        started_at: string;
        completed_at: string | null;
        created_at: string;
      };
      recommendations: Array<{
        id: string;
        run_id: string;
        recommendation_type: 'context_update' | 'source_candidate' | 'replay_experiment';
        scope_level: 'instrument_context' | 'domain_context' | 'prediction_global_context';
        target_id: string | null;
        target_symbol: string | null;
        title: string;
        rationale: string;
        proposed_change: Record<string, unknown>;
        confidence: number;
        status: 'pending' | 'approved' | 'rejected' | 'applied' | 'escalated';
        action_source: string | null;
        action_note: string | null;
        actioned_by: string | null;
        actioned_at: string | null;
        created_at: string;
      }>;
    }>('daily-reports.get', { runId });

    if (!response.content) {
      return response as unknown as DashboardResponsePayload<{
        run: DailyReportRun;
        recommendations: DailyReportRecommendation[];
      }>;
    }

    return {
      ...response,
      content: {
        run: {
          id: response.content.run.id,
          orgSlug: response.content.run.org_slug,
          agentSlug: response.content.run.agent_slug,
          runDate: response.content.run.run_date,
          status: response.content.run.status,
          summary: response.content.run.summary,
          reportMarkdown: response.content.run.report_markdown,
          reportHtml: response.content.run.report_html,
          reportJson: response.content.run.report_json,
          createdBy: response.content.run.created_by,
          startedAt: response.content.run.started_at,
          completedAt: response.content.run.completed_at,
          createdAt: response.content.run.created_at,
        },
        recommendations: response.content.recommendations.map((rec) => ({
          id: rec.id,
          runId: rec.run_id,
          recommendationType: rec.recommendation_type,
          scopeLevel: rec.scope_level,
          targetId: rec.target_id,
          targetSymbol: rec.target_symbol,
          title: rec.title,
          rationale: rec.rationale,
          proposedChange: rec.proposed_change,
          confidence: rec.confidence,
          status: rec.status,
          actionSource: rec.action_source,
          actionNote: rec.action_note,
          actionedBy: rec.actioned_by,
          actionedAt: rec.actioned_at,
          createdAt: rec.created_at,
        })),
      },
    };
  }

  async getDailyReportArtifact(
    runId: string,
    artifactType: 'html' | 'markdown' | 'json'
  ): Promise<
    DashboardResponsePayload<{
      runId: string;
      artifactType: 'html' | 'markdown' | 'json';
      mimeType: string;
      filename: string;
      content: string | Record<string, unknown>;
    }>
  > {
    const action =
      artifactType === 'html'
        ? 'daily-reports.getHtml'
        : artifactType === 'markdown'
          ? 'daily-reports.getMarkdown'
          : 'daily-reports.getJson';
    return this.executeDashboardRequest<{
      runId: string;
      artifactType: 'html' | 'markdown' | 'json';
      mimeType: string;
      filename: string;
      content: string | Record<string, unknown>;
    }>(action, { runId });
  }

  async decideDailyReportRecommendation(params: {
    recommendationId: string;
    decision: 'approve' | 'reject' | 'apply' | 'escalate' | 'replay';
    actionSource?: 'dashboard' | 'openclaw-web' | 'openclaw-phone';
    note?: string;
    escalateTo?: 'instrument_context' | 'domain_context' | 'prediction_global_context';
  }): Promise<DashboardResponsePayload<DailyReportRecommendation>> {
    const response = await this.executeDashboardRequest<{
      id: string;
      run_id: string;
      recommendation_type: 'context_update' | 'source_candidate' | 'replay_experiment';
      scope_level: 'instrument_context' | 'domain_context' | 'prediction_global_context';
      target_id: string | null;
      target_symbol: string | null;
      title: string;
      rationale: string;
      proposed_change: Record<string, unknown>;
      confidence: number;
      status: 'pending' | 'approved' | 'rejected' | 'applied' | 'escalated';
      action_source: string | null;
      action_note: string | null;
      actioned_by: string | null;
      actioned_at: string | null;
      created_at: string;
    }>('daily-reports.decide', params as unknown as Record<string, unknown>);

    return {
      ...response,
      content: response.content
        ? {
            id: response.content.id,
            runId: response.content.run_id,
            recommendationType: response.content.recommendation_type,
            scopeLevel: response.content.scope_level,
            targetId: response.content.target_id,
            targetSymbol: response.content.target_symbol,
            title: response.content.title,
            rationale: response.content.rationale,
            proposedChange: response.content.proposed_change,
            confidence: response.content.confidence,
            status: response.content.status,
            actionSource: response.content.action_source,
            actionNote: response.content.action_note,
            actionedBy: response.content.actioned_by,
            actionedAt: response.content.actioned_at,
            createdAt: response.content.created_at,
          }
        : null!,
    };
  }

  // ==========================================================================
  // PREDICTION OPERATIONS
  // ==========================================================================

  async listPredictions(
    params?: PredictionListParams,
    pagination?: { page?: number; pageSize?: number }
  ): Promise<DashboardResponsePayload<Prediction[]>> {
    const effectiveParams: PredictionListParams = {
      ...(params ?? {}),
      status: params?.status ?? 'active',
    };

    return this.executeDashboardRequest<Prediction[]>(
      'predictions.list',
      undefined,
      effectiveParams as unknown as Record<string, unknown>,
      pagination
    );
  }

  async getPrediction(
    params: PredictionGetParams
  ): Promise<DashboardResponsePayload<Prediction>> {
    return this.executeDashboardRequest<Prediction>(
      'predictions.get',
      params as unknown as Record<string, unknown>
    );
  }

  async getPredictionSnapshot(
    params: PredictionGetSnapshotParams
  ): Promise<DashboardResponsePayload<PredictionSnapshot>> {
    return this.executeDashboardRequest<PredictionSnapshot>(
      'predictions.getSnapshot',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Get full prediction deep-dive with complete lineage
   * Prediction -> Predictors -> Signals -> Articles
   */
  async getPredictionDeepDive(
    params: { id: string }
  ): Promise<DashboardResponsePayload<PredictionDeepDive>> {
    return this.executeDashboardRequest<PredictionDeepDive>(
      'predictions.deepDive',
      params
    );
  }

  // ==========================================================================
  // SOURCE OPERATIONS
  // ==========================================================================

  async listSources(
    params?: SourceListParams
  ): Promise<DashboardResponsePayload<PredictionSource[]>> {
    const response = await this.executeDashboardRequest<ApiSource[]>(
      'sources.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
    return {
      ...response,
      content: response.content ? transformSources(response.content) : ([] as PredictionSource[]),
    };
  }

  async getSource(
    params: SourceGetParams
  ): Promise<DashboardResponsePayload<PredictionSource>> {
    const response = await this.executeDashboardRequest<ApiSource>(
      'sources.get',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformSource(response.content) : null!,
    };
  }

  async createSource(
    params: SourceCreateParams
  ): Promise<DashboardResponsePayload<PredictionSource>> {
    const response = await this.executeDashboardRequest<ApiSource>(
      'sources.create',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformSource(response.content) : null!,
    };
  }

  async updateSource(
    params: SourceUpdateParams
  ): Promise<DashboardResponsePayload<PredictionSource>> {
    const response = await this.executeDashboardRequest<ApiSource>(
      'sources.update',
      params as unknown as Record<string, unknown>
    );
    return {
      ...response,
      content: response.content ? transformSource(response.content) : null!,
    };
  }

  async deleteSource(
    params: SourceDeleteParams
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'sources.delete',
      params as unknown as Record<string, unknown>
    );
  }

  async testCrawl(
    params: SourceTestCrawlParams
  ): Promise<DashboardResponsePayload<TestCrawlResult>> {
    return this.executeDashboardRequest<TestCrawlResult>(
      'sources.testCrawl',
      params as unknown as Record<string, unknown>
    );
  }

  // ==========================================================================
  // STRATEGY OPERATIONS
  // ==========================================================================

  async listStrategies(
    params?: StrategyListParams
  ): Promise<DashboardResponsePayload<PredictionStrategy[]>> {
    return this.executeDashboardRequest<PredictionStrategy[]>(
      'strategies.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  // ==========================================================================
  // PHASE 11: ANALYST OPERATIONS
  // ==========================================================================

  async listAnalysts(
    params?: AnalystListParams
  ): Promise<DashboardResponsePayload<PredictionAnalyst[]>> {
    const response = await this.executeDashboardRequest<ApiAnalyst[]>(
      'analysts.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
    // Transform snake_case API response to camelCase frontend format
    return {
      ...response,
      content: response.content ? transformAnalysts(response.content) : ([] as PredictionAnalyst[]),
    };
  }

  async getAnalyst(params: {
    id: string;
  }): Promise<DashboardResponsePayload<PredictionAnalyst>> {
    const response = await this.executeDashboardRequest<ApiAnalyst>(
      'analysts.get',
      params
    );
    // Transform snake_case API response to camelCase frontend format
    return {
      ...response,
      content: response.content ? transformAnalyst(response.content) : null!,
    };
  }

  async createAnalyst(
    params: AnalystCreateParams
  ): Promise<DashboardResponsePayload<PredictionAnalyst>> {
    // Transform camelCase to snake_case for API compatibility
    const transformedParams = {
      slug: params.slug,
      name: params.name,
      perspective: params.perspective,
      scope_level: params.scopeLevel,
      domain: params.domain,
      universe_id: params.universeId,
      target_id: params.targetId,
      default_weight: params.defaultWeight,
      tier_instructions: params.tierInstructions,
    };
    const response = await this.executeDashboardRequest<ApiAnalyst>(
      'analysts.create',
      transformedParams
    );
    // Transform snake_case API response to camelCase frontend format
    return {
      ...response,
      content: response.content ? transformAnalyst(response.content) : null!,
    };
  }

  async updateAnalyst(
    params: AnalystUpdateParams
  ): Promise<DashboardResponsePayload<PredictionAnalyst>> {
    // Transform camelCase to snake_case for API compatibility
    const transformedParams = {
      id: params.id,
      name: params.name,
      perspective: params.perspective,
      default_weight: params.defaultWeight,
      tier_instructions: params.tierInstructions,
      is_enabled: params.active, // Use is_enabled for backend
    };
    const response = await this.executeDashboardRequest<ApiAnalyst>(
      'analysts.update',
      transformedParams as unknown as Record<string, unknown>
    );
    // Transform snake_case API response to camelCase frontend format
    return {
      ...response,
      content: response.content ? transformAnalyst(response.content) : null!,
    };
  }

  async deleteAnalyst(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'analysts.delete',
      params
    );
  }

  // ==========================================================================
  // PHASE 11: LEARNING OPERATIONS
  // ==========================================================================

  /**
   * Transform learning response from snake_case (API) to camelCase (frontend)
   */
  private transformLearningResponse(learning: Record<string, unknown>): PredictionLearning {
    return {
      id: learning.id as string,
      title: learning.title as string,
      scopeLevel: (learning.scope_level as string) || (learning.scopeLevel as string),
      domain: (learning.domain as string | null) || null,
      universeId: (learning.universe_id as string | null) || (learning.universeId as string | null) || null,
      targetId: (learning.target_id as string | null) || (learning.targetId as string | null) || null,
      analystId: (learning.analyst_id as string | null) || (learning.analystId as string | null) || null,
      learningType: (learning.learning_type as string) || (learning.learningType as string),
      content: (learning.description as string) || (learning.content as string) || '',
      sourceType: (learning.source_type as string) || (learning.sourceType as string),
      status: learning.status as string,
      supersededBy: (learning.superseded_by as string | null) || (learning.supersededBy as string | null) || null,
      createdAt: (learning.created_at as string) || (learning.createdAt as string),
      updatedAt: (learning.updated_at as string) || (learning.updatedAt as string),
    } as PredictionLearning;
  }

  async listLearnings(
    params?: LearningListParams
  ): Promise<DashboardResponsePayload<PredictionLearning[]>> {
    const response = await this.executeDashboardRequest<Record<string, unknown>[]>(
      'learnings.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
    // Transform snake_case response to camelCase
    if (response.content && Array.isArray(response.content)) {
      response.content = response.content.map((l) => this.transformLearningResponse(l)) as unknown as Record<string, unknown>[];
    }
    return response as unknown as DashboardResponsePayload<PredictionLearning[]>;
  }

  async getLearning(params: {
    id: string;
  }): Promise<DashboardResponsePayload<PredictionLearning>> {
    const response = await this.executeDashboardRequest<Record<string, unknown>>(
      'learnings.get',
      params
    );
    // Transform snake_case response to camelCase
    if (response.content) {
      response.content = this.transformLearningResponse(response.content) as unknown as Record<string, unknown>;
    }
    return response as unknown as DashboardResponsePayload<PredictionLearning>;
  }

  async createLearning(
    params: LearningCreateParams
  ): Promise<DashboardResponsePayload<PredictionLearning>> {
    // Transform camelCase to snake_case for API compatibility
    // Note: API expects 'description' but frontend uses 'content'
    const transformedParams = {
      title: params.title,
      scope_level: params.scopeLevel,
      domain: params.domain,
      universe_id: params.universeId,
      target_id: params.targetId,
      analyst_id: params.analystId,
      learning_type: params.learningType,
      description: params.content, // API field name differs from frontend
      source_type: params.sourceType,
    };
    const response = await this.executeDashboardRequest<Record<string, unknown>>(
      'learnings.create',
      transformedParams
    );
    // Transform snake_case response to camelCase
    if (response.content) {
      response.content = this.transformLearningResponse(response.content) as unknown as Record<string, unknown>;
    }
    return response as unknown as DashboardResponsePayload<PredictionLearning>;
  }

  async updateLearning(
    params: LearningUpdateParams
  ): Promise<DashboardResponsePayload<PredictionLearning>> {
    return this.executeDashboardRequest<PredictionLearning>(
      'learnings.update',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteLearning(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'learnings.delete',
      params
    );
  }

  async listLearningQueue(
    params?: LearningQueueListParams
  ): Promise<DashboardResponsePayload<LearningQueueItem[]>> {
    return this.executeDashboardRequest<LearningQueueItem[]>(
      'learnings.listQueue',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  async respondToLearningQueue(
    params: LearningQueueRespondParams
  ): Promise<DashboardResponsePayload<{ success: boolean; learningId?: string }>> {
    return this.executeDashboardRequest<{ success: boolean; learningId?: string }>(
      'learnings.respondQueue',
      params as unknown as Record<string, unknown>
    );
  }

  // ==========================================================================
  // PHASE 11: REVIEW QUEUE OPERATIONS
  // ==========================================================================

  async listReviewQueue(
    params?: ReviewQueueListParams
  ): Promise<DashboardResponsePayload<ReviewQueueItem[]>> {
    return this.executeDashboardRequest<ReviewQueueItem[]>(
      'reviewQueue.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  async getReviewQueueItem(params: {
    id: string;
  }): Promise<DashboardResponsePayload<ReviewQueueItem>> {
    return this.executeDashboardRequest<ReviewQueueItem>(
      'reviewQueue.get',
      params
    );
  }

  async respondToReviewQueue(
    params: ReviewQueueRespondParams
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'reviewQueue.respond',
      params as unknown as Record<string, unknown>
    );
  }

  // ==========================================================================
  // PHASE 11: MISSED OPPORTUNITY OPERATIONS
  // ==========================================================================

  async listMissedOpportunities(
    params?: MissedOpportunityListParams
  ): Promise<DashboardResponsePayload<MissedOpportunity[]>> {
    return this.executeDashboardRequest<MissedOpportunity[]>(
      'missedOpportunities.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  async getMissedOpportunity(params: {
    id: string;
  }): Promise<DashboardResponsePayload<MissedOpportunity>> {
    return this.executeDashboardRequest<MissedOpportunity>(
      'missedOpportunities.get',
      params
    );
  }

  async getMissedOpportunityAnalysis(params: {
    id: string;
  }): Promise<DashboardResponsePayload<MissedOpportunityAnalysis>> {
    return this.executeDashboardRequest<MissedOpportunityAnalysis>(
      'missedOpportunities.getAnalysis',
      params
    );
  }

  async triggerMissedOpportunityAnalysis(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ success: boolean; analysisId?: string }>> {
    return this.executeDashboardRequest<{ success: boolean; analysisId?: string }>(
      'missedOpportunities.triggerAnalysis',
      params
    );
  }

  // ==========================================================================
  // PHASE 11: TOOL REQUEST OPERATIONS
  // ==========================================================================

  async listToolRequests(
    params?: ToolRequestListParams
  ): Promise<DashboardResponsePayload<ToolRequest[]>> {
    return this.executeDashboardRequest<ToolRequest[]>(
      'toolRequests.list',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  async getToolRequest(params: {
    id: string;
  }): Promise<DashboardResponsePayload<ToolRequest>> {
    return this.executeDashboardRequest<ToolRequest>(
      'toolRequests.get',
      params
    );
  }

  async createToolRequest(
    params: ToolRequestCreateParams
  ): Promise<DashboardResponsePayload<ToolRequest>> {
    return this.executeDashboardRequest<ToolRequest>(
      'toolRequests.create',
      params as unknown as Record<string, unknown>
    );
  }

  async updateToolRequestStatus(
    params: ToolRequestUpdateStatusParams
  ): Promise<DashboardResponsePayload<ToolRequest>> {
    return this.executeDashboardRequest<ToolRequest>(
      'toolRequests.updateStatus',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteToolRequest(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'toolRequests.delete',
      params
    );
  }

  // ==========================================================================
  // PHASE 11: LLM COST OPERATIONS
  // ==========================================================================

  async getLLMCostSummary(
    params?: LLMCostSummaryParams
  ): Promise<DashboardResponsePayload<LLMCostSummary>> {
    return this.executeDashboardRequest<LLMCostSummary>(
      'llmCosts.summary',
      params as unknown as Record<string, unknown> | undefined
    );
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  async loadDashboardData(universeId?: string, agentSlug?: string, includeTestData = false): Promise<{
    universes: PredictionUniverse[];
    predictions: Prediction[];
    strategies: PredictionStrategy[];
  }> {
    // Snapshot the effective agent slug at the start to prevent singleton state pollution.
    // This ensures all parallel API calls use the same agent, even if another component
    // calls setAgentSlug() concurrently (e.g., through Ionic page stack or Vue watchers).
    const effectiveAgent = agentSlug || this.getAgentSlug();

    const universeFilters: UniverseListParams | undefined = agentSlug ? { agentSlug } as UniverseListParams : undefined;
    // Exclude test data by default — real predictions are the primary view
    // Only show active predictions (not cancelled/expired/resolved)
    const predictionFilters = universeId
      ? { universeId, includeTestData, status: 'active' as const }
      : { includeTestData, status: 'active' as const };

    const [universesRes, predictionsRes, strategiesRes] = await Promise.all([
      this.executeDashboardRequest<ApiUniverse[]>(
        'universes.list', undefined,
        universeFilters as unknown as Record<string, unknown> | undefined,
        undefined, effectiveAgent
      ).then(res => ({
        ...res,
        content: res.content ? transformUniverses(res.content) : ([] as PredictionUniverse[]),
      })),
      this.executeDashboardRequest<Prediction[]>(
        'predictions.list', undefined,
        predictionFilters as unknown as Record<string, unknown> | undefined,
        { pageSize: 50 }, effectiveAgent
      ),
      this.executeDashboardRequest<PredictionStrategy[]>(
        'strategies.list', undefined, undefined, undefined, effectiveAgent
      ),
    ]);

    // If agentSlug provided, filter universes and predictions to only those for this agent
    // Use Array.isArray to guard against non-array API responses (e.g., error objects)
    let universes: PredictionUniverse[] = Array.isArray(universesRes.content) ? universesRes.content : [];
    let predictions: Prediction[] = Array.isArray(predictionsRes.content) ? predictionsRes.content : [];

    if (agentSlug) {
      universes = universes.filter((u: PredictionUniverse) => u.agentSlug === agentSlug);
      const universeIds = new Set(universes.map((u: PredictionUniverse) => u.id));
      predictions = predictions.filter((p: Prediction) => universeIds.has(p.universeId));
    }

    return {
      universes,
      predictions,
      strategies: Array.isArray(strategiesRes.content) ? strategiesRes.content : [],
    };
  }

  // ==========================================================================
  // PHASE 4: TEST SCENARIO OPERATIONS
  // ==========================================================================

  async listTestScenarios(
    params?: TestScenarioListParams
  ): Promise<DashboardResponsePayload<TestScenario[]>> {
    return this.executeDashboardRequest<TestScenario[]>(
      'test-scenarios.list',
      { filters: params },
      undefined,
      params ? { page: params.page, pageSize: params.pageSize } : undefined
    );
  }

  async getTestScenario(params: {
    id: string;
  }): Promise<DashboardResponsePayload<TestScenario>> {
    return this.executeDashboardRequest<TestScenario>(
      'test-scenarios.get',
      params
    );
  }

  async getTestScenarioSummaries(): Promise<DashboardResponsePayload<TestScenarioSummary[]>> {
    return this.executeDashboardRequest<TestScenarioSummary[]>(
      'test-scenarios.get-summaries'
    );
  }

  async createTestScenario(
    params: TestScenarioCreateParams
  ): Promise<DashboardResponsePayload<TestScenario>> {
    return this.executeDashboardRequest<TestScenario>(
      'test-scenarios.create',
      params as unknown as Record<string, unknown>
    );
  }

  async updateTestScenario(
    params: TestScenarioUpdateParams
  ): Promise<DashboardResponsePayload<TestScenario>> {
    return this.executeDashboardRequest<TestScenario>(
      'test-scenarios.update',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteTestScenario(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ deleted: boolean; id: string }>> {
    return this.executeDashboardRequest<{ deleted: boolean; id: string }>(
      'test-scenarios.delete',
      params
    );
  }

  async injectTestData(
    params: TestScenarioInjectParams
  ): Promise<DashboardResponsePayload<InjectResult>> {
    return this.executeDashboardRequest<InjectResult>(
      'test-scenarios.inject',
      params as unknown as Record<string, unknown>
    );
  }

  async generateTestData(
    params: TestScenarioGenerateParams
  ): Promise<DashboardResponsePayload<GenerateResult>> {
    return this.executeDashboardRequest<GenerateResult>(
      'test-scenarios.generate',
      params as unknown as Record<string, unknown>
    );
  }

  async runTestTier(
    params: TestScenarioRunTierParams
  ): Promise<DashboardResponsePayload<TierRunResult>> {
    return this.executeDashboardRequest<TierRunResult>(
      'test-scenarios.run-tier',
      params as unknown as Record<string, unknown>
    );
  }

  async cleanupTestData(
    params: TestScenarioCleanupParams
  ): Promise<DashboardResponsePayload<CleanupResult>> {
    return this.executeDashboardRequest<CleanupResult>(
      'test-scenarios.cleanup',
      params as unknown as Record<string, unknown>
    );
  }

  async getTestScenarioCounts(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ scenario_id: string; counts: Record<string, number> }>> {
    return this.executeDashboardRequest<{ scenario_id: string; counts: Record<string, number> }>(
      'test-scenarios.get-counts',
      params
    );
  }

  /**
   * Export a test scenario as JSON (for 4.6 Export/Import JSON feature)
   * Exports the scenario metadata and all associated test data
   */
  async exportTestScenario(params: {
    id: string;
    includeData?: boolean; // Include injected test data
  }): Promise<DashboardResponsePayload<TestScenarioExport>> {
    return this.executeDashboardRequest<TestScenarioExport>(
      'test-scenarios.export',
      params
    );
  }

  /**
   * Import a test scenario from JSON (for 4.6 Export/Import JSON feature)
   * Creates a new scenario with optional data injection
   */
  async importTestScenario(params: {
    data: TestScenarioExport;
    newName?: string; // Override name on import
  }): Promise<DashboardResponsePayload<TestScenario>> {
    return this.executeDashboardRequest<TestScenario>(
      'test-scenarios.import',
      params
    );
  }

  // ==========================================================================
  // PHASE 8: HISTORICAL REPLAY TEST OPERATIONS
  // ==========================================================================

  /**
   * List all replay tests for the organization
   */
  async listReplayTests(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<DashboardResponsePayload<ReplayTestSummary[]>> {
    return this.executeDashboardRequest<ReplayTestSummary[]>(
      'replay-tests.list',
      params,
      undefined,
      params ? { page: params.page, pageSize: params.pageSize } : undefined
    );
  }

  /**
   * Get a single replay test by ID
   */
  async getReplayTest(params: { id: string }): Promise<DashboardResponsePayload<ReplayTestSummary>> {
    return this.executeDashboardRequest<ReplayTestSummary>(
      'replay-tests.get',
      params
    );
  }

  /**
   * Create a new replay test
   */
  async createReplayTest(
    params: ReplayTestCreateParams
  ): Promise<DashboardResponsePayload<ReplayTest>> {
    return this.executeDashboardRequest<ReplayTest>(
      'replay-tests.create',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Delete a replay test
   */
  async deleteReplayTest(params: { id: string }): Promise<DashboardResponsePayload<{ deleted: boolean; id: string }>> {
    return this.executeDashboardRequest<{ deleted: boolean; id: string }>(
      'replay-tests.delete',
      params
    );
  }

  /**
   * Preview what records would be affected by a replay test
   */
  async previewReplayTest(
    params: ReplayTestPreviewParams
  ): Promise<DashboardResponsePayload<ReplayTestPreviewResult>> {
    return this.executeDashboardRequest<ReplayTestPreviewResult>(
      'replay-tests.preview',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Run a replay test
   */
  async runReplayTest(params: { id: string }): Promise<DashboardResponsePayload<ReplayTestSummary>> {
    return this.executeDashboardRequest<ReplayTestSummary>(
      'replay-tests.run',
      params
    );
  }

  /**
   * Get detailed results for a replay test
   */
  async getReplayTestResults(params: { id: string }): Promise<DashboardResponsePayload<{
    replay_test_id: string;
    count: number;
    results: ReplayTestResult[];
  }>> {
    return this.executeDashboardRequest<{
      replay_test_id: string;
      count: number;
      results: ReplayTestResult[];
    }>(
      'replay-tests.results',
      params
    );
  }

  // ==========================================================================
  // PHASE 3: TEST ARTICLE OPERATIONS
  // ==========================================================================

  async listTestArticles(
    params?: TestArticleListParams
  ): Promise<DashboardResponsePayload<TestArticle[]>> {
    return this.executeDashboardRequest<TestArticle[]>(
      'test-articles.list',
      params as unknown as Record<string, unknown> | undefined,
      undefined,
      params ? { page: params.page, pageSize: params.pageSize } : undefined
    );
  }

  async getTestArticle(params: {
    id: string;
  }): Promise<DashboardResponsePayload<TestArticle>> {
    return this.executeDashboardRequest<TestArticle>(
      'test-articles.get',
      params
    );
  }

  async createTestArticle(
    params: TestArticleCreateParams
  ): Promise<DashboardResponsePayload<TestArticle>> {
    return this.executeDashboardRequest<TestArticle>(
      'test-articles.create',
      params as unknown as Record<string, unknown>
    );
  }

  async updateTestArticle(
    params: TestArticleUpdateParams
  ): Promise<DashboardResponsePayload<TestArticle>> {
    return this.executeDashboardRequest<TestArticle>(
      'test-articles.update',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteTestArticle(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ deleted: boolean; id: string }>> {
    return this.executeDashboardRequest<{ deleted: boolean; id: string }>(
      'test-articles.delete',
      params
    );
  }

  async bulkCreateTestArticles(
    params: TestArticleBulkCreateParams
  ): Promise<DashboardResponsePayload<{ created: number; articles: TestArticle[] }>> {
    return this.executeDashboardRequest<{ created: number; articles: TestArticle[] }>(
      'test-articles.bulk-create',
      params as unknown as Record<string, unknown>
    );
  }

  async markTestArticleProcessed(params: {
    id: string;
    isProcessed?: boolean;
  }): Promise<DashboardResponsePayload<TestArticle>> {
    return this.executeDashboardRequest<TestArticle>(
      'test-articles.mark-processed',
      params
    );
  }

  async listUnprocessedTestArticles(params?: {
    scenarioId?: string;
    targetSymbol?: string;
  }): Promise<DashboardResponsePayload<TestArticle[]>> {
    return this.executeDashboardRequest<TestArticle[]>(
      'test-articles.list-unprocessed',
      params
    );
  }

  async generateTestArticle(
    params: GenerateTestArticleParams
  ): Promise<DashboardResponsePayload<{
    articles: TestArticle[];
    generation_metadata: {
      model_used: string;
      tokens_used: number;
      generation_time_ms: number;
    };
    created_count: number;
  }>> {
    return this.executeDashboardRequest<{
      articles: TestArticle[];
      generation_metadata: {
        model_used: string;
        tokens_used: number;
        generation_time_ms: number;
      };
      created_count: number;
    }>('test-articles.generate', params as unknown as Record<string, unknown>);
  }

  // ==========================================================================
  // PHASE 3: TEST PRICE DATA OPERATIONS
  // ==========================================================================

  async listTestPriceData(
    params?: TestPriceDataListParams
  ): Promise<DashboardResponsePayload<TestPriceData[]>> {
    return this.executeDashboardRequest<TestPriceData[]>(
      'test-price-data.list',
      params as unknown as Record<string, unknown> | undefined,
      undefined,
      params ? { page: params.page, pageSize: params.pageSize } : undefined
    );
  }

  async getTestPriceData(params: {
    id: string;
  }): Promise<DashboardResponsePayload<TestPriceData>> {
    return this.executeDashboardRequest<TestPriceData>(
      'test-price-data.get',
      params
    );
  }

  async createTestPriceData(
    params: TestPriceDataCreateParams
  ): Promise<DashboardResponsePayload<TestPriceData>> {
    return this.executeDashboardRequest<TestPriceData>(
      'test-price-data.create',
      params as unknown as Record<string, unknown>
    );
  }

  async updateTestPriceData(
    params: TestPriceDataUpdateParams
  ): Promise<DashboardResponsePayload<TestPriceData>> {
    return this.executeDashboardRequest<TestPriceData>(
      'test-price-data.update',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteTestPriceData(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ deleted: boolean; id: string }>> {
    return this.executeDashboardRequest<{ deleted: boolean; id: string }>(
      'test-price-data.delete',
      params
    );
  }

  async bulkCreateTestPriceData(
    params: TestPriceDataBulkCreateParams
  ): Promise<DashboardResponsePayload<{ created: number; prices: TestPriceData[] }>> {
    return this.executeDashboardRequest<{ created: number; prices: TestPriceData[] }>(
      'test-price-data.bulk-create',
      params as unknown as Record<string, unknown>
    );
  }

  async getLatestTestPrice(params: {
    symbol: string;
    scenarioId?: string;
  }): Promise<DashboardResponsePayload<TestPriceData | null>> {
    return this.executeDashboardRequest<TestPriceData | null>(
      'test-price-data.get-latest',
      params
    );
  }

  async getTestPricesByDateRange(params: {
    symbol: string;
    scenarioId?: string;
    startDate: string;
    endDate: string;
  }): Promise<DashboardResponsePayload<TestPriceData[]>> {
    return this.executeDashboardRequest<TestPriceData[]>(
      'test-price-data.get-by-date-range',
      params
    );
  }

  async countTestPricesBySymbol(params: {
    symbol: string;
  }): Promise<DashboardResponsePayload<{ symbol: string; count: number }>> {
    return this.executeDashboardRequest<{ symbol: string; count: number }>(
      'test-price-data.count-by-symbol',
      params
    );
  }

  // ==========================================================================
  // PHASE 4.6: TEST SCENARIO GENERATION FROM LEARNINGS/MISSED OPPORTUNITIES
  // ==========================================================================

  /**
   * Generate test scenario from a missed opportunity
   * Creates a scenario that replicates the conditions of the missed opportunity
   */
  async generateScenarioFromMissed(params: {
    missedOpportunityId: string;
    options?: {
      includeVariations?: boolean;
      variationCount?: number;
      articleCount?: number;
      additionalContext?: string;
    };
  }): Promise<DashboardResponsePayload<{
    scenario: TestScenario;
    articles: TestArticle[];
    priceData: TestPriceData[];
    sourceType: string;
    sourceId: string;
    realTargetSymbol: string;
    testTargetSymbol: string;
  }>> {
    return this.executeDashboardRequest<{
      scenario: TestScenario;
      articles: TestArticle[];
      priceData: TestPriceData[];
      sourceType: string;
      sourceId: string;
      realTargetSymbol: string;
      testTargetSymbol: string;
    }>('test-scenarios.from-missed', params);
  }

  /**
   * Generate test scenario from a learning
   * Creates a scenario that tests the learning's effectiveness
   */
  async generateScenarioFromLearning(params: {
    learningId: string;
    options?: {
      includeVariations?: boolean;
      variationCount?: number;
      articleCount?: number;
      additionalContext?: string;
    };
  }): Promise<DashboardResponsePayload<{
    scenario: TestScenario;
    articles: TestArticle[];
    priceData: TestPriceData[];
    sourceType: string;
    sourceId: string;
    realTargetSymbol: string;
    testTargetSymbol: string;
  }>> {
    return this.executeDashboardRequest<{
      scenario: TestScenario;
      articles: TestArticle[];
      priceData: TestPriceData[];
      sourceType: string;
      sourceId: string;
      realTargetSymbol: string;
      testTargetSymbol: string;
    }>('test-scenarios.from-learning', params);
  }

  // ==========================================================================
  // PHASE 3: TEST TARGET MIRROR OPERATIONS
  // ==========================================================================

  async listTestTargetMirrors(
    params?: TestTargetMirrorListParams
  ): Promise<DashboardResponsePayload<TestTargetMirror[] | TestTargetMirrorWithTarget[]>> {
    const action = params?.includeTargetDetails
      ? 'test-target-mirrors.list-with-targets'
      : 'test-target-mirrors.list';
    return this.executeDashboardRequest<TestTargetMirror[] | TestTargetMirrorWithTarget[]>(
      action,
      params as unknown as Record<string, unknown> | undefined,
      undefined,
      params ? { page: params.page, pageSize: params.pageSize } : undefined
    );
  }

  async getTestTargetMirror(params: {
    id: string;
    includeTargetDetails?: boolean;
  }): Promise<DashboardResponsePayload<TestTargetMirror | TestTargetMirrorWithTarget>> {
    return this.executeDashboardRequest<TestTargetMirror | TestTargetMirrorWithTarget>(
      'test-target-mirrors.get',
      params
    );
  }

  async getTestTargetMirrorByProductionTarget(params: {
    productionTargetId: string;
  }): Promise<DashboardResponsePayload<TestTargetMirror>> {
    return this.executeDashboardRequest<TestTargetMirror>(
      'test-target-mirrors.get-by-production-target',
      params
    );
  }

  async getTestTargetMirrorByTestSymbol(params: {
    testSymbol: string;
  }): Promise<DashboardResponsePayload<TestTargetMirror>> {
    return this.executeDashboardRequest<TestTargetMirror>(
      'test-target-mirrors.get-by-test-symbol',
      params
    );
  }

  async createTestTargetMirror(
    params: TestTargetMirrorCreateParams
  ): Promise<DashboardResponsePayload<TestTargetMirror>> {
    return this.executeDashboardRequest<TestTargetMirror>(
      'test-target-mirrors.create',
      params as unknown as Record<string, unknown>
    );
  }

  async ensureTestTargetMirror(
    params: TestTargetMirrorEnsureParams
  ): Promise<DashboardResponsePayload<{ mirror: TestTargetMirror; created: boolean }>> {
    return this.executeDashboardRequest<{ mirror: TestTargetMirror; created: boolean }>(
      'test-target-mirrors.ensure',
      params as unknown as Record<string, unknown>
    );
  }

  async deleteTestTargetMirror(params: {
    id: string;
  }): Promise<DashboardResponsePayload<{ deleted: boolean; id: string; test_symbol: string }>> {
    return this.executeDashboardRequest<{ deleted: boolean; id: string; test_symbol: string }>(
      'test-target-mirrors.delete',
      params
    );
  }

  // ==========================================================================
  // PHASE 5: LEARNING PROMOTION OPERATIONS
  // ==========================================================================

  /**
   * Get promotion candidates - test learnings ready for promotion
   */
  async getPromotionCandidates(
    page?: number,
    pageSize?: number
  ): Promise<DashboardResponsePayload<unknown[]>> {
    return this.executeDashboardRequest<unknown[]>(
      'learning-promotion.list-candidates',
      undefined,
      undefined,
      { page, pageSize }
    );
  }

  /**
   * Validate a learning for promotion
   */
  async validateLearning(
    learningId: string
  ): Promise<DashboardResponsePayload<unknown>> {
    return this.executeDashboardRequest<unknown>(
      'learning-promotion.validate',
      { learningId }
    );
  }

  /**
   * Promote a learning to production
   */
  async promoteLearning(params: {
    learningId: string;
    reviewerNotes?: string;
    backtestResult?: Record<string, unknown>;
    scenarioRunIds?: string[];
  }): Promise<DashboardResponsePayload<{
    success: boolean;
    productionLearningId: string;
    promotionHistoryId: string;
  }>> {
    return this.executeDashboardRequest<{
      success: boolean;
      productionLearningId: string;
      promotionHistoryId: string;
    }>('learning-promotion.promote', params);
  }

  /**
   * Reject a learning with reason
   */
  async rejectLearning(params: {
    learningId: string;
    reason: string;
  }): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'learning-promotion.reject',
      params
    );
  }

  /**
   * Get promotion history
   */
  async getPromotionHistory(
    page?: number,
    pageSize?: number
  ): Promise<DashboardResponsePayload<unknown[]>> {
    return this.executeDashboardRequest<unknown[]>(
      'learning-promotion.history',
      undefined,
      undefined,
      { page, pageSize }
    );
  }

  /**
   * Get promotion statistics
   */
  async getPromotionStats(): Promise<DashboardResponsePayload<unknown>> {
    return this.executeDashboardRequest<unknown>(
      'learning-promotion.stats'
    );
  }

  /**
   * Run a backtest on a learning
   */
  async runBacktest(params: {
    learningId: string;
    windowDays?: number;
  }): Promise<DashboardResponsePayload<unknown>> {
    return this.executeDashboardRequest<unknown>(
      'learning-promotion.run-backtest',
      params
    );
  }

  // ==========================================================================
  // MANUAL PROCESSING OPERATIONS
  // ==========================================================================
  // These actions allow manual triggering of pipeline steps:
  // 1. crawlSources: Source crawl → Article creation (in crawler schema)
  // 2. processArticles: Article → Predictor creation (new unified flow)
  // 3. generatePredictions: Predictor → Prediction generation
  //
  // NOTE: processSignals is DEPRECATED - use processArticles instead.
  // The signals intermediate layer has been removed; predictors are now
  // created directly from articles via the ArticleProcessorService.

  /**
   * Process crawler articles to create predictors directly
   * This is the new unified flow that replaces signals.
   *
   * Articles are analyzed for instrument relevance, then run through
   * the analyst ensemble to create predictors.
   *
   * @param params.targetId - Target to process articles for (single target)
   * @param params.universeId - Process articles for all active targets in universe
   * @param params.batchSize - Max articles to process (default: 20)
   */
  async processArticles(params: {
    targetId?: string;
    universeId?: string;
    batchSize?: number;
  }): Promise<DashboardResponsePayload<{
    articlesProcessed: number;
    predictorsCreated: number;
    targetsAnalyzed: number;
    errors: number;
    message: string;
  }>> {
    return this.executeDashboardRequest<{
      articlesProcessed: number;
      predictorsCreated: number;
      targetsAnalyzed: number;
      errors: number;
      message: string;
    }>('articles.process', params);
  }

  /**
   * @deprecated Use processArticles instead. Signals have been removed;
   * predictors are now created directly from articles.
   *
   * This method is kept for backward compatibility but may not work
   * as the backend signal processing has been removed.
   */
  async processSignals(params: {
    targetId?: string;
    universeId?: string;
    batchSize?: number;
    includeTest?: boolean;
  }): Promise<DashboardResponsePayload<{
    // Single target response
    processed?: number;
    predictorsCreated?: number;
    rejected?: number;
    errors?: number;
    results?: Array<{
      signalId: string;
      status: 'predictor_created' | 'rejected' | 'error';
      confidence?: number;
      direction?: string;
      error?: string;
    }>;
    // Universe-level response
    targetsProcessed?: number;
    totalProcessed?: number;
    totalPredictorsCreated?: number;
    totalRejected?: number;
    totalErrors?: number;
    targetResults?: Array<{
      targetId: string;
      targetSymbol: string;
      processed: number;
      predictorsCreated: number;
      rejected: number;
      errors: number;
    }>;
    message: string;
  }>> {
    return this.executeDashboardRequest<{
      processed?: number;
      predictorsCreated?: number;
      rejected?: number;
      errors?: number;
      results?: Array<{
        signalId: string;
        status: 'predictor_created' | 'rejected' | 'error';
        confidence?: number;
        direction?: string;
        error?: string;
      }>;
      targetsProcessed?: number;
      totalProcessed?: number;
      totalPredictorsCreated?: number;
      totalRejected?: number;
      totalErrors?: number;
      targetResults?: Array<{
        targetId: string;
        targetSymbol: string;
        processed: number;
        predictorsCreated: number;
        rejected: number;
        errors: number;
      }>;
      message: string;
    }>('signals.process', params);
  }

  /**
   * Manually generate predictions from active predictors
   * Evaluates thresholds and creates predictions for targets
   *
   * @param params.targetId - Single target to generate for
   * @param params.universeId - Generate for all active targets in universe
   * @param params.forceGenerate - Force generation even if thresholds not met (future use)
   */
  async generatePredictions(params: {
    targetId?: string;
    universeId?: string;
    forceGenerate?: boolean;
    filters?: {
      includeTestData?: boolean;
    };
  }): Promise<DashboardResponsePayload<{
    generated: number;
    skipped: number;
    errors: number;
    results: Array<{
      targetId: string;
      targetSymbol?: string;
      status: 'prediction_generated' | 'threshold_not_met' | 'no_predictors' | 'error';
      predictionId?: string;
      direction?: string;
      confidence?: number;
      predictorCount?: number;
      error?: string;
    }>;
    message: string;
  }>> {
    return this.executeDashboardRequest<{
      generated: number;
      skipped: number;
      errors: number;
      results: Array<{
        targetId: string;
        targetSymbol?: string;
        status: 'prediction_generated' | 'threshold_not_met' | 'no_predictors' | 'error';
        predictionId?: string;
        direction?: string;
        confidence?: number;
        predictorCount?: number;
        error?: string;
      }>;
      message: string;
    }>('predictions.generate', params);
  }

  /**
   * Manually crawl sources and create signals
   * Triggers source crawling and persists resulting signals
   *
   * @param params.id - Single source to crawl
   * @param params.targetId - Crawl all sources for a target
   * @param params.universeId - Crawl all sources for a universe
   */
  async crawlSources(params: {
    id?: string;
    targetId?: string;
    universeId?: string;
  }): Promise<DashboardResponsePayload<{
    sourcesProcessed: number;
    successCount: number;
    errorCount: number;
    skippedCount: number;
    totalSignalsCreated: number;
    results: Array<{
      sourceId: string;
      sourceName: string;
      sourceUrl: string;
      status: 'success' | 'error' | 'skipped';
      signalsCreated?: number;
      error?: string;
    }>;
    message: string;
  }>> {
    return this.executeDashboardRequest<{
      sourcesProcessed: number;
      successCount: number;
      errorCount: number;
      skippedCount: number;
      totalSignalsCreated: number;
      results: Array<{
        sourceId: string;
        sourceName: string;
        sourceUrl: string;
        status: 'success' | 'error' | 'skipped';
        signalsCreated?: number;
        error?: string;
      }>;
      message: string;
    }>('sources.crawl', params);
  }

  /**
   * Run the full prediction pipeline for a universe
   * Executes all steps in sequence:
   * 1. Crawl sources -> Create articles in crawler schema
   * 2. Process articles -> Create predictors directly (unified flow)
   * 3. Generate predictions -> Create predictions from predictors
   *
   * NOTE: The signals intermediate layer has been removed. Articles
   * are now processed directly into predictors via ArticleProcessorService.
   *
   * @param params.universeId - Universe to run the pipeline for
   * @param params.batchSize - Max articles to process per target (default: 50)
   * @param params.includeTest - Include test data (default: false)
   */
  async runFullPipeline(params: {
    universeId: string;
    batchSize?: number;
    includeTest?: boolean;
  }): Promise<{
    success: boolean;
    crawlResult: {
      sourcesProcessed: number;
      signalsCreated: number;
      errors: number;
      message: string;
    };
    processResult: {
      targetsProcessed: number;
      signalsProcessed: number;
      predictorsCreated: number;
      errors: number;
      message: string;
    };
    generateResult: {
      predictionsGenerated: number;
      skipped: number;
      errors: number;
      message: string;
    };
    summary: string;
  }> {
    const batchSize = params.batchSize ?? 50;
    const includeTest = params.includeTest ?? false;

    // Step 1: Crawl sources
    let crawlResult = {
      sourcesProcessed: 0,
      signalsCreated: 0,
      errors: 0,
      message: 'Not started',
    };

    try {
      const crawlResponse = await this.crawlSources({
        universeId: params.universeId,
      });
      if (crawlResponse.content) {
        crawlResult = {
          sourcesProcessed: crawlResponse.content.sourcesProcessed,
          signalsCreated: crawlResponse.content.totalSignalsCreated,
          errors: crawlResponse.content.errorCount,
          message: crawlResponse.content.message,
        };
      }
    } catch (error) {
      crawlResult = {
        sourcesProcessed: 0,
        signalsCreated: 0,
        errors: 1,
        message: error instanceof Error ? error.message : 'Crawl failed',
      };
    }

    // Step 2: Process articles directly into predictors (unified flow)
    let processResult = {
      targetsProcessed: 0,
      signalsProcessed: 0, // Kept for compatibility, now represents articles processed
      predictorsCreated: 0,
      errors: 0,
      message: 'Not started',
    };

    try {
      const processResponse = await this.processArticles({
        universeId: params.universeId,
        batchSize,
      });
      if (processResponse.content) {
        processResult = {
          targetsProcessed: processResponse.content.targetsAnalyzed ?? 0,
          signalsProcessed: processResponse.content.articlesProcessed ?? 0,
          predictorsCreated: processResponse.content.predictorsCreated ?? 0,
          errors: processResponse.content.errors ?? 0,
          message: processResponse.content.message,
        };
      }
    } catch (error) {
      processResult = {
        targetsProcessed: 0,
        signalsProcessed: 0,
        predictorsCreated: 0,
        errors: 1,
        message: error instanceof Error ? error.message : 'Article processing failed',
      };
    }

    // Step 3: Generate predictions
    let generateResult = {
      predictionsGenerated: 0,
      skipped: 0,
      errors: 0,
      message: 'Not started',
    };

    try {
      const generateResponse = await this.generatePredictions({
        universeId: params.universeId,
        filters: { includeTestData: includeTest },
      });
      if (generateResponse.content) {
        generateResult = {
          predictionsGenerated: generateResponse.content.generated,
          skipped: generateResponse.content.skipped,
          errors: generateResponse.content.errors,
          message: generateResponse.content.message,
        };
      }
    } catch (error) {
      generateResult = {
        predictionsGenerated: 0,
        skipped: 0,
        errors: 1,
        message: error instanceof Error ? error.message : 'Prediction generation failed',
      };
    }

    // Build summary
    const totalErrors = crawlResult.errors + processResult.errors + generateResult.errors;
    const success = totalErrors === 0;
    const summary = `Pipeline complete: ${crawlResult.signalsCreated} articles crawled, ${processResult.predictorsCreated} predictors created, ${generateResult.predictionsGenerated} predictions generated${totalErrors > 0 ? ` (${totalErrors} errors)` : ''}`;

    return {
      success,
      crawlResult,
      processResult,
      generateResult,
      summary,
    };
  }

  // ============================================================================
  // AGENT ACTIVITY (Phase 7 - Self-Modification Notifications)
  // ============================================================================

  /**
   * List agent self-modification activity
   */
  async listAgentActivity(
    params?: { analystId?: string; acknowledged?: boolean; limit?: number },
  ): Promise<DashboardResponsePayload<AgentActivityItem[]>> {
    return this.executeDashboardRequest<AgentActivityItem[]>(
      'agent_activity.list',
      params,
    );
  }

  /**
   * Acknowledge a single agent activity item
   */
  async acknowledgeAgentActivity(
    activityId: string,
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'agent_activity.acknowledge',
      { id: activityId },
    );
  }

  /**
   * Acknowledge all unacknowledged agent activity
   */
  async acknowledgeAllAgentActivity(): Promise<
    DashboardResponsePayload<{ success: boolean; count: number }>
  > {
    return this.executeDashboardRequest<{ success: boolean; count: number }>(
      'agent_activity.acknowledge_all',
    );
  }

  // ============================================================================
  // LEARNING SESSION (Phase 7 - Bidirectional Learning)
  // ============================================================================

  /**
   * Start a learning session with an analyst
   */
  async startLearningSession(
    analystId: string,
  ): Promise<DashboardResponsePayload<LearningSessionResponse>> {
    return this.executeDashboardRequest<LearningSessionResponse>(
      'learning_session.start',
      { analystId },
    );
  }

  /**
   * Get fork comparison report for an analyst
   */
  async getForkComparison(
    analystId: string,
    period?: string,
  ): Promise<DashboardResponsePayload<ForkComparisonReport>> {
    return this.executeDashboardRequest<ForkComparisonReport>(
      'learning_session.compare',
      { analystId, period },
    );
  }

  /**
   * Create a learning exchange (ask a question)
   */
  async createLearningExchange(params: {
    analystId: string;
    initiatedBy: 'user' | 'agent';
    question: string;
    contextDiff?: Record<string, unknown>;
  }): Promise<DashboardResponsePayload<LearningExchange>> {
    return this.executeDashboardRequest<LearningExchange>(
      'learning_session.ask',
      params,
    );
  }

  /**
   * Respond to a learning exchange
   */
  async respondToExchange(params: {
    exchangeId: string;
    response: string;
  }): Promise<DashboardResponsePayload<LearningExchange>> {
    return this.executeDashboardRequest<LearningExchange>(
      'learning_session.respond',
      params,
    );
  }

  /**
   * Update exchange outcome (adopt, reject, note)
   */
  async updateExchangeOutcome(params: {
    exchangeId: string;
    outcome: 'adopted' | 'rejected' | 'noted';
    adoptionDetails?: Record<string, unknown>;
  }): Promise<DashboardResponsePayload<LearningExchange>> {
    return this.executeDashboardRequest<LearningExchange>(
      'learning_session.outcome',
      params,
    );
  }

  /**
   * End a learning session
   */
  async endLearningSession(
    analystId: string,
  ): Promise<DashboardResponsePayload<{ success: boolean }>> {
    return this.executeDashboardRequest<{ success: boolean }>(
      'learning_session.end',
      { analystId },
    );
  }

  // ============================================================================
  // ANALYST VERSION HISTORY (Phase 7 - Context Versioning)
  // ============================================================================

  /**
   * Get analyst context version history
   */
  async getAnalystVersionHistory(
    analystId: string,
    forkType?: 'user' | 'agent',
  ): Promise<DashboardResponsePayload<AnalystContextVersion[]>> {
    return this.executeDashboardRequest<AnalystContextVersion[]>(
      'analyst.version_history',
      { analystId, forkType },
    );
  }

  /**
   * Rollback analyst context to a specific version
   */
  async rollbackAnalystVersion(params: {
    analystId: string;
    targetVersionId: string;
    forkType: 'user' | 'agent';
    reason: string;
  }): Promise<DashboardResponsePayload<{ success: boolean; newVersion: AnalystContextVersion }>> {
    return this.executeDashboardRequest<{ success: boolean; newVersion: AnalystContextVersion }>(
      'analyst.rollback',
      params,
    );
  }

  // ============================================================================
  // USER PORTFOLIO & TRADING (Phase 4)
  // ============================================================================

  /**
   * Get user's portfolio with open positions and P&L
   */
  async getUserPortfolio(): Promise<DashboardResponsePayload<UserPortfolioSummary>> {
    return this.executeDashboardRequest<UserPortfolioSummary>('prediction.portfolio', {});
  }

  /**
   * Create a position from a prediction (take the trade)
   */
  async usePrediction(params: {
    id: string;
    quantity: number;
    entryPrice?: number;
  }): Promise<DashboardResponsePayload<PositionCreationResult>> {
    return this.executeDashboardRequest<PositionCreationResult>('prediction.use', params);
  }

  /**
   * Calculate recommended position size for a prediction
   */
  async calculatePositionSize(
    predictionId: string,
  ): Promise<DashboardResponsePayload<PositionSizeRecommendation>> {
    return this.executeDashboardRequest<PositionSizeRecommendation>(
      'prediction.calculateSize',
      { id: predictionId },
    );
  }

  /**
   * Get closed positions history with statistics
   */
  async getClosedPositions(filters?: {
    startDate?: string;
    endDate?: string;
    symbol?: string;
    limit?: number;
  }): Promise<DashboardResponsePayload<ClosedPositionsResult>> {
    return this.executeDashboardRequest<ClosedPositionsResult>('prediction.closedPositions', {
      filters,
    });
  }

  /**
   * Close an open position at the specified exit price
   */
  async closePosition(
    positionId: string,
    exitPrice: number,
  ): Promise<DashboardResponsePayload<ClosePositionResult>> {
    return this.executeDashboardRequest<ClosePositionResult>('prediction.closePosition', {
      id: positionId,
      exitPrice,
    });
  }

  // ============================================================================
  // EOD TRADE QUEUE
  // ============================================================================

  /**
   * Queue a trade for end-of-day settlement
   */
  async queueTrade(params: {
    id: string;
    quantity: number;
  }): Promise<DashboardResponsePayload<QueueTradeResult>> {
    return this.executeDashboardRequest<QueueTradeResult>('prediction.queue', params);
  }

  /**
   * Get user's pending queued trades
   */
  async getTradeQueue(): Promise<DashboardResponsePayload<TradeQueueResult>> {
    return this.executeDashboardRequest<TradeQueueResult>('prediction.getQueue', {});
  }

  /**
   * Cancel a pending queued trade
   */
  async cancelQueuedTrade(
    tradeId: string,
  ): Promise<DashboardResponsePayload<CancelQueuedTradeResult>> {
    return this.executeDashboardRequest<CancelQueuedTradeResult>('prediction.cancelQueuedTrade', {
      tradeId,
    });
  }

  // ============================================================================
  // ANALYST LEADERBOARD (Fork Comparison)
  // ============================================================================

  /**
   * Get all analysts with user vs agent fork comparison
   * Returns portfolio performance for both forks
   */
  async getAnalystForksSummary(): Promise<DashboardResponsePayload<AnalystForksSummary>> {
    return this.executeDashboardRequest<AnalystForksSummary>('analyst.forksSummary', {});
  }

  /**
   * Compare user vs agent fork for a specific analyst
   */
  async compareAnalystForks(
    analystId: string,
  ): Promise<DashboardResponsePayload<AnalystForkComparison>> {
    return this.executeDashboardRequest<AnalystForkComparison>('analyst.compareForks', {
      id: analystId,
    });
  }

  /**
   * Get analyst positions for all forks (or a specific fork)
   * Returns portfolio summary + open positions per fork
   */
  async getAnalystPositions(
    analystId: string,
    forkType?: 'user' | 'ai' | 'arbitrator',
  ): Promise<DashboardResponsePayload<AnalystPositionsResult>> {
    return this.executeDashboardRequest<AnalystPositionsResult>('analyst.positions', {
      id: analystId,
      forkType,
    });
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UserPortfolioSummary {
  portfolio: {
    id: string;
    initialBalance: number;
    currentBalance: number;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
  };
  openPositions: UserPosition[];
  summary: {
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    winRate: number;
    openPositionCount: number;
  };
}

export interface UserPosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface PositionCreationResult {
  position: {
    id: string;
    symbol: string;
    direction: 'long' | 'short';
    quantity: number;
    entryPrice: number;
    portfolioId: string;
  };
  portfolioUpdate: {
    previousBalance: number;
    newBalance: number;
  };
}

export interface PositionSizeRecommendation {
  predictionId: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  currentPrice: number;
  recommendedQuantity: number;
  riskAmount: number;
  riskRewardRatio: number;
  reasoning: string;
}

export interface ClosedPosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  realizedPnl: number;
  pnlPercent: number;
  openedAt: string;
  closedAt: string | null;
  predictionId: string;
  targetId: string;
}

export interface ClosedPositionsResult {
  positions: ClosedPosition[];
  statistics: {
    totalClosed: number;
    wins: number;
    losses: number;
    totalPnl: number;
    avgPnl: number;
    winRate: number;
  };
}

export interface ClosePositionResult {
  positionId: string;
  realizedPnl: number;
  isWin: boolean;
  message: string;
}

export interface QueuedTrade {
  id: string;
  predictionId: string;
  symbol: string;
  direction: string;
  quantity: number;
  status: string;
  queuedAt: string;
}

export interface QueueTradeResult {
  queueEntry: QueuedTrade;
  message: string;
}

export interface TradeQueueResult {
  trades: QueuedTrade[];
  count: number;
}

export interface CancelQueuedTradeResult {
  tradeId: string;
  message: string;
}

export interface AnalystForksSummary {
  comparisons: AnalystForkComparisonRow[];
  summary: {
    totalAnalysts: number;
    agentOutperforming: number;
    userOutperforming: number;
    statusBreakdown: Record<string, number>;
  };
}

export interface AnalystForkComparisonRow {
  analyst_id: string;
  slug: string;
  name: string;
  perspective: string;
  user_pnl: number;
  user_win_count: number;
  user_loss_count: number;
  agent_pnl: number;
  agent_win_count: number;
  agent_loss_count: number;
  arbitrator_pnl: number;
  arbitrator_win_count: number;
  arbitrator_loss_count: number;
  pnl_difference: number;
  comparison_status: 'agent_winning' | 'user_winning' | 'tied' | 'warning';
}

export interface AnalystForkComparison {
  analyst: {
    id: string;
    slug: string;
    name: string;
    perspective: string;
  };
  userFork: {
    balance: number;
    pnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  agentFork: {
    balance: number;
    pnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  comparison: {
    pnlDiff: { absolute: number; percent: number };
    contextDiff: {
      perspectiveChanged: boolean;
      signalPreferencesChanged: boolean;
      riskToleranceChanged: boolean;
    };
    suggestion: string;
  };
}

export interface AnalystPositionsResult {
  analyst: {
    id: string;
    slug: string;
    name: string;
    perspective: string;
  };
  forks: AnalystForkPositions[];
}

export interface AnalystForkPositions {
  forkType: 'user' | 'ai' | 'arbitrator';
  portfolio: {
    id: string;
    initialBalance: number;
    currentBalance: number;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    winCount: number;
    lossCount: number;
    status: string;
  } | null;
  openPositions: AnalystPosition[];
  positionCount: number;
}

export interface AnalystPosition {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  predictionId: string | null;
  isPaperOnly: boolean;
  openedAt: string;
}

export const predictionDashboardService = new PredictionDashboardService();
