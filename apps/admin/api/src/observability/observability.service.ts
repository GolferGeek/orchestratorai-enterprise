import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

type DbError = { message: string } | null;

export interface ObservabilityMetrics {
  totalEventsLast24h: number;
  errorCountLast24h: number;
  warnCountLast24h: number;
  topProducts: Array<{ product: string; eventCount: number }>;
  topErrorMessages: Array<{ message: string; count: number }>;
}

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

export interface ObservabilityEventsQuery {
  product?: string;
  severity?: 'info' | 'warn' | 'error';
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async getMetrics(): Promise<ObservabilityMetrics> {
    this.logger.log('[Observability] Querying metrics');

    const metricsResult: {
      data: Record<string, unknown>[] | null;
      error: DbError;
    } = await this.db.rawQuery(`
      WITH recent_events AS (
        SELECT
          source_app,
          message,
          CASE
            WHEN lower(coalesce(status, '')) IN ('error', 'failed', 'failure')
              OR lower(coalesce(hook_event_type, '')) LIKE '%failed%'
              OR lower(coalesce(hook_event_type, '')) LIKE '%error%'
              OR lower(coalesce(message, '')) LIKE 'error:%'
            THEN 'error'
            WHEN lower(coalesce(status, '')) IN ('warn', 'warning')
              OR lower(coalesce(hook_event_type, '')) LIKE '%warn%'
            THEN 'warn'
            ELSE 'info'
          END AS severity
        FROM public.observability_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      ),
      totals AS (
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE severity = 'error')::int AS error_events,
          COUNT(*) FILTER (WHERE severity = 'warn')::int AS warn_events
        FROM recent_events
      ),
      products AS (
        SELECT COALESCE(source_app, 'unknown') AS product, COUNT(*)::int AS event_count
        FROM recent_events
        GROUP BY COALESCE(source_app, 'unknown')
        ORDER BY event_count DESC, product ASC
        LIMIT 5
      ),
      errors AS (
        SELECT COALESCE(NULLIF(message, ''), 'Unknown error') AS message, COUNT(*)::int AS error_count
        FROM recent_events
        WHERE severity = 'error'
        GROUP BY COALESCE(NULLIF(message, ''), 'Unknown error')
        ORDER BY error_count DESC, message ASC
        LIMIT 5
      )
      SELECT
        (SELECT total_events FROM totals) AS total_events,
        (SELECT error_events FROM totals) AS error_events,
        (SELECT warn_events FROM totals) AS warn_events,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('product', product, 'eventCount', event_count)) FROM products), '[]'::jsonb) AS top_products,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('message', message, 'count', error_count)) FROM errors), '[]'::jsonb) AS top_error_messages
    `);

    if (metricsResult.error) {
      throw new Error(
        `Failed to query observability metrics: ${metricsResult.error.message}`,
      );
    }

    const row = metricsResult.data?.[0] ?? {};

    return {
      totalEventsLast24h: Number(row['total_events'] ?? 0),
      errorCountLast24h: Number(row['error_events'] ?? 0),
      warnCountLast24h: Number(row['warn_events'] ?? 0),
      topProducts: this.parseJsonArray(row['top_products']) as Array<{
        product: string;
        eventCount: number;
      }>,
      topErrorMessages: this.parseJsonArray(
        row['top_error_messages'],
      ) as Array<{ message: string; count: number }>,
    };
  }

  async listEvents(
    query: ObservabilityEventsQuery,
  ): Promise<ObservabilityEvent[]> {
    this.logger.log('[Observability] Querying events');

    const params: unknown[] = [];
    const filters: string[] = [];

    if (query.product) {
      params.push(query.product);
      filters.push(`product = $${params.length}`);
    }

    if (query.severity) {
      params.push(query.severity);
      filters.push(`severity = $${params.length}`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      filters.push(
        `(message ILIKE $${params.length} OR event_type ILIKE $${params.length})`,
      );
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    params.push(limit, offset);

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const result: { data: Record<string, unknown>[] | null; error: DbError } =
      await this.db.rawQuery(
        `
        WITH mapped_events AS (
          SELECT
            id::text,
            COALESCE(hook_event_type, 'unknown') AS event_type,
            COALESCE(source_app, 'unknown') AS product,
            COALESCE(organization_slug, 'unknown') AS org_slug,
            user_id::text,
            agent_slug,
            conversation_id::text,
            CASE
              WHEN lower(coalesce(status, '')) IN ('error', 'failed', 'failure')
                OR lower(coalesce(hook_event_type, '')) LIKE '%failed%'
                OR lower(coalesce(hook_event_type, '')) LIKE '%error%'
                OR lower(coalesce(message, '')) LIKE 'error:%'
              THEN 'error'
              WHEN lower(coalesce(status, '')) IN ('warn', 'warning')
                OR lower(coalesce(hook_event_type, '')) LIKE '%warn%'
              THEN 'warn'
              ELSE 'info'
            END AS severity,
            COALESCE(message, '') AS message,
            COALESCE(payload, '{}'::jsonb) AS metadata,
            COALESCE(created_at, to_timestamp(timestamp / 1000.0)) AS occurred_at
          FROM public.observability_events
        )
        SELECT *
        FROM mapped_events
        ${whereClause}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
        params,
      );

    if (result.error) {
      throw new Error(
        `Failed to query observability events: ${result.error.message}`,
      );
    }

    return (result.data ?? []).map((row) => this.mapEvent(row));
  }

  private mapEvent(row: Record<string, unknown>): ObservabilityEvent {
    const occurredAt = row['occurred_at'];

    return {
      id: String(row['id']),
      eventType: String(row['event_type']),
      product: String(row['product']),
      orgSlug: String(row['org_slug']),
      userId: (row['user_id'] as string | null) ?? null,
      agentSlug: (row['agent_slug'] as string | null) ?? null,
      conversationId: (row['conversation_id'] as string | null) ?? null,
      severity: row['severity'] as 'info' | 'warn' | 'error',
      message:
        typeof row['message'] === 'string'
          ? row['message']
          : JSON.stringify(row['message'] ?? ''),
      metadata: this.parseJsonObject(row['metadata']),
      occurredAt:
        occurredAt instanceof Date
          ? occurredAt.toISOString()
          : new Date(String(occurredAt)).toISOString(),
    };
  }

  private parseJsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return JSON.parse(value) as unknown[];
    return [];
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      return JSON.parse(value) as Record<string, unknown>;
    }
    return {};
  }
}
