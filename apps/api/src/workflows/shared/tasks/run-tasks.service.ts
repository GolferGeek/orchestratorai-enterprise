import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import { WORK_TASK_SINK, type WorkTaskSink } from '@orchestratorai/planes/work-routing';

/** Where a workflow records the tasks it created: a table with (run_id, organization_slug, item_key, title, task_provider, task_id). */
export interface TaskRecordTable {
  schema: string;
  table: string;
}

export interface RunTask {
  key: string;
  title: string;
  description: string;
}

export interface CreatedRunTask {
  provider: string;
  id: string;
}

/**
 * Creates a run's tasks in the team's work tracker (the work-routing plane:
 * Flow, Slack or Azure DevOps), exactly once per run and item: a retried step
 * finds the tasks it already created in its record table.
 */
@Injectable()
export class RunTasksService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(WORK_TASK_SINK) private readonly tasks: WorkTaskSink,
  ) {}

  async create(where: TaskRecordTable, organizationSlug: string, runId: string, items: RunTask[]): Promise<Map<string, CreatedRunTask>> {
    const { data, error } = await this.db.from(where.schema, where.table).select('item_key, task_provider, task_id').eq('run_id', runId);
    if (error) throw new Error(`Failed to read the run's tasks: ${error.message}`);
    const created = new Map((data as Array<Record<string, string>>).map((r) => [r.item_key!, { provider: r.task_provider!, id: r.task_id! }]));
    for (const item of items) {
      if (created.has(item.key)) continue;
      const task = await this.tasks.createTask({ title: item.title, description: item.description });
      const inserted = await this.db.from(where.schema, where.table).insert({
        run_id: runId, organization_slug: organizationSlug, item_key: item.key, title: item.title, task_provider: task.provider, task_id: task.id,
      });
      if (inserted.error) throw new Error(`Created task ${task.id} but could not record it: ${inserted.error.message}`);
      created.set(item.key, { provider: task.provider, id: task.id });
    }
    return created;
  }
}

/** Global: workflows that turn approved items into tracked work use it. */
@Global()
@Module({ providers: [RunTasksService], exports: [RunTasksService] })
export class RunTasksModule {}
