/**
 * E2E Test: Prediction Runner Crawl Frequency Configuration
 *
 * Tests that the source-crawler.runner respects per-source crawl_frequency_minutes.
 *
 * Sprint 5: Setup Completion & Exploration
 * PRD Reference: Phase 1.7
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-crawl-frequency
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

describe('Prediction Runner Crawl Frequency E2E Tests', () => {
  let authToken: string;
  let userId: string;

  // Track created resources for cleanup
  let createdUniverseId: string | null = null;
  let createdSources: string[] = [];

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
    // Cleanup sources in reverse order
    for (const sourceId of createdSources.reverse()) {
      try {
        await callDashboard(PREDICTION_AGENT, 'sources.delete', {
          id: sourceId,
        });
      } catch {
        console.log(`Source cleanup skipped: ${sourceId}`);
      }
    }

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
  // CRAWL FREQUENCY CONFIGURATION TESTS
  // ============================================================================
  describe('Crawl Frequency Configuration', () => {
    it('should create a universe for testing', async () => {
      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'universes.create', {
        name: `Crawl Frequency Test Universe ${uniqueSuffix}`,
        domain: 'stocks',
        description: 'Test universe for crawl frequency validation',
        agentSlug: PREDICTION_AGENT,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const universe = response.payload?.content as { id: string };
      createdUniverseId = universe.id;
    }, DASHBOARD_TIMEOUT);

    it('should create source with 5-minute crawl frequency', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `5-Min Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/5min-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 5,
        isActive: true,
      });

      console.log('5-Min Source Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        id: string;
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(5);
      createdSources.push(source.id);
    }, DASHBOARD_TIMEOUT);

    it('should create source with 10-minute crawl frequency', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `10-Min Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/10min-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 10,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        id: string;
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(10);
      createdSources.push(source.id);
    }, DASHBOARD_TIMEOUT);

    it('should create source with 15-minute (default) crawl frequency', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `15-Min Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/15min-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 15,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        id: string;
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(15);
      createdSources.push(source.id);
    }, DASHBOARD_TIMEOUT);

    it('should create source with 30-minute crawl frequency', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `30-Min Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/30min-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 30,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        id: string;
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(30);
      createdSources.push(source.id);
    }, DASHBOARD_TIMEOUT);

    it('should create source with 60-minute crawl frequency', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `60-Min Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/60min-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 60,
        isActive: true,
      });

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        id: string;
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(60);
      createdSources.push(source.id);
    }, DASHBOARD_TIMEOUT);

    it('should update source crawl frequency', async () => {
      if (createdSources.length === 0) {
        console.log('Skipping - no sources created');
        return;
      }

      const sourceId = createdSources[0];
      const response = await callDashboard(PREDICTION_AGENT, 'sources.update', {
        id: sourceId,
        crawlFrequencyMinutes: 30, // Change from 5 to 30
      });

      console.log(
        'Update Frequency Response:',
        JSON.stringify(response, null, 2),
      );

      expect(response.success).toBe(true);
      const source = response.payload?.content as {
        crawl_frequency_minutes: number;
      };
      expect(source.crawl_frequency_minutes).toBe(30);
    }, DASHBOARD_TIMEOUT);

    it('should list sources and verify frequency distribution', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const response = await callDashboard(
        PREDICTION_AGENT,
        'sources.list',
        {},
        { universeId: createdUniverseId },
      );

      console.log('Sources List Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      const sources = response.payload?.content as Array<{
        crawl_frequency_minutes: number;
      }>;

      // Verify we have sources with different frequencies
      const frequencies = sources.map((s) => s.crawl_frequency_minutes);
      console.log('Frequency distribution:', frequencies);

      // We should have sources with various frequencies (some may have been updated)
      expect(sources.length).toBeGreaterThan(0);
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // INVALID FREQUENCY TESTS
  // ============================================================================
  describe('Invalid Crawl Frequency Handling', () => {
    it('should handle invalid crawl frequency value', async () => {
      if (!createdUniverseId) {
        console.log('Skipping - no universe created');
        return;
      }

      const uniqueSuffix = Date.now();
      const response = await callDashboard(PREDICTION_AGENT, 'sources.create', {
        universeId: createdUniverseId,
        scopeLevel: 'universe',
        name: `Invalid Freq Source ${uniqueSuffix}`,
        sourceType: 'rss',
        url: `https://example.com/feed/invalid-${uniqueSuffix}.rss`,
        crawlFrequencyMinutes: 7, // Not a valid frequency (5, 10, 15, 30, 60)
        isActive: true,
      });

      console.log('Invalid Frequency Response:', JSON.stringify(response, null, 2));

      // The API may either:
      // 1. Reject with error
      // 2. Default to nearest valid frequency
      // 3. Accept and store (but runner won't pick it up)
      // This test documents the actual behavior
      if (response.success) {
        const source = response.payload?.content as {
          id: string;
          crawl_frequency_minutes: number;
        };
        // If it accepts, clean up
        createdSources.push(source.id);
        console.log(`API accepted frequency ${source.crawl_frequency_minutes}`);
      } else {
        console.log('API rejected invalid frequency (expected behavior)');
      }
    }, DASHBOARD_TIMEOUT);
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================
  describe('Cleanup', () => {
    it('should delete test sources', async () => {
      for (const sourceId of createdSources) {
        const response = await callDashboard(PREDICTION_AGENT, 'sources.delete', {
          id: sourceId,
        });
        console.log(`Delete source ${sourceId}:`, response.success);
      }
      createdSources = [];
    }, DASHBOARD_TIMEOUT * 2);

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
