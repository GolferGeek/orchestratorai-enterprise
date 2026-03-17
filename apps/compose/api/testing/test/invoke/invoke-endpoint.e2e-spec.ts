/**
 * Compose Invoke Endpoint E2E Tests
 *
 * Tests the POST /invoke endpoint on the Compose API (port 6300).
 *
 * Requirements:
 *   - Compose API running on COMPOSE_API_URL (default http://localhost:6300)
 *   - Auth API running on AUTH_API_URL (default http://localhost:6100)
 *   - Supabase running on port 6012
 *
 * No mocking. All calls hit real running services.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load root .env — AUTH_API_URL, COMPOSE_API_URL, test credentials
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for Compose invoke e2e tests. Set it in the root .env file.`,
    );
  }
  return value;
}

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:6100';
const COMPOSE_API_URL = process.env.COMPOSE_API_URL ?? 'http://localhost:6300';
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'golfergeek@orchestratorai.io';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'GolferGeek123!';
const TEST_ORG_SLUG = process.env.TEST_ORG_SLUG ?? 'marketing';

/**
 * Obtain a valid JWT from the Auth API using the standard test user credentials.
 */
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
 * Build a minimal valid A2AInvokeRequest body.
 * ExecutionContext is passed whole — never destructured.
 */
function buildInvokeRequest(overrides?: {
  id?: string | number | null;
  agentSlug?: string;
  agentType?: string;
  userMessage?: string;
  userId?: string;
}) {
  return {
    jsonrpc: '2.0',
    id: overrides?.id ?? 'e2e-test-1',
    method: 'invoke',
    params: {
      context: {
        orgSlug: TEST_ORG_SLUG,
        userId: overrides?.userId ?? '876558c7-d009-4271-90a3-5078aaa8ca46',
        conversationId: '00000000-0000-0000-0000-000000000000',
        agentSlug: overrides?.agentSlug ?? 'blog-post-writer',
        agentType: overrides?.agentType ?? 'context',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
      data: {
        content: overrides?.userMessage ?? 'Hello, this is an e2e test ping.',
        contentType: 'text',
      },
      metadata: {
        source: 'e2e-test',
      },
    },
  };
}

describe('Compose /invoke endpoint (e2e)', () => {
  let jwtToken: string;
  let client: AxiosInstance;

  beforeAll(async () => {
    jwtToken = await getJwtToken();
    client = axios.create({
      baseURL: COMPOSE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
        'x-organization-slug': TEST_ORG_SLUG,
      },
      // Do not throw on non-2xx — we assert manually so errors are visible
      validateStatus: () => true,
      timeout: 30000,
    });
  });

  describe('POST /invoke — authentication', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const unauthClient = axios.create({
        baseURL: COMPOSE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await unauthClient.post('/invoke', buildInvokeRequest());
      expect(response.status).toBe(401);
    });

    it('returns 401 when Authorization header contains an invalid token', async () => {
      const unauthClient = axios.create({
        baseURL: COMPOSE_API_URL,
        headers: {
          Authorization: 'Bearer this-is-not-a-valid-jwt',
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
        id: 'e2e-missing-context',
        method: 'invoke',
        params: {
          data: { content: 'test message', contentType: 'text' },
        },
      };
      const response = await client.post('/invoke', body);

      // Controller returns HTTP 200 with a JSON-RPC error body
      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('e2e-missing-context');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
      expect(response.data.error.message).toMatch(/context/i);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.data is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'e2e-missing-data',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'blog-post-writer',
            agentType: 'context',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('e2e-missing-data');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
    });

    it('returns JSON-RPC error when invoking an unknown agentSlug', async () => {
      const body = buildInvokeRequest({
        id: 'e2e-unknown-agent',
        agentSlug: 'this-agent-slug-does-not-exist-in-any-org',
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('e2e-unknown-agent');
      // Must return an error — either INVALID_PARAMS or INTERNAL_ERROR
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBeDefined();
      expect(typeof response.data.error.message).toBe('string');
      expect(response.data.error.message.length).toBeGreaterThan(0);
    });
  });

  describe('POST /invoke — valid request shape', () => {
    it('returns a JSON-RPC 2.0 response with the correct envelope shape for a valid request', async () => {
      const body = buildInvokeRequest({ id: 'e2e-valid-shape' });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('e2e-valid-shape');

      // Must be either a success result or a JSON-RPC error — never a missing envelope
      const hasResult = 'result' in response.data;
      const hasError = 'error' in response.data;
      expect(hasResult || hasError).toBe(true);
    });

    it('echoes the ExecutionContext back in a success result', async () => {
      const body = buildInvokeRequest({ id: 'e2e-context-echo' });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');

      if (response.data.result) {
        // ExecutionContext must flow through — verified as an object with required fields
        expect(response.data.result.context).toBeDefined();
        expect(response.data.result.context.orgSlug).toBe(TEST_ORG_SLUG);
        expect(response.data.result.context.agentSlug).toBe('blog-post-writer');
      }
    });

    it('preserves the request id in the response', async () => {
      const requestId = 'e2e-id-preservation-test-12345';
      const body = buildInvokeRequest({ id: requestId });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(requestId);
    });

    it('accepts a numeric request id', async () => {
      const body = buildInvokeRequest({ id: 42 });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(42);
    });
  });
});
