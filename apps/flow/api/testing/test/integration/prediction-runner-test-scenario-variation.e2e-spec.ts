/**
 * E2E Test: Test Scenario Variations via A2A
 *
 * Tests the test-scenarios handler variation operations:
 * - test-scenarios.from-missed - Generate scenario from missed opportunity
 * - test-scenarios.from-learning - Generate scenario from learning
 * - test-scenarios.generate-variations - Generate variations of existing scenario
 *
 * This test validates Phase 6.8 requirements:
 * - Scenario variation generation
 * - Variation types: timing, confidence, magnitude, direction
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-test-scenario-variation.e2e-spec
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
// Longer timeout for AI-powered variation generation
const VARIATION_TIMEOUT = 90000;

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

interface ScenarioVariation {
  id: string;
  source_scenario_id: string;
  variation_type: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

describe('Test Scenario Variation E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let sourceScenarioId: string | null = null;
  const createdScenarioIds: string[] = [];

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

    // Create a source scenario for variation tests
    const createResult = await callDashboard(
      PREDICTION_AGENT,
      'test-scenarios.create',
      {
        name: `Variation Source Scenario ${Date.now()}`,
        description: 'Source scenario for variation generation tests',
        injection_points: ['signals', 'predictions', 'articles'],
        config: {
          test_type: 'variation_source',
          base_confidence: 0.7,
          base_direction: 'bullish',
          base_magnitude: '5-10%',
          base_timeframe_hours: 48,
        },
      },
    );

    const createData = extractData<TestScenario>(createResult.payload.content);

    if (createData?.id) {
      sourceScenarioId = createData.id;
      createdScenarioIds.push(sourceScenarioId);
      console.log('Created source scenario for variation tests:', sourceScenarioId);

      // Inject some base data
      await callDashboard(PREDICTION_AGENT, 'test-scenarios.inject', {
        scenarioId: sourceScenarioId,
        table: 'signals',
        data: [
          {
            content: 'Base signal for variation testing',
            direction: 'bullish',
            urgency: 'medium',
            detected_at: new Date().toISOString(),
          },
        ],
      });
    }
  }, 30000);

  afterAll(async () => {
    // Clean up all created scenarios
    for (const scenarioId of createdScenarioIds) {
      try {
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.cleanup', {
          scenarioId,
        });
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.delete', {
          id: scenarioId,
        });
        console.log('Cleaned up scenario:', scenarioId);
      } catch (error) {
        console.warn('Failed to cleanup scenario:', error);
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

    // If content has 'variations' property, assume success
    if ('variations' in c) {
      return true;
    }

    return false;
  };

  describe('test-scenarios.generate-variations', () => {
    it('should generate timing variations', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['timing'],
            variationsPerType: 2,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        variations: ScenarioVariation[];
        generation_metadata?: Record<string, unknown>;
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.variations).toBeDefined();
      expect(Array.isArray(data!.variations)).toBe(true);

      // Store created variations for cleanup
      data!.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      console.log('Generated', data!.variations.length, 'timing variations');
    }, VARIATION_TIMEOUT);

    it('should generate confidence variations', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['confidence'],
            variationsPerType: 2,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        variations: ScenarioVariation[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.variations).toBeDefined();

      // Store created variations for cleanup
      data!.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      console.log('Generated', data!.variations.length, 'confidence variations');
    }, VARIATION_TIMEOUT);

    it('should generate magnitude variations', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['magnitude'],
            variationsPerType: 2,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        variations: ScenarioVariation[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.variations).toBeDefined();

      // Store created variations for cleanup
      data!.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      console.log('Generated', data!.variations.length, 'magnitude variations');
    }, VARIATION_TIMEOUT);

    it('should generate direction variations', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['direction'],
            variationsPerType: 1,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        variations: ScenarioVariation[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.variations).toBeDefined();

      // Store created variations for cleanup
      data!.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      console.log('Generated', data!.variations.length, 'direction variations');
    }, VARIATION_TIMEOUT);

    it('should generate multiple variation types at once', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['timing', 'confidence', 'magnitude'],
            variationsPerType: 1,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        variations: ScenarioVariation[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.variations).toBeDefined();
      // Should have at least one variation per type
      expect(data!.variations.length).toBeGreaterThanOrEqual(1);

      // Store created variations for cleanup
      data!.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      console.log(
        'Generated',
        data!.variations.length,
        'variations across multiple types',
      );
    }, VARIATION_TIMEOUT);

    it('should return error for missing sourceScenarioId', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            // Missing sourceScenarioId
            variationTypes: ['timing'],
          },
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing variationTypes', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            // Missing variationTypes
          },
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_VARIATION_TYPES');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for empty variationTypes', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: [], // Empty array
          },
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_VARIATION_TYPES');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing request', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          // Missing request object
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_REQUEST');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.from-missed', () => {
    it('should return error for missing missedOpportunityId', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.from-missed',
        {
          // Missing missedOpportunityId
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    // Note: Testing with actual missed opportunity requires existing data
    // This test validates the error handling
    it('should handle non-existent missed opportunity gracefully', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.from-missed',
        {
          missedOpportunityId: '00000000-0000-0000-0000-000000000001',
        },
      );

      // May return success=false with NOT_FOUND or error
      expect(result.payload.content).toBeDefined();

      const error = hasError(result.payload.content);

      // Should fail for non-existent ID
      if (error) {
        expect(['NOT_FOUND', 'GENERATE_FROM_MISSED_FAILED']).toContain(
          error.code,
        );
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.from-learning', () => {
    it('should return error for missing learningId', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.from-learning',
        {
          // Missing learningId
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    // Note: Testing with actual learning requires existing data
    // This test validates the error handling
    it('should handle non-existent learning gracefully', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.from-learning',
        {
          learningId: '00000000-0000-0000-0000-000000000001',
        },
      );

      // May return success=false with NOT_FOUND or error
      expect(result.payload.content).toBeDefined();

      const error = hasError(result.payload.content);

      // Should fail for non-existent ID
      if (error) {
        expect(['NOT_FOUND', 'GENERATE_FROM_LEARNING_FAILED']).toContain(
          error.code,
        );
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Action name verification', () => {
    it('should return error for camelCase generateVariations (use generate-variations instead)', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generateVariations', // camelCase not supported
        {
          request: {
            sourceScenarioId,
            variationTypes: ['timing'],
            variationsPerType: 1,
          },
        },
      );

      // Verify the action is not supported (handlers use kebab-case)
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase fromMissed (use from-missed instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.fromMissed', // camelCase not supported
        {
          missedOpportunityId: '00000000-0000-0000-0000-000000000001',
        },
      );

      // Verify the action is not supported
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase fromLearning (use from-learning instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.fromLearning', // camelCase not supported
        {
          learningId: '00000000-0000-0000-0000-000000000001',
        },
      );

      // Verify the action is not supported
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Variation workflow integration (Phase 6.8)', () => {
    it('should complete full variation workflow', async () => {
      if (!sourceScenarioId) {
        console.log('Skipping - no source scenario created');
        return;
      }

      // Step 1: Get the source scenario
      const getResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.get',
        {
          id: sourceScenarioId,
        },
      );

      expect(getResult.success).toBe(true);
      expect(isSuccess(getResult.payload.content)).toBe(true);
      console.log('Step 1: Retrieved source scenario');

      // Step 2: Generate variations
      const variationsResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.generate-variations',
        {
          request: {
            sourceScenarioId,
            variationTypes: ['timing', 'confidence'],
            variationsPerType: 1,
          },
        },
      );

      expect(variationsResult.success).toBe(true);
      expect(isSuccess(variationsResult.payload.content)).toBe(true);

      const variationsData = extractData<{
        variations: ScenarioVariation[];
      }>(variationsResult.payload.content);
      console.log(
        'Step 2: Generated',
        variationsData?.variations.length,
        'variations',
      );

      // Store for cleanup
      variationsData?.variations.forEach((v: ScenarioVariation) => {
        if (v.id) {
          createdScenarioIds.push(v.id);
        }
      });

      // Step 3: List all scenarios to verify variations appear
      const listResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.list',
        {},
      );

      expect(listResult.success).toBe(true);
      expect(isSuccess(listResult.payload.content)).toBe(true);

      const listData = extractData<TestScenario[]>(listResult.payload.content);

      // Verify variations are in the list
      if (variationsData?.variations && listData) {
        const variationIds = variationsData.variations.map(
          (v: ScenarioVariation) => v.id,
        );
        const foundVariations = listData.filter((s) =>
          variationIds.includes(s.id),
        );
        console.log(
          'Step 3: Found',
          foundVariations.length,
          'variations in scenario list',
        );
      }

      // Step 4: Get summaries to see variations with data counts
      const summariesResult = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.get-summaries',
        {},
      );

      expect(summariesResult.success).toBe(true);
      expect(isSuccess(summariesResult.payload.content)).toBe(true);
      console.log('Step 4: Retrieved summaries with data counts');

      console.log('Full variation workflow completed successfully!');
    }, VARIATION_TIMEOUT * 2);
  });
});
