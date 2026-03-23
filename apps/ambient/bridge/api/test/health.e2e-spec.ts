/**
 * Health endpoint E2E tests
 *
 * Tests the GET /health endpoint using the real compiled NestJS module
 * with in-memory infrastructure implementations.
 *
 * No live Supabase or Auth API required.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TestAppModule } from './test-app.module';

describe('GET /health (e2e)', () => {
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

  it('returns 200 with status ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('returns product name as bridge', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.product).toBe('bridge');
  });

  it('includes a timestamp in ISO format', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.timestamp).toBeDefined();
    expect(() => new Date(response.body.timestamp as string).toISOString()).not.toThrow();
  });

  it('includes a version field', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.version).toBeDefined();
    expect(typeof response.body.version).toBe('string');
  });
});
