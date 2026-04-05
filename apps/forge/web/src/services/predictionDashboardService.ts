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
import { usePredictionStore } from '@/stores/predictionStore';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import type { ExecutionContext, JsonValue } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload, DashboardResponsePayload } from '@/types/forge-types';
import { divinerBridgeService } from '@/services/divinerBridgeService';
import type {
  UniverseListParams,
  UniverseGetParams,
  TargetListParams,
  TargetGetParams,
  PredictionListParams,
  PredictionGetParams,
  PredictionGetSnapshotParams,
  SourceListParams,
  SourceGetParams,
  StrategyListParams,
  // Analyst params
  AnalystListParams,
  // Learning params
  LearningListParams,
  // Learning queue params
  LearningQueueListParams,
  // Review queue params
  ReviewQueueListParams,
  // Missed opportunity params
  MissedOpportunityListParams,
  // Tool request params
  ToolRequestListParams,
  // Entity types
  PredictionUniverse,
  PredictionTarget,
  PriceHistoryPeriod,
  InstrumentPrice,
  PriceHistoryData,
  DailyReportSummary,
  DailyReportRun,
  DailyReportRecommendation,
  Prediction,
  PredictionSnapshot,
  PredictionDeepDive,
  PredictionSource,
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
  TestScenarioExport,
  ReplayTestStatus,
  ReplayTest,
  ReplayTestSummary,
  ReplayTestResult,
  ReplayTestPreviewParams,
  ReplayTestPreviewResult,
  TestArticle,
  TestArticleListParams,
  TestPriceData,
  TestPriceDataListParams,
  TestTargetMirror,
  TestTargetMirrorWithTarget,
  TestTargetMirrorListParams,
} from '@/types/prediction-agent';

// Re-export entity types and read-only params so consumers can import them from here
// REMOVED write params (Create/Update/Delete/Respond) — Enterprise is read-only
export type {
  // Analyst params
  AnalystListParams,
  // Learning params
  LearningListParams,
  // Learning queue params
  LearningQueueListParams,
  // Review queue params
  ReviewQueueListParams,
  // Missed opportunity params
  MissedOpportunityListParams,
  // Tool request params
  ToolRequestListParams,
  // Entity types
  PredictionUniverse,
  PredictionTarget,
  PriceHistoryPeriod,
  InstrumentPrice,
  PriceHistoryData,
  DailyReportSummary,
  DailyReportRun,
  DailyReportRecommendation,
  Prediction,
  PredictionSnapshot,
  PredictionDeepDive,
  PredictionSource,
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
  TestScenarioExport,
  ReplayTestStatus,
  ReplayTest,
  ReplayTestSummary,
  ReplayTestResult,
  ReplayTestPreviewParams,
  ReplayTestPreviewResult,
  TestArticle,
  TestArticleListParams,
  TestPriceData,
  TestPriceDataListParams,
  TestTargetMirror,
  TestTargetMirrorWithTarget,
  TestTargetMirrorListParams,
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

    // All data flows through Diviner via Bridge (Gatekeeper).
    // Enterprise is read-only — it displays what Diviner produces.
    const bridgeResult = await divinerBridgeService.executeDashboardAction(
      action,
      { ...(params ?? {}), ...(filters ?? {}), ...(pagination ?? {}) }
    );
    // Normalize to DashboardResponsePayload<T> shape that callers expect
    const bridgeContent = bridgeResult.content as T | null;
    return bridgeContent !== null && typeof bridgeContent === 'object' && 'content' in (bridgeContent as object)
      ? (bridgeContent as unknown as DashboardResponsePayload<T>)
      : ({ content: bridgeContent } as DashboardResponsePayload<T>);
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

  // WRITE OPERATIONS REMOVED — Enterprise is read-only via Diviner

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

  // Target WRITE OPERATIONS REMOVED — Enterprise is read-only via Diviner

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

  // REMOVED: runDailyReport — Enterprise is read-only

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

  // REMOVED: decideDailyReportRecommendation — Enterprise is read-only

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
   *
   * When using Diviner bridge, deep-dive data is synthesized from
   * already-loaded predictions (analyst assessments are inline).
   */
  async getPredictionDeepDive(
    params: { id: string }
  ): Promise<DashboardResponsePayload<PredictionDeepDive>> {
    // When using Diviner bridge, build deep-dive from local prediction data
    if (import.meta.env.VITE_USE_DIVINER_BRIDGE === 'true') {
      const store = usePredictionStore();
      const prediction = store.predictions.find(
        (p: Prediction) => p.id === params.id
      );
      if (prediction?.analystAssessments) {
        return {
          content: {
            predictionId: prediction.id,
            analysis: prediction.reasoning || '',
            factors: [],
            risks: [],
            opportunities: [],
            // The modal reads from lineage.analystAssessments
            lineage: {
              analystAssessments: prediction.analystAssessments,
            },
          } as unknown as PredictionDeepDive,
        } as DashboardResponsePayload<PredictionDeepDive>;
      }
    }

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

  // REMOVED: createSource — Enterprise is read-only
  // REMOVED: updateSource — Enterprise is read-only
  // REMOVED: deleteSource — Enterprise is read-only
  // REMOVED: testCrawl — Enterprise is read-only

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

  // REMOVED: createAnalyst — Enterprise is read-only
  // REMOVED: updateAnalyst — Enterprise is read-only
  // REMOVED: deleteAnalyst — Enterprise is read-only

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

  // REMOVED: createLearning — Enterprise is read-only
  // REMOVED: updateLearning — Enterprise is read-only
  // REMOVED: deleteLearning — Enterprise is read-only

  async listLearningQueue(
    params?: LearningQueueListParams
  ): Promise<DashboardResponsePayload<LearningQueueItem[]>> {
    return this.executeDashboardRequest<LearningQueueItem[]>(
      'learnings.listQueue',
      undefined,
      params as unknown as Record<string, unknown> | undefined
    );
  }

  // REMOVED: respondToLearningQueue — Enterprise is read-only

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

  // REMOVED: respondToReviewQueue — Enterprise is read-only

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

  // REMOVED: triggerMissedOpportunityAnalysis — Enterprise is read-only

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

  // REMOVED: createToolRequest — Enterprise is read-only
  // REMOVED: updateToolRequestStatus — Enterprise is read-only
  // REMOVED: deleteToolRequest — Enterprise is read-only

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
    // Include the data-level agentSlug in prediction filters so the API handler
    // can scope universe lookups correctly. context.agentSlug is the routing key
    // ('predictor') which differs from the data-level slug ('us-tech-stocks').
    const predictionFilters = universeId
      ? { universeId, agentSlug: effectiveAgent, includeTestData, status: 'active' as const }
      : { agentSlug: effectiveAgent, includeTestData, status: 'active' as const };

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

    console.log('[DashboardService] Raw API responses:', {
      effectiveAgent,
      universesRaw: universesRes.content,
      predictionsRaw: predictionsRes.content,
      universesCount: universes.length,
      predictionsCount: predictions.length,
      predictionFilters,
    });

    if (agentSlug) {
      universes = universes.filter((u: PredictionUniverse) => u.agentSlug === agentSlug);
      const universeIds = new Set(universes.map((u: PredictionUniverse) => u.id));
      console.log('[DashboardService] Filtering by agent:', {
        agentSlug,
        filteredUniverses: universes.length,
        universeIds: [...universeIds],
        predictionsBeforeFilter: predictions.length,
        samplePrediction: predictions[0],
      });
      predictions = predictions.filter((p: Prediction) => universeIds.has(p.universeId));
      console.log('[DashboardService] After universe filter:', predictions.length);
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

  // REMOVED: createTestScenario — Enterprise is read-only
  // REMOVED: updateTestScenario — Enterprise is read-only
  // REMOVED: deleteTestScenario — Enterprise is read-only
  // REMOVED: injectTestData — Enterprise is read-only
  // REMOVED: generateTestData — Enterprise is read-only
  // REMOVED: runTestTier — Enterprise is read-only
  // REMOVED: cleanupTestData — Enterprise is read-only

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

  // REMOVED: importTestScenario — Enterprise is read-only

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

  // REMOVED: createReplayTest — Enterprise is read-only
  // REMOVED: deleteReplayTest — Enterprise is read-only

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

  // REMOVED: runReplayTest — Enterprise is read-only

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

  // REMOVED: createTestArticle — Enterprise is read-only
  // REMOVED: updateTestArticle — Enterprise is read-only
  // REMOVED: deleteTestArticle — Enterprise is read-only
  // REMOVED: bulkCreateTestArticles — Enterprise is read-only
  // REMOVED: markTestArticleProcessed — Enterprise is read-only

  async listUnprocessedTestArticles(params?: {
    scenarioId?: string;
    targetSymbol?: string;
  }): Promise<DashboardResponsePayload<TestArticle[]>> {
    return this.executeDashboardRequest<TestArticle[]>(
      'test-articles.list-unprocessed',
      params
    );
  }

  // REMOVED: generateTestArticle — Enterprise is read-only

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

  // REMOVED: createTestPriceData — Enterprise is read-only
  // REMOVED: updateTestPriceData — Enterprise is read-only
  // REMOVED: deleteTestPriceData — Enterprise is read-only
  // REMOVED: bulkCreateTestPriceData — Enterprise is read-only

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

  // REMOVED: generateScenarioFromMissed — Enterprise is read-only
  // REMOVED: generateScenarioFromLearning — Enterprise is read-only

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

  // REMOVED: createTestTargetMirror — Enterprise is read-only
  // REMOVED: ensureTestTargetMirror — Enterprise is read-only
  // REMOVED: deleteTestTargetMirror — Enterprise is read-only

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

  // REMOVED: validateLearning — Enterprise is read-only
  // REMOVED: promoteLearning — Enterprise is read-only
  // REMOVED: rejectLearning — Enterprise is read-only

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

  // REMOVED: runBacktest — Enterprise is read-only

  // REMOVED: processArticles — Enterprise is read-only
  // REMOVED: processSignals — Enterprise is read-only
  // REMOVED: generatePredictions — Enterprise is read-only
  // REMOVED: crawlSources — Enterprise is read-only
  // REMOVED: runFullPipeline — Enterprise is read-only

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

  // REMOVED: acknowledgeAgentActivity — Enterprise is read-only
  // REMOVED: acknowledgeAllAgentActivity — Enterprise is read-only

  // ============================================================================
  // LEARNING SESSION (Phase 7 - Bidirectional Learning)
  // ============================================================================

  // REMOVED: startLearningSession — Enterprise is read-only

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

  // REMOVED: createLearningExchange — Enterprise is read-only
  // REMOVED: respondToExchange — Enterprise is read-only
  // REMOVED: updateExchangeOutcome — Enterprise is read-only
  // REMOVED: endLearningSession — Enterprise is read-only

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

  // REMOVED: rollbackAnalystVersion — Enterprise is read-only

  // ============================================================================
  // USER PORTFOLIO & TRADING (Phase 4)
  // ============================================================================

  /**
   * Get user's portfolio with open positions and P&L
   */
  async getUserPortfolio(): Promise<DashboardResponsePayload<UserPortfolioSummary>> {
    return this.executeDashboardRequest<UserPortfolioSummary>('prediction.portfolio', {});
  }

  // REMOVED: usePrediction — Enterprise is read-only

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

  // REMOVED: closePosition — Enterprise is read-only

  // ============================================================================
  // EOD TRADE QUEUE
  // ============================================================================

  // REMOVED: queueTrade — Enterprise is read-only

  /**
   * Get user's pending queued trades
   */
  async getTradeQueue(): Promise<DashboardResponsePayload<TradeQueueResult>> {
    return this.executeDashboardRequest<TradeQueueResult>('prediction.getQueue', {});
  }

  // REMOVED: cancelQueuedTrade — Enterprise is read-only

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
