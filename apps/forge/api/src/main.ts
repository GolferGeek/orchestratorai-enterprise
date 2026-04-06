import './preload-env'; // Must run first - provider modules read process.env at import time
import { NestFactory } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import * as dotenv from 'dotenv';
import { join } from 'path';

type ProviderSelector =
  | 'AUTH_PROVIDER'
  | 'CONFIG_PROVIDER'
  | 'DB_PROVIDER'
  | 'RAG_PROVIDER'
  | 'STORAGE_PROVIDER'
  | 'WORK_PROVIDER'
  | 'KNOWLEDGE_PROVIDER';

const ALLOWED_PROVIDER_VALUES: Record<ProviderSelector, string[]> = {
  AUTH_PROVIDER: ['supabase', 'auth0', 'azure_oidc', 'google_oidc'],
  CONFIG_PROVIDER: [
    'local',
    'supabase_vault',
    'azure_keyvault',
    'gcp_secret_manager',
  ],
  DB_PROVIDER: ['supabase_pg', 'sqlserver', 'postgresql'],
  RAG_PROVIDER: ['supabase_pg', 'sqlserver', 'postgresql'],
  STORAGE_PROVIDER: ['supabase_storage', 'azure_blob', 'gcs'],
  WORK_PROVIDER: ['slack', 'ado', 'flow'],
  KNOWLEDGE_PROVIDER: ['none', 'notebooklm', 'internal'],
};

/**
 * Vault-aware env validation. When CONFIG_PROVIDER is a vault provider,
 * secret keys will be loaded at module init — skip them at startup.
 */
const VAULT_PROVIDERS = [
  'supabase_vault',
  'azure_keyvault',
  'gcp_secret_manager',
];

const SECRET_KEY_PATTERNS = [
  '_API_KEY',
  '_SECRET',
  '_PASSWORD',
  '_TOKEN',
  '_ANON_KEY',
  '_SERVICE_ROLE_KEY',
  '_CONNECTION_STRING',
  '_PAT',
];

function isSecretKey(name: string): boolean {
  return SECRET_KEY_PATTERNS.some((p) => name.includes(p) || name === p);
}

function requireEnv(name: string): void {
  // When a vault provider is active, secrets will be loaded later
  if (
    isSecretKey(name) &&
    VAULT_PROVIDERS.includes(process.env.CONFIG_PROVIDER || '')
  ) {
    return; // Will be loaded from vault at module init
  }
  if (!process.env[name] || process.env[name]?.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateProviderSelectors(): void {
  const selectorErrors: string[] = [];

  const selectors = Object.keys(ALLOWED_PROVIDER_VALUES) as ProviderSelector[];
  for (const selector of selectors) {
    const value = process.env[selector];
    if (!value) {
      selectorErrors.push(
        `${selector} is required. Allowed values: ${ALLOWED_PROVIDER_VALUES[selector].join(', ')}`,
      );
      continue;
    }

    if (!ALLOWED_PROVIDER_VALUES[selector].includes(value)) {
      selectorErrors.push(
        `${selector} has invalid value '${value}'. Allowed values: ${ALLOWED_PROVIDER_VALUES[selector].join(', ')}`,
      );
    }
  }

  if (selectorErrors.length > 0) {
    throw new Error(
      `Provider selector validation failed:\n- ${selectorErrors.join('\n- ')}`,
    );
  }

  // Provider-specific required keys.
  switch (process.env.AUTH_PROVIDER) {
    case 'supabase':
      requireEnv('SUPABASE_URL');
      requireEnv('SUPABASE_ANON_KEY');
      requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      break;
    case 'auth0':
      requireEnv('AUTH0_DOMAIN');
      requireEnv('AUTH0_ISSUER_URL');
      requireEnv('AUTH0_AUDIENCE');
      requireEnv('AUTH0_JWKS_URI');
      requireEnv('AUTH0_CLIENT_ID');
      requireEnv('AUTH0_CLIENT_SECRET');
      break;
    case 'azure_oidc':
      requireEnv('AZURE_TENANT_ID');
      requireEnv('AZURE_AD_CLIENT_ID');
      requireEnv('AZURE_ISSUER_URL');
      requireEnv('AZURE_JWKS_URI');
      break;
    case 'google_oidc':
      requireEnv('GOOGLE_CLIENT_ID');
      requireEnv('GOOGLE_ISSUER_URL');
      requireEnv('GOOGLE_JWKS_URI');
      break;
  }

  switch (process.env.CONFIG_PROVIDER) {
    case 'azure_keyvault':
      requireEnv('AZURE_KEYVAULT_URL');
      break;
    case 'gcp_secret_manager':
      requireEnv('GCP_PROJECT_ID');
      break;
    case 'supabase_vault':
      requireEnv('DATABASE_URL');
      break;
    case 'local':
      break;
  }

  switch (process.env.DB_PROVIDER) {
    case 'supabase_pg':
      requireEnv('DATABASE_URL');
      break;
    case 'sqlserver':
      requireEnv('SQLSERVER_HOST');
      requireEnv('SQLSERVER_PORT');
      requireEnv('SQLSERVER_DATABASE');
      requireEnv('SQLSERVER_USER');
      requireEnv('SQLSERVER_PASSWORD');
      break;
    case 'postgresql': {
      const hasPgUrl = process.env.POSTGRESQL_URL?.trim();
      const hasPgHost =
        process.env.PG_HOST?.trim() && process.env.PG_DATABASE?.trim();
      if (!hasPgUrl && !hasPgHost) {
        throw new Error(
          'DB_PROVIDER=postgresql requires either POSTGRESQL_URL or both PG_HOST and PG_DATABASE environment variables',
        );
      }
      break;
    }
  }

  // RAG_PROVIDER shares the same env var requirements as DB_PROVIDER for postgresql.
  // For sqlserver RAG it uses the same SQLSERVER_* vars as DB_PROVIDER.
  // The postgresql RAG provider uses RAG_POSTGRESQL_URL if set, otherwise POSTGRESQL_URL.
  if (process.env.RAG_PROVIDER === 'postgresql') {
    const hasRagUrl = process.env.RAG_POSTGRESQL_URL?.trim();
    const hasPgUrl = process.env.POSTGRESQL_URL?.trim();
    const hasPgHost =
      process.env.PG_HOST?.trim() && process.env.PG_DATABASE?.trim();
    if (!hasRagUrl && !hasPgUrl && !hasPgHost) {
      throw new Error(
        'RAG_PROVIDER=postgresql requires RAG_POSTGRESQL_URL, POSTGRESQL_URL, or PG_HOST+PG_DATABASE environment variables',
      );
    }
  }

  switch (process.env.STORAGE_PROVIDER) {
    case 'supabase_storage':
      requireEnv('SUPABASE_URL');
      requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      break;
    case 'azure_blob':
      requireEnv('AZURE_STORAGE_ACCOUNT');
      requireEnv('AZURE_STORAGE_CONNECTION_STRING');
      requireEnv('AZURE_STORAGE_CONTAINER_MEDIA');
      requireEnv('AZURE_STORAGE_CONTAINER_LEGAL');
      break;
    case 'gcs':
      requireEnv('GCS_PROJECT_ID');
      requireEnv('GCS_BUCKET_MEDIA');
      requireEnv('GCS_BUCKET_LEGAL');
      break;
  }

  if (process.env.WORK_PROVIDER === 'slack') {
    requireEnv('SLACK_BOT_TOKEN');
    requireEnv('SLACK_SIGNING_SECRET');
    requireEnv('SLACK_DEFAULT_CHANNEL_ID');
    requireEnv('FLOW_DEFAULT_TEAM_ID');
  }
  if (process.env.WORK_PROVIDER === 'ado') {
    requireEnv('ADO_ORG_URL');
    requireEnv('ADO_PROJECT');
    requireEnv('ADO_PAT');
    requireEnv('ADO_WORK_ITEM_TYPE');
  }

  if (process.env.KNOWLEDGE_PROVIDER === 'notebooklm') {
    requireEnv('NOTEBOOKLM_PROJECT_ID');
  }
}

async function bootstrap() {
  // Suppress punycode deprecation warning until dependencies are updated
  (process as NodeJS.Process & { noDeprecation?: boolean }).noDeprecation =
    true;
  // Load environment files with optional profile overlay
  // Load order:
  // 1. .env (infrastructure: provider selectors, ports, URLs)
  // 2. .env.secrets (credentials: API keys, passwords) - optional
  // 3. .env.{ENV_PROFILE} (profile overlay: azure, gcp, etc.) - optional
  const startupLogger = new Logger('Bootstrap');
  const { existsSync } = await import('fs');

  const projectRoot = join(process.cwd(), '../../..');

  const baseEnvPath = process.env.ENV_FILE
    ? process.env.ENV_FILE.startsWith('/')
      ? process.env.ENV_FILE
      : join(process.cwd(), process.env.ENV_FILE)
    : join(projectRoot, '.env');

  const secretsEnvPath = join(projectRoot, '.env.secrets');

  try {
    // Load base config
    if (existsSync(baseEnvPath)) {
      const baseResult = dotenv.config({ path: baseEnvPath });
      if (baseResult.error) {
        startupLogger.error(
          `[main.ts] Failed to load base env from ${baseEnvPath}: ${baseResult.error.message}`,
        );
      }
    } else {
      startupLogger.warn(`[main.ts] Base env file not found: ${baseEnvPath}`);
    }

    // Load secrets (overrides base values)
    if (existsSync(secretsEnvPath)) {
      const secretsResult = dotenv.config({
        path: secretsEnvPath,
        override: true,
      });
      if (secretsResult.error) {
        startupLogger.error(
          `[main.ts] Failed to load secrets from ${secretsEnvPath}: ${secretsResult.error.message}`,
        );
      } else {
        startupLogger.log(`[main.ts] Loaded secrets from .env.secrets`);
      }
    }

    // Load profile overlay if ENV_PROFILE is set (e.g. ENV_PROFILE=azure loads .env.azure)
    const profile = process.env.ENV_PROFILE;
    if (profile) {
      const profilePath = join(projectRoot, `.env.${profile}`);
      const profileResult = dotenv.config({
        path: profilePath,
        override: true,
      });
      if (profileResult.error) {
        startupLogger.error(
          `[main.ts] Failed to load profile overlay from ${profilePath}: ${profileResult.error.message}`,
        );
      } else {
        startupLogger.log(`[main.ts] Loaded profile overlay: .env.${profile}`);
      }
    }
  } catch (err) {
    startupLogger.error(`[main.ts] dotenv.config() threw: ${String(err)}`);
    process.exit(1);
  }

  validateProviderSelectors();

  // Parse command line arguments for --enable-external-agents
  const args = process.argv.slice(2);
  const enableExternalIdx = args.findIndex(
    (arg) => arg === '--enable-external-agents' || arg === '--enable-external',
  );
  if (enableExternalIdx !== -1) {
    process.env.ENABLE_EXTERNAL_AGENTS = 'true';
  }

  // Configure logging levels based on environment
  //
  // Environment Variables for Logging:
  // LOG_LEVEL - Comma-separated list of levels: error,warn,log,debug,verbose
  // NODE_ENV - Environment: production, development, test
  //
  // Examples:
  // LOG_LEVEL=error,warn              (Production-like logging)
  // LOG_LEVEL=error,warn,log          (Info logging without debug)
  // LOG_LEVEL=error,warn,log,debug    (Full development logging - default in dev)
  // LOG_LEVEL=error                   (Minimal logging)
  //
  const logLevels = (() => {
    const nodeEnv = process.env.NODE_ENV;
    const logLevel = process.env.LOG_LEVEL;

    // Valid NestJS log levels
    const validLevels: LogLevel[] = [
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
    ];

    // If LOG_LEVEL is explicitly set, use it
    if (logLevel) {
      const levels = logLevel
        .toLowerCase()
        .split(',')
        .map((l) => l.trim());
      return levels.filter((level) =>
        validLevels.includes(level as LogLevel),
      ) as LogLevel[];
    }

    // Default levels based on environment
    if (nodeEnv === 'production') {
      return ['error', 'warn'] as LogLevel[]; // Only errors and warnings in production
    } else if (nodeEnv === 'test') {
      return ['error'] as LogLevel[]; // Only errors in test
    } else {
      return ['error', 'warn'] as LogLevel[]; // Development: minimal logging by default
    }
  })();

  // Add startup timing
  const startTime = Date.now();
  startupLogger.log(`[STARTUP] Creating NestJS application...`);

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default body parser to configure custom limits
    logger: logLevels, // Configure logging levels
  });

  startupLogger.log(
    `[STARTUP] NestFactory.create completed in ${Date.now() - startTime}ms`,
  );

  // Configure body parser with larger limits for conversation histories and metrics responses
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Setup Swagger/OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Forge API — Complex Agent Dashboards')
    .setDescription(
      'Forge API: LangGraph agent workflows (Marketing Swarm, Legal Department, CAD Agent, Business Automation Advisor, Extended Post Writer, Data Analyst, HR Assistant, Customer Service). Port 6200.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('sovereign-policy', 'Sovereign mode policy management')
    .addTag('models', 'Model and provider management')
    .addTag(
      'orchestrations',
      'Orchestration dashboard, approvals, and replay APIs',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Enable CORS with environment-driven origins
  //
  // CORS_ORIGINS: Comma-separated list of allowed origins.
  //   Production example: CORS_ORIGINS=https://orchestratorai.io,https://app.orchestratorai.io
  //   Dev example: CORS_ORIGINS=http://localhost:6101,http://localhost:6102
  //
  // In development mode (NODE_ENV != production), localhost/Tailscale/LAN origins
  // are automatically allowed regardless of CORS_ORIGINS.
  //
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const corsOrigins: string[] = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  if (corsOrigins.length === 0 && !isDevelopment) {
    startupLogger.warn(
      '[CORS] WARNING: CORS_ORIGINS is not set in production mode. ' +
        'No cross-origin requests will be allowed. ' +
        'Set CORS_ORIGINS=https://orchestratorai.io,https://app.orchestratorai.io',
    );
  }

  if (corsOrigins.length > 0) {
    startupLogger.log(`[CORS] Allowed origins: ${corsOrigins.join(', ')}`);
  }
  if (isDevelopment) {
    startupLogger.log(
      '[CORS] Development mode: localhost, Tailscale, and LAN origins are auto-allowed',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, or tests)
      if (!origin) return callback(null, true);

      // Check explicit allowlist first (works in all environments)
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In development mode, allow common local/dev origins
      if (isDevelopment) {
        // localhost and 127.0.0.1
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('https://localhost') ||
          origin.includes('127.0.0.1') ||
          origin === 'null' ||
          origin === 'file://'
        ) {
          return callback(null, true);
        }

        // Tailscale origins (*.ts.net and 100.x.x.x CGNAT range)
        if (
          origin.includes('.ts.net') ||
          /https?:\/\/100\.\d+\.\d+\.\d+/.test(origin)
        ) {
          return callback(null, true);
        }

        // Local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (
          /https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/.test(
            origin,
          )
        ) {
          return callback(null, true);
        }
      }

      // Reject everything else
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Cache-Control',
      'Accept',
      'Accept-Language',
      'Accept-Encoding',
      'Pragma',
      'X-CSRF-Token',
      'Accept-Version',
      'Content-Length',
      'Content-MD5',
      'Date',
      'X-Api-Version',
      'X-Test-Api-Key',
      'X-Agent-Namespace',
      'x-organization-slug',
      'X-Team-ID',
    ],
  });

  // Start the HTTP server
  // Forge API port: Dev 6200, Prod 7200
  // Use FORGE_API_PORT (preferred) or API_PORT (fallback for legacy configs)
  const rawPort = process.env.FORGE_API_PORT || process.env.API_PORT;
  if (!rawPort) {
    throw new Error(
      'FORGE_API_PORT environment variable is required. ' +
        'Set FORGE_API_PORT in your .env file (Dev: 6200, Prod: 7200)',
    );
  }
  const port = parseInt(rawPort);

  startupLogger.log(`[STARTUP] Starting HTTP server on port ${port}...`);
  const listenStart = Date.now();
  await app.listen(port);
  startupLogger.log(
    `[STARTUP] Server listening in ${Date.now() - listenStart}ms`,
  );
  startupLogger.log(
    `[STARTUP] Total startup time: ${Date.now() - startTime}ms`,
  );

  // Capability registration is handled by CapabilitiesModule — each agent module
  // registers itself with CapabilityRegistryService on startup.
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to bootstrap application', error);
  process.exit(1);
});
