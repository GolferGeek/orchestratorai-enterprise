import { Test } from '@nestjs/testing';
import { OriginValidatorService } from './origin-validator.service';

describe('OriginValidatorService', () => {
  let service: OriginValidatorService;

  function buildService(env: Record<string, string> = {}): Promise<OriginValidatorService> {
    // Set env before module creation
    Object.assign(process.env, env);
    return Test.createTestingModule({
      providers: [OriginValidatorService],
    })
      .compile()
      .then((m) => m.get<OriginValidatorService>(OriginValidatorService));
  }

  beforeEach(() => {
    delete process.env.TRUSTED_ORIGINS;
    delete process.env.ORIGIN_VALIDATION;
  });

  it('should be defined', async () => {
    service = await buildService();
    expect(service).toBeDefined();
  });

  describe('strict mode (default)', () => {
    beforeEach(async () => {
      service = await buildService({ ORIGIN_VALIDATION: 'strict' });
    });

    it('should reject an unknown origin in strict mode', () => {
      expect(service.isOriginTrusted('http://unknown-agent.io')).toBe(false);
    });

    it('should accept a wildcard origin when TRUSTED_ORIGINS includes *', async () => {
      service = await buildService({
        ORIGIN_VALIDATION: 'strict',
        TRUSTED_ORIGINS: '*',
      });
      expect(service.isOriginTrusted('http://any-origin.io')).toBe(true);
    });

    it('should accept an origin loaded from TRUSTED_ORIGINS env', async () => {
      service = await buildService({
        ORIGIN_VALIDATION: 'strict',
        TRUSTED_ORIGINS: 'http://trusted-agent.io,http://another.io',
      });
      expect(service.isOriginTrusted('http://trusted-agent.io')).toBe(true);
      expect(service.isOriginTrusted('http://another.io')).toBe(true);
      expect(service.isOriginTrusted('http://not-listed.io')).toBe(false);
    });
  });

  describe('permissive mode', () => {
    beforeEach(async () => {
      service = await buildService({ ORIGIN_VALIDATION: 'permissive' });
    });

    it('should allow all origins in permissive mode', () => {
      expect(service.isOriginTrusted('http://any-unknown-agent.io')).toBe(true);
    });
  });

  describe('addTrustedOrigin()', () => {
    beforeEach(async () => {
      service = await buildService({ ORIGIN_VALIDATION: 'strict' });
    });

    it('should add an origin to the trusted set', () => {
      expect(service.isOriginTrusted('http://new-agent.io')).toBe(false);
      service.addTrustedOrigin('http://new-agent.io');
      expect(service.isOriginTrusted('http://new-agent.io')).toBe(true);
    });
  });

  describe('removeTrustedOrigin()', () => {
    beforeEach(async () => {
      service = await buildService({
        ORIGIN_VALIDATION: 'strict',
        TRUSTED_ORIGINS: 'http://removable.io',
      });
    });

    it('should remove an origin from the trusted set', () => {
      expect(service.isOriginTrusted('http://removable.io')).toBe(true);
      service.removeTrustedOrigin('http://removable.io');
      expect(service.isOriginTrusted('http://removable.io')).toBe(false);
    });
  });

  describe('getTrustedOrigins()', () => {
    it('should return an array of all trusted origins', async () => {
      service = await buildService({
        ORIGIN_VALIDATION: 'strict',
        TRUSTED_ORIGINS: 'http://a.io,http://b.io',
      });
      const origins = service.getTrustedOrigins();
      expect(origins).toContain('http://a.io');
      expect(origins).toContain('http://b.io');
    });

    it('should reflect dynamically added origins', async () => {
      service = await buildService({ ORIGIN_VALIDATION: 'strict' });
      service.addTrustedOrigin('http://dynamic.io');
      expect(service.getTrustedOrigins()).toContain('http://dynamic.io');
    });
  });
});
