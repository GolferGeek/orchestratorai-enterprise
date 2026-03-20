// Pipeline tracing types matching the backend PipelineTracer output

export interface PipelineStep {
  stepNumber: number;
  label: string;
  layer: string;
  provider: string;
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: string;
  duration: number;
}

export interface PipelineTrace {
  id: string;
  source: string;
  target: string;
  method: string;
  steps: PipelineStep[];
  totalDuration: number;
  completedAt: string;
}

// Backend PipelineTracer uses different field names — normalize here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePipelineTrace(raw: any): PipelineTrace {
  return {
    id: raw.traceId ?? raw.id ?? '',
    source: raw.source ?? '',
    target: raw.target ?? '',
    method: raw.method ?? '',
    totalDuration: raw.totalDurationMs ?? raw.totalDuration ?? 0,
    completedAt: raw.completedAt ?? '',
    steps: (raw.steps ?? []).map(normalizeStep),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStep(raw: any): PipelineStep {
  return {
    stepNumber: raw.step ?? raw.stepNumber ?? 0,
    label: raw.label ?? '',
    layer: raw.layer ?? '',
    provider: raw.provider ?? '',
    data: raw.data ?? null,
    metadata: raw.metadata ?? {},
    timestamp: raw.timestamp ?? '',
    duration: raw.durationMs ?? raw.duration ?? 0,
  };
}

// Scenario types

export interface ScenarioDefinition {
  id: number;
  name: string;
  description: string;
  providers: string[];
}

export interface ScenarioResult {
  scenario: ScenarioDefinition;
  result: Record<string, unknown>;
  pipelineTrace: PipelineTrace;
  effectiveConfig?: Record<string, string>;
}

// Timeline message — one entry per scenario run (derived from ScenarioResult)

export interface TimelineMessage {
  id: string;
  timestamp: string;
  source: string;
  target: string;
  method: string;
  duration: number;
  providers: string[];
  scenarioId: number;
  scenarioName: string;
  pipelineTrace: PipelineTrace;
  result: Record<string, unknown>;
}

// Org data types

export interface LoanApplication {
  id: string;
  borrowerId: string;
  borrowerName: string;
  amount: number;
  purpose: string;
  status: string;
  [key: string]: unknown;
}

export interface BorrowerRecord {
  id: string;
  name: string;
  creditScore: number;
  [key: string]: unknown;
}

export interface RateSheet {
  [key: string]: unknown;
}

export interface CollateralItem {
  id: string;
  type: string;
  description: string;
  value: number;
  [key: string]: unknown;
}

export interface PortfolioSummary {
  [key: string]: unknown;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  availableTo: string[];
  [key: string]: unknown;
}

export interface Association {
  id: string;
  name: string;
  region: string;
  [key: string]: unknown;
}

export interface ExaminationCriteria {
  id: string;
  category: string;
  [key: string]: unknown;
}

export interface CapitalRequirement {
  id: string;
  [key: string]: unknown;
}

export interface AssociationRating {
  id: string;
  associationId: string;
  [key: string]: unknown;
}

export interface RiskConcentrationLimit {
  id: string;
  [key: string]: unknown;
}

// Org state shape

export type OrgId = 'agriserv' | 'prairie-ridge' | 'central-farm-bank';

export interface OrgInfo {
  id: OrgId;
  name: string;
  identityProvider: string;
  trustProvider: string;
  color: string;
  borderColor: string;
}

export const ORG_INFO: Record<OrgId, OrgInfo> = {
  'agriserv': {
    id: 'agriserv',
    name: 'AgriServ Financial',
    identityProvider: 'oauth-jwt',
    trustProvider: 'reputation',
    color: '#3b82f6',
    borderColor: 'border-blue-500',
  },
  'prairie-ridge': {
    id: 'prairie-ridge',
    name: 'Prairie Ridge Credit',
    identityProvider: 'x509',
    trustProvider: 'allowlist',
    color: '#10b981',
    borderColor: 'border-emerald-500',
  },
  'central-farm-bank': {
    id: 'central-farm-bank',
    name: 'Central Farm Bank',
    identityProvider: 'x509',
    trustProvider: 'allowlist',
    color: '#f59e0b',
    borderColor: 'border-amber-500',
  },
};

// Layer color mapping

export const LAYER_COLORS: Record<string, string> = {
  identity: '#3b82f6',
  encryption: '#10b981',
  transport: '#8b5cf6',
  trust: '#f59e0b',
  audit: '#ef4444',
  payment: '#ec4899',
  business: '#6b7280',
  data: '#14b8a6',
  observability: '#6366f1',
  resilience: '#f97316',
  negotiation: '#06b6d4',
  orchestration: '#84cc16',
  discovery: '#a78bfa',
};

export function getLayerColor(layer: string): string {
  return LAYER_COLORS[layer.toLowerCase()] ?? '#6b7280';
}

// Circuit breaker state

export type CircuitBreakerState = 'CLOSED' | 'HALF-OPEN' | 'OPEN';

export interface CircuitBreakerInfo {
  source: string;
  target: string;
  state: CircuitBreakerState;
  failureCount: number;
  failureThreshold: number;
}

// Trust level

export type TrustLevel = 'UNTRUSTED' | 'FIRST-CONTACT' | 'UNVERIFIED' | 'TRUSTED' | 'MAXIMUM';

export interface TrustInfo {
  source: string;
  target: string;
  level: TrustLevel;
  score: number;
}

export function trustScoreFromLevel(level: TrustLevel): number {
  switch (level) {
    case 'UNTRUSTED': return 0;
    case 'FIRST-CONTACT': return 10;
    case 'UNVERIFIED': return 25;
    case 'TRUSTED': return 75;
    case 'MAXIMUM': return 100;
  }
}
