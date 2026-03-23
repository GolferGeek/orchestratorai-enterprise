import { spawnSync } from 'child_process';

type MatrixStep = {
  name: string;
  command: string;
  env: Record<string, string>;
};

function runStep(step: MatrixStep): void {
  console.log('----------------------------------------');
  console.log(`Step: ${step.name}`);
  console.log(`Command: ${step.command}`);
  console.log(
    `Env: ${Object.entries(step.env)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')}`,
  );

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

function run(): void {
  const steps: MatrixStep[] = [
    {
      name: 'Slack env precheck',
      command: 'npm run smoke:slack-env',
      env: {
        ENV_FILE: '../../.env.azure',
      },
    },
    {
      name: 'Slack provider smoke',
      command: 'npm run smoke:work-task-sink',
      env: {
        ENV_FILE: '../../.env.azure',
        WORK_PROVIDER: 'slack',
        DB_PROVIDER: 'supabase_pg',
      },
    },
    {
      name: 'ADO env precheck',
      command: 'npm run smoke:ado-env',
      env: {
        ENV_FILE: '../../.env.azure',
      },
    },
    {
      name: 'ADO provider smoke',
      command: 'npm run smoke:work-task-sink',
      env: {
        ENV_FILE: '../../.env.azure',
        WORK_PROVIDER: 'ado',
        DB_PROVIDER: 'supabase_pg',
      },
    },
  ];

  console.log('========================================');
  console.log(' Work Routing Matrix Smoke');
  console.log('========================================');

  for (const step of steps) {
    runStep(step);
  }

  console.log('========================================');
  console.log('✅ Work routing matrix smoke passed');
  console.log('========================================');
}

try {
  run();
  process.exit(0);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('========================================');
  console.error(`❌ Work routing matrix smoke failed: ${message}`);
  console.error('========================================');
  process.exit(1);
}
