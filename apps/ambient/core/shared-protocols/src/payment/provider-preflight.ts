/**
 * Provider Pre-flight Service
 *
 * Checks whether a payment provider is properly configured (env vars present)
 * and reachable before attempting a real payment operation.
 *
 * Rules:
 *   - If env vars are missing → throw an explicit error (NO FALLBACK)
 *   - If the provider endpoint is unreachable → throw an explicit error (NO FALLBACK)
 *   - Never silently degrade to a mock provider
 */

export interface PreflightResult {
  provider: string;
  available: boolean;
  error?: string;
}

/**
 * Check whether the Lightning LND node is configured and reachable.
 * Verifies LIGHTNING_LND_REST_URL and LIGHTNING_LND_MACAROON env vars,
 * then pings the LND /v1/getinfo endpoint.
 */
async function checkLightningPreflight(): Promise<PreflightResult> {
  const restUrl = process.env.LIGHTNING_LND_REST_URL;
  const macaroon = process.env.LIGHTNING_LND_MACAROON;

  if (!restUrl) {
    throw new Error(
      'Lightning provider is not configured: LIGHTNING_LND_REST_URL environment variable is not set',
    );
  }
  if (!macaroon) {
    throw new Error(
      'Lightning provider is not configured: LIGHTNING_LND_MACAROON environment variable is not set',
    );
  }

  // Ping LND to confirm it is reachable
  const baseUrl = restUrl.replace(/\/+$/, '');
  const skipVerify = process.env.LIGHTNING_LND_TLS_SKIP_VERIFY === 'true';

  // Node's built-in fetch is available from Node 18+
  // For self-signed cert environments we attempt with rejectUnauthorized=false
  // via a custom https agent when skipVerify is set. For standard TLS we use fetch.
  if (skipVerify) {
    // Use https module directly for self-signed cert support
    const https = await import('https');
    return new Promise<PreflightResult>((resolve, reject) => {
      const url = new URL(`${baseUrl}/v1/getinfo`);
      const req = https.default.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'GET',
          headers: {
            'Grpc-Metadata-macaroon': macaroon,
          },
          agent: new https.default.Agent({ rejectUnauthorized: false }),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ provider: 'lightning', available: true });
            } else {
              reject(
                new Error(
                  `Lightning LND node returned HTTP ${res.statusCode} on /v1/getinfo — node may not be ready`,
                ),
              );
            }
          });
        },
      );
      req.on('error', (err: Error) => {
        reject(
          new Error(
            `Lightning LND node at ${baseUrl} is not reachable: ${err.message}`,
          ),
        );
      });
      req.end();
    });
  }

  const response = await fetch(`${baseUrl}/v1/getinfo`, {
    method: 'GET',
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Lightning LND node returned HTTP ${response.status} on /v1/getinfo — node may not be ready`,
    );
  }

  return { provider: 'lightning', available: true };
}

/**
 * Check whether Stripe is configured.
 * Only verifies the env var — Stripe client-side validation requires
 * an actual API call which incurs latency; the key presence is sufficient for preflight.
 */
function checkStripePreflight(): PreflightResult {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'Stripe provider is not configured: STRIPE_SECRET_KEY environment variable is not set',
    );
  }
  return { provider: 'stripe', available: true };
}

/**
 * Check whether the Coinbase CDP (x402 USDC) provider is configured.
 * Verifies CDP_API_KEY_ID and CDP_API_KEY_PRIVATE_KEY env vars.
 */
function checkX402Preflight(): PreflightResult {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeyPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;

  if (!apiKeyId) {
    throw new Error(
      'x402 USDC provider is not configured: CDP_API_KEY_ID environment variable is not set',
    );
  }
  if (!apiKeyPrivateKey) {
    throw new Error(
      'x402 USDC provider is not configured: CDP_API_KEY_PRIVATE_KEY environment variable is not set',
    );
  }
  return { provider: 'x402', available: true };
}

/**
 * Check a single payment provider for configuration and reachability.
 *
 * Throws an explicit error if the provider is not configured — NO FALLBACK.
 * The caller must handle the error and decide whether to abort the operation.
 */
export async function checkProviderPreflight(
  provider: 'lightning' | 'stripe' | 'x402',
): Promise<PreflightResult> {
  switch (provider) {
    case 'lightning':
      return checkLightningPreflight();
    case 'stripe':
      return checkStripePreflight();
    case 'x402':
      return checkX402Preflight();
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Check all three payment providers.
 * Returns results for each — individual failures are collected, not thrown,
 * so the caller can see the full picture of what is and is not available.
 *
 * NOTE: This is the only place where errors are caught. All other preflight
 * functions throw explicitly and callers must handle that.
 */
export async function checkAllProviders(): Promise<PreflightResult[]> {
  const providers: Array<'lightning' | 'stripe' | 'x402'> = ['lightning', 'stripe', 'x402'];
  const results: PreflightResult[] = [];

  for (const provider of providers) {
    try {
      const result = await checkProviderPreflight(provider);
      results.push(result);
    } catch (err) {
      results.push({
        provider,
        available: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
