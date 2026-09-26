import { Injectable } from '@nestjs/common';
import type { WorkflowRunSummary } from '@orchestrator-ai/transport-types';
import type { WorkflowRunSource } from '../catalog/workflow.registry';
import type { WorkflowRunReader } from '../shared/runs';
import { MarketingDbService } from './marketing-db.service';

/** Marketing Swarm's runs are its swarm_tasks, listed through the catalog. */
@Injectable()
export class MarketingSwarmRunSource implements WorkflowRunSource {
  constructor(private readonly marketingDb: MarketingDbService) {}

  async list(reader: WorkflowRunReader): Promise<WorkflowRunSummary[]> {
    const tasks = await this.marketingDb.listUserTasks(reader);
    return tasks.map((task) => ({
      conversationId: task.conversationId,
      workflowSlug: 'marketing-swarm',
      status: task.status,
      title: task.previewTitle,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    }));
  }

  delete(conversationId: string, reader: WorkflowRunReader): Promise<boolean> {
    return this.marketingDb.deleteTaskForUser(
      conversationId,
      reader.userId,
      reader.organizationSlug,
    );
  }
}
