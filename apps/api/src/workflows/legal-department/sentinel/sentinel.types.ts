/**
 * Types for the Portfolio Sentinel feature.
 * Mirrors the four sentinel tables in the legal schema.
 */

// ── Job Type Constants ────────────────────────────────────────────────────
export const SENTINEL_INGEST_JOB_TYPE = 'sentinel-ingest';
export const SENTINEL_EVALUATE_JOB_TYPE = 'sentinel-evaluate';

// ── Source Types ──────────────────────────────────────────────────────────
export type SourceType = 'rss' | 'api' | 'webpage';

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

export interface CreateSourceDto {
  name: string;
  sourceType: SourceType;
  url: string;
  pollIntervalMinutes?: number;
  practiceAreas?: string[];
  jurisdictions?: string[];
  enabled?: boolean;
}

export interface UpdateSourceDto {
  name?: string;
  sourceType?: SourceType;
  url?: string;
  pollIntervalMinutes?: number;
  practiceAreas?: string[];
  jurisdictions?: string[];
  enabled?: boolean;
}

// ── Signal Types ─────────────────────────────────────────────────────────
export type SignalType =
  | 'enforcement'
  | 'ruling'
  | 'legislation'
  | 'guidance'
  | 'news';

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

export interface CreateSignalDto {
  sourceId: string;
  title: string;
  summary?: string;
  fullText?: string;
  url?: string;
  publishedAt?: string;
  signalType?: SignalType;
  jurisdictions?: string[];
  practiceAreas?: string[];
  contentHash: string;
}

// ── Portfolio Types ──────────────────────────────────────────────────────
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

export interface CreatePortfolioDto {
  clientName: string;
  matterName?: string;
  practiceAreas?: string[];
  jurisdictions?: string[];
  keyEntities?: string[];
  description?: string;
}

export interface UpdatePortfolioDto {
  clientName?: string;
  matterName?: string;
  practiceAreas?: string[];
  jurisdictions?: string[];
  keyEntities?: string[];
  description?: string;
  active?: boolean;
}

// ── Alert Types ──────────────────────────────────────────────────────────
export type AlertStatus = 'new' | 'acknowledged' | 'dismissed' | 'actioned';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertUrgency = 'immediate' | 'this_week' | 'informational';

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

export interface CreateAlertDto {
  signalId: string;
  portfolioId: string;
  relevanceScore: number;
  severity: AlertSeverity;
  urgency: AlertUrgency;
  summary: string;
  reasoning: string;
  recommendedAction: string;
}
