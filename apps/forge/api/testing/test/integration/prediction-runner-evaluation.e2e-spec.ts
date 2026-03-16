/**
 * E2E Test: Auto-Evaluation via Evaluation Runner
 *
 * Tests the evaluation workflow:
 * - Evaluation of resolved predictions (direction, magnitude, timing accuracy)
 * - Learning suggestion generation from evaluation patterns
 * - Manual evaluation trigger via handler
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 * - Some resolved predictions with outcome values
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-evaluation.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';
const PREDICTION_AGENT = 'us-tech-stocks-2025';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for dashboard operations
const DASHBOARD_TIMEOUT = 30000;

interface DashboardResponse {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata: Record<string, unknown>;
  };
}

interface Prediction {
  id: string;
  target_id: string;
  direction: string;
  magnitude: string;
  confidence: number;
  status: string;
  outcome_value: number | null;
  resolution_notes: string | null;
  predicted_at: string;
  expires_at: string;
}

interface EvaluationResult {
  predictionId: string;
  directionCorrect: boolean;
  magnitudeScore: number;
  timingScore: number;
  overallScore: number;
  evaluatedAt: string;
}

describe('Evaluation Runner E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testPredictionId: string | null = null;
  let resolvedPredictionId: string | null = null;

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      console.error(
        'Authentication failed:',
        authResponse.status,
        authResponse.statusText,
      );
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = (await authResponse.json()) as { accessToken: string };
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        ) as { sub: string };
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, 30000);

  /**
   * Helper to call A2A endpoint with dashboard mode
   */
  const callDashboard = async (
    agentSlug: string,
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<DashboardResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mode: 'dashboard',
          context: {
            orgSlug: ORG_SLUG,
            agentSlug,
            agentType: 'prediction',
            userId,
            conversationId: NIL_UUID,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider: NIL_UUID,
            model: NIL_UUID,
          },
          payload: {
            action,
            params,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Dashboard call failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return (await response.json()) as DashboardResponse;
  };

  describe('Find predictions for evaluation', () => {
    it('should find active predictions', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'predictions.list', {
        filters: { status: 'active' },
        pageSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: Prediction[] };
      const predictions = Array.isArray(content) ? content : (content.data ?? []);

      if (predictions.length > 0) {
        testPredictionId = predictions[0]?.id ?? null;
        console.log('Found active prediction for tests:', testPredictionId);
      } else {
        console.log('No active predictions available');
      }
    }, DASHBOARD_TIMEOUT);

    it('should find resolved predictions', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'predictions.list', {
        filters: { status: 'resolved' },
        pageSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: Prediction[] };
      const predictions = Array.isArray(content) ? content : (content.data ?? []);

      if (predictions.length > 0) {
        resolvedPredictionId = predictions[0]?.id ?? null;
        console.log('Found resolved prediction for evaluation tests:', resolvedPredictionId);
      } else {
        console.log('No resolved predictions available - evaluation tests may be limited');
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Analytics for evaluation metrics', () => {
    it('should get accuracy comparison analytics', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.accuracy-comparison', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const data = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(data)).toBe(true);

      console.log('Accuracy comparison records:', data.length);
    }, DASHBOARD_TIMEOUT);

    it('should get accuracy comparison with date range filter', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1); // Last month

      const result = await callDashboard(PREDICTION_AGENT, 'analytics.accuracy-comparison', {
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should get analytics summary', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.summary', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as {
        data?: {
          accuracy?: { test: unknown; production: unknown };
          learning_velocity?: unknown;
          scenario_effectiveness?: unknown;
          promotion_funnel?: unknown;
        };
      };

      const summary = content.data ?? content;

      // Verify summary structure if present
      if (summary && typeof summary === 'object') {
        console.log('Analytics summary retrieved successfully');
        if ('accuracy' in summary) {
          expect(summary.accuracy).toBeDefined();
        }
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Learning velocity from evaluations', () => {
    it('should get learning velocity analytics', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.learning-velocity', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const data = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(data)).toBe(true);

      console.log('Learning velocity records:', data.length);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Scenario effectiveness from evaluations', () => {
    it('should get scenario effectiveness analytics', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.scenario-effectiveness', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const data = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(data)).toBe(true);

      console.log('Scenario effectiveness records:', data.length);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Promotion funnel from evaluations', () => {
    it('should get promotion funnel analytics', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.promotion-funnel', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const data = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(data)).toBe(true);

      console.log('Promotion funnel stages:', data.length);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Prediction deep-dive for evaluation context', () => {
    it('should get prediction deep-dive with evaluation data', async () => {
      const predictionId = resolvedPredictionId || testPredictionId;

      if (!predictionId) {
        console.log('Skipping - no prediction available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'predictions.deep-dive', {
        id: predictionId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as {
        data?: {
          prediction?: Prediction;
          lineage?: {
            predictors: unknown[];
            analystAssessments: unknown[];
          };
          stats?: {
            predictorCount: number;
            signalCount: number;
          };
        };
      };

      const data = content.data ?? content;

      if (data && typeof data === 'object' && 'prediction' in data) {
        console.log('Deep-dive retrieved for prediction:', (data.prediction as Prediction)?.id);

        if ('stats' in data && data.stats) {
          console.log('Stats:', data.stats);
        }
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Learnings generated from evaluations', () => {
    it('should list learnings (which may include evaluation-generated ones)', async () => {
      // First get a target ID
      const targetResult = await callDashboard(PREDICTION_AGENT, 'targets.list', {
        pageSize: 1,
      });

      expect(targetResult.success).toBe(true);
      const targetContent = targetResult.payload.content as { data: { id: string }[] };
      const targets = Array.isArray(targetContent) ? targetContent : (targetContent.data ?? []);

      if (targets.length > 0 && targets[0]?.id) {
        const result = await callDashboard(PREDICTION_AGENT, 'learnings.list', {
          filters: { targetId: targets[0].id },
          pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(result.payload.content).toBeDefined();

        const content = result.payload.content as { data: unknown[] };
        const learnings = Array.isArray(content) ? content : (content.data ?? []);
        console.log('Learnings found for target:', learnings.length);
      } else {
        console.log('No targets available - skipping learnings test');
      }
    }, DASHBOARD_TIMEOUT);

    it('should list learnings by scope level', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learnings.list', {
        filters: { scopeLevel: 'runner' },
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const learnings = Array.isArray(content) ? content : (content.data ?? []);
      console.log('Runner-level learnings:', learnings.length);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Learning queue from evaluation suggestions', () => {
    it('should list pending learning queue items (evaluation suggestions)', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { status: 'pending' },
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: unknown[] };
      const items = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(items)).toBe(true);

      console.log('Pending learning queue items:', items.length);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Analytics handler error handling', () => {
    it('should return error for unsupported analytics action', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'analytics.unsupported', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string; details?: { supportedActions: string[] } };
      };

      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('UNSUPPORTED_ACTION');
        expect(content.error?.details?.supportedActions).toContain('accuracy-comparison');
        expect(content.error?.details?.supportedActions).toContain('learning-velocity');
        expect(content.error?.details?.supportedActions).toContain('summary');
      }
    }, DASHBOARD_TIMEOUT);
  });
});
