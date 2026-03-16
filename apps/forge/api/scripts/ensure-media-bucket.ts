import * as dotenv from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): void {
  const envFilePath = process.env.ENV_FILE
    ? process.env.ENV_FILE.startsWith('/')
      ? process.env.ENV_FILE
      : join(process.cwd(), process.env.ENV_FILE)
    : join(process.cwd(), '../../.env');
  dotenv.config({ path: envFilePath });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function run(): Promise<void> {
  loadEnv();
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const bucketName = process.env.MEDIA_STORAGE_BUCKET || 'media';

  const client = createClient(url, serviceRoleKey);
  const listResult = await client.storage.listBuckets();
  if (listResult.error) {
    throw new Error(`Failed to list buckets: ${listResult.error.message}`);
  }

  const exists = (listResult.data || []).some((bucket) => bucket.name === bucketName);
  if (exists) {
    console.log(`Bucket already exists: ${bucketName}`);
    return;
  }

  const createResult = await client.storage.createBucket(bucketName, {
    public: true,
  });
  if (createResult.error) {
    throw new Error(`Failed to create bucket '${bucketName}': ${createResult.error.message}`);
  }

  console.log(`Created bucket: ${bucketName}`);
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ensure-media-bucket failed: ${message}`);
    process.exit(1);
  });
