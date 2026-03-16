/**
 * E2E Test: Prediction Runner Strategy Operations
 *
 * Tests strategies.list and strategies.recommend actions.
 *
 * Sprint 5: Setup Completion & Exploration
 * PRD Reference: Phase 1.9
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-strategy
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const DASHBOARD_TIMEOUT = 30000;

interface DashboardResponse {
  success: boolean;
  mode: string;
  payload: {
    content: unknown;
    metadata: Record<string, unknown>;
  };
}

describe('Prediction Runner Strategy E2E Tests', () => {
  let authToken: string;
  let userId: string;

  // Track resources for testing
  let createdUniverseId: string | null = null;
  let systemStrategies: Array<{ id: string; slug: string }> = [];

  beforeAll(async () => {
    // Authenticate
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    authToken = authData.accessToken;

    // Extract userId from JWT
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, 30000);

  afterAll(async () => {
    // Cleanup universe
    if (createdUniverseId) {
      try {
        await callDashboard(PREDICTION_AGENT, 'universes.delete', {
          id: createdUniverseId,
        });
      } catch {
        console.log('Universe cleanup skipped');
      }
    }
  });

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

  const PREDICTION_AGENT = 'us-tech-stocks-2025';

  // ============================================================================
  // STRATEGY LIST TESTS
  // ============================================================================
  describe('Strategy List Operations', () => {
    it('should list all strategies', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.list', {});

      console.log('Strategies List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      const strategies = response.payload?.content as Array<{
        id: string;
        slug: string;
        name: string;
        is_system: boolean;
        risk_level: string;
      }>;
      expect(Array.isArray(strategies)).toBe(true);

      // Store system strategies for later tests
      systemStrategies = strategies
        .filter((s) => s.is_system)
        .map((s) => ({ id: s.id, slug: s.slug }));

      console.log(`Found ${strategies.length} strategies, ${systemStrategies.length} system strategies`);
    }, DASHBOARD_TIMEOUT);

    it('should list only system strategies', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'strategies.list',
        { filters: { isSystem: true } },
      );

      console.log(
        'System Strategies Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const strategies = response.payload?.content as Array<{
        is_system: boolean;
      }>;
      expect(Array.isArray(strategies)).toBe(true);

      // All returned should be system strategies
      for (const strategy of strategies) {
        expect(strategy.is_system).toBe(true);
      }
    }, DASHBOARD_TIMEOUT);

    it('should filter strategies by risk level', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'strategies.list',
        { filters: { riskLevel: 'moderate' } },
      );

      console.log(
        'Moderate Risk Strategies Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const strategies = response.payload?.content as Array<{
        risk_level: string;
      }>;
      expect(Array.isArray(strategies)).toBe(true);

      // All returned should have moderate risk level
      for (const strategy of strategies) {
        expect(strategy.risk_level).toBe('moderate');
      }
    }, DASHBOARD_TIMEOUT);

    it('should filter strategies by active status', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'strategies.list',
        { filters: { isActive: true } },
      );

      console.log(
        'Active Strategies Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const strategies = response.payload?.content as Array<{
        is_active: boolean;
      }>;
      expect(Array.isArray(strategies)).toBe(true);

      // All returned should be active
      for (const strategy of strategies) {
        expect(strategy.is_active).toBe(true);
      }
    }, DASHBOARD_TIMEOUT);

    it('should paginate strategy list', async () => {
      const response = await callDashboard(
        PREDICTION_AGENT,
        'strategies.list',
        { page: 1, pageSize: 2 },
      );

      console.log(
        'Paginated Strategies Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const strategies = response.payload?.content as Array<unknown>;
      expect(Array.isArray(strategies)).toBe(true);
      expect(strategies.length).toBeLessThanOrEqual(2);

      // Check pagination metadata
      const metadata = response.payload?.metadata;
      if (metadata?.pagination) {
        expect(metadata.pagination).toHaveProperty('page');
        expect(metadata.pagination).toHaveProperty('pageSize');
        expect(metadata.pagination).toHaveProperty('total');
      }
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // STRATEGY GET TESTS
  // ============================================================================
  describe('Strategy Get Operations', () => {
    it('should get strategy by ID', async () => {
      if (systemStrategies.length === 0) {
        console.log('Skipping - no system strategies found');
        return;
      }

      const strategyId = systemStrategies[0].id;
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.get', {
        id: strategyId,
      });

      console.log('Get Strategy by ID Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      const strategy = response.payload?.content as {
        id: string;
        slug: string;
        thresholds: Record<string, unknown>;
        analyst_weights: Record<string, unknown>;
      };
      expect(strategy.id).toBe(strategyId);
      expect(strategy.slug).toBeDefined();
      // Strategies should have threshold and weight configurations
      expect(strategy.thresholds).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should get strategy by slug', async () => {
      if (systemStrategies.length === 0) {
        console.log('Skipping - no system strategies found');
        return;
      }

      const strategySlug = systemStrategies[0].slug;
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.get', {
        slug: strategySlug,
      });

      console.log('Get Strategy by Slug Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      const strategy = response.payload?.content as {
        slug: string;
      };
      expect(strategy.slug).toBe(strategySlug);
    }, DASHBOARD_TIMEOUT);

    it('should fail to get non-existent strategy', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.get', {
        id: NIL_UUID,
      });

      console.log(
        'Get Non-Existent Strategy Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should fail to get strategy without ID or slug', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.get', {});

      console.log(
        'Get Strategy No ID Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // STRATEGY RECOMMEND TESTS
  // ============================================================================
  describe('Strategy Recommend Operations', () => {
    it('should create a universe for recommendation testing', async () => {
      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'universes.create', {
        name: `Strategy Recommend Test Universe ${uniqueSuffix}`,
        domain: 'stocks',
        description: 'Test universe for strategy recommendation',
        agentSlug: PREDICTION_AGENT,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const universe = response.payload?.content as { id: string };
      createdUniverseId = universe.id;
    }, DASHBOARD_TIMEOUT);

    it('should recommend strategy for universe', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'strategies.recommend', {
        universeId: createdUniverseId,
      });

      console.log(
        'Recommend Strategy Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const recommendation = response.payload?.content as {
        universeId: string;
        recommended: {
          id: string;
          slug: string;
          name: string;
        };
        reasoning: string;
        alternatives: Array<{
          id: string;
          slug: string;
          name: string;
        }>;
      };

      expect(recommendation.universeId).toBe(createdUniverseId);
      expect(recommendation.recommended).toBeDefined();
      expect(recommendation.recommended.slug).toBeDefined();
      expect(recommendation.reasoning).toBeDefined();
      expect(Array.isArray(recommendation.alternatives)).toBe(true);

      console.log(`Recommended strategy: ${recommendation.recommended.slug}`);
      console.log(`Reasoning: ${recommendation.reasoning}`);
      console.log(`Alternatives: ${recommendation.alternatives.map((a) => a.slug).join(', ')}`);
    }, DASHBOARD_TIMEOUT);

    it('should fail to recommend strategy without universeId', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.recommend', {});

      console.log(
        'Recommend Without UniverseId Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should handle recommendation for non-existent universe', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'strategies.recommend', {
        universeId: NIL_UUID,
      });

      console.log(
        'Recommend Non-Existent Universe Response:',
        JSON.stringify(response, null, 2),
      );

      // May return default recommendation or error
      // This test documents the actual behavior
      console.log(`Success: ${response.success}`);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================
  describe('Cleanup', () => {
    it('should delete test universe', async () => {
      if (createdUniverseId) {
        const response = await callDashboard(PREDICTION_AGENT, 'universes.delete', {
          id: createdUniverseId,
        });
        expect(response.success).toBe(true);
        createdUniverseId = null;
      }
    }, DASHBOARD_TIMEOUT);
  });
});
