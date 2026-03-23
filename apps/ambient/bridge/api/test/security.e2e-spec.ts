/**
 * Security stack E2E tests
 *
 * Tests POST /a2a/tasks (A2AReceiverController) using the real compiled
 * NestJS module with in-memory database.
 *
 * /a2a/tasks uses the Bridge security stack:
 *   - Origin validation (OriginValidatorService)
 *   - Rate limiting (RateLimiterService)
 *   - JSON-RPC 2.0 format validation (A2AValidatorService)
 *   - Security envelope validation (SigningService) — only in strict mode
 *
 * Tests run in permissive origin + permissive security mode where appropriate
 * so they exercise the actual request processing path.
 *
 * Rate limit tests use a dedicated short-window env var override.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TestAppModule } from './test-app.module';

function buildA2ATask(overrides?: {
  id?: string | number;
  method?: string;
  agentId?: string;
  origin?: string;
}) {
  return {
    jsonrpc: '2.0',
    id: overrides?.id ?? 'a2a-task-001',
    method: overrides?.method ?? 'compose.invoke',
    params: {
      mode: 'converse',
      userMessage: 'E2E test message',
    },
  };
}

describe('POST /a2a/tasks — security stack (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Permissive mode: accept all origins so requests reach the routing layer
    process.env.ORIGIN_VALIDATION = 'permissive';
    // Permissive security: no envelope required
    process.env.SECURITY_MODE = 'permissive';

    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.ORIGIN_VALIDATION;
    delete process.env.SECURITY_MODE;
    await app.close();
  });

  describe('valid envelope in permissive mode', () => {
    it('returns 200 with a JSON-RPC 2.0 response', async () => {
      const response = await request(app.getHttpServer())
        .post('/a2a/tasks')
        .set('X-Agent-Id', 'external-agent-test')
        .set('Origin', 'https://external-partner.example.com')
        .send(buildA2ATask())
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('a2a-task-001');
    });

    it('preserves the request id in the JSON-RPC response', async () => {
      const id = 'preserve-id-test-55';
      const response = await request(app.getHttpServer())
        .post('/a2a/tasks')
        .set('X-Agent-Id', 'external-agent-id-check')
        .set('Origin', 'https://agent.example.com')
        .send(buildA2ATask({ id }))
        .expect(200);

      expect(response.body.id).toBe(id);
    });
  });

  describe('missing X-Agent-Id', () => {
    it('returns a JSON-RPC response (no agent id is allowed — validation proceeds)', async () => {
      const response = await request(app.getHttpServer())
        .post('/a2a/tasks')
        .set('Origin', 'https://agent.example.com')
        .send(buildA2ATask())
        .expect(200);

      // Response is always a valid JSON-RPC envelope
      expect(response.body.jsonrpc).toBe('2.0');
      const hasResult = 'result' in response.body;
      const hasError = 'error' in response.body;
      expect(hasResult || hasError).toBe(true);
    });
  });

  describe('strict origin validation', () => {
    let strictApp: INestApplication;

    beforeAll(async () => {
      process.env.ORIGIN_VALIDATION = 'strict';
      process.env.TRUSTED_ORIGINS = 'https://trusted.example.com';
      process.env.SECURITY_MODE = 'permissive';

      const moduleRef = await Test.createTestingModule({
        imports: [TestAppModule],
      }).compile();

      strictApp = moduleRef.createNestApplication();
      await strictApp.init();
    });

    afterAll(async () => {
      delete process.env.ORIGIN_VALIDATION;
      delete process.env.TRUSTED_ORIGINS;
      delete process.env.SECURITY_MODE;
      await strictApp.close();
    });

    it('rejects request from an untrusted origin with JSON-RPC error -32003', async () => {
      const response = await request(strictApp.getHttpServer())
        .post('/a2a/tasks')
        .set('X-Agent-Id', 'untrusted-agent')
        .set('Origin', 'https://untrusted-origin.example.com')
        .send(buildA2ATask({ id: 'strict-origin-test' }))
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('strict-origin-test');
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe(-32003);
    });

    it('accepts request from a trusted origin', async () => {
      const response = await request(strictApp.getHttpServer())
        .post('/a2a/tasks')
        .set('X-Agent-Id', 'trusted-agent')
        .set('Origin', 'https://trusted.example.com')
        .send(buildA2ATask({ id: 'trusted-origin-test' }))
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe('trusted-origin-test');
    });
  });

  describe('rate limiting', () => {
    let rateLimitApp: INestApplication;

    beforeAll(async () => {
      process.env.ORIGIN_VALIDATION = 'permissive';
      process.env.SECURITY_MODE = 'permissive';
      // Very low limit so tests can exhaust it quickly
      process.env.RATE_LIMIT_MAX_REQUESTS = '3';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';

      const moduleRef = await Test.createTestingModule({
        imports: [TestAppModule],
      }).compile();

      rateLimitApp = moduleRef.createNestApplication();
      await rateLimitApp.init();
    });

    afterAll(async () => {
      delete process.env.ORIGIN_VALIDATION;
      delete process.env.SECURITY_MODE;
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
      delete process.env.RATE_LIMIT_WINDOW_MS;
      await rateLimitApp.close();
    });

    it('allows requests within the rate limit', async () => {
      const agentId = `rate-limit-allow-agent-${Date.now()}`;

      for (let i = 0; i < 3; i++) {
        const response = await request(rateLimitApp.getHttpServer())
          .post('/a2a/tasks')
          .set('X-Agent-Id', agentId)
          .set('Origin', 'https://agent.example.com')
          .send(buildA2ATask({ id: `allowed-${i}` }))
          .expect(200);

        expect(response.body.jsonrpc).toBe('2.0');
        // Must not be a rate-limit rejection
        if (response.body.error) {
          expect(response.body.error.code).not.toBe(-32029);
        }
      }
    });

    it('rate-limits after exceeding the configured maximum', async () => {
      const agentId = `rate-limit-exceed-agent-${Date.now()}`;

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await request(rateLimitApp.getHttpServer())
          .post('/a2a/tasks')
          .set('X-Agent-Id', agentId)
          .set('Origin', 'https://agent.example.com')
          .send(buildA2ATask({ id: `exhaust-${i}` }));
      }

      // The 4th request should be rate-limited
      const overLimitResponse = await request(rateLimitApp.getHttpServer())
        .post('/a2a/tasks')
        .set('X-Agent-Id', agentId)
        .set('Origin', 'https://agent.example.com')
        .send(buildA2ATask({ id: 'over-limit' }))
        .expect(200);

      expect(overLimitResponse.body.jsonrpc).toBe('2.0');
      expect(overLimitResponse.body.error).toBeDefined();
      expect(overLimitResponse.body.error.code).toBe(-32029);
    });
  });
});
