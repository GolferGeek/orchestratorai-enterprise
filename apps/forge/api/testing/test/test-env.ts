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

/** API base URL (e.g. http://localhost:6100) — reads API_URL or API_BASE_URL */
export function getApiUrl(): string {
  const url = process.env.API_URL || process.env.API_BASE_URL;
  if (!url) {
    throw new Error(
      'API_URL (or API_BASE_URL) environment variable is required for tests. ' +
        'Ensure it is set in the root .env file.',
    );
  }
  return url;
}

/** Supabase URL (e.g. http://127.0.0.1:6010) */
export function getSupabaseUrl(): string {
  return requireEnv('SUPABASE_URL');
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

/** Database URL (e.g. postgresql://postgres:postgres@127.0.0.1:6012/postgres) */
export function getDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}
