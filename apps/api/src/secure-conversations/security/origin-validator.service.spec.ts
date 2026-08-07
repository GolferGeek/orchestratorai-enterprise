import { OriginValidatorService } from './origin-validator.service';

describe('OriginValidatorService', () => {
  const originalOrigins = process.env.TRUSTED_ORIGINS;
  const originalMode = process.env.ORIGIN_VALIDATION;

  afterEach(() => {
    if (originalOrigins === undefined) delete process.env.TRUSTED_ORIGINS;
    else process.env.TRUSTED_ORIGINS = originalOrigins;
    if (originalMode === undefined) delete process.env.ORIGIN_VALIDATION;
    else process.env.ORIGIN_VALIDATION = originalMode;
  });

  it('normalizes configured origins and rejects untrusted origins', () => {
    process.env.ORIGIN_VALIDATION = 'strict';
    process.env.TRUSTED_ORIGINS = ' https://agent.example/path ';
    const service = new OriginValidatorService();
    expect(service.isOriginTrusted('https://agent.example')).toBe(true);
    expect(service.isOriginTrusted('https://other.example')).toBe(false);
  });

  it('does not accept wildcard configuration in strict mode', () => {
    process.env.ORIGIN_VALIDATION = 'strict';
    process.env.TRUSTED_ORIGINS = '*';
    const service = new OriginValidatorService();
    expect(service.isOriginTrusted('https://attacker.example')).toBe(false);
  });

  it('fails closed for invalid modes and malformed origins', () => {
    process.env.ORIGIN_VALIDATION = 'typo';
    process.env.TRUSTED_ORIGINS = 'not-a-url';
    const service = new OriginValidatorService();
    expect(service.isOriginTrusted('https://agent.example')).toBe(false);
    expect(() => service.addTrustedOrigin('file:///tmp/agent')).toThrow(
      'valid HTTP or HTTPS origin',
    );
  });
});
