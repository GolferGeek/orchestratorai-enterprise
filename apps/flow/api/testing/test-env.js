/**
 * Shared test environment helper for JavaScript test scripts.
 *
 * All test scripts MUST use these helpers instead of hardcoding URLs.
 * Throws immediately if a required env var is missing.
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

/** API base URL — reads API_URL or API_BASE_URL */
function getApiUrl() {
  const url = process.env.API_URL || process.env.API_BASE_URL || process.env.API_BASE;
  if (!url) {
    console.error('ERROR: API_URL (or API_BASE_URL) environment variable is required for tests.');
    console.error('Ensure it is set in the root .env file.');
    process.exit(1);
  }
  return url;
}

/** Supabase URL */
function getSupabaseUrl() {
  return requireEnv('SUPABASE_URL');
}

/** Supabase service-role key */
function getSupabaseServiceKey() {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

module.exports = { requireEnv, getApiUrl, getSupabaseUrl, getSupabaseServiceKey };
