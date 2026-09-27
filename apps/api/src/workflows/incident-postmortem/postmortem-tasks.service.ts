import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import { WORK_TASK_SINK, type WorkTaskSink } from '@orchestratorai/planes/work-routing';
import type { ActionItem } from './postmortem.state';

/**
 * Creates each approved action item as a task in the team's work tracker
 * (the work-routing plane: Flow, Slack or Azure DevOps), exactly once per run
 * and item: a retried step finds the tasks it already created.
 */
@Injectable()
export class PostmortemTasksService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(WORK_TASK_SINK) private readonly tasks: WorkTaskSink,
  ) {}

  async create(organizationSlug: string, runId: string, postmortemTitle: string, items: ActionItem[], link: string): Promise<ActionItem[]> {
    const { data, error } = await this.db.from('engineering', 'postmortem_tasks').select('item_key, task_provider, task_id').eq('run_id', runId);
    if (error) throw new Error(`Failed to read the postmortem's tasks: ${error.message}`);
    const existing = new Map((data as Array<Record<string, string>>).map((r) => [r.item_key, { provider: r.task_provider!, id: r.task_id! }]));
    const out: ActionItem[] = [];
    for (const item of items) {
      let task = existing.get(item.key);
      if (!task) {
        const created = await this.tasks.createTask({
          title: `[${item.priority.toUpperCase()}] ${item.title}`,
          description: `Action item from the postmortem "${postmortemTitle}".\nOwner: ${item.owner}. Due: ${item.due}.\nWhy: ${item.why}\n\nPostmortem: ${link}`,
        });
        task = { provider: created.provider, id: created.id };
        const inserted = await this.db.from('engineering', 'postmortem_tasks').insert({
          run_id: runId, organization_slug: organizationSlug, item_key: item.key, title: item.title, task_provider: task.provider, task_id: task.id,
        });
        if (inserted.error) throw new Error(`Created task ${task.id} but could not record it: ${inserted.error.message}`);
      }
      out.push({ ...item, task });
    }
    return out;
  }
}
