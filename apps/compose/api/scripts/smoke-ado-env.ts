import * as dotenv from 'dotenv';
import { join } from 'path';

const REQUIRED_KEYS = [
  'ADO_ORG_URL',
  'ADO_PROJECT',
  'ADO_PAT',
  'ADO_WORK_ITEM_TYPE',
] as const;

function loadEnv(): void {
  const envFilePath = process.env.ENV_FILE
    ? process.env.ENV_FILE.startsWith('/')
      ? process.env.ENV_FILE
      : join(process.cwd(), process.env.ENV_FILE)
    : join(process.cwd(), '../../.env');
  dotenv.config({ path: envFilePath });
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.includes('<') ||
    lower.includes('your-') ||
    lower.includes('replace') ||
    lower.includes('todo') ||
    lower.includes('changeme') ||
    lower.includes('example')
  );
}

function maskValue(key: string, value: string): string {
  if (key === 'ADO_PAT') {
    if (value.length <= 4) return '****';
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }
  return value;
}

async function run(): Promise<void> {
  loadEnv();

  console.log('========================================');
  console.log(' ADO Environment Precheck');
  console.log('========================================');
  console.log(`WORK_PROVIDER=${process.env.WORK_PROVIDER ?? '<unset>'}`);

  const missing: string[] = [];
  const placeholder: string[] = [];

  for (const key of REQUIRED_KEYS) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      missing.push(key);
      continue;
    }
    if (isPlaceholder(value.trim())) {
      placeholder.push(key);
    }

    console.log(`${key}=${maskValue(key, value.trim())}`);
  }

  if (missing.length > 0 || placeholder.length > 0) {
    if (missing.length > 0) {
      console.error(`Missing required ADO keys: ${missing.join(', ')}`);
    }
    if (placeholder.length > 0) {
      console.error(
        `ADO keys still look like placeholders: ${placeholder.join(', ')}`,
      );
    }
    throw new Error('ADO env precheck failed');
  }

  console.log('✅ ADO env precheck passed');
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ADO env precheck failed: ${message}`);
    process.exit(1);
  });
