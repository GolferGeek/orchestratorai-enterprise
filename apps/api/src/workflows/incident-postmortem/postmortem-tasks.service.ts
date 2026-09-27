import { Injectable } from '@nestjs/common';
import { RunTasksService } from '../shared/tasks';
import type { ActionItem } from './postmortem.state';

/** Each approved action item as a task in the team's tracker, once (engineering.postmortem_tasks). */
@Injectable()
export class PostmortemTasksService {
  constructor(private readonly runTasks: RunTasksService) {}

  async create(organizationSlug: string, runId: string, postmortemTitle: string, items: ActionItem[], link: string): Promise<ActionItem[]> {
    const created = await this.runTasks.create({ schema: 'engineering', table: 'postmortem_tasks' }, organizationSlug, runId, items.map((item) => ({
      key: item.key,
      title: `[${item.priority.toUpperCase()}] ${item.title}`,
      description: `Action item from the postmortem "${postmortemTitle}".\nOwner: ${item.owner}. Due: ${item.due}.\nWhy: ${item.why}\n\nPostmortem: ${link}`,
    })));
    return items.map((item) => ({ ...item, task: created.get(item.key)! }));
  }
}
