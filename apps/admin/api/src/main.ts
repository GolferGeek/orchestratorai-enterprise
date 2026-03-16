import { NestFactory } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import * as dotenv from 'dotenv';
import { join } from 'path';

async function bootstrap(): Promise<void> {
  const startupLogger = new Logger('Bootstrap');
  const { existsSync } = await import('fs');

  const projectRoot = join(process.cwd(), '../..');

  const baseEnvPath = process.env['ENV_FILE']
    ? process.env['ENV_FILE'].startsWith('/')
      ? process.env['ENV_FILE']
      : join(process.cwd(), process.env['ENV_FILE'])
    : join(projectRoot, '.env');

  const secretsEnvPath = join(projectRoot, '.env.secrets');

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
      startupLogger.log('[main.ts] Loaded secrets from .env.secrets');
    }
  }

  const logLevels = ((): LogLevel[] => {
    const nodeEnv = process.env['NODE_ENV'];
    const logLevel = process.env['LOG_LEVEL'];

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
      return ['error', 'warn'];
    } else if (nodeEnv === 'test') {
      return ['error'];
    } else {
      return ['error', 'warn'];
    }
  })();

  const startTime = Date.now();
  startupLogger.log('[STARTUP] Creating Admin API NestJS application...');

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: logLevels,
  });

  startupLogger.log(
    `[STARTUP] NestFactory.create completed in ${Date.now() - startTime}ms`,
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OrchestratorAI Admin API')
    .setDescription(
      'Admin API — aggregation gateway for admin functionality. ' +
        'Calls product APIs (Forge, Compose, Flow, Pulse, Bridge) on behalf of Admin Web. ' +
        'No direct database access — pure HTTP aggregation with pass-through JWT auth.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token (passed through to product APIs)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('health', 'Admin API health check')
    .addTag('llm-analytics', 'LLM usage, model stats, cost tracking')
    .addTag('rag-management', 'RAG collection management')
    .addTag('agent-registry', 'Agent registry and configuration')
    .addTag('observability', 'Events, metrics, and errors across products')
    .addTag('system-config', 'System-wide configuration and health')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const isDevelopment = process.env['NODE_ENV'] !== 'production';

  const corsOrigins: string[] = process.env['CORS_ORIGINS']
    ? process.env['CORS_ORIGINS']
        .split(',')
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
    ],
  });

  const portValue = process.env['ADMIN_API_PORT'];

  if (!portValue) {
    throw new Error(
      'ADMIN_API_PORT environment variable is required. ' +
        'Set ADMIN_API_PORT=6150 in your .env file.',
    );
  }

  const port = parseInt(portValue, 10);

  startupLogger.log(`[STARTUP] Using port ADMIN_API_PORT=${port}`);
  startupLogger.log('[STARTUP] Starting Admin API...');

  const listenStart = Date.now();
  await app.listen(port);
  startupLogger.log(
    `[STARTUP] Server listening in ${Date.now() - listenStart}ms`,
  );
  startupLogger.log(
    `[STARTUP] Total startup time: ${Date.now() - startTime}ms`,
  );
  startupLogger.log(
    `[STARTUP] Swagger docs available at http://localhost:${port}/api/docs`,
  );
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to bootstrap Admin API', error);
  process.exit(1);
});
