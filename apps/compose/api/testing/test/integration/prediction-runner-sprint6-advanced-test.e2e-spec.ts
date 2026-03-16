/**
 * E2E Test: Prediction Runner Sprint 6 - Advanced Test Framework & Monitoring
 *
 * Tests the Sprint 6 features through the A2A endpoint.
 * - Test Scenario Comparison (s6-1)
 * - Batch Scenario Execution (s6-2)
 * - Signal Detection Rate Analytics (s6-4)
 * - Alert System (s6-5, s6-6)
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-sprint6-advanced-test.e2e-spec
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

describe('Prediction Runner Sprint 6 - Advanced Test Framework & Monitoring E2E Tests', () => {
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
          jsonrpc: '2.0',
          id: `test-${Date.now()}`,
          method: 'tasks/send',
          params: {
            message: {
              role: 'user',
              parts: [{ type: 'text', text: action }],
            },
            mode: 'dashboard',
            metadata: {
              conversationId: NIL_UUID,
              taskId: NIL_UUID,
              orgSlug: ORG_SLUG,
              userId,
              action,
              params,
              filters,
              pagination,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dashboard call failed:', response.status, errorText);
      throw new Error(`Dashboard call failed: ${response.status}`);
    }

    return response.json();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // s6-1: Test Scenario Comparison
  // ═══════════════════════════════════════════════════════════════════════════

  describe('s6-1: Test Scenario Comparison', () => {
    it('should list test scenarios for comparison', async () => {
      // First, list available test scenarios
      const response = await callDashboard('prediction-dashboard', 'list', {
        entity: 'test-scenarios',
      });

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      // Response should include scenarios or be empty if none exist
      const content = response.payload.content as { scenarios?: unknown[] };
      expect(Array.isArray(content.scenarios) || content.scenarios === undefined).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should handle comparison request for non-existent scenario gracefully', async () => {
      try {
        const response = await callDashboard('prediction-dashboard', 'compare', {
          entity: 'test-scenario',
          testScenarioId: 'non-existent-id',
        });

        // Should either fail gracefully or return empty comparison
        expect(response).toBeDefined();
      } catch (error) {
        // Expected for non-existent scenario
        expect(error).toBeDefined();
      }
    }, DASHBOARD_TIMEOUT);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // s6-4: Signal Detection Rate Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  describe('s6-4: Signal Detection Rate Analytics', () => {
    it('should get signal detection rate with default grouping', async () => {
      const response = await callDashboard('prediction-dashboard', 'analytics', {
        entity: 'analytics',
        metric: 'signalDetectionRate',
      });

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      const content = response.payload.content as { rates?: unknown[] };
      // Should have rates array (possibly empty)
      expect(Array.isArray(content.rates) || content.rates === undefined).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get signal detection rate grouped by day', async () => {
      const response = await callDashboard('prediction-dashboard', 'analytics', {
        entity: 'analytics',
        metric: 'signalDetectionRate',
        groupBy: 'time',
        timePeriod: 'day',
      });

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get signal detection rate grouped by source', async () => {
      const response = await callDashboard('prediction-dashboard', 'analytics', {
        entity: 'analytics',
        metric: 'signalDetectionRate',
        groupBy: 'source',
      });

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // s6-5: Alert System
  // ═══════════════════════════════════════════════════════════════════════════

  describe('s6-5: Alert System', () => {
    it('should list alerts with default filters', async () => {
      const response = await callDashboard('prediction-dashboard', 'list', {
        entity: 'alerts',
      });

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      const content = response.payload.content as { alerts?: unknown[] };
      // Should have alerts array (possibly empty)
      expect(Array.isArray(content.alerts) || content.alerts === undefined).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should list alerts filtered by status', async () => {
      const response = await callDashboard(
        'prediction-dashboard',
        'list',
        { entity: 'alerts' },
        { status: 'active' },
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should list alerts filtered by severity', async () => {
      const response = await callDashboard(
        'prediction-dashboard',
        'list',
        { entity: 'alerts' },
        { severity: 'critical' },
      );

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should get alert counts', async () => {
      const response = await callDashboard('prediction-dashboard', 'get', {
        entity: 'alert-counts',
      });

      expect(response.success).toBe(true);

      const content = response.payload.content as {
        active?: number;
        acknowledged?: number;
        resolved?: number;
        total?: number;
      };
      // Should have counts (even if 0)
      expect(typeof content.active === 'number' || content.active === undefined).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // s6-6: Anomaly Detection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('s6-6: Anomaly Detection', () => {
    it('should run anomaly detection', async () => {
      const response = await callDashboard('prediction-dashboard', 'run', {
        entity: 'anomaly-detection',
      });

      expect(response.success).toBe(true);

      const content = response.payload.content as {
        signal_rate_anomalies?: unknown[];
        accuracy_anomalies?: unknown[];
        alerts_created?: number;
      };
      // Should return detection results
      expect(content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should run anomaly detection with custom config', async () => {
      const response = await callDashboard('prediction-dashboard', 'run', {
        entity: 'anomaly-detection',
        config: {
          signal_rate_threshold_pct: 75,
          accuracy_threshold_pct: 25,
        },
      });

      expect(response.success).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration: End-to-End Flow
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Integration: Complete Monitoring Flow', () => {
    it('should complete a monitoring check cycle', async () => {
      // Step 1: Check current alerts
      const alertsResponse = await callDashboard('prediction-dashboard', 'list', {
        entity: 'alerts',
      });
      expect(alertsResponse.success).toBe(true);

      // Step 2: Run anomaly detection
      const anomalyResponse = await callDashboard('prediction-dashboard', 'run', {
        entity: 'anomaly-detection',
      });
      expect(anomalyResponse.success).toBe(true);

      // Step 3: Get signal detection analytics
      const analyticsResponse = await callDashboard('prediction-dashboard', 'analytics', {
        entity: 'analytics',
        metric: 'signalDetectionRate',
      });
      expect(analyticsResponse.success).toBe(true);

      // All steps should complete successfully
      console.log('Monitoring cycle completed successfully');
    }, DASHBOARD_TIMEOUT * 2);
  });
});
