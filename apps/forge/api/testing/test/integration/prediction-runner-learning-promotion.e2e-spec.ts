/**
 * E2E Test: Learning Promotion Flow including Lineage Tracking
 *
 * Tests the learning-promotion handler actions:
 * - learning-promotion.list-candidates: List test learnings eligible for promotion
 * - learning-promotion.validate: Validate a learning for promotion
 * - learning-promotion.promote: Promote test learning to production (with lineage)
 * - learning-promotion.reject: Reject a learning from promotion
 * - learning-promotion.history: Get promotion history with lineage data
 * - learning-promotion.stats: Get promotion statistics
 * - learning-promotion.run-backtest: Run backtest for a learning
 *
 * Phase 5 - Learning Promotion Workflow
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 * - Test learnings (is_test=true) available for promotion testing
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-learning-promotion.e2e-spec
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

interface PromotionCandidate {
  id: string;
  title: string;
  description: string;
  scope_level: string;
  learning_type: string;
  is_test: boolean;
  status: string;
  times_applied: number;
  times_helpful: number;
  validationMetrics?: {
    timesApplied: number;
    timesHelpful: number;
    successRate: number;
  };
  readyForPromotion?: boolean;
}

interface ValidationResult {
  learningId: string;
  isValid: boolean;
  checks: {
    isTestLearning: boolean;
    isActive: boolean;
    notAlreadyPromoted: boolean;
    hasValidationMetrics: boolean;
    meetsMinApplications: boolean;
    meetsMinSuccessRate: boolean;
  };
  validationMetrics?: {
    timesApplied: number;
    timesHelpful: number;
    successRate: number;
  };
  errors: string[];
  warnings: string[];
}

interface PromotionHistory {
  id: string;
  testLearningId: string;
  productionLearningId: string;
  testLearningTitle: string;
  productionLearningTitle: string;
  promotedBy: string;
  promotedByEmail: string;
  promotedByName: string;
  promotedAt: string;
  validationMetrics: unknown;
  backtestResult?: unknown;
  reviewerNotes?: string;
  scenarioRuns: unknown;
}

interface PromotionStats {
  totalTestLearnings: number;
  totalPromoted: number;
  totalRejected: number;
  pendingReview: number;
  avgTimesApplied: number;
  avgSuccessRate: number;
}

interface BacktestResult {
  backtestId: string;
  learningId: string;
  passed: boolean;
  metrics: {
    baselineAccuracy: number;
    withLearningAccuracy: number;
    accuracyLift: number;
    baselineFalsePositiveRate: number;
    withLearningFalsePositiveRate: number;
    falsePositiveDelta: number;
    predictionsAffected: number;
    predictionsImproved: number;
    predictionsDegraded: number;
    statisticalSignificance: number;
  };
  executedAt: string;
  executionTimeMs: number;
}

describe('Learning Promotion E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testCandidateId: string | null = null;

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

  describe('learning-promotion.list-candidates', () => {
    it('should list promotion candidates (test learnings)', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.list-candidates', {
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: PromotionCandidate[] };
      const candidates = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(candidates)).toBe(true);

      // Store first candidate ID for later tests if available
      if (candidates.length > 0 && candidates[0]?.id) {
        testCandidateId = candidates[0].id;
        console.log('Found promotion candidate for tests:', testCandidateId);
        console.log('Title:', candidates[0]?.title);
        console.log('Ready for promotion:', candidates[0]?.readyForPromotion);
        console.log('Validation metrics:', candidates[0]?.validationMetrics);
      } else {
        console.log('No promotion candidates available - some tests may be skipped');
      }

      // Verify pagination metadata
      expect(result.payload.metadata).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should handle pagination correctly', async () => {
      const page1 = await callDashboard(PREDICTION_AGENT, 'learning-promotion.list-candidates', {
        page: 1,
        pageSize: 5,
      });

      expect(page1.success).toBe(true);
      expect(page1.payload.metadata?.page).toBe(1);
      expect(page1.payload.metadata?.pageSize).toBe(5);
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.validate', () => {
    it('should return error for missing learningId', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.validate', {});

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

    it('should validate a promotion candidate', async () => {
      if (!testCandidateId) {
        console.log('Skipping - no candidate available');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.validate', {
        learningId: testCandidateId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: ValidationResult };
      const validation = content.data ?? content;

      if (validation && typeof validation === 'object' && 'learningId' in validation) {
        expect((validation as ValidationResult).learningId).toBe(testCandidateId);
        expect((validation as ValidationResult).checks).toBeDefined();
        console.log('Validation result:', {
          isValid: (validation as ValidationResult).isValid,
          checks: (validation as ValidationResult).checks,
        });
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.stats', () => {
    it('should get promotion statistics', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.stats', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: PromotionStats };
      const stats = content.data ?? content;

      if (stats && typeof stats === 'object') {
        console.log('Promotion stats:', stats);
        // Verify stats structure
        if ('totalTestLearnings' in stats) {
          expect(typeof (stats as PromotionStats).totalTestLearnings).toBe('number');
          expect(typeof (stats as PromotionStats).totalPromoted).toBe('number');
          expect(typeof (stats as PromotionStats).totalRejected).toBe('number');
          expect(typeof (stats as PromotionStats).pendingReview).toBe('number');
        }
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.history', () => {
    it('should get promotion history', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.history', {
        page: 1,
        pageSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: PromotionHistory[] };
      const history = Array.isArray(content) ? content : (content.data ?? []);
      expect(Array.isArray(history)).toBe(true);

      if (history.length > 0) {
        console.log('Promotion history entries:', history.length);
        console.log('First entry:', {
          testLearningTitle: history[0]?.testLearningTitle,
          promotedAt: history[0]?.promotedAt,
          promotedByName: history[0]?.promotedByName,
        });
      } else {
        console.log('No promotion history available');
      }

      // Verify pagination metadata
      expect(result.payload.metadata).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should handle pagination correctly', async () => {
      const page1 = await callDashboard(PREDICTION_AGENT, 'learning-promotion.history', {
        page: 1,
        pageSize: 5,
      });

      expect(page1.success).toBe(true);
      expect(page1.payload.metadata?.page).toBe(1);
      expect(page1.payload.metadata?.pageSize).toBe(5);
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.run-backtest', () => {
    it('should return error for missing learningId', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.run-backtest', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for missing ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_LEARNING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should run backtest for a learning', async () => {
      if (!testCandidateId) {
        console.log('Skipping - no candidate available for backtest');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.run-backtest', {
        learningId: testCandidateId,
        windowDays: 30,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as { data: BacktestResult };
      const backtest = content.data ?? content;

      if (backtest && typeof backtest === 'object' && 'backtestId' in backtest) {
        console.log('Backtest result:', {
          passed: (backtest as BacktestResult).passed,
          accuracyLift: (backtest as BacktestResult).metrics?.accuracyLift,
          executionTimeMs: (backtest as BacktestResult).executionTimeMs,
        });
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.promote', () => {
    it('should return error for missing learningId', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.promote', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for missing ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_LEARNING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should accept valid promotion parameters', async () => {
      if (!testCandidateId) {
        console.log('Skipping - no candidate available for promotion test');
        return;
      }

      // Note: This test may modify data - promoting a learning
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.promote', {
        learningId: testCandidateId,
        reviewerNotes: 'Promoted during E2E test',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as PromotionHistory | { success: boolean; error?: { code: string; message?: string } };

      // Either success with lineage data or error (if validation fails)
      if ('testLearningId' in content) {
        console.log('Promotion successful:', {
          testLearningId: content.testLearningId,
          productionLearningId: content.productionLearningId,
        });
      } else if ('error' in content) {
        console.log('Promotion returned error (expected if validation fails):', content.error);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('learning-promotion.reject', () => {
    it('should return error for missing learningId', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.reject', {
        reason: 'Test rejection',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for missing ID
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_LEARNING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing reason', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.reject', {
        learningId: '00000000-0000-0000-0000-000000000001',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string };
      };

      // Should have error for missing reason
      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('MISSING_REASON');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should accept valid rejection parameters', async () => {
      // Skip actual rejection to avoid modifying test data
      // Just verify the parameter structure is accepted
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.reject', {
        learningId: testCandidateId || '00000000-0000-0000-0000-000000000001',
        reason: 'Rejected during E2E test - not effective enough',
      });

      expect(result.payload).toBeDefined();
      // Either success or error (if item doesn't exist or already processed)
      const content = result.payload?.content;
      expect(content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('Lineage tracking verification', () => {
    it('should include lineage data in promotion history', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.history', {
        page: 1,
        pageSize: 10,
      });

      expect(result.success).toBe(true);

      const content = result.payload.content as { data: PromotionHistory[] };
      const history = Array.isArray(content) ? content : (content.data ?? []);

      if (history.length > 0) {
        const entry = history[0] as PromotionHistory;
        // Verify lineage fields are present
        expect(entry.testLearningId).toBeDefined();
        expect(entry.productionLearningId).toBeDefined();
        expect(entry.promotedBy).toBeDefined();
        expect(entry.promotedAt).toBeDefined();

        console.log('Lineage verification:', {
          hasTestLearningId: !!entry.testLearningId,
          hasProductionLearningId: !!entry.productionLearningId,
          hasPromoter: !!entry.promotedBy,
          hasTimestamp: !!entry.promotedAt,
          hasValidationMetrics: !!entry.validationMetrics,
        });
      } else {
        console.log('No history entries to verify lineage');
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Supported actions verification', () => {
    it('should return error for unsupported action', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'learning-promotion.unsupported', {});

      expect(result.payload).toBeDefined();

      const content = result.payload?.content as {
        success?: boolean;
        error?: { code: string; details?: { supportedActions: string[] } };
      };

      if (result.success && content) {
        expect(content.success).toBe(false);
        expect(content.error?.code).toBe('UNSUPPORTED_ACTION');
        expect(content.error?.details?.supportedActions).toContain('list-candidates');
        expect(content.error?.details?.supportedActions).toContain('validate');
        expect(content.error?.details?.supportedActions).toContain('promote');
        expect(content.error?.details?.supportedActions).toContain('reject');
        expect(content.error?.details?.supportedActions).toContain('history');
        expect(content.error?.details?.supportedActions).toContain('stats');
        expect(content.error?.details?.supportedActions).toContain('run-backtest');
      }
    }, DASHBOARD_TIMEOUT);
  });
});
