/**
 * Diviner Bridge Service
 *
 * Routes dashboard requests through Bridge (Gatekeeper) to Diviner.
 * Enterprise is READ-ONLY — it displays what Diviner produces, never writes.
 *
 * Bridge endpoint: POST ${VITE_BRIDGE_API_URL}/a2a/send
 * Body: { targetAgentId, method, params }
 *
 * Diviner capabilities (all read-only):
 *   1.  markets/instruments    — 12 instruments with prices
 *   2.  markets/predictions    — Dashboard summary, or deep-dive with instrumentId
 *   3.  markets/risk-assessments — All instruments summary, or composite+trend with instrumentId
 *   4.  markets/analysts       — 5 base analysts with configs
 *   5.  markets/runs           — Orchestration run history
 *   6.  markets/sources        — Source catalog
 *   7.  markets/trading        — Analyst leaderboard + positions (pass analystId for detail)
 *   8.  markets/portfolios     — Analyst portfolios with leaderboard
 *   9.  markets/queue          — Pending learning proposals (read-only)
 *   10. markets/context-agents — Analyst personas and configurations
 *   11. markets/daily-report   — 24h aggregate: runs, predictions, risk scores, learning reports
 */

import { useAuthStore } from '@/stores/rbacStore';

const BRIDGE_API_URL = import.meta.env.VITE_BRIDGE_API_URL || 'http://localhost:7600';
const DIVINER_AGENT_ID = import.meta.env.VITE_DIVINER_AGENT_ID || 'external-1775332941563';

// ============================================================================
// CAPABILITY MAPPING (READ-ONLY)
// Enterprise dashboard action → Diviner capability
// ============================================================================

const ACTION_TO_CAPABILITY: Record<string, string> = {
  // Instruments / Universes / Targets
  'universes.list':          'markets/instruments',
  'universes.get':           'markets/instruments',
  'targets.list':            'markets/instruments',
  'targets.get':             'markets/instruments',
  'prices.list':             'markets/instruments',

  // Predictions
  'predictions.list':        'markets/predictions',
  'predictions.get':         'markets/predictions',
  'predictions.snapshot':    'markets/predictions',
  'predictions.details':     'markets/predictions',
  'predictions.deep-dive':   'markets/predictions',

  // Risk Assessments
  'scopes.list':             'markets/risk-assessments',
  'scopes.get':              'markets/risk-assessments',
  'subjects.list':           'markets/risk-assessments',
  'subjects.get':            'markets/risk-assessments',
  'dimensions.list':         'markets/risk-assessments',
  'dimensions.get':          'markets/risk-assessments',
  'assessments.list':        'markets/risk-assessments',
  'assessments.get':         'markets/risk-assessments',
  'composite-scores.list':   'markets/risk-assessments',
  'composite-scores.get':    'markets/risk-assessments',
  'debates.list':            'markets/risk-assessments',
  'debates.get':             'markets/risk-assessments',
  'alerts.list':             'markets/risk-assessments',
  'alerts.get':              'markets/risk-assessments',
  'correlations.analyze':    'markets/risk-assessments',
  'portfolio.summary':       'markets/risk-assessments',

  // Analysts
  'analysts.list':           'markets/analysts',
  'analysts.get':            'markets/analysts',
  'analysts.performance':    'markets/analysts',

  // Runs
  'runs.list':               'markets/runs',
  'runs.get':                'markets/runs',

  // Sources
  'sources.list':            'markets/sources',
  'sources.get':             'markets/sources',

  // Trading (read-only: leaderboard + positions)
  'trading.summary':         'markets/trading',
  'trading.positions':       'markets/trading',
  'trading.leaderboard':     'markets/trading',

  // Portfolios (read-only: analyst portfolios with leaderboard)
  'portfolios.list':         'markets/portfolios',
  'portfolios.get':          'markets/portfolios',
  'strategies.list':         'markets/portfolios',
  'strategies.get':          'markets/portfolios',

  // Queue (read-only: pending learning proposals)
  'queue.list':              'markets/queue',
  'queue.get':               'markets/queue',
  'learning-queue.list':     'markets/queue',

  // Context Agents (read-only: analyst personas and configurations)
  'context-agents.list':     'markets/context-agents',
  'context-agents.get':      'markets/context-agents',

  // Daily Report (read-only: 24h aggregate)
  'daily-reports.list':      'markets/daily-report',
  'daily-reports.get':       'markets/daily-report',
  'daily-reports.latest':    'markets/daily-report',

  // Evaluations (read-only)
  'evaluations.list':        'markets/predictions',
  'evaluations.get':         'markets/predictions',
};

// ============================================================================
// RESPONSE NORMALIZATION
// Diviner returns { success, data, ... } — normalize to { content: <data> }
// ============================================================================

function normalizeDivinerResponse<T>(raw: unknown): { content: T | null; success: boolean; metadata?: unknown } {
  if (!raw || typeof raw !== 'object') {
    return { content: null, success: false };
  }

  const r = raw as Record<string, unknown>;

  // JSON-RPC wrapper: raw might be the full JSON-RPC result or already unwrapped
  const result = r.result !== undefined ? (r.result as Record<string, unknown>) : r;

  const success = typeof result.success === 'boolean' ? result.success : true;

  // Diviner wraps data in output.content, output.content.response, data, or response
  const outputContent = (result.output as Record<string, unknown> | undefined)?.content;
  const content = (
    (outputContent as Record<string, unknown> | undefined)?.response ??
    outputContent ??
    result.data ??
    result.response ??
    result.content ??
    null
  ) as T | null;

  return {
    success,
    content,
    metadata: result.metadata ?? (outputContent as Record<string, unknown> | undefined)?.metadata ?? null,
  };
}

// ============================================================================
// SHAPE TRANSFORMERS
// Convert Diviner response shapes → Enterprise dashboard shapes
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function transformPredictions(divinerItems: any[]): any[] {
  // Diviner: { instrument_id, symbol, name, run_id, created_at, arbitrator, analysts[] }
  // Enterprise expects one prediction PER ANALYST (each with analystSlug set)
  const results: any[] = [];

  for (const item of divinerItems) {
    const analysts = item.analysts || [];
    for (const analyst of analysts) {
      results.push({
        id: `${item.run_id || item.instrument_id}-${analyst.analyst_slug || analyst.analyst_name}`,
        targetId: item.instrument_id,
        universeId: null,
        taskId: item.run_id || null,
        status: 'active',
        direction: analyst.direction || 'neutral',
        confidence: analyst.confidence || 0,
        magnitude: null,
        timeframe: '24h',
        timeframeHours: 24,
        reasoning: analyst.rationale || analyst.reasoning || '',
        generatedAt: item.created_at,
        predictedAt: item.created_at,
        expiresAt: item.created_at,
        targetSymbol: item.symbol,
        targetName: item.name,
        isTest: false,
        analystSlug: analyst.analyst_slug || analyst.analyst_name,
        isArbitrator: false,
        analystAssessments: analysts.map((a: any) => ({
          analystSlug: a.analyst_slug || a.analyst_name,
          analystName: a.analyst_name,
          direction: a.direction,
          confidence: a.confidence,
          reasoning: a.rationale || a.reasoning,
        })),
      });
    }

    // Add arbitrator as a separate prediction if present
    if (item.arbitrator) {
      results.push({
        id: `${item.run_id || item.instrument_id}-arbitrator`,
        targetId: item.instrument_id,
        universeId: null,
        taskId: item.run_id || null,
        status: 'active',
        direction: item.arbitrator.direction || 'neutral',
        confidence: item.arbitrator.confidence || 0,
        magnitude: null,
        timeframe: '24h',
        timeframeHours: 24,
        reasoning: item.arbitrator.rationale || item.arbitrator.reasoning || '',
        generatedAt: item.created_at,
        predictedAt: item.created_at,
        expiresAt: item.created_at,
        targetSymbol: item.symbol,
        targetName: item.name,
        isTest: false,
        analystSlug: 'arbitrator',
        isArbitrator: true,
      });
    }
  }

  return results;
}

function transformUniverses(divinerItems: any[]): any[] {
  // Diviner instruments → Enterprise universes
  return divinerItems.map((item: any) => ({
    id: item.id || item.slug,
    name: item.name || item.display_name || item.symbol,
    domain: item.universe_slug || item.asset_type || 'stocks',
    description: item.description || null,
    organizationSlug: item.organization_slug || 'finance',
    agentSlug: 'us-tech-stocks',
    isActive: item.is_active !== false,
    createdAt: item.created_at,
    updatedAt: item.created_at,
  }));
}

function transformAnalysts(divinerItems: any[]): any[] {
  // Diviner analysts → Enterprise analyst format
  return divinerItems.map((item: any) => ({
    id: item.id || item.slug,
    slug: item.slug || item.analyst_slug,
    name: item.name || item.analyst_name,
    perspective: item.perspective || item.description || '',
    tier: item.tier || 'standard',
    isActive: item.is_active !== false,
    config: item.config || item.learned_patterns || {},
    createdAt: item.created_at,
  }));
}

function transformTrading(divinerData: any): any {
  // Diviner trading → Enterprise trading dashboard format
  // May be an object with leaderboard + positions, or an array
  if (Array.isArray(divinerData)) return divinerData;
  return divinerData;
}

// Map of actions that need response transformation
const ACTION_TRANSFORMERS: Record<string, (items: any) => any> = {
  'predictions.list': transformPredictions,
  'universes.list': transformUniverses,
  'targets.list': transformUniverses, // instruments serve as both
  'analysts.list': transformAnalysts,
  'context-agents.list': transformAnalysts, // same shape
  'trading.summary': transformTrading,
};

/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DivinerBridgeService {
  private authStore: ReturnType<typeof useAuthStore> | null = null;

  private getAuthStore(): ReturnType<typeof useAuthStore> {
    if (!this.authStore) {
      this.authStore = useAuthStore();
    }
    return this.authStore;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = this.getAuthStore().token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Send a request through Bridge to Diviner.
   *
   * @param capability  Diviner capability string, e.g. 'markets/instruments'
   * @param params      Optional parameters forwarded to Diviner
   */
  async callDiviner<T = unknown>(
    capability: string,
    params?: Record<string, unknown>
  ): Promise<{ content: T | null; success: boolean; metadata?: unknown }> {
    const endpoint = `${BRIDGE_API_URL}/a2a/send`;

    const body = {
      targetAgentId: DIVINER_AGENT_ID,
      method: 'invoke',
      params: {
        context: { tenantId: import.meta.env.VITE_DIVINER_TENANT_ID || 'alpha-capital' },
        data: {
          content: {
            capability,
            ...(params ?? {}),
          },
        },
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as Record<string, unknown>)?.error?.toString() ||
        (errorData as Record<string, unknown>)?.message?.toString() ||
        response.statusText;
      throw new Error(`Bridge request failed: ${message}`);
    }

    const raw = await response.json() as Record<string, unknown>;

    // Bridge wraps Diviner's response: { response: { jsonrpc, id, result|error }, success, ... }
    const bridgeResponse = (raw.response ?? raw) as Record<string, unknown>;

    // Check for JSON-RPC error from Diviner
    if (bridgeResponse.error) {
      const err = bridgeResponse.error as Record<string, unknown>;
      throw new Error(err?.message?.toString() || 'Diviner request failed via Bridge');
    }

    // Check for Bridge-level failure
    if (raw.success === false && !bridgeResponse.result) {
      throw new Error('Bridge request to Diviner failed');
    }

    return normalizeDivinerResponse<T>(bridgeResponse);
  }

  /**
   * Map an Enterprise dashboard action to a Diviner capability, then call Diviner.
   * All actions are READ-ONLY. Enterprise never writes to Diviner.
   *
   * @param action  Enterprise dashboard action, e.g. 'universes.list'
   * @param params  Optional parameters forwarded with the request
   */
  async executeDashboardAction<T = unknown>(
    action: string,
    params?: Record<string, unknown>
  ): Promise<{ content: T | null; success: boolean; metadata?: unknown }> {
    let capability = ACTION_TO_CAPABILITY[action];

    if (!capability) {
      // Best-guess: map entity prefix to a capability
      const entity = action.split('.')[0];
      const guessMap: Record<string, string> = {
        universes: 'markets/instruments',
        targets: 'markets/instruments',
        prices: 'markets/instruments',
        predictions: 'markets/predictions',
        analysts: 'markets/analysts',
        scopes: 'markets/risk-assessments',
        subjects: 'markets/risk-assessments',
        dimensions: 'markets/risk-assessments',
        assessments: 'markets/risk-assessments',
        'composite-scores': 'markets/risk-assessments',
        debates: 'markets/risk-assessments',
        alerts: 'markets/risk-assessments',
        correlations: 'markets/risk-assessments',
        portfolio: 'markets/risk-assessments',
        sources: 'markets/sources',
        runs: 'markets/runs',
        trading: 'markets/trading',
        portfolios: 'markets/portfolios',
        strategies: 'markets/portfolios',
        queue: 'markets/queue',
        'learning-queue': 'markets/queue',
        'context-agents': 'markets/context-agents',
        'daily-reports': 'markets/daily-report',
        evaluations: 'markets/predictions',
      };
      capability = guessMap[entity] ?? 'markets/instruments';
      console.warn(`[DivinerBridge] No exact mapping for '${action}', guessing capability: ${capability}`);
    }

    // Pass the original action along so Diviner can sub-route if needed
    const result = await this.callDiviner<T>(capability, { action, ...params });

    // Transform response shape if needed (Diviner → Enterprise format)
    const transformer = ACTION_TRANSFORMERS[action];
    if (transformer && result.content != null) {
      result.content = transformer(result.content) as unknown as T;
    }

    return result;
  }
}

export const divinerBridgeService = new DivinerBridgeService();
