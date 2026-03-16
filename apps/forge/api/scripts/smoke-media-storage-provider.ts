import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { join } from 'path';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AppModule } from '../src/app.module';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '../src/agent2agent/services/media-storage-provider.interface';

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
  const storageProvider = process.env.STORAGE_PROVIDER;

  console.log('========================================');
  console.log(' Media Storage Provider Smoke');
  console.log('========================================');
  console.log(`STORAGE_PROVIDER=${storageProvider ?? '<unset>'}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  let storedAssetId: string | null = null;
  try {
    const mediaStorage = app.get<MediaStorageProvider>(MEDIA_STORAGE_PROVIDER);
    console.log(`Resolved provider: ${mediaStorage.constructor.name}`);

    const context = {
      orgSlug: 'smoke-org',
      userId: undefined,
      conversationId: undefined,
      taskId: `smoke-${Date.now()}`,
      planId: undefined,
      deliverableId: undefined,
      agentSlug: 'media-smoke',
      agentType: 'media',
      provider: 'smoke',
      model: 'smoke',
    } as unknown as ExecutionContext;

    const payload = Buffer.from(`media-smoke-${Date.now()}`);
    const result = await mediaStorage.storeGeneratedMedia(payload, context, {
      prompt: 'smoke test',
      provider: 'smoke',
      model: 'smoke-model',
      mime: 'application/octet-stream',
    });
    storedAssetId = result.assetId;

    console.log(`Stored asset: ${result.assetId}`);
    console.log(`Storage path: ${result.storagePath}`);
    console.log(`URL present: ${result.url ? 'yes' : 'no'}`);

    await mediaStorage.deleteAsset(result.assetId, context);
    storedAssetId = null;
    console.log('Cleanup: deleted stored smoke asset');

    console.log('✅ Media storage smoke passed');
  } catch (error) {
    if (storedAssetId) {
      console.warn(`⚠️ Cleanup incomplete. Manual delete may be needed: ${storedAssetId}`);
    }
    throw error;
  } finally {
    await app.close();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Media storage smoke failed: ${message}`);
    process.exit(1);
  });
