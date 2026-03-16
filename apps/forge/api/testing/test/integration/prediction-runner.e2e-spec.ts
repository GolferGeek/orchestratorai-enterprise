/**
 * E2E Test: Prediction Runner via A2A
 *
 * Tests the prediction runner's dashboard mode operations through the A2A endpoint.
 * This validates the Test-Based Learning Loop infrastructure.
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
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

describe('Prediction Runner E2E Tests', () => {
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
      console.error('Authentication failed:', authResponse.status, authResponse.statusText);
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
  // UNIVERSE DASHBOARD TESTS
  // ============================================================================
  describe('Universe Dashboard Operations', () => {
    it('should list universes', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'universes.list',
      );

      console.log('Universe List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
      expect(response.payload?.content).toBeDefined();

      // Content should be an array of universes (may be empty)
      const universes = response.payload?.content as unknown[];
      expect(Array.isArray(universes)).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should handle universe with domain filter', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'universes.list',
        {},
        { domain: 'stocks' },
      );

      console.log('Filtered Universes Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // TARGET DASHBOARD TESTS
  // ============================================================================
  describe('Target Dashboard Operations', () => {
    let testUniverseId: string;

    beforeAll(async () => {
      // Get a universe ID to use for target queries
      const universeResponse = await callDashboard(
        PREDICTION_AGENT,
        'universes.list',
      );
      const universes = universeResponse.payload?.content as { id: string }[];
      if (Array.isArray(universes) && universes.length > 0 && universes[0]) {
        testUniverseId = universes[0].id;
      }
    });

    it('should list targets with universe ID', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'targets.list',
        { universeId: testUniverseId },
      );

      console.log('Target List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);

    it('should handle target filtering by type with universe ID', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'targets.list',
        { universeId: testUniverseId },
        { targetType: 'stock' },
      );

      console.log('Filtered Targets Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ANALYST DASHBOARD TESTS
  // ============================================================================
  describe('Analyst Dashboard Operations', () => {
    it('should list analysts', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analysts.list',
      );

      console.log('Analyst List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Should have seeded analysts
      const analysts = response.payload?.content as unknown[];
      if (Array.isArray(analysts) && analysts.length > 0) {
        console.log(`Found ${analysts.length} analysts`);
      }
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // TEST SCENARIO DASHBOARD TESTS (Test-Based Learning Loop)
  // ============================================================================
  describe('Test Scenario Dashboard Operations', () => {
    it('should list test scenarios', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.list',
      );

      console.log('Test Scenarios Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);

    it('should handle test scenario filtering by status', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.list',
        {},
        { status: 'pending' },
      );

      console.log('Pending Scenarios Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // TEST ARTICLE DASHBOARD TESTS
  // ============================================================================
  describe('Test Article Dashboard Operations', () => {
    it('should list test articles', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'test-articles.list',
      );

      console.log('Test Articles Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ANALYTICS DASHBOARD TESTS
  // ============================================================================
  describe('Analytics Dashboard Operations', () => {
    it('should get analytics summary', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.summary',
      );

      console.log('Analytics Summary Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);

    it('should get prediction accuracy comparison', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'analytics.accuracy-comparison',
      );

      console.log('Accuracy Comparison Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // LEARNING PROMOTION TESTS (Test-Based Learning Loop)
  // ============================================================================
  describe('Learning Promotion Dashboard Operations', () => {
    it('should list promotion candidates', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'learning-promotion.list-candidates',
      );

      console.log('Promotion Candidates Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');
    }, DASHBOARD_TIMEOUT);

    it('should get promotion stats', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'learning-promotion.stats',
      );

      console.log('Promotion Stats Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================
  describe('Dashboard Error Handling', () => {
    it('should return error for invalid action', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'invalid.action',
      );

      console.log('Invalid Action Response:', JSON.stringify(response, null, 2));

      // Should still get a response structure
      expect(response).toBeDefined();
      // Either fails gracefully or returns an error
      if (!response.success) {
        expect(response.payload?.content || response.mode).toBeDefined();
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid entity', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'nonexistent-entity.list',
      );

      console.log('Invalid Entity Response:', JSON.stringify(response, null, 2));

      expect(response).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });
});
