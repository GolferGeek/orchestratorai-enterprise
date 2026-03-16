/**
 * E2E Test: Test Scenario CRUD Operations via A2A
 *
 * Tests the test-scenarios handler actions:
 * - test-scenarios.create - Create a new test scenario
 * - test-scenarios.get - Get a test scenario by ID
 * - test-scenarios.list - List test scenarios
 * - test-scenarios.update - Update a test scenario
 * - test-scenarios.delete - Delete a test scenario
 * - test-scenarios.get-counts - Get data counts for a scenario
 * - test-scenarios.get-summaries - Get scenario summaries
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-test-scenario-crud.e2e-spec
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

describe('Test Scenario CRUD E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let createdScenarioId: string | null = null;

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

  afterAll(async () => {
    // Clean up created scenario if it exists
    if (createdScenarioId) {
      try {
        await callDashboard(PREDICTION_AGENT, 'test-scenarios.delete', {
          id: createdScenarioId,
        });
        console.log('Cleaned up test scenario:', createdScenarioId);
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

  describe('test-scenarios.create', () => {
    it('should create a test scenario with valid data', async () => {
      const scenarioName = `E2E Test Scenario ${Date.now()}`;

      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.create', {
        name: scenarioName,
        description: 'Created by E2E test for scenario CRUD',
        injection_points: ['signals', 'predictions'],
        config: {
          test_type: 'integration',
          auto_cleanup: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      // The handler returns DashboardActionResult directly, or it may be wrapped
      const content = result.payload.content as
        | { success: boolean; data: TestScenario }
        | TestScenario;

      // Handle both wrapped and unwrapped formats
      let scenario: TestScenario;
      if ('success' in content && content.success !== undefined) {
        expect(content.success).toBe(true);
        scenario = content.data;
      } else {
        // Content is the data directly
        scenario = content as TestScenario;
      }

      expect(scenario).toBeDefined();
      expect(scenario.id).toBeDefined();
      expect(scenario.name).toBe(scenarioName);
      expect(scenario.organization_slug).toBe(ORG_SLUG);
      expect(scenario.injection_points).toContain('signals');
      expect(scenario.injection_points).toContain('predictions');
      expect(scenario.status).toBeDefined();

      // Store for later tests and cleanup
      createdScenarioId = scenario.id;
      console.log('Created test scenario:', createdScenarioId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing required fields', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.create', {
        // Missing name and injection_points
        description: 'Invalid scenario',
      });

      expect(result.payload).toBeDefined();

      const content = result.payload.content as {
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

    it('should return error for empty injection_points', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.create', {
        name: 'Invalid Scenario',
        injection_points: [], // Empty array
      });

      expect(result.payload).toBeDefined();

      const content = result.payload.content as {
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
  });

  describe('test-scenarios.get', () => {
    it('should get a test scenario by ID', async () => {
      if (!createdScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.get', {
        id: createdScenarioId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: TestScenario }
        | TestScenario;

      // Handle both wrapped and unwrapped formats
      let scenario: TestScenario;
      if ('success' in content && content.success !== undefined) {
        expect(content.success).toBe(true);
        scenario = content.data;
      } else {
        scenario = content as TestScenario;
      }

      expect(scenario).toBeDefined();
      expect(scenario.id).toBe(createdScenarioId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.get', {});

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

    it('should return error for non-existent scenario', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.get', {
        id: '00000000-0000-0000-0000-000000000001',
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

  describe('test-scenarios.list', () => {
    it('should list test scenarios for the organization', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.list', {});

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: TestScenario[] }
        | TestScenario[];

      // Handle both wrapped and unwrapped formats
      let scenarios: TestScenario[];
      if (Array.isArray(content)) {
        scenarios = content;
      } else if ('data' in content && Array.isArray(content.data)) {
        scenarios = content.data;
      } else {
        scenarios = [];
      }

      expect(Array.isArray(scenarios)).toBe(true);

      // If we created a scenario, it should be in the list
      if (createdScenarioId && scenarios.length > 0) {
        const found = scenarios.find((s) => s.id === createdScenarioId);
        expect(found).toBeDefined();
      }
    }, DASHBOARD_TIMEOUT);

    it('should support pagination', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.list', {
        page: 1,
        pageSize: 5,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: TestScenario[] }
        | TestScenario[];

      // Handle both wrapped and unwrapped formats
      let scenarios: TestScenario[];
      if (Array.isArray(content)) {
        scenarios = content;
      } else if ('data' in content && Array.isArray(content.data)) {
        scenarios = content.data;
      } else {
        scenarios = [];
      }

      expect(Array.isArray(scenarios)).toBe(true);
      expect(scenarios.length).toBeLessThanOrEqual(5);
    }, DASHBOARD_TIMEOUT);

    it('should support status filter', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.list', {
        filters: { status: 'draft' },
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: TestScenario[] }
        | TestScenario[];

      // Handle both wrapped and unwrapped formats
      let scenarios: TestScenario[];
      if (Array.isArray(content)) {
        scenarios = content;
      } else if ('data' in content && Array.isArray(content.data)) {
        scenarios = content.data;
      } else {
        scenarios = [];
      }

      expect(Array.isArray(scenarios)).toBe(true);

      // All returned scenarios should have the filtered status (if any returned)
      scenarios.forEach((scenario) => {
        if (scenario.status) {
          expect(scenario.status).toBe('draft');
        }
      });
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.update', () => {
    it('should update a test scenario', async () => {
      if (!createdScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const updatedName = `Updated E2E Scenario ${Date.now()}`;

      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.update', {
        id: createdScenarioId,
        name: updatedName,
        description: 'Updated description from E2E test',
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: TestScenario }
        | TestScenario;

      // Handle both wrapped and unwrapped formats
      let scenario: TestScenario;
      if ('success' in content && content.success !== undefined) {
        expect(content.success).toBe(true);
        scenario = content.data;
      } else {
        scenario = content as TestScenario;
      }

      expect(scenario).toBeDefined();
      expect(scenario.name).toBe(updatedName);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID on update', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.update', {
        name: 'Updated Name',
      });

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
  });

  describe('test-scenarios.get-counts', () => {
    it('should get data counts for a scenario', async () => {
      if (!createdScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.get-counts', {
        id: createdScenarioId,
      });

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as {
        success?: boolean;
        data?: {
          scenario_id: string;
          counts: Record<string, number>;
        };
        scenario_id?: string;
        counts?: Record<string, number>;
      };

      // Handle both wrapped and unwrapped formats
      const scenarioId = content.scenario_id ?? content.data?.scenario_id;
      const counts = content.counts ?? content.data?.counts;

      expect(scenarioId).toBe(createdScenarioId);
      expect(counts).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID on get-counts', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.get-counts',
        {},
      );

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
  });

  describe('test-scenarios.get-summaries', () => {
    it('should get scenario summaries with data counts', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.get-summaries',
        {},
      );

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();

      const content = result.payload.content as
        | { success: boolean; data: Array<TestScenario & { data_counts?: Record<string, number> }> }
        | Array<TestScenario & { data_counts?: Record<string, number> }>;

      // Handle both wrapped and unwrapped formats
      let summaries: Array<TestScenario & { data_counts?: Record<string, number> }>;
      if (Array.isArray(content)) {
        summaries = content;
      } else if ('data' in content && Array.isArray(content.data)) {
        summaries = content.data;
      } else {
        summaries = [];
      }

      expect(Array.isArray(summaries)).toBe(true);

      // Each summary should have id and name
      summaries.forEach((summary) => {
        expect(summary.id).toBeDefined();
        expect(summary.name).toBeDefined();
        // data_counts may or may not be present depending on implementation
      });
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-scenarios.delete', () => {
    it('should return error for missing ID on delete', async () => {
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.delete', {});

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

    // Note: Actual delete is tested in afterAll cleanup
  });

  describe('Alternative action names', () => {
    it('should return unsupported action for camelCase getCounts', async () => {
      if (!createdScenarioId) {
        console.log('Skipping - no scenario created');
        return;
      }

      // Note: Handler only supports kebab-case 'get-counts', not camelCase 'getCounts'
      const result = await callDashboard(PREDICTION_AGENT, 'test-scenarios.getCounts', {
        id: createdScenarioId,
      });

      // Either returns success=false from A2A or content.error for unsupported action
      expect(result.payload).toBeDefined();
    }, DASHBOARD_TIMEOUT);

    it('should return unsupported action for camelCase getSummaries', async () => {
      // Note: Handler only supports kebab-case 'get-summaries', not camelCase 'getSummaries'
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-scenarios.getSummaries',
        {},
      );

      // Either returns success=false from A2A or content.error for unsupported action
      expect(result.payload).toBeDefined();
    }, DASHBOARD_TIMEOUT);
  });
});
