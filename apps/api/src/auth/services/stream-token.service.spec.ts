import { StreamTokenService } from './stream-token.service';

describe('StreamTokenService', () => {
  const originalEnv = {
    STREAM_TOKEN_SECRET: process.env.STREAM_TOKEN_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
    STREAM_TOKEN_RATE_MAX: process.env.STREAM_TOKEN_RATE_MAX,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function issue(service: StreamTokenService) {
    return service.issueToken({
      user: {
        id: 'user-1',
        email: 'user@example.test',
        role: 'authenticated',
        appMetadata: {},
        userMetadata: {},
        identities: [],
      },
      taskId: 'task-1',
      agentSlug: 'agent-1',
      organizationSlug: 'acme',
    });
  }

  it('issues and verifies a short-lived token with fixed audience and issuer', () => {
    process.env.STREAM_TOKEN_SECRET = 'test-stream-secret';
    const service = new StreamTokenService();
    const issued = issue(service);

    expect(service.verifyToken(issued.token)).toMatchObject({
      sub: 'user-1',
      taskId: 'task-1',
      agentSlug: 'agent-1',
      organizationSlug: 'acme',
      aud: 'sse',
      iss: 'orchestrator-ai',
    });
  });

  it('fails closed when neither stream nor JWT secret is configured', () => {
    delete process.env.STREAM_TOKEN_SECRET;
    delete process.env.JWT_SECRET;
    const service = new StreamTokenService();
    expect(() => issue(service)).toThrow('not configured');
    expect(() => service.verifyToken('forged')).toThrow('Invalid token');
  });

  it('rate limits repeated issuance for the same user and task', () => {
    process.env.STREAM_TOKEN_SECRET = 'test-stream-secret';
    process.env.STREAM_TOKEN_RATE_MAX = '1';
    const service = new StreamTokenService();
    issue(service);
    expect(() => issue(service)).toThrow('Too many stream tokens');
  });

  it('redacts tokens from URLs', () => {
    process.env.STREAM_TOKEN_SECRET = 'test-stream-secret';
    const service = new StreamTokenService();
    expect(
      service.stripTokenFromUrl('/events?token=secret&other=value'),
    ).toBe('/events?token=%5Bredacted%5D&other=value');
  });
});
