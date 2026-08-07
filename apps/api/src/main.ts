import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApplication } from './app-bootstrap';

function readRequiredPort(): number {
  const rawPort = process.env.PLATFORM_API_PORT;

  if (!rawPort) {
    throw new Error('PLATFORM_API_PORT is required for the unified platform API.');
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PLATFORM_API_PORT must be a positive integer. Received: ${rawPort}`);
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const port = readRequiredPort();
  configureApplication(app);

  await app.listen(port);
}

void bootstrap();
