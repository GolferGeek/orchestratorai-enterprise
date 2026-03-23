/**
 * Invoke endpoint E2E tests
 *
 * Tests POST /invoke using real compiled NestJS module + in-memory DB.
 *
 * The /invoke endpoint requires JWT auth (JwtAuthGuard). In the absence of
 * AUTH_API_URL, the guard accepts any Bearer token. Tests use the
 * x-test-api-key header with TEST_API_SECRET_KEY when set; otherwise they
 * pass a dummy Bearer token which the guard accepts in development mode.
 *
 * ExecutionContext is passed whole — never destructured — per CLAUDE.md rule 3.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TestAppModule } from './test-app.module';

const TEST_ORG_SLUG = 'test-org';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_CONVERSATION_ID = '00000000-0000-0000-0000-000000000002';

function buildValidInvokeRequest(overrides?: {
  id?: string | number | null;
  agentSlug?: string;
  direction?: string;
  targetAgentId?: string;
  omitContext?: boolean;
  omitData?: boolean;
}) {
  const params: Record<string, unknown> = {};

  if (!overrides?.omitContext) {
    params.context = {
      orgSlug: TEST_ORG_SLUG,
      userId: TEST_USER_ID,
      conversationId: TEST_CONVERSATION_ID,
      agentSlug: overrides?.agentSlug ?? 'bridge-test-agent',
      agentType: 'workflow',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    };
  }

  if (!overrides?.omitData) {
    params.data = {
      content: 'E2E test invoke request',
      contentType: 'text',
    };
  }

  const metadata: Record<string, unknown> = { source: 'e2e-test' };
  if (overrides?.direction) {
    metadata.direction = overrides.direction;
  }
  if (overrides?.targetAgentId) {
    metadata.targetAgentId = overrides.targetAgentId;
    metadata.direction = 'outbound';
  }

  params.metadata = metadata;

  return {
    jsonrpc: '2.0',
    id: overrides?.id ?? 'e2e-invoke-001',
    method: 'invoke',
    params,
  };
}

describe('POST /invoke (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set dev environment so JwtAuthGuard accepts any Bearer token
    process.env.AUTH_API_URL = '';

    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/invoke')
        .send(buildValidInvokeRequest())
        .expect(401);
    });

    it('accepts request with Bearer token when AUTH_API_URL is not set (dev mode)', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(buildValidInvokeRequest())
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
    });
  });

  describe('JSON-RPC contract validation', () => {
    it('returns JSON-RPC INVALID_PARAMS error when params.context is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(buildValidInvokeRequest({ omitContext: true }))
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('e2e-invoke-001');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(-32602);
      expect(response.body.error.message).toMatch(/context/i);
    });

    it('returns JSON-RPC INVALID_PARAMS error when params.data is missing', async () => {
      const body = buildValidInvokeRequest({ omitData: true, id: 'missing-data-test' });
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('missing-data-test');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(-32602);
    });

    it('returns a JSON-RPC 2.0 response envelope for any authenticated request', async () => {
      const body = buildValidInvokeRequest({ id: 'envelope-check' });
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('envelope-check');
      const hasResult = 'result' in response.body;
      const hasError = 'error' in response.body;
      expect(hasResult || hasError).toBe(true);
    });

    it('preserves the request id in the response', async () => {
      const requestId = 'id-preservation-test-7777';
      const body = buildValidInvokeRequest({ id: requestId });
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.id).toBe(requestId);
    });

    it('accepts a numeric request id', async () => {
      const body = buildValidInvokeRequest({ id: 42 });
      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.id).toBe(42);
    });
  });

  describe('Outbound dispatch validation', () => {
    it('returns JSON-RPC error when outbound dispatch has no targetAgentId', async () => {
      const body = {
        jsonrpc: '2.0',
        id: 'outbound-no-target',
        method: 'invoke',
        params: {
          context: {
            orgSlug: TEST_ORG_SLUG,
            userId: TEST_USER_ID,
            conversationId: TEST_CONVERSATION_ID,
            agentSlug: 'bridge-test-agent',
            agentType: 'workflow',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          data: { content: 'outbound without target', contentType: 'text' },
          metadata: { direction: 'outbound' },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('outbound-no-target');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message.toLowerCase()).toContain('targetagentid');
    });

    it('returns JSON-RPC error when outbound targetAgentId is not in registry', async () => {
      const body = buildValidInvokeRequest({
        id: 'outbound-unknown-target',
        targetAgentId: 'external-agent-not-registered-xyz',
      });

      const response = await request(app.getHttpServer())
        .post('/invoke')
        .set('Authorization', 'Bearer dev-test-token')
        .send(body)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('outbound-unknown-target');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
    });
  });
});
