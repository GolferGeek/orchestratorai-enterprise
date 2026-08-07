import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureApplication(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '55mb', strict: true });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
