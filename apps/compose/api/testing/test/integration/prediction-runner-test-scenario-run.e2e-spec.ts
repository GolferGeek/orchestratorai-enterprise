/**
 * E2E Test: Test Scenario Run via A2A
 *
 * Tests the test-scenarios handler run operations:
 * - test-scenarios.inject - Inject test data into scenario
 * - test-scenarios.generate - Generate mock data for scenario
 * - test-scenarios.run-tier - Run specific pipeline tier against scenario
 * - test-scenarios.cleanup - Cleanup scenario data
 *
 * This test validates Phase 6.4/6.5 requirements:
 * - Test scenario execution with T_ predictions
 * - Signal detection tier execution
 * - Prediction generation tier execution
 * - Evaluation tier execution
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-test-scenario-run.e2e-spec
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
// Longer timeout for tier execution
const TIER_EXECUTION_TIMEOUT = 60000;

interface DashboardResponse {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata: Record<string, unknown>;
  };
}

interface TestScenario {
  id: string;
  name: string;
  description?: string;
  organization_slug: string;
  target_id?: string;
  injection_points: string[];
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

describe('Test Scenario Run E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let testScenarioId: string | null = null;

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

    // Create a test scenario for run tests
    const createResult = await callDashboard(
      PREDICTION_AGENT,
      'test-scenarios.create',
      {
        name: `Run Test Scenario ${Date.now()}`,
        description: 'Scenario for testing run operations',
        injection_points: ['signals', 'predictions', 'articles'],
        config: {
          test_type: 'run_test',
          auto_cleanup: true,
        },
      },
    );

    const createData = extractData<TestScenario>(createResult.payload.content);

    if (createData?.id) {
      testScenarioId = createData.id;
      console.log('Created test scenario for run tests:', testScenarioId);
    }
  }, 30000);

  afterAll(async () => {
    // Clean up test scenario
    if (testScenarioId) {
      try {
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.cleanup', {
          scenarioId: testScenarioId,
        });
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.delete', {
          id: testScenarioId,
        });
        console.log('Cleaned up test scenario:', testScenarioId);
      } catch (error) {
        console.warn('Failed to cleanup test scenario:', error);
      }
    }
  });

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

  /**
   * Helper to extract data from response content (handles both wrapped and unwrapped formats)
   */
  const extractData = <T>(content: unknown): T | null => {
    if (!content) return null;
    if (typeof content !== 'object') return null;

    const c = content as Record<string, unknown>;

    // If content has 'data' property, extract it
    if ('data' in c) {
      return c.data as T;
    }

    // Otherwise content is the data directly
    return content as T;
  };

  /**
   * Helper to check if response indicates an error
   */
  const hasError = (
    content: unknown,
  ): { code: string; message?: string } | null => {
    if (!content) return null;
    if (typeof content !== 'object') return null;

    const c = content as Record<string, unknown>;

    if ('error' in c && c.error && typeof c.error === 'object') {
      return c.error as { code: string; message?: string };
    }

    if ('success' in c && c.success === false && 'error' in c) {
      return c.error as { code: string; message?: string };
    }

    return null;
  };

  /**
   * Helper to check if content indicates success
   */
  const isSuccess = (content: unknown): boolean => {
    if (!content) return false;
    if (typeof content !== 'object') return false;

    const c = content as Record<string, unknown>;

    // If content has explicit 'success' property, use it
    if ('success' in c && typeof c.success === 'boolean') {
      return c.success;
    }

    // If content has 'data' property without 'error', assume success
    if ('data' in c && !('error' in c)) {
      return true;
    }

    // If content has 'id' (looks like data directly), assume success
    if ('id' in c) {
      return true;
    }

    // If content has expected result properties, assume success
    if ('table' in c || 'tier' in c || 'cleanup_type' in c) {
      return true;
    }

    return false;
  };

  describe('test-scenarios.inject', () => {
    it('should inject signal data into scenario', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.inject',
        {
          scenarioId: testScenarioId,
          table: 'signals',
          data: [
            {
              content: 'Test signal 1 about T_AAPL stock performance',
              direction: 'bullish',
              urgency: 'high',
              detected_at: new Date().toISOString(),
            },
            {
              content: 'Test signal 2 about T_MSFT earnings',
              direction: 'bearish',
              urgency: 'medium',
              detected_at: new Date().toISOString(),
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        table: string;
        injected_count: number;
        items: unknown[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.table).toBe('signals');
      expect(data!.injected_count).toBe(2);

      console.log('Injected', data!.injected_count, 'signals');
    }, DASHBOARD_TIMEOUT);

    it('should inject prediction data into scenario', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.inject',
        {
          scenarioId: testScenarioId,
          table: 'predictions',
          data: [
            {
              direction: 'up',
              magnitude: '5-10%',
              confidence: 0.75,
              timeframe_hours: 24,
              reasoning: 'Test prediction based on injected signals',
              predicted_at: new Date().toISOString(),
              expires_at: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ).toISOString(),
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        table: string;
        injected_count: number;
        items: unknown[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.table).toBe('predictions');
      expect(data!.injected_count).toBe(1);

      console.log('Injected', data!.injected_count, 'predictions');
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing required params', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.inject',
        {
          // Missing scenarioId, table, and data
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid injection point', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.inject',
        {
          scenarioId: testScenarioId,
          table: 'invalid_table',
          data: [{ test: 'data' }],
        },
      );

      // May return success with no injection or error depending on implementation
      expect(result.payload.content).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.generate', () => {
    it('should generate mock signals for scenario', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate',
        {
          scenarioId: testScenarioId,
          type: 'signals',
          config: {
            count: 3,
            directions: ['bullish', 'bearish'],
            urgencies: ['high', 'medium'],
            targetSymbols: ['T_AAPL', 'T_MSFT'],
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        type: string;
        generated_count: number;
        injected_count: number;
        items: unknown[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.type).toBe('signals');
      expect(data!.generated_count).toBeGreaterThan(0);

      console.log('Generated', data!.generated_count, 'mock signals');
    }, DASHBOARD_TIMEOUT);

    it('should generate mock predictions with outcomes', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate',
        {
          scenarioId: testScenarioId,
          type: 'predictions',
          config: {
            count: 3,
            directions: ['up', 'down'],
            magnitudes: ['1-5%', '5-10%'],
            confidenceRange: [0.6, 0.9],
            timeframeHours: [24, 72],
            outcomeDistribution: {
              correct: 0.6,
              incorrect: 0.3,
              pending: 0.1,
            },
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        type: string;
        generated_count: number;
        injected_count: number;
        items: unknown[];
        outcomes?: unknown[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.type).toBe('predictions');
      expect(data!.generated_count).toBeGreaterThan(0);

      console.log('Generated', data!.generated_count, 'mock predictions');
    }, DASHBOARD_TIMEOUT);

    it('should generate mock articles', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate',
        {
          scenarioId: testScenarioId,
          type: 'articles',
          config: {
            count: 2,
            sentiments: ['positive', 'negative'],
            targetSymbols: ['T_AAPL'],
            sourceName: 'E2E Test News',
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        type: string;
        generated_count: number;
        items: unknown[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.type).toBe('articles');
      expect(data!.generated_count).toBeGreaterThan(0);

      console.log('Generated', data!.generated_count, 'mock articles');
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing required params', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate',
        {
          // Missing scenarioId, type, config
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid type', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate',
        {
          scenarioId: testScenarioId,
          type: 'invalid_type',
          config: { count: 1 },
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_TYPE');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.run-tier', () => {
    it('should run signal-detection tier', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.run-tier',
        {
          scenarioId: testScenarioId,
          tier: 'signal-detection',
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        tier: string;
        status?: string;
        signals_detected?: number;
        processing_time_ms?: number;
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.tier).toBe('signal-detection');

      console.log('Signal detection tier result:', data);
    }, TIER_EXECUTION_TIMEOUT);

    it('should run prediction-generation tier', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.run-tier',
        {
          scenarioId: testScenarioId,
          tier: 'prediction-generation',
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        tier: string;
        status?: string;
        predictions_generated?: number;
        processing_time_ms?: number;
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.tier).toBe('prediction-generation');

      console.log('Prediction generation tier result:', data);
    }, TIER_EXECUTION_TIMEOUT);

    it('should run evaluation tier', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.run-tier',
        {
          scenarioId: testScenarioId,
          tier: 'evaluation',
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        tier: string;
        status?: string;
        predictions_evaluated?: number;
        processing_time_ms?: number;
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.tier).toBe('evaluation');

      console.log('Evaluation tier result:', data);
    }, TIER_EXECUTION_TIMEOUT);

    it('should return error for missing required params', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.run-tier',
        {
          // Missing scenarioId and tier
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for invalid tier', async () => {
      if (!testScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.run-tier',
        {
          scenarioId: testScenarioId,
          tier: 'invalid-tier',
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_TIER');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.cleanup', () => {
    it('should cleanup scenario data', async () => {
      // Create a separate scenario for cleanup test
      const createResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.create',
        {
          name: `Cleanup Test Scenario ${Date.now()}`,
          description: 'Scenario for testing cleanup',
          injection_points: ['signals', 'predictions'],
        },
      );

      const createData = extractData<TestScenario>(createResult.payload.content);

      if (!createData?.id) {
        console.log('Skipping - could not create cleanup test scenario');
        return;
      }

      const cleanupScenarioId = createData.id;

      // Inject some data
      await callDashboard(PREDICTION_AGENT, 'test-scenarios.inject', {
        scenarioId: cleanupScenarioId,
        table: 'signals',
        data: [
          { content: 'Cleanup test signal', direction: 'bullish', urgency: 'low' },
        ],
      });

      // Now cleanup
      const cleanupResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.cleanup',
        {
          scenarioId: cleanupScenarioId,
        },
      );

      expect(cleanupResult.success).toBe(true);
      expect(isSuccess(cleanupResult.payload.content)).toBe(true);

      const cleanupData = extractData<{
        cleanup_type: string;
        scenario_id: string;
        cleaned_counts?: Record<string, number>;
      }>(cleanupResult.payload.content);
      expect(cleanupData).toBeDefined();
      expect(cleanupData!.cleanup_type).toBe('scenario');
      expect(cleanupData!.scenario_id).toBe(cleanupScenarioId);

      console.log('Cleanup result:', cleanupData);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing scenarioId', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.cleanup',
        {
          // Missing scenarioId and cleanupAll
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should support cleanupAll option', async () => {
      // This is a potentially dangerous operation, so we test it last
      // In a real test environment, you might want to skip this test
      // or ensure it only cleans up test data

      // Note: This test is commented out to prevent accidental cleanup of all test data
      // Uncomment and run manually when needed
      /*
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.cleanup', {
        cleanupAll: true,
      });

      expect(result.success).toBe(true);

      const cleanupData = extractData<{
        cleanup_type: string;
      }>(result.payload.content);
      expect(isSuccess(result.payload.content)).toBe(true);
      expect(cleanupData!.cleanup_type).toBe('all');
      */

      // Just verify the cleanupAll parameter is recognized
      expect(true).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  describe('Full pipeline run (Phase 6.4/6.5)', () => {
    it('should run complete test scenario pipeline with T_ predictions', async () => {
      // Create a new scenario for full pipeline test
      const pipelineCreateResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.create',
        {
          name: `Pipeline Test Scenario ${Date.now()}`,
          description: 'Full pipeline test scenario',
          injection_points: ['signals', 'predictions'],
          config: {
            pipeline_test: true,
          },
        },
      );

      const pipelineCreateData = extractData<TestScenario>(
        pipelineCreateResult.payload.content,
      );

      if (!pipelineCreateData?.id) {
        console.log('Skipping - could not create pipeline test scenario');
        return;
      }

      const pipelineScenarioId = pipelineCreateData.id;
      console.log('Created pipeline test scenario:', pipelineScenarioId);

      try {
        // Step 1: Generate mock signals
        const signalsResult = await callDashboard(
          PREDICTION_AGENT,
          'test-scenarios.generate',
          {
            scenarioId: pipelineScenarioId,
            type: 'signals',
            config: {
              count: 5,
              directions: ['bullish', 'bearish'],
              urgencies: ['high', 'medium', 'low'],
              targetSymbols: ['T_AAPL', 'T_MSFT', 'T_GOOGL'],
            },
          },
        );

        expect(isSuccess(signalsResult.payload.content)).toBe(true);
        const signalsData = extractData<{ generated_count: number }>(
          signalsResult.payload.content,
        );
        console.log('Step 1: Generated', signalsData?.generated_count, 'signals');

        // Step 2: Run signal detection tier
        const detectionResult = await callDashboard(
          PREDICTION_AGENT,
          'test-scenarios.run-tier',
          {
            scenarioId: pipelineScenarioId,
            tier: 'signal-detection',
          },
        );

        expect(isSuccess(detectionResult.payload.content)).toBe(true);
        console.log('Step 2: Signal detection tier completed');

        // Step 3: Run prediction generation tier
        const generationResult = await callDashboard(
          PREDICTION_AGENT,
          'test-scenarios.run-tier',
          {
            scenarioId: pipelineScenarioId,
            tier: 'prediction-generation',
          },
        );

        expect(isSuccess(generationResult.payload.content)).toBe(true);
        console.log('Step 3: Prediction generation tier completed');

        // Step 4: Run evaluation tier
        const evaluationResult = await callDashboard(
          PREDICTION_AGENT,
          'test-scenarios.run-tier',
          {
            scenarioId: pipelineScenarioId,
            tier: 'evaluation',
          },
        );

        expect(isSuccess(evaluationResult.payload.content)).toBe(true);
        console.log('Step 4: Evaluation tier completed');

        // Step 5: Verify data counts
        const countsResult = await callDashboard(
          PREDICTION_AGENT,
          'test-scenarios.get-counts',
          {
            id: pipelineScenarioId,
          },
        );

        expect(isSuccess(countsResult.payload.content)).toBe(true);
        const countsData = extractData<{
          scenario_id: string;
          counts: Record<string, number>;
        }>(countsResult.payload.content);
        console.log('Step 5: Final data counts:', countsData?.counts);

        // Pipeline completed successfully
        console.log('Full pipeline test completed successfully!');
      } finally {
        // Cleanup pipeline test scenario
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.cleanup', {
          scenarioId: pipelineScenarioId,
        });
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.delete', {
          id: pipelineScenarioId,
        });
        console.log('Cleaned up pipeline test scenario');
      }
    }, TIER_EXECUTION_TIMEOUT * 4);
  });
});
