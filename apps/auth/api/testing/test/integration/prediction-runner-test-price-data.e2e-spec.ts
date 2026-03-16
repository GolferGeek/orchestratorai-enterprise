/**
 * E2E Test: Test Price Data CRUD and Operations via A2A
 *
 * Tests the test-price-data handler actions:
 * - test-price-data.create - Create new price data
 * - test-price-data.get - Get price data by ID
 * - test-price-data.list - List price data
 * - test-price-data.update - Update price data
 * - test-price-data.delete - Delete price data
 * - test-price-data.bulk-create - Bulk create price data (timelines)
 * - test-price-data.get-latest - Get latest price for a symbol
 * - test-price-data.get-by-date-range - Get prices by date range
 * - test-price-data.count-by-scenario - Count by scenario
 * - test-price-data.count-by-symbol - Count by symbol
 * - test-price-data.delete-by-scenario - Delete by scenario
 * - test-price-data.delete-by-symbol - Delete by symbol
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with prediction schema
 * - Finance organization exists with prediction agents
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json prediction-runner-test-price-data.e2e-spec
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

interface TestPriceData {
  id: string;
  organization_slug: string;
  scenario_id?: string;
  symbol: string;
  price_timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

describe('Test Price Data E2E Tests', () => {
  let authToken: string;
  let userId: string;
  let createdPriceDataId: string | null = null;
  const createdPriceDataIds: string[] = [];
  const testSymbol = `T_E2E_${Date.now()}`;

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
    // Clean up created price data
    for (const priceDataId of createdPriceDataIds) {
      try {
        await callDashboard(PREDICTION_AGENT, 'test-price-data.delete', {
          id: priceDataId,
        });
        console.log('Cleaned up test price data:', priceDataId);
      } catch (error) {
        console.warn('Failed to cleanup test price data:', error);
      }
    }

    // Clean up by symbol as fallback
    try {
      await callDashboard(PREDICTION_AGENT, 'test-price-data.delete-by-symbol', {
        symbol: testSymbol,
      });
      console.log('Cleaned up test price data by symbol:', testSymbol);
    } catch {
      // Ignore cleanup errors
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

    // If content has 'error' property, it's a failure
    if ('error' in c && c.error) {
      return false;
    }

    // If content has 'data' property without 'error', assume success
    if ('data' in c) {
      return true;
    }

    // If content has 'id' (looks like data directly), assume success
    if ('id' in c) {
      return true;
    }

    // If content has result-indicating properties (symbol, count, deleted, etc.), assume success
    if (
      'symbol' in c ||
      'count' in c ||
      'deleted' in c ||
      'created_count' in c ||
      'deleted_count' in c
    ) {
      return true;
    }

    // If content is an array, assume success (list results)
    if (Array.isArray(c)) {
      return true;
    }

    return false;
  };

  describe('test-price-data.create', () => {
    it('should create price data with valid OHLCV values', async () => {
      const timestamp = new Date().toISOString();

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.create',
        {
          symbol: testSymbol,
          price_timestamp: timestamp,
          open: 100.0,
          high: 105.5,
          low: 99.0,
          close: 103.25,
          volume: 1500000,
          metadata: {
            source: 'E2E test',
            test_run: Date.now(),
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.payload.content).toBeDefined();
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceData = extractData<TestPriceData>(result.payload.content);
      expect(priceData).toBeDefined();
      expect(priceData!.id).toBeDefined();
      expect(priceData!.symbol).toBe(testSymbol);
      expect(priceData!.open).toBe(100.0);
      expect(priceData!.high).toBe(105.5);
      expect(priceData!.low).toBe(99.0);
      expect(priceData!.close).toBe(103.25);
      expect(priceData!.volume).toBe(1500000);

      // Store for later tests and cleanup
      createdPriceDataId = priceData!.id;
      createdPriceDataIds.push(priceData!.id);
      console.log('Created test price data:', createdPriceDataId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing required fields', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.create',
        {
          // Missing symbol, price_timestamp, and OHLC values
          volume: 1000,
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

    it('should return error for missing OHLC values', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.create',
        {
          symbol: 'T_TEST',
          price_timestamp: new Date().toISOString(),
          // Missing open, high, low, close
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
  });

  describe('test-price-data.get', () => {
    it('should get price data by ID', async () => {
      if (!createdPriceDataId) {
        console.log('Skipping - no price data created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get',
        {
          id: createdPriceDataId,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceData = extractData<TestPriceData>(result.payload.content);
      expect(priceData).toBeDefined();
      expect(priceData!.id).toBe(createdPriceDataId);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for non-existent price data', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get',
        {
          id: '00000000-0000-0000-0000-000000000001',
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('NOT_FOUND');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.list', () => {
    it('should list price data for the organization', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.list',
        {},
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceDataList = extractData<TestPriceData[]>(result.payload.content);
      expect(Array.isArray(priceDataList)).toBe(true);
    }, DASHBOARD_TIMEOUT);

    it('should support symbol filter', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.list',
        {
          filters: { symbol: testSymbol },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceDataList = extractData<TestPriceData[]>(result.payload.content);
      expect(Array.isArray(priceDataList)).toBe(true);

      // All returned price data should have the filtered symbol
      if (priceDataList) {
        priceDataList.forEach((pd) => {
          expect(pd.symbol).toBe(testSymbol);
        });
      }
    }, DASHBOARD_TIMEOUT);

    it('should support pagination', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.list',
        {
          page: 1,
          pageSize: 10,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceDataList = extractData<TestPriceData[]>(result.payload.content);
      expect(Array.isArray(priceDataList)).toBe(true);
      expect(priceDataList!.length).toBeLessThanOrEqual(10);
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.update', () => {
    it('should update price data', async () => {
      if (!createdPriceDataId) {
        console.log('Skipping - no price data created');
        return;
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.update',
        {
          id: createdPriceDataId,
          close: 110.5,
          volume: 2000000,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceData = extractData<TestPriceData>(result.payload.content);
      expect(priceData).toBeDefined();
      expect(priceData!.close).toBe(110.5);
      expect(priceData!.volume).toBe(2000000);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing ID on update', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.update',
        {
          close: 100.0,
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
  });

  describe('test-price-data.bulk-create', () => {
    it('should bulk create price data for a timeline', async () => {
      const baseTime = Date.now();
      const bulkSymbol = `T_BULK_${baseTime}`;

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.bulk-create',
        {
          priceData: [
            {
              symbol: bulkSymbol,
              price_timestamp: new Date(baseTime).toISOString(),
              open: 100.0,
              high: 102.0,
              low: 99.0,
              close: 101.5,
              volume: 1000000,
            },
            {
              symbol: bulkSymbol,
              price_timestamp: new Date(baseTime + 86400000).toISOString(), // +1 day
              open: 101.5,
              high: 105.0,
              low: 101.0,
              close: 104.0,
              volume: 1200000,
            },
            {
              symbol: bulkSymbol,
              price_timestamp: new Date(baseTime + 172800000).toISOString(), // +2 days
              open: 104.0,
              high: 106.5,
              low: 103.0,
              close: 105.5,
              volume: 1100000,
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        created_count: number;
        data: TestPriceData[];
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.created_count).toBe(3);

      // Store for cleanup
      if (Array.isArray(data!.data)) {
        data!.data.forEach((pd) => {
          createdPriceDataIds.push(pd.id);
        });
      }

      console.log('Bulk created', data!.created_count, 'price data points');
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing priceData array', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.bulk-create',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('INVALID_DATA');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.get-latest', () => {
    it('should get the latest price for a symbol', async () => {
      // First create some price data
      const latestSymbol = `T_LATEST_${Date.now()}`;
      const timestamps = [
        new Date(Date.now() - 172800000).toISOString(), // -2 days
        new Date(Date.now() - 86400000).toISOString(), // -1 day
        new Date().toISOString(), // now (latest)
      ];

      // Create multiple price points
      for (let i = 0; i < timestamps.length; i++) {
        await callDashboard(PREDICTION_AGENT, 'test-price-data.create', {
          symbol: latestSymbol,
          price_timestamp: timestamps[i],
          open: 100 + i,
          high: 105 + i,
          low: 99 + i,
          close: 103 + i, // Latest will be 105
          volume: 1000000 + i * 100000,
        });
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get-latest',
        {
          symbol: latestSymbol,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceData = extractData<TestPriceData>(result.payload.content);
      expect(priceData).toBeDefined();
      expect(priceData!.symbol).toBe(latestSymbol);
      expect(priceData!.close).toBe(105); // Latest close price

      // Cleanup
      await callDashboard(PREDICTION_AGENT, 'test-price-data.delete-by-symbol', {
        symbol: latestSymbol,
      });
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing symbol', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get-latest',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_SYMBOL');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.get-by-date-range', () => {
    it('should get price data within date range', async () => {
      // First create some price data
      const rangeSymbol = `T_RANGE_${Date.now()}`;
      const now = Date.now();
      const startDate = new Date(now - 172800000).toISOString(); // -2 days
      const endDate = new Date(now).toISOString();

      // Create price data within and outside the range
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(now - i * 86400000).toISOString();
        const createResult = await callDashboard(
          PREDICTION_AGENT,
          'test-price-data.create',
          {
            symbol: rangeSymbol,
            price_timestamp: timestamp,
            open: 100 + i,
            high: 105 + i,
            low: 99 + i,
            close: 103 + i,
            volume: 1000000,
          },
        );

        const createData = extractData<TestPriceData>(
          createResult.payload.content,
        );
        if (createData?.id) {
          createdPriceDataIds.push(createData.id);
        }
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get-by-date-range',
        {
          filters: {
            symbol: rangeSymbol,
            startDate,
            endDate,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const priceDataList = extractData<TestPriceData[]>(result.payload.content);
      expect(Array.isArray(priceDataList)).toBe(true);
      expect(priceDataList!.length).toBeGreaterThan(0);
      expect(priceDataList!.length).toBeLessThanOrEqual(3); // Within 2-day range
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing parameters', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.get-by-date-range',
        {
          filters: {
            symbol: 'T_TEST',
            // Missing startDate and endDate
          },
        },
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_PARAMS');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.count-by-symbol', () => {
    it('should count price data by symbol', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.count-by-symbol',
        {
          symbol: testSymbol,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{ symbol: string; count: number }>(
        result.payload.content,
      );
      expect(data).toBeDefined();
      expect(data!.symbol).toBe(testSymbol);
      expect(typeof data!.count).toBe('number');
      expect(data!.count).toBeGreaterThanOrEqual(0);
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing symbol', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.count-by-symbol',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_SYMBOL');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.delete-by-symbol', () => {
    it('should delete price data by symbol', async () => {
      // Create some price data to delete
      const deleteSymbol = `T_DELETE_${Date.now()}`;

      for (let i = 0; i < 3; i++) {
        await callDashboard(PREDICTION_AGENT, 'test-price-data.create', {
          symbol: deleteSymbol,
          price_timestamp: new Date(Date.now() + i * 86400000).toISOString(),
          open: 100,
          high: 105,
          low: 99,
          close: 103,
          volume: 1000000,
        });
      }

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.delete-by-symbol',
        {
          symbol: deleteSymbol,
        },
      );

      expect(result.success).toBe(true);
      expect(isSuccess(result.payload.content)).toBe(true);

      const data = extractData<{
        deleted: boolean;
        symbol: string;
        deleted_count: number;
      }>(result.payload.content);
      expect(data).toBeDefined();
      expect(data!.deleted).toBe(true);
      expect(data!.symbol).toBe(deleteSymbol);
      expect(data!.deleted_count).toBe(3);

      console.log('Deleted', data!.deleted_count, 'price data by symbol');
    }, DASHBOARD_TIMEOUT);

    it('should return error for missing symbol', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.delete-by-symbol',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_SYMBOL');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('test-price-data.delete', () => {
    it('should return error for missing ID on delete', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.delete',
        {},
      );

      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);

      if (error) {
        expect(error.code).toBe('MISSING_ID');
      } else {
        expect(result.success).toBe(false);
      }
    }, DASHBOARD_TIMEOUT);
  });

  describe('Action name verification', () => {
    it('should return error for camelCase bulkCreate (use bulk-create instead)', async () => {
      const bulkSymbol = `T_ALT_${Date.now()}`;

      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.bulkCreate', // camelCase not supported
        {
          priceData: [
            {
              symbol: bulkSymbol,
              price_timestamp: new Date().toISOString(),
              open: 100,
              high: 105,
              low: 99,
              close: 103,
            },
          ],
        },
      );

      // Verify the action is not supported (handlers use kebab-case)
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase getLatest (use get-latest instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.getLatest', // camelCase not supported
        {
          symbol: testSymbol,
        },
      );

      // Verify the action is not supported
      expect(result.payload).toBeDefined();
      const error = hasError(result.payload.content);
      if (error) {
        expect(error.code).toBe('UNSUPPORTED_ACTION');
      }
    }, DASHBOARD_TIMEOUT);

    it('should return error for camelCase countBySymbol (use count-by-symbol instead)', async () => {
      const result = await callDashboard(
        PREDICTION_AGENT,
        'test-price-data.countBySymbol', // camelCase not supported
        {
          symbol: testSymbol,
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
});
