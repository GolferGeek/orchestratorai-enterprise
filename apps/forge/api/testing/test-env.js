/**
 * Shared test environment helper for JavaScript test scripts.
 *
 * Resolution order for the Forge API URL (most specific → fallback):
 *   1. API_URL — explicit override (CI / non-default ports)
 *   2. API_BASE_URL / API_BASE — alternate names supported by older scripts
 *   3. FORGE_API_URL — set in the monorepo .env, points at the running Forge API
 *   4. http://localhost:${FORGE_API_PORT} — composed from the port var in .env
 *   5. http://localhost:6200 — current Enterprise dev default (CLAUDE.md)
 *
 * The same fallback chain applies to Supabase via SUPABASE_URL → 6010 default.
 *
 * Service-role keys still throw fast — they have no safe default.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} environment variable is required for tests.`);
    console.error('Ensure it is set in the root .env file.');
    process.exit(1);
  }
  return value;
}

/** Forge API base URL with the resolution chain documented above. */
function getApiUrl() {
  const explicit =
    process.env.API_URL || process.env.API_BASE_URL || process.env.API_BASE;
  if (explicit) return explicit;
  if (process.env.FORGE_API_URL) return process.env.FORGE_API_URL;
  if (process.env.FORGE_API_PORT) {
    return `http://localhost:${process.env.FORGE_API_PORT}`;
  }
  // Final fallback — current Enterprise dev port per CLAUDE.md
  return 'http://localhost:6200';
}

/** Supabase URL with the same fallback chain. */
function getSupabaseUrl() {
  return process.env.SUPABASE_URL || 'http://127.0.0.1:6010';
}

/** Supabase service-role key — no safe default, must be set explicitly. */
function getSupabaseServiceKey() {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

module.exports = {
  requireEnv,
  getApiUrl,
  getSupabaseUrl,
  getSupabaseServiceKey,
};
