/**
 * Shared test environment helper.
 *
 * All e2e / integration tests MUST use these helpers instead of
 * hardcoding URLs or falling back to localhost ports.
 *
 * Required env vars are loaded from the root .env by setup-env.ts.
 * If a required variable is missing the helper throws immediately
 * so the test fails with a clear message instead of silently
 * hitting the wrong endpoint.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is required for tests. ` +
        'Ensure it is set in the root .env file.',
    );
  }
  return value;
}

/**
 * Forge API base URL with the same fallback chain as testing/test-env.js.
 * Resolution order: API_URL → API_BASE_URL → FORGE_API_URL →
 * http://localhost:${FORGE_API_PORT} → http://localhost:6200 (CLAUDE.md default).
 */
export function getApiUrl(): string {
  const explicit = process.env.API_URL || process.env.API_BASE_URL;
  if (explicit) return explicit;
  if (process.env.FORGE_API_URL) return process.env.FORGE_API_URL;
  if (process.env.FORGE_API_PORT) {
    return `http://localhost:${process.env.FORGE_API_PORT}`;
  }
  return 'http://localhost:6200';
}

/** Supabase URL with a default that matches the local Enterprise stack. */
export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || 'http://127.0.0.1:6010';
}

/** Supabase service-role key */
export function getSupabaseServiceKey(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

/** LangGraph URL (e.g. http://localhost:6200) — reads LANGGRAPH_URL or builds from LANGGRAPH_PORT */
export function getLanggraphUrl(): string {
  if (process.env.LANGGRAPH_URL) return process.env.LANGGRAPH_URL;
  const port = process.env.LANGGRAPH_PORT;
  if (!port) {
    throw new Error(
      'LANGGRAPH_URL or LANGGRAPH_PORT environment variable is required for tests. ' +
        'Ensure it is set in the root .env file.',
    );
  }
  return `http://localhost:${port}`;
}

/** Database URL (e.g. postgresql://postgres:postgres@127.0.0.1:54322/postgres) */
export function getDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}
