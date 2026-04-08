import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';
import { parseCallerName } from './caller-name.util';

// ---------------------------------------------------------------------------
// Types for reasoning-aware list + lazy-load endpoints
// ---------------------------------------------------------------------------

export interface ListUsageFilters {
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

export interface LlmUsageRow {
  id: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runId: string;
  userId: string | null;
  conversationId: string | null;
  agentName: string | null;
  /** Parsed workflow slug from agentName (before the first colon, or the full name when no colon). */
  workflowSlug: string | null;
  /** Parsed node name from agentName (after the first colon; null when no colon present). */
  nodeName: string | null;
  providerName: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalCost: number | null;
  durationMs: number | null;
  status: string | null;
  hasReasoning: boolean;
  thinkingDurationMs: number | null;
  thinkingTokenCount: number | null;
}

export interface LlmUsageReasoningPayload {
  thinkingContent: string | null;
  thinkingDurationMs: number | null;
  thinkingTokenCount: number | null;
}

export interface LlmUsageRecord {
  product: string;
  orgSlug: string;
  agentSlug: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
}

export interface LlmUsageResponse {
  records: LlmUsageRecord[];
  totalCost: number;
  totalTokens: number;
  sources: string[];
}

/** Shape expected by Admin Web frontend */
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

export interface LlmModelStats {
  provider: string;
  model: string;
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  products: string[];
}

export interface LlmModelsResponse {
  models: LlmModelStats[];
  sources: string[];
}

/** Shape expected by Admin Web frontend */
export interface LlmModelFlat {
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

export interface LlmCostByProduct {
  product: string;
  totalCost: number;
  totalTokens: number;
  modelBreakdown: Record<string, number>;
}

export interface LlmCostsByOrgModel {
  orgSlug: string;
  totalCost: number;
  byProduct: LlmCostByProduct[];
}

export interface LlmCostsResponse {
  costs: LlmCostsByOrgModel[];
  grandTotalCost: number;
  sources: string[];
}

/** Shape expected by Admin Web frontend */
export interface LlmCostSummaryFlat {
  product: string;
  orgSlug: string;
  model: string;
  totalEstimatedCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
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

/**
 * LlmAnalyticsService — reads and manages LLM usage data and model configuration.
 *
 * No fallbacks: if a query fails, the error propagates.
 */
@Injectable()
export class LlmAnalyticsService {
  private readonly logger = new Logger(LlmAnalyticsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async getUsage(): Promise<LlmUsageSummary[]> {
    this.logger.log('[LlmAnalytics] Fetching LLM usage summaries from database');

    const { data, error } = await this.db.rawQuery(
      `SELECT
        COALESCE(agent_name, 'unknown') as agent,
        COALESCE(model_name, 'unknown') as model,
        COALESCE(provider_name, 'unknown') as provider,
        COUNT(*)::int as total_requests,
        COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int as total_output_tokens,
        COALESCE(SUM(input_tokens + output_tokens), 0)::int as total_tokens,
        MIN(started_at) as period_start,
        MAX(started_at) as period_end
      FROM llm_usage
      GROUP BY agent_name, model_name, provider_name
      ORDER BY total_requests DESC`,
    );

    if (error) {
      throw new Error(`Failed to aggregate llm_usage: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];

    return rows.map((row) => ({
      product: (row['agent'] as string) ?? 'unknown',
      model: (row['model'] as string) ?? 'unknown',
      provider: (row['provider'] as string) ?? 'unknown',
      totalRequests: Number(row['total_requests'] ?? 0),
      totalInputTokens: Number(row['total_input_tokens'] ?? 0),
      totalOutputTokens: Number(row['total_output_tokens'] ?? 0),
      totalTokens: Number(row['total_tokens'] ?? 0),
      periodStart: (row['period_start'] as string) ?? '',
      periodEnd: (row['period_end'] as string) ?? '',
    }));
  }

  async getModels(): Promise<LlmModelFlat[]> {
    this.logger.log('[LlmAnalytics] Fetching model stats from database');

    const [modelsResult, usageResult] = await Promise.all([
      this.db.from(null, 'llm_models').select('*'),
      this.db.rawQuery(
        `SELECT model_name, provider_name, COUNT(*) as total_calls,
         MAX(started_at) as last_used_at
         FROM llm_usage GROUP BY model_name, provider_name`,
      ),
    ]);

    if (modelsResult.error) {
      throw new Error(
        `Failed to query llm_models: ${modelsResult.error.message}`,
      );
    }
    if (usageResult.error) {
      throw new Error(
        `Failed to aggregate llm_usage: ${usageResult.error.message}`,
      );
    }

    const modelRows = (modelsResult.data as Record<string, unknown>[]) ?? [];
    const usageRows = (usageResult.data as Record<string, unknown>[]) ?? [];

    // Build a usage lookup keyed by "provider::model"
    const usageMap = new Map<
      string,
      { totalCalls: number; lastUsedAt: string | null }
    >();
    for (const row of usageRows) {
      const key = `${row['provider_name'] as string}::${row['model_name'] as string}`;
      usageMap.set(key, {
        totalCalls: Number(row['total_calls'] ?? 0),
        lastUsedAt: (row['last_used_at'] as string) ?? null,
      });
    }

    return modelRows.map((row) => {
      const key = `${row['provider_name'] as string}::${row['model_name'] as string}`;
      const usage = usageMap.get(key);
      const pricing = (row['pricing_info_json'] as Record<string, unknown>) ?? {};
      return {
        id: `${row['provider_name']}:${row['model_name']}`,
        slug: (row['model_name'] as string) ?? '',
        provider: (row['provider_name'] as string) ?? '',
        displayName: (row['display_name'] as string) ?? (row['model_name'] as string) ?? '',
        inputCostPer1k: Number(pricing['input_cost_per_1k'] ?? pricing['inputCostPer1k'] ?? 0),
        outputCostPer1k: Number(pricing['output_cost_per_1k'] ?? pricing['outputCostPer1k'] ?? 0),
        contextWindow: Number(row['context_window'] ?? 4096),
        enabled: row['is_active'] === true,
        usageCount: usage?.totalCalls ?? 0,
        lastUsedAt: usage?.lastUsedAt ?? null,
      };
    });
  }

  async getCosts(): Promise<LlmCostSummaryFlat[]> {
    this.logger.log('[LlmAnalytics] Fetching cost data from database');

    const { data, error } = await this.db.rawQuery(
      `SELECT
        COALESCE(agent_name, 'unknown') as product,
        COALESCE(model_name, 'unknown') as model,
        COALESCE(SUM(total_cost), 0)::float as total_cost,
        COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int as total_output_tokens
      FROM llm_usage
      GROUP BY agent_name, model_name
      ORDER BY total_cost DESC`,
    );

    if (error) {
      throw new Error(`Failed to aggregate llm_usage costs: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];

    return rows.map((row) => ({
      product: (row['product'] as string) ?? 'unknown',
      orgSlug: 'all',
      model: (row['model'] as string) ?? 'unknown',
      totalEstimatedCostUsd: Number(row['total_cost'] ?? 0),
      totalInputTokens: Number(row['total_input_tokens'] ?? 0),
      totalOutputTokens: Number(row['total_output_tokens'] ?? 0),
    }));
  }

  async createModel(req: CreateLlmModelRequest): Promise<LlmModelFlat> {
    this.logger.log(`[LlmAnalytics] Creating model ${req.provider}::${req.slug}`);

    const pricingJson = {
      input_cost_per_1k: req.inputCostPer1k,
      output_cost_per_1k: req.outputCostPer1k,
    };

    const { data, error } = await this.db
      .from(null, 'llm_models')
      .insert({
        model_name: req.slug,
        provider_name: req.provider,
        display_name: req.displayName,
        context_window: req.contextWindow,
        pricing_info_json: pricingJson,
        is_active: req.enabled,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create model: ${error.message}`);
    }

    const row = data as Record<string, unknown>;
    const pricing = (row['pricing_info_json'] as Record<string, unknown>) ?? {};
    return {
      id: `${row['provider_name']}:${row['model_name']}`,
      slug: row['model_name'] as string,
      provider: row['provider_name'] as string,
      displayName: (row['display_name'] as string) ?? (row['model_name'] as string),
      inputCostPer1k: Number(pricing['input_cost_per_1k'] ?? 0),
      outputCostPer1k: Number(pricing['output_cost_per_1k'] ?? 0),
      contextWindow: Number(row['context_window'] ?? 4096),
      enabled: row['is_active'] === true,
      usageCount: 0,
      lastUsedAt: null,
    };
  }

  // -------------------------------------------------------------------------
  // Reasoning-aware filtered list
  // -------------------------------------------------------------------------

  async listUsage(filters: ListUsageFilters): Promise<LlmUsageRow[]> {
    this.logger.log('[LlmAnalytics] listUsage called', filters);

    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    // Build parameterised SQL dynamically — no fallbacks, errors propagate.
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.agentName !== undefined) {
      conditions.push(`agent_name = $${paramIdx++}`);
      params.push(filters.agentName);
    }

    if (filters.provider !== undefined) {
      conditions.push(`provider_name = $${paramIdx++}`);
      params.push(filters.provider);
    }

    if (filters.model !== undefined) {
      conditions.push(`model_name = $${paramIdx++}`);
      params.push(filters.model);
    }

    if (filters.from !== undefined) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.from);
    }

    if (filters.to !== undefined) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.to);
    }

    if (filters.hasReasoning === true) {
      conditions.push('thinking_content IS NOT NULL');
    } else if (filters.hasReasoning === false) {
      conditions.push('thinking_content IS NULL');
    }

    // orgSlug: llm_usage has no org_slug column — skip silently (documented).
    // Phase 8 caller-name audit may add org join; for now it is a no-op filter.

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitParam = `$${paramIdx++}`;
    const offsetParam = `$${paramIdx++}`;
    params.push(limit, offset);

    const sql = `
      SELECT
        id,
        created_at,
        started_at,
        completed_at,
        run_id,
        user_id,
        conversation_id,
        agent_name,
        provider_name,
        model_name,
        input_tokens,
        output_tokens,
        total_cost,
        duration_ms,
        status,
        (thinking_content IS NOT NULL) AS has_reasoning,
        thinking_duration_ms,
        thinking_token_count
      FROM public.llm_usage
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { data, error } = await this.db.rawQuery(sql, params);

    if (error) {
      throw new Error(`Failed to list llm_usage: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];

    return rows.map((row) => {
      const agentName = (row['agent_name'] as string) ?? null;
      const { workflowSlug, nodeName } = parseCallerName(agentName);
      return {
      id: row['id'] as string,
      createdAt: row['created_at'] as string,
      startedAt: (row['started_at'] as string) ?? null,
      completedAt: (row['completed_at'] as string) ?? null,
      runId: row['run_id'] as string,
      userId: (row['user_id'] as string) ?? null,
      conversationId: (row['conversation_id'] as string) ?? null,
      agentName,
      workflowSlug,
      nodeName,
      providerName: (row['provider_name'] as string) ?? null,
      modelName: (row['model_name'] as string) ?? null,
      inputTokens: row['input_tokens'] != null ? Number(row['input_tokens']) : null,
      outputTokens: row['output_tokens'] != null ? Number(row['output_tokens']) : null,
      totalCost: row['total_cost'] != null ? Number(row['total_cost']) : null,
      durationMs: row['duration_ms'] != null ? Number(row['duration_ms']) : null,
      status: (row['status'] as string) ?? null,
      hasReasoning: row['has_reasoning'] === true,
      thinkingDurationMs:
        row['thinking_duration_ms'] != null ? Number(row['thinking_duration_ms']) : null,
      thinkingTokenCount:
        row['thinking_token_count'] != null ? Number(row['thinking_token_count']) : null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Lazy-load reasoning payload for a single row
  // -------------------------------------------------------------------------

  async getUsageReasoning(id: string): Promise<LlmUsageReasoningPayload> {
    this.logger.log(`[LlmAnalytics] getUsageReasoning id=${id}`);

    const { data, error } = await this.db.rawQuery(
      `SELECT thinking_content, thinking_duration_ms, thinking_token_count
       FROM public.llm_usage
       WHERE id = $1`,
      [id],
    );

    if (error) {
      throw new Error(`Failed to fetch reasoning for llm_usage ${id}: ${error.message}`);
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const row = rows[0];

    if (row === undefined) {
      throw new NotFoundException(`llm_usage row ${id} not found`);
    }

    return {
      thinkingContent: (row['thinking_content'] as string) ?? null,
      thinkingDurationMs:
        row['thinking_duration_ms'] != null ? Number(row['thinking_duration_ms']) : null,
      thinkingTokenCount:
        row['thinking_token_count'] != null ? Number(row['thinking_token_count']) : null,
    };
  }

  async updateModel(
    provider: string,
    slug: string,
    req: UpdateLlmModelRequest,
  ): Promise<LlmModelFlat> {
    this.logger.log(`[LlmAnalytics] Updating model ${provider}::${slug}`);

    // Build the patch object — only include fields that were provided
    const patch: Record<string, unknown> = {};

    if (req.displayName !== undefined) {
      patch['display_name'] = req.displayName;
    }
    if (req.contextWindow !== undefined) {
      patch['context_window'] = req.contextWindow;
    }
    if (req.enabled !== undefined) {
      patch['is_active'] = req.enabled;
    }

    // Pricing fields are stored as a JSONB column; we must merge them
    if (req.inputCostPer1k !== undefined || req.outputCostPer1k !== undefined) {
      // First fetch the current pricing so we can merge
      const { data: existing, error: fetchErr } = await this.db
        .from(null, 'llm_models')
        .select('pricing_info_json')
        .eq('model_name', slug)
        .eq('provider_name', provider)
        .single();

      if (fetchErr) {
        throw new NotFoundException(`Model ${provider}::${slug} not found`);
      }

      const currentPricing =
        ((existing as Record<string, unknown>)['pricing_info_json'] as Record<string, unknown>) ??
        {};

      patch['pricing_info_json'] = {
        ...currentPricing,
        ...(req.inputCostPer1k !== undefined
          ? { input_cost_per_1k: req.inputCostPer1k }
          : {}),
        ...(req.outputCostPer1k !== undefined
          ? { output_cost_per_1k: req.outputCostPer1k }
          : {}),
      };
    }

    const { data, error } = await this.db
      .from(null, 'llm_models')
      .update(patch)
      .eq('model_name', slug)
      .eq('provider_name', provider)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update model: ${error.message}`);
    }

    // Fetch updated usage stats for the return value
    const { data: usageData } = await this.db.rawQuery(
      `SELECT COUNT(*) as total_calls, MAX(started_at) as last_used_at
       FROM llm_usage WHERE model_name = $1 AND provider_name = $2`,
      [slug, provider],
    );

    const usageRow = ((usageData as Record<string, unknown>[]) ?? [])[0];
    const row = data as Record<string, unknown>;
    const pricing = (row['pricing_info_json'] as Record<string, unknown>) ?? {};

    return {
      id: `${row['provider_name']}:${row['model_name']}`,
      slug: row['model_name'] as string,
      provider: row['provider_name'] as string,
      displayName: (row['display_name'] as string) ?? (row['model_name'] as string),
      inputCostPer1k: Number(pricing['input_cost_per_1k'] ?? pricing['inputCostPer1k'] ?? 0),
      outputCostPer1k: Number(pricing['output_cost_per_1k'] ?? pricing['outputCostPer1k'] ?? 0),
      contextWindow: Number(row['context_window'] ?? 4096),
      enabled: row['is_active'] === true,
      usageCount: Number(usageRow?.['total_calls'] ?? 0),
      lastUsedAt: (usageRow?.['last_used_at'] as string) ?? null,
    };
  }
}
