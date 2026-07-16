/**
 * 02 — Health Check Integration Tests
 *
 * Verify the unified platform /health endpoint.
 */
import { createTestClient } from './helpers/http-client';
import { API_PORTS, Product, apiUrl } from './helpers/ports';

const ALL_PRODUCTS: Product[] = ['platform'];

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
        'No platform API is running. Start it with: npm run dev:api\n' +
        'Or start all with: npm run dev:all',
      );
    }
  });

  it('platform API is running', () => {
    expect(running).toContain('platform');
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
