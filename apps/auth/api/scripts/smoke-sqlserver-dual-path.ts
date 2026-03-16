import { spawnSync } from 'child_process';

type DualPathStep = {
  name: string;
  command: string;
  env: Record<string, string>;
};

function runStep(step: DualPathStep): void {
  console.log('----------------------------------------');
  console.log(`Step: ${step.name}`);
  console.log(`Command: ${step.command}`);
  const result = spawnSync(step.command, {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...step.env,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${step.name}`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function run(): void {
  const localEnv = requireEnv('SQLSERVER_LOCAL_ENV_FILE');
  const azureEnv = requireEnv('SQLSERVER_AZURE_ENV_FILE');

  const steps: DualPathStep[] = [
    {
      name: 'Local SQL Server bootstrap',
      command: 'npm run bootstrap:sqlserver-pilot-schema',
      env: { ENV_FILE: localEnv },
    },
    {
      name: 'Local SQL Server seed verification',
      command: 'npm run init:verify',
      env: { ENV_FILE: localEnv, DB_PROVIDER: 'sqlserver' },
    },
    {
      name: 'Local SQL Server schema portability verification',
      command: 'npm run init:verify-schema',
      env: { ENV_FILE: localEnv, DB_PROVIDER: 'sqlserver' },
    },
    {
      name: 'Azure SQL bootstrap',
      command: 'npm run bootstrap:sqlserver-pilot-schema',
      env: { ENV_FILE: azureEnv },
    },
    {
      name: 'Azure SQL seed verification',
      command: 'npm run init:verify',
      env: { ENV_FILE: azureEnv, DB_PROVIDER: 'sqlserver' },
    },
    {
      name: 'Azure SQL schema portability verification',
      command: 'npm run init:verify-schema',
      env: { ENV_FILE: azureEnv, DB_PROVIDER: 'sqlserver' },
    },
  ];

  console.log('========================================');
  console.log(' SQL Server Dual-Path Verification');
  console.log('========================================');
  console.log(`SQLSERVER_LOCAL_ENV_FILE=${localEnv}`);
  console.log(`SQLSERVER_AZURE_ENV_FILE=${azureEnv}`);

  for (const step of steps) {
    runStep(step);
  }

  console.log('========================================');
  console.log('✅ SQL Server dual-path verification passed');
  console.log('========================================');
}

try {
  run();
  process.exit(0);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('========================================');
  console.error(`❌ SQL Server dual-path verification failed: ${message}`);
  console.error('========================================');
  process.exit(1);
}
