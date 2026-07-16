import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);
  const port = readRequiredPort();

  await app.listen(port);
}

void bootstrap();

