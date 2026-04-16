/**
 * Service availability check — fails fast if an API is not running.
 * No skipping. No mocking. If the service is down, the test fails.
 */
import { apiUrl, Product } from './ports';

/**
 * Verify a service is reachable by hitting its /health endpoint.
 * Throws immediately if the service is not running.
 */
export async function requireService(product: Product): Promise<void> {
  const url = `${apiUrl(product)}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      throw new Error(`${product} API /health returned ${res.status}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${product} API is not running on port ${apiUrl(product)}. ` +
      `Start it with: npm run dev:${product}:api\n` +
      `Original error: ${message}`,
    );
  }
}

/**
 * Check if Supabase REST (Kong) is reachable. Resolves the URL from the
 * SUPABASE_URL env var (set in the monorepo root .env) so this helper
 * follows the project's port configuration rather than hardcoding a stale
 * local-dev port. Defaults to the current Enterprise local port (6010).
 */
export async function requireSupabase(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:6010';
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey:
          process.env.SUPABASE_ANON_KEY ??
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Supabase REST returned ${res.status}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Supabase REST is not reachable at ${supabaseUrl}. ` +
        `Start the local stack (supabase CLI or docker compose).\n` +
        `Original error: ${message}`,
    );
  }
}
