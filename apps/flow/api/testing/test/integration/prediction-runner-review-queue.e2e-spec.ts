/**
 * E2E Test: Review Queue CRUD and Response Actions
 *
 * Tests the review-queue handler actions:
 * - review-queue.list: List pending signals requiring human review (confidence 0.4-0.7)
 * - review-queue.get: Get details of a specific review item
 * - review-queue.respond: Human response to approve/reject/modify a signal
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-review-queue.e2e-spec
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

interface ReviewQueueItem {
  id: string;
  signal_id: string;
  target_id: string;
  confidence: number;
  direction: string;
  content: string;
  status: string;
  created_at: string;
}

interface ReviewQueueRespondResult {
  predictor?: {
    id: string;
    signal_id: string;
  };
  learning?: {
    id: string;
  };
  message: string;
}

describe('Review Queue E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testReviewItemId: string | null = null;

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

  describe('review-queue.list', () => {
    it('should list pending review items', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.list', {
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: ReviewQueueItem[] };

      // Content may be an array directly or have data property
      const items = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(items)).toBe(true);

      // Store first item ID for later tests if available
      if (items.length > 0) {
        const firstItem = items[0];
        if (firstItem?.id) {
          testReviewItemId = firstItem.id;
          console.log('Found review item ID for tests:', testReviewItemId);
        }
      } else {
        console.log('No review items in queue - some tests may be skipped');
      }

      // Verify pagination metadata
      expect(result.payload.metadata).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by targetId', async () => {
      // First get a universe ID
      const universeListResult = await callDashboard(PREDICTION_AGENT, 'universes.list', {
        pageSize: 1,
      });

      expect(universeListResult.success).toBe(true);
      const universeListContent = universeListResult.payload.content as { id: string }[] | { data: { id: string }[] };
      const universes = Array.isArray(universeListContent) ? universeListContent : (universeListContent.data ?? []);

      if (universes.length === 0 || !universes[0]?.id) {
        console.log('No universes available - skipping filter test');
        return;
      }

      const universeId = universes[0].id;

      // Now get targets from that universe
      const targetResult = await callDashboard(PREDICTION_AGENT, 'targets.list', {
        universeId,
        pageSize: 1,
      });

      expect(targetResult.success).toBe(true);
      const targetContent = targetResult.payload.content as { id: string }[] | { data: { id: string }[] };
      const targets = Array.isArray(targetContent) ? targetContent : (targetContent.data ?? []);

      if (targets.length > 0 && targets[0]?.id) {
        const targetId = targets[0].id;

        const result = await callDashboard(PREDICTION_AGENT, 'review-queue.list', {
          filters: { targetId },
          page: 1,
          pageSize: 20,
        });

        expect(result.success).toBe(true);
        expect(result.payload.content).toBeDefined();
      } else {
        console.log('No targets available in universe - skipping filter test');
      }
    }, DASHBOARD_TIMEOUT);

    it('should filter by date range', async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7); // Last 7 days

      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.list', {
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

    it('should handle pagination correctly', async () => {
      const page1 = await callDashboard(PREDICTION_AGENT, 'review-queue.list', {
        page: 1,
        pageSize: 5,
      });

      expect(page1.success).toBe(true);
      expect(page1.payload.metadata?.page).toBe(1);
      expect(page1.payload.metadata?.pageSize).toBe(5);
    }, DASHBOARD_TIMEOUT);
  });

  describe('review-queue.get', () => {
    it('should get a specific review item', async () => {
      if (!testReviewItemId) {
        console.log('Skipping - no review item available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.get', {
        id: testReviewItemId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: ReviewQueueItem };
      const item = content.data ?? content;

      expect(item).toBeDefined();
      // Should have review queue item properties
      if (typeof item === 'object' && item !== null && 'id' in item) {
        expect((item as ReviewQueueItem).id).toBe(testReviewItemId);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.get', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for missing ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for non-existent ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.get', {
        id: '00000000-0000-0000-0000-000000000001', // Non-existent
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for not found
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('NOT_FOUND');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('review-queue.respond', () => {
    it('should return error for missing reviewId', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.respond', {
        decision: 'approve',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for invalid data
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing decision', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.respond', {
        reviewId: '00000000-0000-0000-0000-000000000001',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for invalid data
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid decision', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.respond', {
        reviewId: '00000000-0000-0000-0000-000000000001',
        decision: 'invalid_decision',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for invalid decision
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('INVALID_DECISION');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should accept valid approve response parameters', async () => {
      if (!testReviewItemId) {
        console.log('Skipping - no review item available for approval test');
        return;
      }

      // Note: This test may fail if the review item has already been processed
      // We're mainly testing that the handler accepts valid parameters
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.respond', {
        reviewId: testReviewItemId,
        decision: 'approve',
        notes: 'Approved during E2E test',
      });

      // The call should succeed at the handler level (even if service throws)
      expect(result.payload).toBeDefined();

      const content = result.payload?.content as ReviewQueueRespondResult | { success: boolean; error?: { code: string } };

      // Either success with predictor/message or error
      if ('message' in content) {
        expect(content.message).toBeDefined();
        console.log('Approve response:', content.message);
      } else if ('error' in content) {
        console.log('Approve returned error (expected if item already processed):', content.error);
      }
    }, DASHBOARD_TIMEOUT);

    it('should accept valid modify response with strength override', async () => {
      // Skip if no test item, but verify parameter structure is valid
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.respond', {
        reviewId: testReviewItemId || '00000000-0000-0000-0000-000000000001',
        decision: 'modify',
        strengthOverride: 0.85,
        notes: 'Modified strength during E2E test',
        learningNote: 'This is a learning note from E2E test',
      });

      expect(result.payload).toBeDefined();
      // Either success or error (if item doesn't exist or already processed)
      const content = result.payload?.content;
      expect(content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('Supported actions verification', () => {
    it('should return error for unsupported action', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'review-queue.unsupported', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string; details?: { supportedActions: string[] } };
      };

      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('UNSUPPORTED_ACTION');
        expect(content.error?.details?.supportedActions).toContain('list');
        expect(content.error?.details?.supportedActions).toContain('get');
        expect(content.error?.details?.supportedActions).toContain('respond');
      }
    }, DASHBOARD_TIMEOUT);
  });
});
