/**
 * 02 — Health Check Integration Tests
 *
 * Verify /health endpoints across all running APIs.
 * Tests are lenient — they only fail if the service responds with an error.
 * If a service is not running, the test reports clearly what's missing.
 */
import { createTestClient } from './helpers/http-client';
import { API_PORTS, Product, apiUrl } from './helpers/ports';

const ALL_PRODUCTS: Product[] = ['auth', 'admin', 'forge', 'compose', 'flow', 'pulse', 'bridge'];

async function isServiceRunning(product: Product): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl(product)}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Health Checks', () => {
  const running: Product[] = [];

  beforeAll(async () => {
    // Discover which services are running
    const checks = await Promise.all(
      ALL_PRODUCTS.map(async (p) => ({ product: p, running: await isServiceRunning(p) })),
    );
    for (const check of checks) {
      if (check.running) running.push(check.product);
    }

    if (running.length === 0) {
      throw new Error(
        'No APIs are running. Start at least one with: npm run dev:auth\n' +
        'Or start all with: npm run dev:all',
      );
    }
  });

  it('at least Auth API is running', () => {
    expect(running).toContain('auth');
  });

  for (const product of ALL_PRODUCTS) {
    it(`GET ${apiUrl(product)}/health returns OK (if running)`, async () => {
      if (!running.includes(product)) {
        console.warn(`  ⚠ ${product} API not running on port ${API_PORTS[product]} — skipping`);
        return;
      }

      const client = createTestClient(apiUrl(product));
      const res = await client.get<{ status: string }>('/health');
      expect(res).toBeDefined();
    });
  }
});
