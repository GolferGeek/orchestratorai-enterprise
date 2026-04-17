/**
 * sentinelService — typed HTTP client for the Portfolio Sentinel API.
 *
 * Talks to Forge API at /legal-department/sentinel/*.
 */

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL ||
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL || '/api/forge';

// ── Types ─────────────────────────────────────────────────────────────────

export type SourceType = 'rss' | 'api' | 'webpage';
export type SignalType = 'enforcement' | 'ruling' | 'legislation' | 'guidance' | 'news';
export type AlertStatus = 'new' | 'acknowledged' | 'dismissed' | 'actioned';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertUrgency = 'immediate' | 'this_week' | 'informational';

export interface SentinelSource {
  id: string;
  org_slug: string;
  name: string;
  source_type: SourceType;
  url: string;
  poll_interval_minutes: number;
  practice_areas: string[];
  jurisdictions: string[];
  enabled: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SentinelSignal {
  id: string;
  org_slug: string;
  source_id: string;
  title: string;
  summary: string | null;
  full_text: string | null;
  url: string | null;
  published_at: string | null;
  signal_type: SignalType | null;
  jurisdictions: string[];
  practice_areas: string[];
  content_hash: string;
  processed: boolean;
  ingested_at: string;
}

export interface SentinelPortfolioHolding {
  id: string;
  org_slug: string;
  client_name: string;
  matter_name: string | null;
  practice_areas: string[];
  jurisdictions: string[];
  key_entities: string[];
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SentinelAlert {
  id: string;
  org_slug: string;
  signal_id: string;
  portfolio_id: string;
  relevance_score: number;
  severity: AlertSeverity;
  urgency: AlertUrgency;
  summary: string;
  reasoning: string;
  recommended_action: string;
  status: AlertStatus;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export interface AlertDetail {
  alert: SentinelAlert;
  signal: SentinelSignal;
  portfolio: SentinelPortfolioHolding;
}

// ── HTTP helper ───────────────────────────────────────────────────────────

async function jsonRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('authToken');
  const res = await fetch(input, {
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as T;
}

const BASE = `${FORGE_API_URL}/legal-department/sentinel`;

// ── Service ───────────────────────────────────────────────────────────────

export const sentinelService = {
  // Sources
  async listSources(orgSlug: string): Promise<SentinelSource[]> {
    return jsonRequest<SentinelSource[]>(
      `${BASE}/sources?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
  },

  async createSource(
    orgSlug: string,
    dto: {
      name: string;
      sourceType: SourceType;
      url: string;
      pollIntervalMinutes?: number;
      practiceAreas?: string[];
      jurisdictions?: string[];
    },
  ): Promise<SentinelSource> {
    return jsonRequest<SentinelSource>(`${BASE}/sources`, {
      method: 'POST',
      body: JSON.stringify({ orgSlug, ...dto }),
    });
  },

  async updateSource(
    id: string,
    orgSlug: string,
    dto: Partial<{
      name: string;
      sourceType: SourceType;
      url: string;
      pollIntervalMinutes: number;
      practiceAreas: string[];
      jurisdictions: string[];
      enabled: boolean;
    }>,
  ): Promise<SentinelSource> {
    return jsonRequest<SentinelSource>(`${BASE}/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ orgSlug, ...dto }),
    });
  },

  async deleteSource(id: string, orgSlug: string): Promise<void> {
    await jsonRequest<{ deleted: boolean }>(
      `${BASE}/sources/${id}?orgSlug=${encodeURIComponent(orgSlug)}`,
      { method: 'DELETE' },
    );
  },

  // Signals
  async listSignals(
    orgSlug: string,
    opts?: { sourceId?: string; signalType?: string; limit?: number; offset?: number },
  ): Promise<SentinelSignal[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.sourceId) qs.set('sourceId', opts.sourceId);
    if (opts?.signalType) qs.set('signalType', opts.signalType);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    return jsonRequest<SentinelSignal[]>(`${BASE}/signals?${qs.toString()}`);
  },

  // Portfolio
  async listPortfolio(
    orgSlug: string,
    opts?: { active?: boolean },
  ): Promise<SentinelPortfolioHolding[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.active !== undefined) qs.set('active', String(opts.active));
    return jsonRequest<SentinelPortfolioHolding[]>(
      `${BASE}/portfolio?${qs.toString()}`,
    );
  },

  async createPortfolioHolding(
    orgSlug: string,
    dto: {
      clientName: string;
      matterName?: string;
      practiceAreas?: string[];
      jurisdictions?: string[];
      keyEntities?: string[];
      description?: string;
    },
  ): Promise<SentinelPortfolioHolding> {
    return jsonRequest<SentinelPortfolioHolding>(`${BASE}/portfolio`, {
      method: 'POST',
      body: JSON.stringify({ orgSlug, ...dto }),
    });
  },

  async updatePortfolioHolding(
    id: string,
    orgSlug: string,
    dto: Partial<{
      clientName: string;
      matterName: string;
      practiceAreas: string[];
      jurisdictions: string[];
      keyEntities: string[];
      description: string;
      active: boolean;
    }>,
  ): Promise<SentinelPortfolioHolding> {
    return jsonRequest<SentinelPortfolioHolding>(`${BASE}/portfolio/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ orgSlug, ...dto }),
    });
  },

  async deactivatePortfolioHolding(
    id: string,
    orgSlug: string,
  ): Promise<void> {
    await jsonRequest<{ deactivated: boolean }>(
      `${BASE}/portfolio/${id}?orgSlug=${encodeURIComponent(orgSlug)}`,
      { method: 'DELETE' },
    );
  },

  // Alerts
  async listAlerts(
    orgSlug: string,
    opts?: {
      status?: AlertStatus;
      severity?: string;
      urgency?: string;
      portfolioId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<SentinelAlert[]> {
    const qs = new URLSearchParams({ orgSlug });
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.severity) qs.set('severity', opts.severity);
    if (opts?.urgency) qs.set('urgency', opts.urgency);
    if (opts?.portfolioId) qs.set('portfolioId', opts.portfolioId);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    return jsonRequest<SentinelAlert[]>(`${BASE}/alerts?${qs.toString()}`);
  },

  async getAlertDetail(
    id: string,
    orgSlug: string,
  ): Promise<AlertDetail> {
    return jsonRequest<AlertDetail>(
      `${BASE}/alerts/${id}?orgSlug=${encodeURIComponent(orgSlug)}`,
    );
  },

  async updateAlertStatus(
    id: string,
    orgSlug: string,
    status: AlertStatus,
    acknowledgedBy?: string,
  ): Promise<SentinelAlert> {
    return jsonRequest<SentinelAlert>(`${BASE}/alerts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ orgSlug, status, acknowledgedBy }),
    });
  },

  // Poll Now — enqueue a sentinel-ingest job for a specific source
  async pollNow(
    orgSlug: string,
    sourceId: string,
    userId: string,
  ): Promise<{ jobId: string; conversationId: string; status: string }> {
    const FORGE_JOBS_URL = `${FORGE_API_URL}/legal-department/jobs`;
    return jsonRequest<{ jobId: string; conversationId: string; status: string }>(
      FORGE_JOBS_URL,
      {
        method: 'POST',
        body: JSON.stringify({
          context: {
            orgSlug,
            userId,
            conversationId: '',
            agentSlug: 'legal-department',
            agentType: 'langgraph',
            provider: 'ollama',
            model: 'gemma3:4b',
          },
          data: { content: `poll-now:${sourceId}` },
          metadata: { jobType: 'sentinel-ingest', sourceId },
        }),
      },
    );
  },

  // Sync Pulse triggers for all enabled sources
  async syncTriggers(orgSlug: string): Promise<{ synced: number }> {
    return jsonRequest<{ synced: number }>(`${BASE}/sources/sync-triggers`, {
      method: 'POST',
      body: JSON.stringify({ orgSlug }),
    });
  },
};
