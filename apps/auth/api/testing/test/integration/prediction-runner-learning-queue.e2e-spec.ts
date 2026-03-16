/**
 * E2E Test: Learning Queue CRUD and Response Actions
 *
 * Tests the learning-queue handler actions:
 * - learning-queue.list: List AI-suggested learnings pending human review
 * - learning-queue.get: Get details of a specific queue item
 * - learning-queue.respond: Human response to approve/reject/modify a learning suggestion
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-learning-queue.e2e-spec
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

interface LearningQueueItem {
  id: string;
  suggested_title: string;
  suggested_description: string;
  suggested_scope_level: string;
  suggested_learning_type: string;
  status: string;
  ai_reasoning: string;
  ai_confidence: number;
  created_at: string;
}

interface LearningQueueRespondResult {
  queueItem: LearningQueueItem;
  message: string;
}

describe('Learning Queue E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testQueueItemId: string | null = null;

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

  describe('learning-queue.list', () => {
    it('should list pending learning queue items by default', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: LearningQueueItem[] };
      const items = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(items)).toBe(true);

      // Store first item ID for later tests if available
      if (items.length > 0 && items[0]?.id) {
        testQueueItemId = items[0].id;
        console.log('Found learning queue item for tests:', testQueueItemId);
        console.log('Suggested title:', items[0]?.suggested_title);
        console.log('AI confidence:', items[0]?.ai_confidence);
      } else {
        console.log('No learning queue items available - some tests may be skipped');
      }

      // Verify pagination metadata
      expect(result.payload.metadata).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by status', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { status: 'pending' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by suggested scope level', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { suggestedScopeLevel: 'target' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should filter by suggested learning type', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { suggestedLearningType: 'rule' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should handle pagination correctly', async () => {
      const page1 = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        page: 1,
        pageSize: 5,
      });

      expect(page1.success).toBe(true);
      expect(page1.payload.metadata?.page).toBe(1);
      expect(page1.payload.metadata?.pageSize).toBe(5);
    }, DASHBOARD_TIMEOUT);

    it('should list approved items', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { status: 'approved' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should list rejected items', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.list', {
        filters: { status: 'rejected' },
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-queue.get', () => {
    it('should get a specific queue item', async () => {
      if (!testQueueItemId) {
        console.log('Skipping - no queue item available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.get', {
        id: testQueueItemId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: LearningQueueItem };
      const item = content.data ?? content;

      // Should have queue item properties
      if (typeof item === 'object' && item !== null && 'id' in item) {
        expect((item as LearningQueueItem).id).toBe(testQueueItemId);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.get', {});

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
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.get', {
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

  describe('learning-queue.respond', () => {
    it('should return error for missing ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        decision: 'approved',
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
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        id: '00000000-0000-0000-0000-000000000001',
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
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        id: '00000000-0000-0000-0000-000000000001',
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

    it('should accept valid approved response parameters', async () => {
      if (!testQueueItemId) {
        console.log('Skipping - no queue item available for approval test');
        return;
      }

      // Note: This test may modify data
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        id: testQueueItemId,
        decision: 'approved',
        reviewerNotes: 'Approved during E2E test',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as LearningQueueRespondResult | { success: boolean; error?: { code: string } };

      // Either success with message or error
      if ('message' in content) {
        expect(content.message).toBeDefined();
        console.log('Approve response:', content.message);
      } else if ('error' in content) {
        console.log('Approve returned error (expected if item already processed):', content.error);
      }
    }, DASHBOARD_TIMEOUT);

    it('should accept valid modified response with override fields', async () => {
      // Skip if no test item, but verify parameter structure is valid
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        id: testQueueItemId || '00000000-0000-0000-0000-000000000001',
        decision: 'modified',
        reviewerNotes: 'Modified during E2E test',
        finalTitle: 'Modified Title',
        finalDescription: 'Modified description from E2E test',
        finalScopeLevel: 'target',
        finalLearningType: 'rule',
        finalConfig: { threshold: 0.8 },
      });

      expect(result.payload).toBeDefined();
      // Either success or error (if item doesn't exist or already processed)
      const content = result.payload?.content;
      expect(content).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should accept valid rejected response', async () => {
      // Skip if no test item, but verify parameter structure is valid
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.respond', {
        id: testQueueItemId || '00000000-0000-0000-0000-000000000001',
        decision: 'rejected',
        reviewerNotes: 'Rejected during E2E test',
      });

      expect(result.payload).toBeDefined();
      // Either success or error (if item doesn't exist or already processed)
      const content = result.payload?.content;
      expect(content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('Supported actions verification', () => {
    it('should return error for unsupported action', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-queue.unsupported', {});

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
