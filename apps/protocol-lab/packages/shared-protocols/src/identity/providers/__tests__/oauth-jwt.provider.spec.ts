import { OAuthJWTIdentityProvider } from '../oauth-jwt.provider';

describe('OAuthJWTIdentityProvider A2A security schemes', () => {
  it('includes A2A securitySchemes metadata in generated identity', async () => {
    const provider = new OAuthJWTIdentityProvider();
    const identity = await provider.generateIdentity();

    const extended = identity as typeof identity & {
      metadata?: Record<string, unknown>;
      securitySchemes?: Record<string, unknown>;
    };
    expect(extended.securitySchemes).toBeDefined();
    expect(extended.metadata?.a2aSecuritySchemes).toBeDefined();
  });

  it('exposes security schemes for Agent Card compatibility', () => {
    const provider = new OAuthJWTIdentityProvider();
    const schemes = provider.getSecuritySchemes('client-123');
    expect(schemes.oauth_jwt).toBeDefined();
    expect(schemes.oauth_jwt.type).toBe('oauth2');
  });
});
