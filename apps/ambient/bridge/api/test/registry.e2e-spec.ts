/**
 * Registry endpoint E2E tests
 *
 * Tests the /registry/agents CRUD endpoints using the real compiled NestJS
 * module with in-memory database so tests run without Supabase.
 *
 * Test isolation: each test that modifies data registers a unique agent ID
 * so concurrent execution does not cause collisions.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TestAppModule } from './test-app.module';

// Unique prefix per test run to avoid cross-run collisions
const RUN_ID = Date.now().toString(36);

function agentId(suffix: string): string {
  return `test-agent-${RUN_ID}-${suffix}`;
}

function buildAgentBody(id: string) {
  return {
    id,
    name: `Test Agent ${id}`,
    description: 'E2E test agent',
    url: `https://agents.example.com/${id}`,
    version: '1.0.0',
    capabilities: ['text-generation', 'summarization'],
    trustScore: 50,
    trustLevel: 'neutral' as const,
    interactions: 0,
  };
}

describe('Registry endpoints (e2e)', () => {
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

  describe('GET /registry/agents', () => {
    it('returns 200 with an array', async () => {
      const response = await request(app.getHttpServer())
        .get('/registry/agents')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /registry/agents', () => {
    it('registers a new agent and returns 201 with agent data', async () => {
      const id = agentId('register');
      const body = buildAgentBody(id);

      const response = await request(app.getHttpServer())
        .post('/registry/agents')
        .send(body)
        .expect(201);

      expect(response.body.id).toBe(id);
      expect(response.body.name).toBe(body.name);
      expect(response.body.url).toBe(body.url);
    });

    it('returns the agent in the GET /registry/agents list after registration', async () => {
      const id = agentId('list-check');
      const body = buildAgentBody(id);

      await request(app.getHttpServer())
        .post('/registry/agents')
        .send(body)
        .expect(201);

      const listResponse = await request(app.getHttpServer())
        .get('/registry/agents')
        .expect(200);

      const agents = listResponse.body as Array<{ id: string }>;
      expect(agents.some((a) => a.id === id)).toBe(true);
    });
  });

  describe('GET /registry/agents/:id', () => {
    it('returns the agent by id after registration', async () => {
      const id = agentId('get-by-id');
      const body = buildAgentBody(id);

      await request(app.getHttpServer())
        .post('/registry/agents')
        .send(body)
        .expect(201);

      const getResponse = await request(app.getHttpServer())
        .get(`/registry/agents/${id}`)
        .expect(200);

      expect(getResponse.body.id).toBe(id);
      expect(getResponse.body.url).toBe(body.url);
    });

    it('returns 404 for an agent id that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/registry/agents/does-not-exist-at-all-12345')
        .expect(404);
    });
  });

  describe('POST /registry/agents/:id/heartbeat', () => {
    it('returns 200 and updates the agent after heartbeat', async () => {
      const id = agentId('heartbeat');
      const body = buildAgentBody(id);

      await request(app.getHttpServer())
        .post('/registry/agents')
        .send(body)
        .expect(201);

      const heartbeatResponse = await request(app.getHttpServer())
        .post(`/registry/agents/${id}/heartbeat`)
        .expect(200);

      expect(heartbeatResponse.body.id).toBe(id);
    });

    it('returns 404 for heartbeat on unknown agent', async () => {
      await request(app.getHttpServer())
        .post('/registry/agents/ghost-agent-99999/heartbeat')
        .expect(404);
    });
  });

  describe('DELETE /registry/agents/:id', () => {
    it('returns 204 and removes the agent', async () => {
      const id = agentId('delete');
      const body = buildAgentBody(id);

      await request(app.getHttpServer())
        .post('/registry/agents')
        .send(body)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/registry/agents/${id}`)
        .expect(204);

      // Agent should no longer be findable
      await request(app.getHttpServer())
        .get(`/registry/agents/${id}`)
        .expect(404);
    });

    it('returns 404 when deleting an agent that does not exist', async () => {
      await request(app.getHttpServer())
        .delete('/registry/agents/never-existed-agent-abc')
        .expect(404);
    });
  });
});
