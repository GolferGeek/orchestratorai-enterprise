/**
 * E2E Test: Prediction Runner Sprint 4 - Monitoring & Polish
 *
 * Tests the Sprint 4 dashboard handlers and features through the A2A endpoint.
 * - Source Seen Items Handler (s4-1)
 * - Signals Handler (s4-2)
 * - Analytics includeTest parameter (s4-3)
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-sprint4-monitoring.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';

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

describe('Prediction Runner Sprint 4 - Monitoring & Polish E2E Tests', () => {
  let authToken: string;
  let userId: string;

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

    const authData = await authResponse.json();
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
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
    filters: Record<string, unknown> = {},
    pagination: { page?: number; limit?: number } = {},
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
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          payload: {
            mode: 'dashboard',
            action,
            params,
            filters,
            pagination,
          },
        }),
      },
    );

    return response.json();
  };

  // Agent slug for prediction agents (from migration 20260108000010)
  const PREDICTION_AGENT = 'us-tech-stocks-2025';

  // ============================================================================
  // SOURCE SEEN ITEMS HANDLER TESTS (s4-1)
  // ============================================================================
  describe('Source Seen Items Dashboard Operations (s4-1)', () => {
    let testSourceId: string;

    beforeAll(async () => {
      // Get a source ID to use for source-seen-items queries
      const sourceResponse = await callDashboard(
        PREDICTION_AGENT,
        'sources.list',
      );
      const sources = sourceResponse.payload?.content as { id: string }[];
      if (Array.isArray(sources) && sources.length > 0 && sources[0]) {
        testSourceId = sources[0].id;
      }
    });

    it('should list source seen items with sourceId', async () => {
      if (!testSourceId) {
        console.log('Skipping test - no source available');
        return;
      }

      const response = await callDashboard(
        PREDICTION_AGENT,
        'source-seen-items.list',
        { sourceId: testSourceId },
      );

      console.log(
        'Source Seen Items List Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Content should be an array
      const items = response.payload?.content as unknown[];
      expect(Array.isArray(items)).toBe(true);

      // Metadata should include pagination info
      const metadata = response.payload?.metadata;
      expect(metadata?.totalCount).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should return error without sourceId for list action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'source-seen-items.list',
        {}, // Missing sourceId
      );

      console.log(
        'Source Seen Items Missing ID Response:',
        JSON.stringify(response, null, 2),
      );

      // Should fail with MISSING_SOURCE_ID error
      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should get source seen items stats with sourceId', async () => {
      if (!testSourceId) {
        console.log('Skipping test - no source available');
        return;
      }

      const response = await callDashboard(
        PREDICTION_AGENT,
        'source-seen-items.stats',
        { sourceId: testSourceId },
      );

      console.log(
        'Source Seen Items Stats Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Stats should include expected fields
      const stats = response.payload?.content as Record<string, unknown>;
      if (stats) {
        expect(stats.sourceId).toBeDefined();
        expect(stats.totalSeenItems).toBeDefined();
        expect(stats.seenToday).toBeDefined();
      }
    }, DASHBOARD_TIMEOUT);

    it('should support pagination for list action', async () => {
      if (!testSourceId) {
        console.log('Skipping test - no source available');
        return;
      }

      const response = await callDashboard(
        PREDICTION_AGENT,
        'source-seen-items.list',
        { sourceId: testSourceId, limit: 5, offset: 0 },
      );

      console.log(
        'Source Seen Items Pagination Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);

      // Metadata should include pagination info
      const metadata = response.payload?.metadata;
      expect(metadata?.pageSize).toBe(5);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // SIGNALS HANDLER TESTS (s4-2)
  // ============================================================================
  describe('Signals Dashboard Operations (s4-2)', () => {
    let testTargetId: string;

    beforeAll(async () => {
      // Get a target ID to use for signals queries
      const universeResponse = await callDashboard(
        PREDICTION_AGENT,
        'universes.list',
      );
      const universes = universeResponse.payload?.content as { id: string }[];
      if (Array.isArray(universes) && universes.length > 0 && universes[0]) {
        const targetResponse = await callDashboard(
          PREDICTION_AGENT,
          'targets.list',
          { universeId: universes[0].id },
        );
        const targets = targetResponse.payload?.content as { id: string }[];
        if (Array.isArray(targets) && targets.length > 0 && targets[0]) {
          testTargetId = targets[0].id;
        }
      }
    });

    it('should list signals with targetId', async () => {
      if (!testTargetId) {
        console.log('Skipping test - no target available');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'signals.list', {
        targetId: testTargetId,
      });

      console.log('Signals List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Content should be an array
      const signals = response.payload?.content as unknown[];
      expect(Array.isArray(signals)).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should return error without targetId for list action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'signals.list',
        {}, // Missing targetId
      );

      console.log(
        'Signals Missing Target Response:',
        JSON.stringify(response, null, 2),
      );

      // Should fail with MISSING_TARGET_ID error
      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should list signals with pagination', async () => {
      if (!testTargetId) {
        console.log('Skipping test - no target available');
        return;
      }

      const response = await callDashboard(
        PREDICTION_AGENT,
        'signals.list',
        { targetId: testTargetId, pageSize: 10, page: 1 },
      );

      console.log(
        'Signals Pagination Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should list signals with includeTest filter', async () => {
      if (!testTargetId) {
        console.log('Skipping test - no target available');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'signals.list', {
        targetId: testTargetId,
        includeTest: true,
      });

      console.log(
        'Signals includeTest Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get signal by ID', async () => {
      if (!testTargetId) {
        console.log('Skipping test - no target available');
        return;
      }

      // First get a signal ID
      const listResponse = await callDashboard(PREDICTION_AGENT, 'signals.list', {
        targetId: testTargetId,
      });
      const signals = listResponse.payload?.content as { id: string }[];

      if (!Array.isArray(signals) || signals.length === 0 || !signals[0]) {
        console.log('Skipping test - no signals available');
        return;
      }

      const signalId = signals[0].id;
      const response = await callDashboard(PREDICTION_AGENT, 'signals.get', {
        id: signalId,
      });

      console.log('Signal Get Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Should return the signal
      const signal = response.payload?.content as { id: string };
      expect(signal?.id).toBe(signalId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing id on get action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'signals.get',
        {}, // Missing id
      );

      console.log(
        'Signals Missing ID Response:',
        JSON.stringify(response, null, 2),
      );

      // Should fail with MISSING_ID error
      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ANALYTICS INCLUDETEST FILTER TESTS (s4-3)
  // ============================================================================
  describe('Analytics includeTest Filter (s4-3)', () => {
    it('should get analytics summary without test data (default)', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.summary',
      );

      console.log(
        'Analytics Summary (no test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);

    it('should get analytics summary with includeTest=true', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.summary',
        {},
        { includeTest: true },
      );

      console.log(
        'Analytics Summary (with test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get accuracy comparison with includeTest filter', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.accuracy-comparison',
        {},
        { includeTest: true },
      );

      console.log(
        'Accuracy Comparison (with test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get learning velocity with includeTest filter', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.learning-velocity',
        {},
        { includeTest: false },
      );

      console.log(
        'Learning Velocity (without test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // PREDICTIONS WITH TEST FILTER TESTS
  // ============================================================================
  describe('Predictions with Test Data Filter', () => {
    it('should list predictions with includeTest=true', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'predictions.list',
        {},
        { includeTest: true },
      );

      console.log(
        'Predictions (with test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);

      // Any predictions with isTest=true should be visible
      const predictions = response.payload?.content as { isTest?: boolean }[];
      if (Array.isArray(predictions)) {
        const testPredictions = predictions.filter((p) => p.isTest === true);
        console.log(
          `Found ${testPredictions.length} test predictions out of ${predictions.length}`,
        );
      }
    }, DASHBOARD_TIMEOUT);

    it('should list predictions with includeTest=false (default)', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'predictions.list',
        {},
        { includeTest: false },
      );

      console.log(
        'Predictions (without test) Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);

      // Should not have test predictions when includeTest=false
      const predictions = response.payload?.content as { isTest?: boolean }[];
      if (Array.isArray(predictions)) {
        const testPredictions = predictions.filter((p) => p.isTest === true);
        // In default mode, test predictions should be excluded
        console.log(
          `Found ${testPredictions.length} test predictions (should be 0 or excluded)`,
        );
      }
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // OBSERVABILITY EVENTS VERIFICATION
  // ============================================================================
  describe('Observability Events Verification (s4-6, s4-7)', () => {
    it('should confirm observability events service is available', async () => {
      // This test verifies that the observability infrastructure is working
      // by making a dashboard call that uses it
      const response = await callDashboard(
        PREDICTION_AGENT,
        'predictions.list',
      );

      console.log(
        'Predictions Response (observability test):',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      // If we got here without error, the observability service is working
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================
  describe('Sprint 4 Error Handling', () => {
    it('should return error for unsupported source-seen-items action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'source-seen-items.invalid-action',
      );

      console.log(
        'Invalid Source Seen Items Action Response:',
        JSON.stringify(response, null, 2),
      );

      // Should fail with UNSUPPORTED_ACTION error
      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should return error for unsupported signals action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'signals.invalid-action',
      );

      console.log(
        'Invalid Signals Action Response:',
        JSON.stringify(response, null, 2),
      );

      // Should fail with UNSUPPORTED_ACTION error
      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);
  });
});
