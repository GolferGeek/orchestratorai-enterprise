import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AddWorkTaskCommentInput,
  CreateWorkTaskInput,
  CreatedWorkTask,
  UpdateWorkTaskStatusInput,
  WorkTaskSink,
} from './work-task-sink.interface';
import { DATABASE_SERVICE, DatabaseService } from '../database';

@Injectable()
export class AdoWorkItemTaskSinkService implements WorkTaskSink {
  private readonly logger = new Logger(AdoWorkItemTaskSinkService.name);
  private readonly defaultTeamId: string;
  private readonly defaultChannelId: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_SERVICE)
    private readonly db: DatabaseService,
  ) {
    this.defaultTeamId = this.configService.get<string>(
      'FLOW_DEFAULT_TEAM_ID',
      '',
    );
    this.defaultChannelId = this.configService.get<string>(
      'FLOW_DEFAULT_CHANNEL_ID',
      '',
    );
  }

  async createTask(input: CreateWorkTaskInput): Promise<CreatedWorkTask> {
    if (!input.title) {
      throw new Error('title is required');
    }

    const orgUrl = this.requireConfig('ADO_ORG_URL');
    const project = this.requireConfig('ADO_PROJECT');
    const pat = this.requireConfig('ADO_PAT');
    const workItemType = this.requireConfig('ADO_WORK_ITEM_TYPE');

    const url = `${orgUrl}/${project}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=7.1-preview.3`;
    const authToken = Buffer.from(`:${pat}`).toString('base64');

    const payload = [
      { op: 'add', path: '/fields/System.Title', value: input.title },
      {
        op: 'add',
        path: '/fields/System.Description',
        value: input.description || '',
      },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `ADO work item creation failed (${response.status}): ${message}`,
      );
    }

    const data = (await response.json()) as {
      id?: number;
      fields?: Record<string, unknown>;
    };

    if (!data.id) {
      throw new Error('ADO work item creation returned no id');
    }

    const externalTaskId = String(data.id);
    const teamId = input.teamId || this.defaultTeamId;
    const channelId = input.channelId || this.defaultChannelId;

    const shadowResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .insert({
        title: input.title,
        description: input.description || null,
        status: 'in_progress',
        assigned_to: input.assignedTo || 'Claude',
        team_id: teamId || null,
        channel_id: channelId || null,
        source_channel_user_id: input.sourceChannelUserId || null,
        is_completed: false,
        pomodoro_count: 0,
        external_provider: 'ado',
        external_task_id: externalTaskId,
      })
      .select('id, title')
      .single();

    if (shadowResult.error || !shadowResult.data) {
      const message = shadowResult.error?.message ?? 'No task row returned';
      throw new Error(`Failed to persist ADO task mapping: ${message}`);
    }

    const shadowTask = shadowResult.data as { id: string; title: string };
    const returnedTitle = data.fields?.['System.Title'];
    const title =
      typeof returnedTitle === 'string' && returnedTitle.trim() !== ''
        ? returnedTitle
        : input.title;

    return {
      id: shadowTask.id,
      title,
      provider: 'ado',
      externalId: externalTaskId,
    };
  }

  async updateTaskStatus(input: UpdateWorkTaskStatusInput): Promise<void> {
    if (!input.taskId || !input.status) {
      throw new Error('taskId and status are required');
    }

    const orgUrl = this.requireConfig('ADO_ORG_URL');
    const project = this.requireConfig('ADO_PROJECT');
    const pat = this.requireConfig('ADO_PAT');
    const adoState = this.mapStatusToAdoState(input.status);
    const adoTaskId = await this.resolveAdoTaskId(input.taskId);

    const url = `${orgUrl}/${project}/_apis/wit/workitems/${encodeURIComponent(
      adoTaskId,
    )}?api-version=7.1-preview.3`;
    const authToken = Buffer.from(`:${pat}`).toString('base64');

    const payload = [
      { op: 'add', path: '/fields/System.State', value: adoState },
    ];
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `ADO status update failed (${response.status}): ${message}`,
      );
    }

    if (this.isUuid(input.taskId)) {
      const statusResult = await this.db
        .from('orch_flow', 'shared_tasks')
        .update({
          status: input.status,
          is_completed: input.status === 'done' || input.status === 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.taskId);

      if (statusResult.error) {
        throw new Error(
          `ADO status updated but failed to sync local task status: ${statusResult.error.message}`,
        );
      }
    }
  }

  async addTaskComment(input: AddWorkTaskCommentInput): Promise<void> {
    if (!input.taskId || !input.comment) {
      throw new Error('taskId and comment are required');
    }

    const orgUrl = this.requireConfig('ADO_ORG_URL');
    const project = this.requireConfig('ADO_PROJECT');
    const pat = this.requireConfig('ADO_PAT');
    const adoTaskId = await this.resolveAdoTaskId(input.taskId);

    const url = `${orgUrl}/${project}/_apis/wit/workItems/${encodeURIComponent(
      adoTaskId,
    )}/comments?api-version=7.1-preview.3`;
    const authToken = Buffer.from(`:${pat}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: input.comment }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `ADO comment creation failed (${response.status}): ${message}`,
      );
    }
  }

  private async resolveAdoTaskId(taskId: string): Promise<string> {
    if (this.isNumericTaskId(taskId)) {
      return taskId;
    }
    if (!this.isUuid(taskId)) {
      throw new Error(
        `Unsupported taskId format '${taskId}'. Expected numeric ADO id or internal UUID`,
      );
    }

    const lookupResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .select('external_task_id')
      .eq('id', taskId)
      .eq('external_provider', 'ado')
      .single();

    if (lookupResult.error) {
      throw new Error(
        `Failed to resolve ADO task mapping for ${taskId}: ${lookupResult.error.message}`,
      );
    }

    const externalTaskId = (
      lookupResult.data as { external_task_id: string | null }
    )?.external_task_id;
    if (!externalTaskId) {
      throw new Error(
        `Failed to resolve ADO task mapping for ${taskId}: No ADO mapping row returned`,
      );
    }

    return externalTaskId;
  }

  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value || value.trim() === '') {
      throw new Error(`${name} is required when WORK_PROVIDER=ado`);
    }
    return value;
  }

  private mapStatusToAdoState(status: string): string {
    switch (status) {
      case 'pending':
      case 'running':
      case 'in_progress':
        return 'Active';
      case 'done':
      case 'completed':
        return 'Closed';
      case 'failed':
      case 'error':
        return 'Removed';
      default:
        throw new Error(
          `Unsupported internal status '${status}' for ADO state mapping`,
        );
    }
  }

  private isNumericTaskId(value: string): boolean {
    return /^[0-9]+$/.test(value);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
