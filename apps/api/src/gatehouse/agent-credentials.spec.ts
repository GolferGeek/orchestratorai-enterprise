import { BadRequestException } from '@nestjs/common';
import { grantProblem, hashKey, isAgentKey, newAgentKey, type AgentGrant } from './agent-credentials';
import { newKey } from './admin.controller';

const grant = (over: Partial<AgentGrant> = {}): AgentGrant => ({
  id: 'g1', orgSlug: 'finance', agentName: 'a', accountRef: 'c', accountLabel: 'C', kind: 'api_key', tokenPrefix: 'oak_12345678',
  orderPolicy: 'approve_each', perOrderLimitCents: null, monthlyLimitCents: null, rateLimitPerMinute: 60,
  validUntil: null, revokedAt: null, lastUsedAt: null, createdBy: 'admin:u', createdAt: '2026-10-05T00:00:00Z', ...over,
});

describe('agent keys', () => {
  it('tells an opaque key from a caller JWT, and never stores the key', () => {
    const key = newAgentKey();
    expect(key).toMatch(/^oak_[A-Za-z0-9_-]{43}$/);
    expect(isAgentKey(key)).toBe(true);
    expect(isAgentKey('eyJhbGciOi.eyJpc3Mi.c2ln')).toBe(false);
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key)).not.toContain(key);
  });

  it('says why a revoked or expired key cannot call', () => {
    expect(grantProblem(grant())).toBeNull();
    expect(grantProblem(grant({ revokedAt: '2026-10-05T00:00:00Z' }))).toBe('This agent key was revoked');
    expect(grantProblem(grant({ validUntil: '2020-01-01T00:00:00Z' }))).toBe('This agent key has expired');
    expect(grantProblem(grant({ validUntil: '2999-01-01T00:00:00Z' }))).toBeNull();
  });

  it('checks a request to issue a key, and refuses anything unclear', () => {
    const body = { agentName: ' Acme bot ', accountRef: 'client-42', accountLabel: 'Acme', perOrderLimitCents: 5000, validDays: 30 };
    const input = newKey(body, 'finance', 'u1');
    expect(input).toMatchObject({ orgSlug: 'finance', agentName: 'Acme bot', orderPolicy: 'approve_each', perOrderLimitCents: 5000, monthlyLimitCents: null, createdBy: 'admin:u1' });
    expect(Date.parse(input.validUntil!) - Date.now()).toBeGreaterThan(29 * 86_400_000);

    const refused = (over: Record<string, unknown>, org = 'finance') => () => newKey({ ...body, ...over }, org, 'u1');
    expect(refused({ agentName: '' })).toThrow(BadRequestException);
    expect(refused({ orderPolicy: 'whatever' })).toThrow('orderPolicy must be one of');
    expect(refused({ orderPolicy: 'auto_within_limits', perOrderLimitCents: undefined })).toThrow('may not order on its own without a limit');
    expect(refused({ perOrderLimitCents: 12.5 })).toThrow('whole number of cents');
    expect(refused({ validDays: 0 })).toThrow('validDays');
    expect(refused({}, '*')).toThrow('orgSlug is required');
    expect(newKey({ ...body, orgSlug: 'legal' }, '*', 'u1').orgSlug).toBe('legal');
  });
});
