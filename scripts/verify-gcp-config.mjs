import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const expectedSelectors = {
  DB_PROVIDER: 'postgresql',
  RAG_PROVIDER: 'postgresql',
  STORAGE_PROVIDER: 'gcs',
  LLM_PROVIDER: 'openrouter',
  CONFIG_PROVIDER: 'gcp_secret_manager',
  AUTH_PROVIDER: 'google_oidc',
  OBSERVABILITY_PROVIDER: 'database_events',
  VITE_AUTH_PROVIDER: 'google_oidc',
  VITE_DB_PROVIDER: 'postgresql',
  VITE_STORAGE_PROVIDER: 'gcs',
};

const requiredValues = [
  'PLATFORM_API_PORT',
  'PLATFORM_API_URL',
  'PUBLIC_API_URL',
  'CORS_ORIGINS',
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'GCS_PROJECT_ID',
  'GCS_BUCKET_MEDIA',
  'GCS_BUCKET_LEGAL',
  'POSTGRESQL_URL',
  'DATABASE_URL',
  'RAG_POSTGRESQL_URL',
  'GOOGLE_ISSUER_URL',
  'GOOGLE_JWKS_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'JWT_SECRET',
  'MEDIA_STORAGE_BUCKET',
  'OPENROUTER_API_KEY',
  'OPENROUTER_SITE_URL',
  'OPENROUTER_SITE_NAME',
  'OPENROUTER_AUTO_ALLOWED_MODELS',
  'OPENROUTER_AUTO_COST_QUALITY_TRADEOFF',
  'OPENROUTER_VIDEO_ENABLED',
  'OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED',
  'EMBEDDING_MODEL',
  'ASSET_FETCH_EXTERNAL',
  'ASSET_FETCH_MAX_BYTES',
  'ASSET_EXTERNAL_STRATEGY',
  'VITE_API_BASE_URL',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_GOOGLE_REDIRECT_URI',
];

const errors = [];

for (const [key, expected] of Object.entries(expectedSelectors)) {
  const actual = process.env[key];
  if (actual !== expected) {
    errors.push(
      `${key} must be '${expected}', received '${actual ?? 'missing'}'`,
    );
  }
}

for (const key of requiredValues) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    errors.push(`${key} is required`);
  } else if (
    value.includes('replace-with') ||
    value.includes('replace-me') ||
    value.includes('example.com')
  ) {
    errors.push(`${key} still contains a placeholder value`);
  }
}

for (const key of ['POSTGRESQL_URL', 'DATABASE_URL', 'RAG_POSTGRESQL_URL']) {
  const value = process.env[key];
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        errors.push(
          `${key} must use the postgresql:// or postgres:// protocol`,
        );
      }
    } catch {
      errors.push(`${key} must be a valid PostgreSQL connection URL`);
    }
  }
}

for (const key of [
  'PLATFORM_API_URL',
  'PUBLIC_API_URL',
  'GOOGLE_ISSUER_URL',
  'GOOGLE_JWKS_URI',
  'VITE_GOOGLE_REDIRECT_URI',
  'OPENROUTER_SITE_URL',
]) {
  const value = process.env[key];
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        errors.push(`${key} must use HTTPS`);
      }
    } catch {
      errors.push(`${key} must be a valid URL`);
    }
  }
}

if (process.env.EMBEDDING_MODEL !== 'text-embedding-3-small') {
  errors.push(
    `EMBEDDING_MODEL must be 'text-embedding-3-small' for the 768-dimension Cloud SQL vector contract`,
  );
}

try {
  const allowedModels = JSON.parse(
    process.env.OPENROUTER_AUTO_ALLOWED_MODELS ?? '',
  );
  if (
    !Array.isArray(allowedModels) ||
    allowedModels.length === 0 ||
    allowedModels.some((model) => typeof model !== 'string' || model === '')
  ) {
    errors.push(
      'OPENROUTER_AUTO_ALLOWED_MODELS must be a non-empty JSON string array',
    );
  }
} catch {
  errors.push('OPENROUTER_AUTO_ALLOWED_MODELS must be valid JSON');
}

const autoTradeoff = Number(process.env.OPENROUTER_AUTO_COST_QUALITY_TRADEOFF);
if (!Number.isInteger(autoTradeoff) || autoTradeoff < 0 || autoTradeoff > 10) {
  errors.push('OPENROUTER_AUTO_COST_QUALITY_TRADEOFF must be an integer from 0 to 10');
}

for (const key of [
  'OPENROUTER_VIDEO_ENABLED',
  'OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED',
]) {
  if (!['true', 'false'].includes(process.env[key] ?? '')) {
    errors.push(`${key} must be 'true' or 'false'`);
  }
}

for (const dependency of [
  '@google-cloud/storage',
  '@google-cloud/secret-manager',
]) {
  try {
    require.resolve(dependency);
  } catch {
    errors.push(`Required GCP dependency '${dependency}' is not installed`);
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `GCP configuration validation failed:\n${errors
      .map((error) => `- ${error}`)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('GCP provider configuration is valid.\n');
}
