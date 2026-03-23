/**
 * A2A Messages endpoint E2E tests
 *
 * Tests GET /a2a/messages and GET /a2a/messages/stats using the real compiled
 * NestJS module with in-memory database. No Supabase required.
 *
 * The A2AMessagesController does NOT require JWT auth — it is a read endpoint
 * served to the internal Bridge web UI.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TestAppModule } from './test-app.module';

describe('A2A Messages endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /a2a/messages', () => {
    it('returns 200 with an array', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts direction=inbound query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages?direction=inbound')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts direction=outbound query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages?direction=outbound')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts limit query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages?limit=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts agentId query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages?agentId=some-external-agent')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('accepts status query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages?status=success')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /a2a/messages/stats', () => {
    it('returns 200 with aggregate counts', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages/stats')
        .expect(200);

      expect(typeof response.body.total).toBe('number');
      expect(typeof response.body.inbound).toBe('number');
      expect(typeof response.body.outbound).toBe('number');
      expect(typeof response.body.success).toBe('number');
      expect(typeof response.body.error).toBe('number');
      expect(typeof response.body.rejected).toBe('number');
    });

    it('stats counts are non-negative integers', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages/stats')
        .expect(200);

      const { total, inbound, outbound, success, error, rejected } = response.body as {
        total: number;
        inbound: number;
        outbound: number;
        success: number;
        error: number;
        rejected: number;
      };

      expect(total).toBeGreaterThanOrEqual(0);
      expect(inbound).toBeGreaterThanOrEqual(0);
      expect(outbound).toBeGreaterThanOrEqual(0);
      expect(success).toBeGreaterThanOrEqual(0);
      expect(error).toBeGreaterThanOrEqual(0);
      expect(rejected).toBeGreaterThanOrEqual(0);
    });

    it('accepts orgSlug query parameter without error', async () => {
      const response = await request(app.getHttpServer())
        .get('/a2a/messages/stats?orgSlug=test-org')
        .expect(200);

      expect(response.body.total).toBeDefined();
    });
  });
});
