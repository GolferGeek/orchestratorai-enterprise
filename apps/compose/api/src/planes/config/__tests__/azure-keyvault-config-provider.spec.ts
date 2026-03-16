import { AzureKeyVaultConfigProvider } from '../azure-keyvault-config-provider';
import { ConfigService } from '@nestjs/config';

// Mock Azure SDK
jest.mock('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({
    getSecret: jest.fn(),
  })),
}));

jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn(),
}));

describe('AzureKeyVaultConfigProvider', () => {
  let provider: AzureKeyVaultConfigProvider;
  let mockGetSecret: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot and clear relevant env keys before each test
    originalEnv = { ...process.env };

    // Set env values used by the provider
    process.env.AZURE_KEYVAULT_URL = 'https://test-vault.vault.azure.net/';
    process.env.API_PORT = '6100';
    process.env.NODE_ENV = 'development';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
    process.env.FEATURE_ENABLED = 'true';
    process.env.MAX_RETRIES = '3';
    process.env.MODEL_CONFIG = '{"provider":"openai","model":"gpt-4o"}';

    const configService = {
      get: jest.fn((key: string) => process.env[key]),
      getOrThrow: jest.fn((key: string) => {
        if (process.env[key] === undefined) throw new Error(`Missing ${key}`);
        return process.env[key];
      }),
    } as unknown as ConfigService;

    provider = new AzureKeyVaultConfigProvider(configService);

    // Replace the secretClient with our controllable mock
    mockGetSecret = jest.fn();
    (provider as any).secretClient = { getSecret: mockGetSecret };
    // Clear the internal secret cache so each test starts clean
    (provider as any).secretCache.clear();
  });

  afterEach(() => {
    // Restore process.env to its state before the test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('getRequired', () => {
    it('returns env value when present', () => {
      expect(provider.getRequired('API_PORT')).toBe('6100');
    });

    it('throws when key is missing from env', () => {
      expect(() => provider.getRequired('MISSING_KEY')).toThrow(
        'Missing required configuration key: MISSING_KEY',
      );
    });
  });

  describe('getOptional', () => {
    it('returns env value when present', () => {
      expect(provider.getOptional('API_PORT', '8080')).toBe('6100');
    });

    it('returns default when missing', () => {
      expect(provider.getOptional('MISSING', '8080')).toBe('8080');
    });
  });

  describe('getSecret', () => {
    it('returns env var if present (env override)', async () => {
      const result = await provider.getSecret('ANTHROPIC_API_KEY');
      expect(result).toBe('sk-ant-from-env');
      expect(mockGetSecret).not.toHaveBeenCalled();
    });

    it('fetches from Key Vault when not in env', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'sk-ant-from-vault',
        name: 'anthropic-api-key',
      });

      // Remove from env so it falls through to vault
      delete process.env.ANTHROPIC_API_KEY;

      const result = await provider.getSecret('ANTHROPIC_API_KEY');
      expect(result).toBe('sk-ant-from-vault');
      expect(mockGetSecret).toHaveBeenCalledWith('anthropic-api-key');
    });

    it('caches vault secrets after first fetch', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'cached-secret',
        name: 'my-secret',
      });
      // MY_SECRET is not set in process.env so will fall through to vault

      await provider.getSecret('MY_SECRET');
      await provider.getSecret('MY_SECRET');

      // Only called once due to caching
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });

    it('throws when secret not found in vault', async () => {
      mockGetSecret.mockRejectedValueOnce(new Error('Secret not found'));
      // MISSING_SECRET is not set in process.env

      await expect(provider.getSecret('MISSING_SECRET')).rejects.toThrow(
        "Failed to retrieve secret 'MISSING_SECRET' (vault name: 'missing-secret') from Azure Key Vault",
      );
    });

    it('throws when vault secret has no value', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: undefined,
        name: 'empty-secret',
      });
      // EMPTY_SECRET is not set in process.env

      await expect(provider.getSecret('EMPTY_SECRET')).rejects.toThrow(
        "Secret 'empty-secret' exists in Key Vault but has no value",
      );
    });
  });

  describe('getSecretOptional', () => {
    it('returns default when secret not available', async () => {
      mockGetSecret.mockRejectedValueOnce(new Error('not found'));
      // MISSING is not set in process.env

      const result = await provider.getSecretOptional('MISSING', 'default-val');
      expect(result).toBe('default-val');
    });
  });

  describe('typed parsers (same as local)', () => {
    it('getBoolean parses true/false', () => {
      expect(provider.getBoolean('FEATURE_ENABLED')).toBe(true);
      expect(provider.getBoolean('MISSING', false)).toBe(false);
    });

    it('getNumber parses numbers', () => {
      expect(provider.getNumber('MAX_RETRIES')).toBe(3);
      expect(provider.getNumber('MISSING', 10)).toBe(10);
    });

    it('getJson parses JSON', () => {
      const result = provider.getJson<{ provider: string }>('MODEL_CONFIG');
      expect(result.provider).toBe('openai');
    });
  });

  describe('validateRequired', () => {
    it('identifies missing keys', () => {
      const missing = provider.validateRequired(['API_PORT', 'MISSING_KEY']);
      expect(missing).toEqual(['MISSING_KEY']);
    });
  });

  describe('getProviderInfo', () => {
    it('returns azure_keyvault provider info', () => {
      const info = provider.getProviderInfo();
      expect(info.provider).toBe('azure_keyvault');
      expect(info.source).toBe('https://test-vault.vault.azure.net/');
    });
  });

  describe('vault name conversion', () => {
    it('converts underscores to hyphens and lowercases', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'secret-value',
        name: 'anthropic-api-key',
      });
      // Remove from process.env so the provider falls through to vault
      delete process.env.ANTHROPIC_API_KEY;

      await provider.getSecret('ANTHROPIC_API_KEY');
      expect(mockGetSecret).toHaveBeenCalledWith('anthropic-api-key');
    });
  });
});
