import { checkProviderPreflight, checkAllProviders } from '../provider-preflight';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Save env var values, set new ones for the test, and restore on cleanup.
 */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lightning preflight
// ---------------------------------------------------------------------------

describe('checkProviderPreflight — lightning', () => {
  const LIGHTNING_ENV = {
    LIGHTNING_LND_REST_URL: 'https://localhost:8080',
    LIGHTNING_LND_MACAROON: 'deadbeef01234567',
    LIGHTNING_LND_TLS_SKIP_VERIFY: 'false',
  };

  it('throws when LIGHTNING_LND_REST_URL is missing', async () => {
    await expect(
      checkProviderPreflight('lightning'),
    ).rejects.toThrow('LIGHTNING_LND_REST_URL environment variable is not set');
  });

  it('throws when LIGHTNING_LND_MACAROON is missing', async () => {
    const saved = process.env.LIGHTNING_LND_REST_URL;
    process.env.LIGHTNING_LND_REST_URL = 'https://localhost:8080';
    const savedMacaroon = process.env.LIGHTNING_LND_MACAROON;
    delete process.env.LIGHTNING_LND_MACAROON;

    try {
      await expect(
        checkProviderPreflight('lightning'),
      ).rejects.toThrow('LIGHTNING_LND_MACAROON environment variable is not set');
    } finally {
      if (saved === undefined) delete process.env.LIGHTNING_LND_REST_URL;
      else process.env.LIGHTNING_LND_REST_URL = saved;
      if (savedMacaroon === undefined) delete process.env.LIGHTNING_LND_MACAROON;
      else process.env.LIGHTNING_LND_MACAROON = savedMacaroon;
    }
  });

  it('resolves with available=true when env vars are set and LND responds 200', async () => {
    // Mock global fetch to simulate a healthy LND node
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ identity_pubkey: 'abc123', alias: 'test-lnd' }),
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch as typeof fetch;

    // Set env vars before calling preflight
    const savedUrl = process.env.LIGHTNING_LND_REST_URL;
    const savedMacaroon = process.env.LIGHTNING_LND_MACAROON;
    process.env.LIGHTNING_LND_REST_URL = LIGHTNING_ENV.LIGHTNING_LND_REST_URL;
    process.env.LIGHTNING_LND_MACAROON = LIGHTNING_ENV.LIGHTNING_LND_MACAROON;

    try {
      const result = await checkProviderPreflight('lightning');
      expect(result.provider).toBe('lightning');
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify fetch was called with the correct LND endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:8080/v1/getinfo',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Grpc-Metadata-macaroon': LIGHTNING_ENV.LIGHTNING_LND_MACAROON,
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
      if (savedUrl === undefined) delete process.env.LIGHTNING_LND_REST_URL;
      else process.env.LIGHTNING_LND_REST_URL = savedUrl;
      if (savedMacaroon === undefined) delete process.env.LIGHTNING_LND_MACAROON;
      else process.env.LIGHTNING_LND_MACAROON = savedMacaroon;
    }
  });
});

// ---------------------------------------------------------------------------
// Stripe preflight
// ---------------------------------------------------------------------------

describe('checkProviderPreflight — stripe', () => {
  it('throws when STRIPE_SECRET_KEY is missing', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    try {
      await expect(
        checkProviderPreflight('stripe'),
      ).rejects.toThrow('STRIPE_SECRET_KEY environment variable is not set');
    } finally {
      if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it('resolves with available=true when STRIPE_SECRET_KEY is set', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';

    try {
      const result = await checkProviderPreflight('stripe');
      expect(result.provider).toBe('stripe');
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// x402 USDC preflight
// ---------------------------------------------------------------------------

describe('checkProviderPreflight — x402', () => {
  it('throws when CDP_API_KEY_ID is missing', async () => {
    const savedId = process.env.CDP_API_KEY_ID;
    const savedKey = process.env.CDP_API_KEY_PRIVATE_KEY;
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_PRIVATE_KEY;

    try {
      await expect(
        checkProviderPreflight('x402'),
      ).rejects.toThrow('CDP_API_KEY_ID environment variable is not set');
    } finally {
      if (savedId === undefined) delete process.env.CDP_API_KEY_ID;
      else process.env.CDP_API_KEY_ID = savedId;
      if (savedKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
      else process.env.CDP_API_KEY_PRIVATE_KEY = savedKey;
    }
  });

  it('throws when CDP_API_KEY_PRIVATE_KEY is missing', async () => {
    const savedId = process.env.CDP_API_KEY_ID;
    const savedKey = process.env.CDP_API_KEY_PRIVATE_KEY;
    process.env.CDP_API_KEY_ID = 'test-cdp-key-id';
    delete process.env.CDP_API_KEY_PRIVATE_KEY;

    try {
      await expect(
        checkProviderPreflight('x402'),
      ).rejects.toThrow('CDP_API_KEY_PRIVATE_KEY environment variable is not set');
    } finally {
      if (savedId === undefined) delete process.env.CDP_API_KEY_ID;
      else process.env.CDP_API_KEY_ID = savedId;
      if (savedKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
      else process.env.CDP_API_KEY_PRIVATE_KEY = savedKey;
    }
  });

  it('resolves with available=true when CDP credentials are set', async () => {
    const savedId = process.env.CDP_API_KEY_ID;
    const savedKey = process.env.CDP_API_KEY_PRIVATE_KEY;
    process.env.CDP_API_KEY_ID = 'test-cdp-key-id';
    process.env.CDP_API_KEY_PRIVATE_KEY = 'test-cdp-private-key';

    try {
      const result = await checkProviderPreflight('x402');
      expect(result.provider).toBe('x402');
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    } finally {
      if (savedId === undefined) delete process.env.CDP_API_KEY_ID;
      else process.env.CDP_API_KEY_ID = savedId;
      if (savedKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
      else process.env.CDP_API_KEY_PRIVATE_KEY = savedKey;
    }
  });
});

// ---------------------------------------------------------------------------
// checkAllProviders — aggregated results
// ---------------------------------------------------------------------------

describe('checkAllProviders', () => {
  it('returns results for all three providers and does not throw even when providers are unconfigured', async () => {
    // Remove all payment provider env vars
    const savedVars: Record<string, string | undefined> = {
      LIGHTNING_LND_REST_URL: process.env.LIGHTNING_LND_REST_URL,
      LIGHTNING_LND_MACAROON: process.env.LIGHTNING_LND_MACAROON,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
      CDP_API_KEY_PRIVATE_KEY: process.env.CDP_API_KEY_PRIVATE_KEY,
    };

    delete process.env.LIGHTNING_LND_REST_URL;
    delete process.env.LIGHTNING_LND_MACAROON;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_PRIVATE_KEY;

    try {
      const { checkAllProviders: checkAll } = await import('../provider-preflight');
      const results = await checkAll();

      expect(results).toHaveLength(3);

      const providerNames = results.map((r) => r.provider);
      expect(providerNames).toContain('lightning');
      expect(providerNames).toContain('stripe');
      expect(providerNames).toContain('x402');

      // All should be unavailable since env vars are cleared
      for (const result of results) {
        expect(result.available).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    } finally {
      for (const [key, value] of Object.entries(savedVars)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
