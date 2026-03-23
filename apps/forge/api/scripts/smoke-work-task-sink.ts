import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import {
  WORK_TASK_SINK,
  WorkTaskSink,
} from '@orchestratorai/planes/work-routing';

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
  const workProvider = process.env.WORK_PROVIDER;
  const skipComment = process.env.SMOKE_SKIP_COMMENT === 'true';
  const flowDefaultTeamId = process.env.FLOW_DEFAULT_TEAM_ID;

  console.log('========================================');
  console.log(' Work Task Sink Smoke');
  console.log('========================================');
  console.log(`WORK_PROVIDER=${workProvider ?? '<unset>'}`);
  console.log(`DB_PROVIDER=${process.env.DB_PROVIDER ?? '<unset>'}`);
  console.log(`SMOKE_SKIP_COMMENT=${skipComment}`);
  console.log(`FLOW_DEFAULT_TEAM_ID=${flowDefaultTeamId ?? '<unset>'}`);

  if (
    workProvider === 'flow' &&
    (!flowDefaultTeamId || flowDefaultTeamId.trim() === '')
  ) {
    throw new Error(
      'WORK_PROVIDER=flow (orch_flow task sink) requires FLOW_DEFAULT_TEAM_ID.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const workSink = app.get<WorkTaskSink>(WORK_TASK_SINK);
    console.log(`Resolved provider: ${workSink.constructor.name}`);

    const created = await workSink.createTask({
      title: `work-smoke-${Date.now()}`,
      description: 'work task sink smoke',
      assignedTo: 'SmokeRunner',
      teamId: flowDefaultTeamId,
    });
    console.log(
      `Created task: id=${created.id} provider=${created.provider} externalId=${created.externalId ?? '<none>'}`,
    );

    await workSink.updateTaskStatus({
      taskId: created.id,
      status: 'done',
    });
    console.log('Updated task status: done');

    if (!skipComment) {
      await workSink.addTaskComment({
        taskId: created.id,
        comment: 'smoke comment',
      });
      console.log('Added task comment');
    } else {
      console.log('Skipped task comment step');
    }

    console.log('✅ Work task sink smoke passed');
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Work task sink smoke failed: ${message}`);
    process.exit(1);
  });
