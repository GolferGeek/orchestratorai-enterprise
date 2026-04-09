import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env and .env.secrets from the monorepo root
// From dist/: ../ = api, ../../ = pulse, ../../../ = ambient, ../../../../ = apps, ../../../../../ = monorepo root
const monorepoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
dotenv.config({ path: path.join(monorepoRoot, '.env') });
dotenv.config({ path: path.join(monorepoRoot, '.env.secrets'), override: true });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const logger = new Logger('PulseAPI');
  const app = await NestFactory.create(AppModule);

  const port = parseInt(process.env.PULSE_API_PORT || process.env.PORT || '6500', 10);

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  await app.listen(port);
  logger.log(`Pulse API running on http://localhost:${port}`);
}

bootstrap();
