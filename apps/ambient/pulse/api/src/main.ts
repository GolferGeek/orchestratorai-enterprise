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

  app.enableCors({
    origin: ['http://localhost:5501', 'http://localhost:7501'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5500;
  await app.listen(port);
  logger.log(`Pulse API running on http://localhost:${port}`);
}

bootstrap();
