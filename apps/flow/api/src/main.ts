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
  | 'WORK_PROVIDER';

const ALLOWED_PROVIDER_VALUES: Record<ProviderSelector, string[]> = {
  AUTH_PROVIDER: ['supabase', 'auth0', 'azure_oidc', 'google_oidc'],
  CONFIG_PROVIDER: [
    'local',
    'supabase_vault',
    'azure_keyvault',
    'gcp_secret_manager',
  ],
  DB_PROVIDER: ['supabase_pg', 'sqlserver', 'postgresql'],
  WORK_PROVIDER: ['flow', 'slack', 'ado'],
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
}

async function bootstrap() {
  // Suppress punycode deprecation warning until dependencies are updated
  (process as NodeJS.Process & { noDeprecation?: boolean }).noDeprecation =
    true;
  const startupLogger = new Logger('Bootstrap');
  const { existsSync } = await import('fs');

  const projectRoot = join(process.cwd(), '../..');

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

  // Configure logging levels based on environment
  const logLevels = (() => {
    const nodeEnv = process.env.NODE_ENV;
    const logLevel = process.env.LOG_LEVEL;

    const validLevels: LogLevel[] = [
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
    ];

    if (logLevel) {
      const levels = logLevel
        .toLowerCase()
        .split(',')
        .map((l) => l.trim());
      return levels.filter((level) =>
        validLevels.includes(level as LogLevel),
      ) as LogLevel[];
    }

    if (nodeEnv === 'production') {
      return ['error', 'warn'] as LogLevel[];
    } else if (nodeEnv === 'test') {
      return ['error'] as LogLevel[];
    } else {
      return ['error', 'warn'] as LogLevel[];
    }
  })();

  const startTime = Date.now();
  startupLogger.log(`[STARTUP] Creating NestJS application...`);

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: logLevels,
  });

  startupLogger.log(
    `[STARTUP] NestFactory.create completed in ${Date.now() - startTime}ms`,
  );

  // Configure body parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Setup Swagger/OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Flow API')
    .setDescription(
      'Flow productivity suite backend — teams, tasks, sprints, files',
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
    .addTag('Flow', 'Flow productivity endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Enable CORS with environment-driven origins
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const corsOrigins: string[] = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  if (corsOrigins.length === 0 && !isDevelopment) {
    startupLogger.warn(
      '[CORS] WARNING: CORS_ORIGINS is not set in production mode.',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);

      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (isDevelopment) {
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('https://localhost') ||
          origin.includes('127.0.0.1') ||
          origin === 'null' ||
          origin === 'file://'
        ) {
          return callback(null, true);
        }

        if (
          origin.includes('.ts.net') ||
          /https?:\/\/100\.\d+\.\d+\.\d+/.test(origin)
        ) {
          return callback(null, true);
        }

        if (
          /https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/.test(
            origin,
          )
        ) {
          return callback(null, true);
        }
      }

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
      'x-organization-slug',
      'X-Team-ID',
    ],
  });

  // Flow API port: FLOW_API_PORT env var, default 6900
  const port = parseInt(
    process.env.FLOW_API_PORT || process.env.API_PORT || '6900',
  );
  if (!process.env.FLOW_API_PORT && !process.env.API_PORT) {
    startupLogger.warn(
      '[STARTUP] Neither FLOW_API_PORT nor API_PORT is set. Defaulting to 6900.',
    );
  }

  startupLogger.log(`[STARTUP] Starting HTTP server on port ${port}...`);
  const listenStart = Date.now();
  await app.listen(port);
  startupLogger.log(
    `[STARTUP] Server listening in ${Date.now() - listenStart}ms`,
  );
  startupLogger.log(
    `[STARTUP] Total startup time: ${Date.now() - startTime}ms`,
  );
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to bootstrap application', error);
  process.exit(1);
});
