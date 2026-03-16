/**
 * E2E Test: Prediction Runner camelCase Contract Tests
 *
 * Tests that the prediction runner handlers accept camelCase params
 * from the transport-types contract and correctly map to snake_case DTOs.
 *
 * Sprint 0: Agent Hardening Foundation - Contract Validation
 *
 * IMPORTANT: After modifying handler code, restart the API server:
 *   1. Stop the running server (Ctrl+C)
 *   2. npm run build --workspace=apps/api
 *   3. npm run start:dev --workspace=apps/api
 *
 * Without restart, tests will fail because old code is still running.
 *
 * Prerequisites:
 * - API server running on localhost:6100 (with latest build)
 * - Supabase running with seeded data and prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-camel-case
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

describe('Prediction Runner camelCase Contract Tests', () => {
  let authToken: string;
  let userId: string;

  // Track created resources for cleanup
  let createdUniverseId: string | null = null;
  let createdTargetId: string | null = null;
  let createdSourceId: string | null = null;

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

  afterAll(async () => {
    // Cleanup created resources in reverse order
    if (createdSourceId) {
      try {
        await callDashboard(PREDICTION_AGENT, 'sources.delete', {
          id: createdSourceId,
        });
      } catch {
        console.log('Source cleanup skipped');
      }
    }

    if (createdTargetId) {
      try {
        await callDashboard(PREDICTION_AGENT, 'targets.delete', {
          id: createdTargetId,
        });
      } catch {
        console.log('Target cleanup skipped');
      }
    }

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

  // Agent slug for prediction agents
  const PREDICTION_AGENT = 'us-tech-stocks-2025';

  // ============================================================================
  // UNIVERSE CRUD WITH camelCase PARAMS
  // ============================================================================
  describe('Universe CRUD with camelCase params', () => {
    it('should create universe with camelCase params', async () => {
      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'universes.create', {
        name: `Test Universe ${uniqueSuffix}`,
        domain: 'stocks',
        description: 'Test universe created with camelCase params',
        // camelCase params that were previously snake_case
        agentSlug: PREDICTION_AGENT,
        isActive: true,
        llmConfig: {
          gold: { provider: 'anthropic', model: 'claude-opus-4-20250514' },
          silver: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        },
        thresholds: {
          min_predictors: 2,
          min_combined_strength: 0.5,
        },
        notificationConfig: {
          urgent_enabled: true,
          new_prediction_enabled: false,
          outcome_enabled: true,
          channels: ['push', 'email'],
        },
      });

      console.log(
        'Universe Create Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      const universe = response.payload?.content as { id: string; name: string };
      expect(universe).toBeDefined();
      expect(universe.id).toBeDefined();
      expect(universe.name).toContain('Test Universe');

      // Store for cleanup and subsequent tests
      createdUniverseId = universe.id;
    }, DASHBOARD_TIMEOUT);

    it('should update universe with camelCase params', async () => {
      if (!createdUniverseId) {
        console.log('Skipping update test - no universe created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'universes.update', {
        id: createdUniverseId,
        // camelCase params for update - simplified
        isActive: false,
        description: 'Updated via camelCase params',
      });

      console.log(
        'Universe Update Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);

      const universe = response.payload?.content as { is_active: boolean };
      expect(universe.is_active).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should get universe by ID', async () => {
      if (!createdUniverseId) {
        console.log('Skipping get test - no universe created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'universes.get', {
        id: createdUniverseId,
      });

      console.log('Universe Get Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const universe = response.payload?.content as { id: string };
      expect(universe.id).toBe(createdUniverseId);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // TARGET CRUD WITH camelCase PARAMS
  // ============================================================================
  describe('Target CRUD with camelCase params', () => {
    it('should create target with camelCase params', async () => {
      if (!createdUniverseId) {
        console.log('Skipping target create - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'targets.create', {
        // camelCase params that were previously snake_case
        universeId: createdUniverseId,
        symbol: `TEST${uniqueSuffix}`,
        name: `Test Target ${uniqueSuffix}`,
        targetType: 'stock',
        context: 'Test target for camelCase contract validation',
        isActive: true,
        // Simplified - no complex nested objects for basic contract test
      });

      console.log('Target Create Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      const target = response.payload?.content as { id: string; symbol: string };
      expect(target).toBeDefined();
      expect(target.id).toBeDefined();
      expect(target.symbol).toContain('TEST');

      // Store for cleanup and subsequent tests
      createdTargetId = target.id;
    }, DASHBOARD_TIMEOUT);

    it('should update target with camelCase params', async () => {
      if (!createdTargetId) {
        console.log('Skipping target update - no target created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'targets.update', {
        id: createdTargetId,
        // camelCase params for update
        isActive: false,
        context: 'Updated context via camelCase params',
      });

      console.log('Target Update Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const target = response.payload?.content as { is_active: boolean };
      expect(target.is_active).toBe(false);
    }, DASHBOARD_TIMEOUT);

    it('should get target by ID with effective LLM config', async () => {
      if (!createdTargetId) {
        console.log('Skipping target get - no target created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'targets.get', {
        id: createdTargetId,
      });

      console.log('Target Get Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const target = response.payload?.content as {
        id: string;
        effectiveLlmConfig?: Record<string, unknown>;
      };
      expect(target.id).toBe(createdTargetId);
      // Should include effective LLM config
      expect(target.effectiveLlmConfig).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // SOURCE CRUD WITH camelCase PARAMS
  // ============================================================================
  describe('Source CRUD with camelCase params', () => {
    it('should create source with camelCase params', async () => {
      if (!createdUniverseId) {
        console.log('Skipping source create - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        // camelCase params that were previously snake_case
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `Test Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 15,
        isActive: true,
        crawlConfig: {
          timeout: 30000,
          maxRetries: 3,
        },
      });

      console.log('Source Create Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('dashboard');

      const source = response.payload?.content as { id: string; name: string };
      expect(source).toBeDefined();
      expect(source.id).toBeDefined();
      expect(source.name).toContain('Test Source');

      // Store for cleanup
      createdSourceId = source.id;
    }, DASHBOARD_TIMEOUT);

    it('should create target-scoped source with camelCase params', async () => {
      if (!createdTargetId || !createdUniverseId) {
        console.log(
          'Skipping target-scoped source create - no target or universe created',
        );
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        // camelCase params for target-scoped source
        // Note: target-scoped sources require both targetId AND universeId per DB constraint
        targetId: createdTargetId,
        universeId: createdUniverseId,
        scopeLevel: 'target',
        name: `Target Source ${uniqueSuffix}`,
        sourceType: 'web',
        url: `https://example.com/target/${uniqueSuffix}`,
        crawlFrequencyMinutes: 30,
        isActive: true,
        crawlConfig: {
          useFirecrawl: true,
          depth: 2,
        },
      });

      console.log(
        'Target-Scoped Source Create Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);

      const source = response.payload?.content as { id: string; scope_level: string };
      expect(source.scope_level).toBe('target');
    }, DASHBOARD_TIMEOUT);

    it('should update source with camelCase params', async () => {
      if (!createdSourceId) {
        console.log('Skipping source update - no source created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'sources.update', {
        id: createdSourceId,
        // camelCase params for update
        isActive: false,
        crawlFrequencyMinutes: 60,
        crawlConfig: {
          timeout: 60000,
          maxRetries: 5,
        },
      });

      console.log('Source Update Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const source = response.payload?.content as {
        is_active: boolean;
        crawl_frequency_minutes: number;
      };
      expect(source.is_active).toBe(false);
      expect(source.crawl_frequency_minutes).toBe(60);
    }, DASHBOARD_TIMEOUT);

    it('should get source by ID', async () => {
      if (!createdSourceId) {
        console.log('Skipping source get - no source created');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'sources.get', {
        id: createdSourceId,
      });

      console.log('Source Get Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const source = response.payload?.content as { id: string };
      expect(source.id).toBe(createdSourceId);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // ERROR VALIDATION TESTS
  // Note: Error messages may show snake_case if server hasn't been restarted
  // After restart, errors should show camelCase param names
  // ============================================================================
  describe('Error validation for required params', () => {
    it('should error when universeId is missing for target create', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'targets.create', {
        symbol: 'TEST',
        name: 'Test',
        targetType: 'stock',
        // Missing universeId
      });

      console.log(
        'Missing universeId Error:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
      // Error could be in payload.content.error.message or payload.metadata.reason
      const errorMsg =
        (response.payload?.content as { error?: { message?: string } })?.error
          ?.message ||
        (response.payload?.metadata as { reason?: string })?.reason ||
        '';
      // Accept either camelCase (new code) or snake_case (old code)
      expect(
        errorMsg.toLowerCase().includes('universeid') ||
          errorMsg.toLowerCase().includes('universe_id'),
      ).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should error when targetType is missing for target create', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'targets.create', {
        universeId: createdUniverseId || NIL_UUID,
        symbol: 'TEST',
        name: 'Test',
        // Missing targetType
      });

      console.log(
        'Missing targetType Error:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
      const errorMsg =
        (response.payload?.content as { error?: { message?: string } })?.error
          ?.message ||
        (response.payload?.metadata as { reason?: string })?.reason ||
        '';
      // Accept either camelCase (new code) or snake_case (old code)
      expect(
        errorMsg.toLowerCase().includes('targettype') ||
          errorMsg.toLowerCase().includes('target_type'),
      ).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should error when sourceType is missing for source create', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId || NIL_UUID,
        scopeLevel: 'universe',
        name: 'Test',
        url: 'https://example.com',
        // Missing sourceType
      });

      console.log(
        'Missing sourceType Error:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
      const errorMsg =
        (response.payload?.content as { error?: { message?: string } })?.error
          ?.message ||
        (response.payload?.metadata as { reason?: string })?.reason ||
        '';
      // Accept either camelCase (new code) or snake_case (old code)
      expect(
        errorMsg.toLowerCase().includes('sourcetype') ||
          errorMsg.toLowerCase().includes('source_type'),
      ).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should error when scopeLevel is missing for source create', async () => {
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId || NIL_UUID,
        name: 'Test',
        sourceType: 'rss',
        url: 'https://example.com',
        // Missing scopeLevel
      });

      console.log(
        'Missing scopeLevel Error:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(false);
      const errorMsg =
        (response.payload?.content as { error?: { message?: string } })?.error
          ?.message ||
        (response.payload?.metadata as { reason?: string })?.reason ||
        '';
      // Accept either camelCase (new code) or snake_case (old code)
      expect(
        errorMsg.toLowerCase().includes('scopelevel') ||
          errorMsg.toLowerCase().includes('scope_level'),
      ).toBe(true);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // CLEANUP VERIFICATION
  // ============================================================================
  describe('Resource cleanup', () => {
    it('should delete source', async () => {
      if (!createdSourceId) {
        console.log('No source to delete');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'sources.delete', {
        id: createdSourceId,
      });

      console.log('Source Delete Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const result = response.payload?.content as { deleted: boolean };
      expect(result.deleted).toBe(true);

      createdSourceId = null;
    }, DASHBOARD_TIMEOUT);

    it('should delete target', async () => {
      if (!createdTargetId) {
        console.log('No target to delete');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'targets.delete', {
        id: createdTargetId,
      });

      console.log('Target Delete Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const result = response.payload?.content as { deleted: boolean };
      expect(result.deleted).toBe(true);

      createdTargetId = null;
    }, DASHBOARD_TIMEOUT);

    it('should delete universe', async () => {
      if (!createdUniverseId) {
        console.log('No universe to delete');
        return;
      }

      const response = await callDashboard(PREDICTION_AGENT, 'universes.delete', {
        id: createdUniverseId,
      });

      console.log('Universe Delete Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);

      const result = response.payload?.content as { deleted: boolean };
      expect(result.deleted).toBe(true);

      createdUniverseId = null;
    }, DASHBOARD_TIMEOUT);
  });
});
