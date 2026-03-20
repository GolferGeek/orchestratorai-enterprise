/**
 * Forge Invoke Endpoint E2E Tests
 *
 * Tests the POST /invoke and GET /.well-known/capabilities endpoints
 * on the Forge API (port 6200).
 *
 * Requirements:
 *   - Forge API running on FORGE_API_URL (default http://localhost:6200)
 *   - Auth API running on AUTH_API_URL (default http://localhost:6100)
 *   - Supabase running on port 6012
 *
 * No mocking. All calls hit real running services.
 * Forge routes through the CapabilityRegistryService — capabilities must
 * be registered (loaded from the database) for invocations to succeed.
 */

import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const AUTH_API_URL = process.env.AUTH_API_URL ?? 'http://localhost:6100';
const FORGE_API_URL = process.env.FORGE_API_URL ?? 'http://localhost:6200';
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
 * Build a valid A2AInvokeRequest targeting a Forge capability.
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
    id: overrides?.id ?? 'forge-e2e-test-1',
    method: 'invoke',
    params: {
      context: {
        orgSlug: TEST_ORG_SLUG,
        userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
        conversationId: '00000000-0000-0000-0000-000000000000',
        agentSlug: overrides?.agentSlug ?? 'marketing-swarm',
        agentType: overrides?.agentType ?? 'capability',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
      data: {
        content: overrides?.userMessage ?? 'E2E test invocation from testing suite',
        contentType: 'text',
      },
      metadata: {
        source: 'e2e-test',
      },
    },
  };
}

describe('Forge /invoke endpoint (e2e)', () => {
  let jwtToken: string;
  let client: AxiosInstance;

  beforeAll(async () => {
    jwtToken = await getJwtToken();
    client = axios.create({
      baseURL: FORGE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
        'x-organization-slug': TEST_ORG_SLUG,
      },
      validateStatus: () => true,
      timeout: 30000,
    });
  });

  describe('POST /invoke — routes to capability registry', () => {
    it('returns a JSON-RPC 2.0 response envelope for any valid request', async () => {
      const body = buildInvokeRequest({ id: 'forge-e2e-envelope' });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('forge-e2e-envelope');

      // Must always be a complete JSON-RPC 2.0 envelope
      const hasResult = 'result' in response.data;
      const hasError = 'error' in response.data;
      expect(hasResult || hasError).toBe(true);
    });

    it('returns JSON-RPC error when invoking an unknown capability slug', async () => {
      const body = buildInvokeRequest({
        id: 'forge-unknown-capability',
        agentSlug: 'capability-slug-that-is-not-registered-anywhere',
      });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('forge-unknown-capability');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBeDefined();
      expect(typeof response.data.error.message).toBe('string');
      expect(response.data.error.message.length).toBeGreaterThan(0);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.context is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'forge-missing-context',
        method: 'invoke',
        params: {
          data: { content: 'test', contentType: 'text' },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('forge-missing-context');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
      expect(response.data.error.message).toMatch(/context/i);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.data is missing', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'forge-missing-data',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: '876558c7-d009-4271-90a3-5078aaa8ca46',
            conversationId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'marketing-swarm',
            agentType: 'capability',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
        },
      };
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.jsonrpc).toBe('2.0');
      expect(response.data.id).toBe('forge-missing-data');
      expect(response.data.error).toBeDefined();
      expect(response.data.error.code).toBe(-32602); // INVALID_PARAMS
    });

    it('returns 401 when no Authorization header is provided', async () => {
      const unauthClient = axios.create({
        baseURL: FORGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await unauthClient.post('/invoke', buildInvokeRequest());
      expect(response.status).toBe(401);
    });

    it('preserves the request id in the response', async () => {
      const requestId = 'forge-id-test-99999';
      const body = buildInvokeRequest({ id: requestId });
      const response = await client.post('/invoke', body);

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(requestId);
    });
  });

  describe('GET /.well-known/capabilities — capability discovery', () => {
    it('returns HTTP 200 with a WellKnownListing shape', async () => {
      // Discovery endpoint is public — no JWT required
      const publicClient = axios.create({
        baseURL: FORGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await publicClient.get('/.well-known/capabilities');

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });

    it('returns a listing with product="forge" and version field', async () => {
      const publicClient = axios.create({
        baseURL: FORGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await publicClient.get('/.well-known/capabilities');

      expect(response.status).toBe(200);
      expect(response.data.product).toBe('forge');
      expect(response.data.version).toBeDefined();
      expect(typeof response.data.version).toBe('string');
    });

    it('returns a capabilities array where every entry has slug, name, and kind', async () => {
      const publicClient = axios.create({
        baseURL: FORGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await publicClient.get('/.well-known/capabilities');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.capabilities)).toBe(true);

      for (const card of response.data.capabilities) {
        expect(typeof card.slug).toBe('string');
        expect(card.slug.length).toBeGreaterThan(0);
        expect(typeof card.name).toBe('string');
        expect(card.name.length).toBeGreaterThan(0);
        expect(typeof card.kind).toBe('string');
      }
    });

    it('returns capabilities with streaming and outputTypes fields', async () => {
      const publicClient = axios.create({
        baseURL: FORGE_API_URL,
        validateStatus: () => true,
        timeout: 10000,
      });
      const response = await publicClient.get('/.well-known/capabilities');

      expect(response.status).toBe(200);

      if (response.data.capabilities.length > 0) {
        const first = response.data.capabilities[0];
        expect(typeof first.streaming).toBe('boolean');
        expect(Array.isArray(first.outputTypes)).toBe(true);
      }
    });
  });
});
