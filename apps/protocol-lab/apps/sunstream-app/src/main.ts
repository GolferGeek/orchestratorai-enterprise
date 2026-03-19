import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard, getAgentToken } from '@agent-communication/shared-protocols';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalGuards(new JwtAuthGuard());
  await app.listen(6407);
  console.log('SunStream App running on http://localhost:6407');

  // Pre-warm agent token for inter-agent calls
  getAgentToken().catch(() => console.warn('Agent token pre-warm failed — main API may not be running'));
}
bootstrap();
