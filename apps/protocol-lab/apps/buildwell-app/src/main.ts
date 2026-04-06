import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard, getAgentToken } from '@agent-communication/shared-protocols';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalGuards(new JwtAuthGuard());
  const port = parseInt(process.env.PROTOCOL_LAB_BUILDWELL_PORT ?? '5408', 10);
  await app.listen(port);
  console.log(`Buildwell App running on http://localhost:${port}`);

  getAgentToken().catch(() => console.warn('Agent token pre-warm failed — main API may not be running'));
}
bootstrap();
