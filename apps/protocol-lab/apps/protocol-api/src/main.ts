import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { JwtAuthGuard, getAgentToken } from '@agent-communication/shared-protocols';

async function bootstrap() {
  const logger = new Logger('ProtocolAPI');
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalGuards(new JwtAuthGuard());

  const port = parseInt(process.env.PROTOCOL_LAB_PROTOCOL_API_PORT ?? '5402', 10);
  await app.listen(port);
  logger.log(`Protocol API running on http://localhost:${port}`);

  getAgentToken().catch(() => logger.warn('Agent token pre-warm failed — main API may not be running'));
}

bootstrap();
