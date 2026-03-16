import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import {
  DATABASE_PROVIDER,
  DatabaseProvider,
} from '../src/data-pilot/database-provider.interface';

function loadEnv(): void {
  const envFilePath = process.env.ENV_FILE
    ? process.env.ENV_FILE.startsWith('/')
      ? process.env.ENV_FILE
      : join(process.cwd(), process.env.ENV_FILE)
    : join(process.cwd(), '../../.env');
  dotenv.config({ path: envFilePath });
}

async function run(): Promise<void> {
  loadEnv();

  const dbProvider = process.env.DB_PROVIDER;
  console.log('========================================');
  console.log(' Database Provider Pilot Smoke');
  console.log('========================================');
  console.log(`DB_PROVIDER=${dbProvider ?? '<unset>'}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const provider = app.get<DatabaseProvider>(DATABASE_PROVIDER);
    console.log(`Resolved provider: ${provider.constructor.name}`);

    const lookupResult = await provider.findIdentityLinkUserId({
      issuer: 'smoke://issuer',
      subject: `smoke-subject-${Date.now()}`,
    });

    if (lookupResult !== null && typeof lookupResult !== 'string') {
      throw new Error('findIdentityLinkUserId returned unexpected value type');
    }

    console.log(
      `Identity link lookup completed (result=${lookupResult ?? 'null'})`,
    );
    console.log('✅ Database provider pilot smoke passed');
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Database provider pilot smoke failed: ${message}`);
    process.exit(1);
  });
