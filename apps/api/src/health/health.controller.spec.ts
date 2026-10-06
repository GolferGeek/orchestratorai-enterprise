import { HttpException } from '@nestjs/common';
import type { DatabaseService } from '@orchestrator-ai/transport-types';
import { HealthController } from './health.controller';

const db = (status: string) => ({ checkConnection: jest.fn(async () => ({ status, message: status === 'ok' ? 'fine' : 'password authentication failed' })) }) as unknown as DatabaseService;

describe('HealthController', () => {
  it('reports both database connections', async () => {
    await expect(new HealthController(db('ok'), db('ok')).getDatabases()).resolves.toEqual({ platform: 'ok', business: 'ok' });
  });

  it('answers 503 when the company database is down, without sending why', async () => {
    const error = (await new HealthController(db('ok'), db('error')).getDatabases().catch((e: unknown) => e)) as HttpException;
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual({ platform: 'ok', business: 'error' });
    expect(JSON.stringify(error.getResponse())).not.toContain('password');
  });
});
