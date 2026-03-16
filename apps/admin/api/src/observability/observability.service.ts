import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestrator-ai/transport-types';

export interface ObservabilityEvent {
  id: string;
  product: string;
  taskId: string;
  orgSlug: string;
  agentSlug: string;
  eventType: string;
  status: string;
  message: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ObservabilityEventsResponse {
  events: ObservabilityEvent[];
  sources: string[];
}

export interface ProductMetrics {
  product: string;
  totalTasks: number;
  activeTasks: number;
  failedTasks: number;
  averageDurationMs: number;
  uptimePercent: number;
}

export interface ObservabilityMetricsResponse {
  metrics: ProductMetrics[];
  sources: string[];
}

/** Shape expected by Admin Web frontend */
export interface ObservabilityMetricsFlat {
  totalEventsLast24h: number;
  errorCountLast24h: number;
  warnCountLast24h: number;
  topProducts: Array<{ product: string; eventCount: number }>;
  topErrorMessages: Array<{ message: string; count: number }>;
}

export interface ObservabilityError {
  id: string;
  product: string;
  taskId: string;
  orgSlug: string;
  agentSlug: string;
  errorMessage: string;
  stackTrace: string | null;
  timestamp: string;
}

export interface ObservabilityErrorsResponse {
  errors: ObservabilityError[];
  sources: string[];
}

interface ObservabilityEventRow {
  id: number | string;
  source_app: string;
  session_id: string;
  hook_event_type: string;
  user_id: string;
  username: string;
  conversation_id: string;
  task_id: string;
  agent_slug: string;
  organization_slug: string;
  mode: string;
  status: string;
  message: string;
  progress: number;
  step: string;
  sequence: number;
  total_steps: number;
  payload: Record<string, unknown>;
  timestamp: number;
  created_at: string;
}

function mapStatusToSeverity(status: string): string {
  if (status === 'error' || status === 'failed') return 'error';
  if (status === 'warning') return 'warn';
  return 'info';
}

function mapRowToEvent(row: ObservabilityEventRow): ObservabilityEvent {
  return {
    id: String(row.id),
    product: row.source_app,
    taskId: row.task_id,
    orgSlug: row.organization_slug,
    agentSlug: row.agent_slug,
    eventType: row.hook_event_type,
    status: mapStatusToSeverity(row.status),
    message: row.message,
    timestamp: row.created_at,
    payload: row.payload ?? {},
  };
}

function mapRowToError(row: ObservabilityEventRow): ObservabilityError {
  const payloadMessage =
    row.payload && typeof row.payload['errorMessage'] === 'string'
      ? row.payload['errorMessage']
      : row.message;
  const stackTrace =
    row.payload && typeof row.payload['stackTrace'] === 'string'
      ? row.payload['stackTrace']
      : null;

  return {
    id: String(row.id),
    product: row.source_app,
    taskId: row.task_id,
    orgSlug: row.organization_slug,
    agentSlug: row.agent_slug,
    errorMessage: payloadMessage,
    stackTrace,
    timestamp: row.created_at,
  };
}

/**
 * ObservabilityService — queries observability_events directly from the database.
 *
 * No fallbacks: database errors are propagated.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async getEvents(): Promise<ObservabilityEventsResponse> {
    this.logger.log('[Observability] Fetching events from database');

    const { data, error } = await this.db
      .from(null, 'observability_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`Failed to fetch observability events: ${error.message}`);
    }

    const rows = (data ?? []) as ObservabilityEventRow[];
    const events = rows.map(mapRowToEvent);
    const sources = [...new Set(rows.map((r) => r.source_app))];

    return { events, sources };
  }

  async getMetrics(): Promise<ObservabilityMetricsFlat> {
    this.logger.log('[Observability] Fetching metrics from database');

    const [eventCountResult, errorCountResult, warnCountResult, topErrorsResult] =
      await Promise.all([
        this.db.rawQuery(
          `SELECT source_app as product, COUNT(*)::int as event_count
           FROM observability_events
           WHERE created_at > NOW() - INTERVAL '24 hours'
           GROUP BY source_app
           ORDER BY event_count DESC`,
        ),
        this.db.rawQuery(
          `SELECT COUNT(*)::int as cnt FROM observability_events
           WHERE status IN ('error','failed')
           AND created_at > NOW() - INTERVAL '24 hours'`,
        ),
        this.db.rawQuery(
          `SELECT COUNT(*)::int as cnt FROM observability_events
           WHERE status = 'warning'
           AND created_at > NOW() - INTERVAL '24 hours'`,
        ),
        this.db.rawQuery(
          `SELECT COALESCE(message, 'Unknown error') as message, COUNT(*)::int as count
           FROM observability_events
           WHERE status IN ('error','failed')
           AND created_at > NOW() - INTERVAL '24 hours'
           GROUP BY message
           ORDER BY count DESC
           LIMIT 10`,
        ),
      ]);

    if (eventCountResult.error) {
      throw new Error(`Failed to fetch observability metrics: ${eventCountResult.error.message}`);
    }

    const productRows = (eventCountResult.data as Array<{ product: string; event_count: number }>) ?? [];
    const totalEventsLast24h = productRows.reduce((sum, r) => sum + Number(r.event_count), 0);
    const errorCountLast24h = Number((errorCountResult.data as Array<{ cnt: number }>)?.[0]?.cnt ?? 0);
    const warnCountLast24h = Number((warnCountResult.data as Array<{ cnt: number }>)?.[0]?.cnt ?? 0);
    const topProducts = productRows.map((r) => ({ product: r.product, eventCount: Number(r.event_count) }));
    const topErrorMessages = ((topErrorsResult.data as Array<{ message: string; count: number }>) ?? [])
      .map((r) => ({ message: r.message, count: Number(r.count) }));

    return {
      totalEventsLast24h,
      errorCountLast24h,
      warnCountLast24h,
      topProducts,
      topErrorMessages,
    };
  }

  async getErrors(): Promise<ObservabilityErrorsResponse> {
    this.logger.log('[Observability] Fetching errors from database');

    const { data, error } = await this.db
      .from(null, 'observability_events')
      .select('*')
      .or('status.eq.error,status.eq.failed')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(
        `Failed to fetch observability errors: ${error.message}`,
      );
    }

    const rows = (data ?? []) as ObservabilityEventRow[];
    const errors = rows.map(mapRowToError);
    const sources = [...new Set(rows.map((r) => r.source_app))];

    return { errors, sources };
  }
}
