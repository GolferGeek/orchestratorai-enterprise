import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard, getAgentToken } from '@agent-communication/shared-protocols';

async function bootstrap() {
  const logger = new Logger('AgentConsumer');
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalGuards(new JwtAuthGuard());

  const port = parseInt(process.env.PROTOCOL_LAB_AGENT_CONSUMER_PORT ?? '5406', 10);
  await app.listen(port);
  logger.log(`AgentConsumer running on http://localhost:${port}`);

  getAgentToken().catch(() => logger.warn('Agent token pre-warm failed — main API may not be running'));
}

bootstrap();
