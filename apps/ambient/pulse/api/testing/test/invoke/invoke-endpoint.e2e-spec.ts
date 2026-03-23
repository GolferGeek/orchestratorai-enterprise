/**
 * Pulse Invoke Endpoint E2E Tests
 *
 * Tests the POST /invoke endpoint on the Pulse API (port 6500).
 *
 * Requirements:
 *   - Pulse API running on PULSE_API_URL (default http://localhost:6500)
 *   - Auth API running on AUTH_API_URL (default http://localhost:6100)
 *   - Supabase running (REST 54321, Postgres 54322)
 *
 * No mocking. All calls hit real running services.
 *
 * Pulse is internally focused — most invocations come from triggers.
 * The invoke endpoint is the thin A2A edge for external callers.
 * Handlers are registered by processing modules (predictor, risk-runner).
 */

import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:6100';
const PULSE_API_URL = process.env.PULSE_API_URL ?? 'http://localhost:6500';
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'golfergeek@orchestratorai.io';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'GolferGeek123!';
const TEST_ORG_SLUG = process.env.TEST_ORG_SLUG ?? 'marketing';

async function getJwtToken(): Promise<string> {
  const response = await axios.post<{ accessToken: string }>(
    `${AUTH_API_URL}/auth/login`,
    { email: TEST_EMAIL, password: TEST_PASSWORD },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = response.data.accessToken;
  if (!token) {
    throw new Error('Auth API login did not return accessToken');
  }
  return token;
}

/**
 * Build a valid A2AInvokeRequest for the Pulse invoke endpoint.
 * ExecutionContext is passed whole — never destructured.
 */
function buildInvokeRequest(overrides?: {
  id?: string | number | null;
  agentSlug?: string;
  agentType?: string;
  userMessage?: string;
}) {
  return {
    jsonrpc: '2.0',
    id: overrides?.id ?? 'pulse-e2e-test-1',
    method: 'invoke',
    params: {
      context: {
        orgSlug: TEST_ORG_SLUG,
        userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
        conversationId: '00000000-0000-0000-0000-000000000000',
        // predictor is the primary registered Pulse handler
        agentSlug: overrides?.agentSlug ?? 'predictor',
        agentType: overrides?.agentType ?? 'workflow',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
      data: {
        content: overrides?.userMessage ?? 'E2E test ping to Pulse processing endpoint',
        contentType: 'text',
      },
      metadata: {
        source: 'e2e-test',
      },
    },
  };
}

describe('Pulse /invoke endpoint (e2e)', () => {
  let jwtToken: string;
  let client: AxiosInstance;

  beforeAll(async () => {
    jwtToken = await getJwtToken();
    client = axios.create({
      baseURL: PULSE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
        'x-organization-slug': TEST_ORG_SLUG,
      },
      validateStatus: () => true,
      timeout: 30000,
    });
  });

  describe('POST /invoke — authentication', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const unauthClient = axios.create({
        baseURL: PULSE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await unauthClient.post('/invoke', buildInvokeRequest());
      expect(response.status).toBe(401);
    });

    it('returns 401 when Authorization header contains an invalid token', async () => {
      const unauthClient = axios.create({
        baseURL: PULSE_API_URL,
        headers: {
          Authorization: 'Bearer invalid-token-value',
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await unauthClient.post('/invoke', buildInvokeRequest());
      expect(response.status).toBe(401);
    });
  });

  describe('POST /invoke — JSON-RPC contract validation', () => {
    it('returns JSON-RPC INVALID_PARAMS error when params.context is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'pulse-missing-context',
        method: 'invoke',
        params: {
          data: { content: 'test', contentType: 'text' },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('pulse-missing-context');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
      expect(response.data.error.message).toMatch(/context/i);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.data is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'pulse-missing-data',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'predictor',
            agentType: 'workflow',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('pulse-missing-data');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
    });
  });

  describe('POST /invoke — handler routing', () => {
    it('returns a JSON-RPC 2.0 response envelope for any valid request', async () => {
      const body = buildInvokeRequest({ id: 'pulse-e2e-envelope' });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('pulse-e2e-envelope');

      const hasResult = 'result' in response.data;
      const hasError = 'error' in response.data;
      expect(hasResult || hasError).toBe(true);
    });

    it('returns JSON-RPC error when invoking an unregistered handler slug', async () => {
      const body = buildInvokeRequest({
        id: 'pulse-unregistered-handler',
        agentSlug: 'handler-slug-that-is-not-registered-in-pulse',
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('pulse-unregistered-handler');

      // PulseDispatchService throws when no handler matches — controller wraps as INTERNAL_ERROR
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBeDefined();
      expect(typeof response.data.error.message).toBe('string');
      expect(response.data.error.message.length).toBeGreaterThan(0);
    });

    it('error response for unknown handler identifies the missing handler slug', async () => {
      const unknownSlug = 'completely-unknown-pulse-handler-xyz';
      const body = buildInvokeRequest({
        id: 'pulse-handler-name-in-error',
        agentSlug: unknownSlug,
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.error).toBeDefined();

      // PulseDispatchService error message includes the missing slug
      expect(response.data.error.message).toContain(unknownSlug);
    });

    it('preserves the request id in the response', async () => {
      const requestId = 'pulse-id-preservation-77777';
      const body = buildInvokeRequest({ id: requestId });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(requestId);
    });
  });
});
