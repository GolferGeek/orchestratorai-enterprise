import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from the agent-communication workspace root (two dirs up from protocol-api/src)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

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

  const port = 4000;
  await app.listen(port);
  logger.log(`Protocol API running on http://localhost:${port}`);

  getAgentToken().catch(() => logger.warn('Agent token pre-warm failed — main API may not be running'));
}

bootstrap();
