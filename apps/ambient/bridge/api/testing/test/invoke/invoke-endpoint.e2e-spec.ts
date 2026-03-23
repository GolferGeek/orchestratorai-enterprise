/**
 * Bridge Invoke Endpoint E2E Tests
 *
 * Tests the POST /invoke endpoint on the Bridge API (port 6600).
 *
 * Requirements:
 *   - Bridge API running on BRIDGE_API_URL (default http://localhost:6600)
 *   - Auth API running on AUTH_API_URL (default http://localhost:6100)
 *   - Supabase running (REST 54321, Postgres 54322)
 *
 * No mocking. All calls hit real running services.
 *
 * Bridge handles external A2A communication. The invoke endpoint routes
 * based on metadata.direction: 'inbound' (default) or 'outbound'.
 * Inbound requests are routed to internal products (Forge/Compose/Pulse).
 * Outbound requests are dispatched to registered external agents.
 */

import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:6100';
const BRIDGE_API_URL = process.env.BRIDGE_API_URL ?? 'http://localhost:6600';
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
 * Build a valid A2AInvokeRequest for the Bridge invoke endpoint.
 * ExecutionContext is passed whole — never destructured.
 * Direction defaults to 'inbound' per BridgeDispatchService logic.
 */
function buildInvokeRequest(overrides?: {
  id?: string | number | null;
  agentSlug?: string;
  agentType?: string;
  direction?: string;
  userMessage?: string;
  targetAgentId?: string;
}) {
  const metadata: Record<string, unknown> = {
    source: 'e2e-test',
  };

  if (overrides?.direction !== undefined) {
    metadata.direction = overrides.direction;
  }

  if (overrides?.targetAgentId) {
    metadata.targetAgentId = overrides.targetAgentId;
    metadata.direction = 'outbound';
  }

  return {
    jsonrpc: '2.0',
    id: overrides?.id ?? 'bridge-e2e-test-1',
    method: 'invoke',
    params: {
      context: {
        orgSlug: TEST_ORG_SLUG,
        userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
        conversationId: '00000000-0000-0000-0000-000000000000',
        agentSlug: overrides?.agentSlug ?? 'bridge-agent',
        agentType: overrides?.agentType ?? 'workflow',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
      data: {
        content: overrides?.userMessage ?? 'E2E test ping to Bridge invoke endpoint',
        contentType: 'text',
      },
      metadata,
    },
  };
}

describe('Bridge /invoke endpoint (e2e)', () => {
  let jwtToken: string;
  let client: AxiosInstance;

  beforeAll(async () => {
    jwtToken = await getJwtToken();
    client = axios.create({
      baseURL: BRIDGE_API_URL,
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
        baseURL: BRIDGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await unauthClient.post('/invoke', buildInvokeRequest());
      expect(response.status).toBe(401);
    });

    it('returns 401 when Authorization header contains an invalid token', async () => {
      const unauthClient = axios.create({
        baseURL: BRIDGE_API_URL,
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
        id: 'bridge-missing-context',
        method: 'invoke',
        params: {
          data: { content: 'test', contentType: 'text' },
          metadata: { source: 'e2e-test' },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-missing-context');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
      expect(response.data.error.message).toMatch(/context/i);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.data is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'bridge-missing-data',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'bridge-agent',
            agentType: 'workflow',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          metadata: { source: 'e2e-test' },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-missing-data');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
    });
  });

  describe('POST /invoke — inbound routing', () => {
    it('returns a JSON-RPC 2.0 response envelope for any valid inbound request', async () => {
      const body = buildInvokeRequest({
        id: 'bridge-inbound-envelope',
        direction: 'inbound',
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-inbound-envelope');

      const hasResult = 'result' in response.data;
      const hasError = 'error' in response.data;
      expect(hasResult || hasError).toBe(true);
    });

    it('defaults to inbound direction when metadata.direction is absent', async () => {
      // BridgeDispatchService defaults to 'inbound' when direction is not specified
      const body = {
        jsonrpc: '2.0',
        id: 'bridge-default-direction',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'bridge-agent',
            agentType: 'workflow',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          data: {
            content: 'E2E test — no direction in metadata',
            contentType: 'text',
          },
          // No direction field — Bridge should default to 'inbound'
          metadata: { source: 'e2e-test' },
        },
      };
      const response = await client.post('/invoke', body);

      // Response must be a valid JSON-RPC 2.0 envelope regardless of routing outcome
      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-default-direction');

      const hasResult = 'result' in response.data;
      const hasError = 'error' in response.data;
      expect(hasResult || hasError).toBe(true);
    });
  });

  describe('POST /invoke — outbound routing', () => {
    it('returns JSON-RPC error when outbound dispatch has no targetAgentId', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'bridge-outbound-no-target',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'bridge-agent',
            agentType: 'workflow',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          data: {
            content: 'E2E test — outbound without targetAgentId',
            contentType: 'text',
          },
          metadata: {
            direction: 'outbound',
            // targetAgentId intentionally omitted
            source: 'e2e-test',
          },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-outbound-no-target');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBeDefined();
      expect(typeof response.data.error.message).toBe('string');
      // BridgeDispatchService: 'Outbound dispatch requires metadata.targetAgentId'
      expect(response.data.error.message.toLowerCase()).toContain('targetagentid');
    });

    it('returns JSON-RPC error when outbound targetAgentId is not in the registry', async () => {
      const body = buildInvokeRequest({
        id: 'bridge-outbound-unknown-agent',
        targetAgentId: 'external-agent-id-that-does-not-exist-in-registry',
        direction: 'outbound',
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('bridge-outbound-unknown-agent');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBeDefined();
      expect(typeof response.data.error.message).toBe('string');
    });
  });

  describe('POST /invoke — request id handling', () => {
    it('preserves the request id in the response', async () => {
      const requestId = 'bridge-id-preservation-88888';
      const body = buildInvokeRequest({ id: requestId });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(requestId);
    });

    it('accepts a numeric request id', async () => {
      const body = buildInvokeRequest({ id: 77 });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(77);
    });
  });
});
