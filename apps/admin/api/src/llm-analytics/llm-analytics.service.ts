import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

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

/**
 * LlmAnalyticsService — reads LLM usage data directly from the database.
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
}
