import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env and .env.secrets from the monorepo root
// From dist/: ../ = src, ../../ = api, ../../../ = bridge, ../../../../ = ambient, ../../../../../ = monorepo root
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
dotenv.config({ path: path.join(monorepoRoot, '.env') });
dotenv.config({ path: path.join(monorepoRoot, '.env.secrets'), override: true });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const logger = new Logger('BridgeAPI');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5601',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Signature', 'X-Agent-Id', 'X-Timestamp'],
  });

  app.useWebSocketAdapter(new WsAdapter(app) as unknown as Parameters<typeof app.useWebSocketAdapter>[0]);

  const port = parseInt(process.env.PORT ?? '5600', 10);
  await app.listen(port);
  logger.log(`Bridge API running on http://localhost:${port}`);
  logger.log('External A2A gateway: inbound + outbound agent communication');
}

bootstrap();
