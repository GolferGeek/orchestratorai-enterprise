import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from the agent-communication workspace root (two dirs up from agent-consumer/src)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard, getAgentToken } from '@agent-communication/shared-protocols';

async function bootstrap() {
  const logger = new Logger('AgentConsumer');
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalGuards(new JwtAuthGuard());

  const port = 4006;
  await app.listen(port);
  logger.log(`AgentConsumer running on http://localhost:${port}`);

  getAgentToken().catch(() => logger.warn('Agent token pre-warm failed — main API may not be running'));
}

bootstrap();
