import {
  ExecutionContext,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeyGuard } from './api-key.guard';
import { OrganizationCredentialsRepository } from '@agent-platform/repositories/organization-credentials.repository';
import { OrganizationCredentialRecord } from '@agent-platform/interfaces/organization-credential-record.interface';
import { ConfigService } from '@nestjs/config';

const createContext = (
  headers: Record<string, unknown>,
  params: Record<string, unknown> = { orgSlug: 'acme' },
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers, params }),
    }),
    getClass: () => undefined,
    getHandler: () => undefined,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => undefined,
    switchToWs: () => undefined,
    getType: () => 'http',
  }) as unknown as ExecutionContext;

const baseRecord: OrganizationCredentialRecord = {
  id: 'cred-1',
  organization_slug: 'acme',
  alias: 'agent_api_key',
  credential_type: 'api_key',
  encrypted_value: '',
  encryption_metadata: {},
  rotated_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ApiKeyGuard', () => {
  let repo: jest.Mocked<OrganizationCredentialsRepository>;
  let config: jest.Mocked<ConfigService>;
  let guard: ApiKeyGuard;

  const createConfigMock = (overrides: Record<string, unknown> = {}) => {
    return {
      get: jest.fn((key: string) => overrides[key]),
    } as unknown as jest.Mocked<ConfigService>;
  };

  beforeEach(() => {
    repo = {
      get: jest.fn(),
    } as unknown as jest.Mocked<OrganizationCredentialsRepository>;
    config = createConfigMock();
    guard = new ApiKeyGuard(repo, config);
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('authorizes matching sha256 key with salt', async () => {
    const credentialMetadata = {
      hash_algorithm: 'sha256',
      salt: 'xyz',
      encoding: 'hex',
    };
    const provided = 'super-secret';
    const digest = createHash('sha256')
      .update(`${credentialMetadata.salt}${provided}`)
      .digest('hex');

    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: digest,
      encryption_metadata: credentialMetadata,
    });

    const result = await guard.canActivate(
      createContext({ 'x-agent-api-key': provided }),
    );

    expect(repo.get).toHaveBeenCalledWith('acme', 'agent_api_key');
    expect(result).toBe(true);
  });

  it('authorizes using alias header', async () => {
    const credentialMetadata = {
      hash_algorithm: 'sha256',
      salt: '',
      encoding: 'base64',
    };
    const provided = 'alias-secret';
    const digest = createHash('sha256').update(provided).digest('base64');
    repo.get.mockImplementation((_org, alias) => {
      if (alias === 'custom_alias') {
        return Promise.resolve({
          ...baseRecord,
          alias,
          encrypted_value: digest,
          encryption_metadata: credentialMetadata,
        });
      }
      return Promise.resolve(null);
    });

    const result = await guard.canActivate(
      createContext({
        'x-agent-api-key': provided,
        'x-agent-key-alias': 'custom_alias',
      }),
    );

    expect(repo.get).toHaveBeenCalledWith('acme', 'custom_alias');
    expect(result).toBe(true);
  });

  it('authorizes plain-text credentials when no hash metadata is provided', async () => {
    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: 'plain-secret',
      encryption_metadata: { encoding: 'utf8' },
    });

    const result = await guard.canActivate(
      createContext({ 'x-agent-api-key': 'plain-secret' }),
    );

    expect(result).toBe(true);
  });

  it('supports pepper environment variables when hashing', async () => {
    process.env.A2A_PEPPER = 'pepper';
    const credentialMetadata = {
      hash_algorithm: 'sha256',
      salt: 'salt-1',
      encoding: 'hex',
      pepper_env_var: 'A2A_PEPPER',
    };
    const provided = 'peppered';
    const digest = createHash('sha256')
      .update(`${credentialMetadata.salt}${provided}${process.env.A2A_PEPPER}`)
      .digest('hex');

    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: digest,
      encryption_metadata: credentialMetadata,
    });

    const result = await guard.canActivate(
      createContext({ 'x-agent-api-key': provided }),
    );

    expect(result).toBe(true);
    delete process.env.A2A_PEPPER;
  });

  it('rejects when API key is missing', async () => {
    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(repo.get).not.toHaveBeenCalled();
  });

  it('rejects when credential lookup fails', async () => {
    repo.get.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext({ 'x-agent-api-key': 'nope' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when computed hash does not match stored value', async () => {
    const credentialMetadata = {
      hash_algorithm: 'sha256',
      salt: 's',
      encoding: 'hex',
    };
    const digest = createHash('sha256').update('swrong').digest('hex');
    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: digest,
      encryption_metadata: credentialMetadata,
    });

    await expect(
      guard.canActivate(createContext({ 'x-agent-api-key': 'different' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('caches credentials between requests to avoid repeated lookups', async () => {
    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: 'plain-secret',
      encryption_metadata: { encoding: 'utf8' },
    });

    const ctx = createContext({ 'x-agent-api-key': 'plain-secret' });

    await guard.canActivate(ctx);
    await guard.canActivate(ctx);

    expect(repo.get).toHaveBeenCalledTimes(1);
  });

  it('enforces rate limits per API key', async () => {
    const rateConfig = createConfigMock({
      AGENT_API_KEY_RATE_LIMIT: 2,
      AGENT_API_KEY_RATE_WINDOW_MS: 10_000,
    });
    guard = new ApiKeyGuard(repo, rateConfig);

    repo.get.mockResolvedValue({
      ...baseRecord,
      encrypted_value: 'plain-secret',
      encryption_metadata: { encoding: 'utf8' },
    });

    const ctx = createContext({ 'x-agent-api-key': 'plain-secret' });

    await guard.canActivate(ctx); // 1st call
    await guard.canActivate(ctx); // 2nd call within limit

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  describe('Security - Timing Attack Resistance', () => {
    it('should use constant-time comparison for API keys', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: 'salt',
        encoding: 'hex',
      };

      // Create two similar keys (differ by one character)
      const validKey = 'correct-api-key-12345';
      const almostValidKey = 'correct-api-key-12346';

      const validDigest = createHash('sha256')
        .update(`${credentialMetadata.salt}${validKey}`)
        .digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: validDigest,
        encryption_metadata: credentialMetadata,
      });

      const startValid = Date.now();
      try {
        await guard.canActivate(createContext({ 'x-agent-api-key': validKey }));
      } catch {
        // Expected
      }
      const timeValid = Date.now() - startValid;

      const startInvalid = Date.now();
      try {
        await guard.canActivate(
          createContext({ 'x-agent-api-key': almostValidKey }),
        );
      } catch {
        // Expected
      }
      const timeInvalid = Date.now() - startInvalid;

      // Both should complete in similar time (within reasonable margin)
      // This is a heuristic test - timing differences should be minimal
      const timeDiff = Math.abs(timeValid - timeInvalid);
      expect(timeDiff).toBeLessThan(50); // 50ms tolerance
    });

    it('should reject keys with length mismatch using constant-time comparison', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'hex',
      };
      const validKey = 'valid-key';
      const digest = createHash('sha256').update(validKey).digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      // Test shorter key
      await expect(
        guard.canActivate(createContext({ 'x-agent-api-key': 'short' })),
      ).rejects.toThrow(UnauthorizedException);

      // Test longer key
      await expect(
        guard.canActivate(
          createContext({ 'x-agent-api-key': 'very-long-invalid-key-here' }),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Security - SQL Injection Protection', () => {
    it('should reject SQL injection attempts in API key', async () => {
      const maliciousKey = "'; DROP TABLE organization_credentials; --";

      // Mock repository to return null (credential not found)
      repo.get.mockResolvedValue(null);

      await expect(
        guard.canActivate(createContext({ 'x-agent-api-key': maliciousKey })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject SQL injection in org slug', async () => {
      const maliciousSlug = "admin' OR '1'='1";

      await expect(
        guard.canActivate(
          createContext(
            { 'x-agent-api-key': 'valid-key' },
            { orgSlug: maliciousSlug },
          ),
        ),
      ).rejects.toThrow();
    });

    it('should handle special characters in API key safely', async () => {
      const specialCharsKey = "key';--<script>alert('xss')</script>";

      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'hex',
      };
      const digest = createHash('sha256').update(specialCharsKey).digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      // Should handle safely (will fail comparison, but no injection)
      await expect(
        guard.canActivate(createContext({ 'x-agent-api-key': 'different' })),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Security - Hash Algorithm Validation', () => {
    it('should handle unsupported hash algorithms as plain-text', async () => {
      const credentialMetadata = {
        hash_algorithm: 'md5', // Unsupported - will fall back to plain-text
        salt: '',
        encoding: 'hex',
      };
      const key = 'test-key';

      // When unsupported algorithm is provided, guard treats as plain-text comparison
      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: key, // Plain-text match
        encryption_metadata: credentialMetadata,
      });

      // Should succeed with plain-text comparison
      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should support sha256 algorithm', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'hex',
      };
      const key = 'test-key';
      const digest = createHash('sha256').update(key).digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should support sha512 algorithm', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha512',
        salt: '',
        encoding: 'hex',
      };
      const key = 'test-key';
      const digest = createHash('sha512').update(key).digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });
  });

  describe('Security - Encoding Validation', () => {
    it('should support hex encoding', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'hex',
      };
      const key = 'hex-key';
      const digest = createHash('sha256').update(key).digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should support base64 encoding', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'base64',
      };
      const key = 'base64-key';
      const digest = createHash('sha256').update(key).digest('base64');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should support base64url encoding', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'base64url',
      };
      const key = 'base64url-key';
      const base64 = createHash('sha256').update(key).digest('base64');
      const base64url = base64
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: base64url,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should default to utf8 encoding for invalid encoding', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: '',
        encoding: 'invalid-encoding',
      };
      const key = 'utf8-key';
      // Guard defaults invalid encodings to utf8, which uses Buffer representation
      // For testing, we need to compute the hash without encoding specification
      const buffer = createHash('sha256').update(key).digest();
      const digest = buffer.toString('utf8');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });
  });

  describe('Security - Salt and Pepper', () => {
    it('should use salt in hash computation', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: 'random-salt',
        encoding: 'hex',
      };
      const key = 'salted-key';
      const digest = createHash('sha256')
        .update(`${credentialMetadata.salt}${key}`)
        .digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: digest,
        encryption_metadata: credentialMetadata,
      });

      const result = await guard.canActivate(
        createContext({ 'x-agent-api-key': key }),
      );
      expect(result).toBe(true);
    });

    it('should reject key when salt is incorrect', async () => {
      const credentialMetadata = {
        hash_algorithm: 'sha256',
        salt: 'correct-salt',
        encoding: 'hex',
      };
      const key = 'key';
      // Compute with wrong salt
      const wrongDigest = createHash('sha256')
        .update(`wrong-salt${key}`)
        .digest('hex');

      repo.get.mockResolvedValue({
        ...baseRecord,
        encrypted_value: wrongDigest,
        encryption_metadata: credentialMetadata,
      });

      await expect(
        guard.canActivate(createContext({ 'x-agent-api-key': key })),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Security - Error Message Safety', () => {
    it('should not leak API key in error messages', async () => {
      const secretKey = 'super-secret-api-key-12345';

      repo.get.mockResolvedValue(null);

      try {
        await guard.canActivate(
          createContext({ 'x-agent-api-key': secretKey }),
        );
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const message = (error as UnauthorizedException).message;
        expect(message).not.toContain(secretKey);
        expect(message).toBe('Invalid API key.');
      }
    });

    it('should not leak organization details in error messages', async () => {
      repo.get.mockRejectedValue(
        new Error('Database connection failed for org acme'),
      );

      try {
        await guard.canActivate(
          createContext(
            { 'x-agent-api-key': 'key' },
            { orgSlug: 'secret-org' },
          ),
        );
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const message = (error as UnauthorizedException).message;
        expect(message).toBe('Unable to validate API key.');
      }
    });
  });
});
