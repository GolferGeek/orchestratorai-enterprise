/**
 * E2E Test: Missed Opportunity Detection and Handler Actions
 *
 * Tests the missed-opportunity handler actions:
 * - missed-opportunities.list/detect: List significant price moves not predicted
 * - missed-opportunities.analyze: Root cause analysis for why opportunity was missed
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 * - Targets with price data that may have missed opportunities
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-missed-opportunity.e2e-spec
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

interface MissedOpportunity {
  id: string;
  target_id: string;
  move_start: string;
  move_end: string;
  move_percentage: number;
  significance_score: number;
  analysis_status: string;
}

interface Target {
  id: string;
  name: string;
  target_type: string;
}

describe('Missed Opportunity E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testTargetId: string | null = null;
  let testMissedOpportunityId: string | null = null;

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

  describe('Setup - find target for testing', () => {
    it('should find a target to test missed opportunity detection', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'targets.list', {
        pageSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: Target[] };
      const targets = Array.isArray(content) ? content : (content.data ?? []);

      if (targets.length > 0 && targets[0]?.id) {
        testTargetId = targets[0].id;
        console.log('Found target for missed opportunity tests:', testTargetId, targets[0]?.name);
      } else {
        console.log('No targets available - some tests may be skipped');
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('missed-opportunities.list/detect', () => {
    it('should return error when targetId is missing', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.list', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should return error for missing target ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_TARGET_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should detect missed opportunities for a target', async () => {
      if (!testTargetId) {
        console.log('Skipping - no target available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.detect', {
        targetId: testTargetId,
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: MissedOpportunity[] };
      const opportunities = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(opportunities)).toBe(true);

      if (opportunities.length > 0 && opportunities[0]?.id) {
        testMissedOpportunityId = opportunities[0].id;
        console.log('Found missed opportunity for analysis tests:', testMissedOpportunityId);
        console.log('Move percentage:', opportunities[0]?.move_percentage);
        console.log('Significance score:', opportunities[0]?.significance_score);
      } else {
        console.log('No missed opportunities detected for target');
      }

      // Verify pagination metadata
      expect(result.payload.metadata).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by status', async () => {
      if (!testTargetId) {
        console.log('Skipping - no target available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.list', {
        targetId: testTargetId,
        filters: { status: 'pending' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by date range', async () => {
      if (!testTargetId) {
        console.log('Skipping - no target available');
        return;
      }

      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 1); // Last month

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.list', {
        targetId: testTargetId,
        filters: {
          fromDate: fromDate.toISOString(),
          toDate: new Date().toISOString(),
        },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by minimum move percentage', async () => {
      if (!testTargetId) {
        console.log('Skipping - no target available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.list', {
        targetId: testTargetId,
        filters: { minMovePercent: 5 }, // Only moves > 5%
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should accept detection config parameters', async () => {
      if (!testTargetId) {
        console.log('Skipping - no target available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.detect', {
        targetId: testTargetId,
        detectionConfig: {
          minMovePercent: 3,
          lookbackDays: 30,
        },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('missed-opportunities.analyze', () => {
    it('should return error when ID is missing', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.analyze', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should return error for missing ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should analyze a missed opportunity when available', async () => {
      if (!testMissedOpportunityId) {
        console.log('Skipping - no missed opportunity available for analysis');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.analyze', {
        id: testMissedOpportunityId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as {
        data?: {
          missedOpportunityId: string;
          analysis: unknown;
        };
      };

      const data = content.data ?? content;
      if (data && typeof data === 'object' && 'missedOpportunityId' in data) {
        expect(data.missedOpportunityId).toBe(testMissedOpportunityId);
        console.log('Analysis completed for missed opportunity:', testMissedOpportunityId);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Supported actions verification', () => {
    it('should return error for unsupported action', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'missed-opportunities.unsupported', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string; details?: { supportedActions: string[] } };
      };

      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('UNSUPPORTED_ACTION');
        expect(content.error?.details?.supportedActions).toContain('list');
        expect(content.error?.details?.supportedActions).toContain('detect');
        expect(content.error?.details?.supportedActions).toContain('analyze');
      }
    }, DASHBOARD_TIMEOUT);
  });
});
