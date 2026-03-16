import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_SERVICE, DatabaseService } from '../database';
import {
  AddWorkTaskCommentInput,
  CreateWorkTaskInput,
  CreatedWorkTask,
  UpdateWorkTaskStatusInput,
  WorkTaskSink,
} from './work-task-sink.interface';

interface SlackPostMessageResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

interface SharedTaskLookupRow {
  id: string;
  title: string;
  external_task_id: string | null;
}

@Injectable()
export class SlackWorkTaskSinkService implements WorkTaskSink {
  private readonly logger = new Logger(SlackWorkTaskSinkService.name);
  private readonly defaultTeamId: string;
  private readonly slackChannelId: string;
  private readonly slackBotToken: string;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTeamId = this.requireConfig('FLOW_DEFAULT_TEAM_ID');
    this.slackChannelId = this.requireConfig('SLACK_DEFAULT_CHANNEL_ID');
    this.slackBotToken = this.requireConfig('SLACK_BOT_TOKEN');
  }

  async createTask(input: CreateWorkTaskInput): Promise<CreatedWorkTask> {
    if (!input.title || input.title.trim() === '') {
      throw new Error('title is required');
    }

    const teamId = input.teamId || this.defaultTeamId;
    if (!teamId || teamId.trim() === '') {
      throw new Error(
        'teamId is required (pass it or set FLOW_DEFAULT_TEAM_ID)',
      );
    }

    const createResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .insert({
        title: input.title,
        description: input.description || null,
        status: 'in_progress',
        assigned_to: input.assignedTo || 'Claude',
        team_id: teamId,
        channel_id: null,
        source_channel_user_id: input.sourceChannelUserId || null,
        is_completed: false,
        pomodoro_count: 0,
        external_provider: 'slack',
      })
      .select('id, title')
      .single();

    if (createResult.error || !createResult.data) {
      const message = createResult.error?.message ?? 'No task row returned';
      throw new Error(`Failed to create Slack task row: ${message}`);
    }

    const taskRow = createResult.data as { id: string; title: string };
    const slackTs = await this.postMessageToSlack(
      [
        '*New task created*',
        `Task: ${input.title}`,
        `Internal ID: ${taskRow.id}`,
        input.description ? `Description: ${input.description}` : '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );

    const updateResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .update({
        external_task_id: slackTs,
      })
      .eq('id', taskRow.id);

    if (updateResult.error) {
      throw new Error(
        `Failed to persist Slack external_task_id: ${updateResult.error.message}`,
      );
    }

    return {
      id: taskRow.id,
      title: taskRow.title,
      provider: 'slack',
      externalId: slackTs,
    };
  }

  async updateTaskStatus(input: UpdateWorkTaskStatusInput): Promise<void> {
    if (!input.taskId || !input.status) {
      throw new Error('taskId and status are required');
    }

    const task = await this.getSharedTaskById(input.taskId);
    const updateResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .update({
        status: input.status,
        is_completed: input.status === 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.taskId);

    if (updateResult.error) {
      throw new Error(
        `Failed to update Slack task status: ${updateResult.error.message}`,
      );
    }

    await this.postMessageToSlack(
      `Task status updated: *${task.title}* -> \`${input.status}\``,
      task.external_task_id,
    );
  }

  async addTaskComment(input: AddWorkTaskCommentInput): Promise<void> {
    if (!input.taskId || !input.comment) {
      throw new Error('taskId and comment are required');
    }

    const task = await this.getSharedTaskById(input.taskId);
    await this.postMessageToSlack(
      `Comment on *${task.title}*: ${input.comment}`,
      task.external_task_id,
    );
  }

  private async getSharedTaskById(
    taskId: string,
  ): Promise<SharedTaskLookupRow> {
    const queryResult = await this.db
      .from('orch_flow', 'shared_tasks')
      .select('id, title, external_task_id')
      .eq('id', taskId)
      .single();

    if (queryResult.error || !queryResult.data) {
      const message = queryResult.error?.message ?? 'No task row returned';
      throw new Error(`Failed to fetch Slack task ${taskId}: ${message}`);
    }

    return queryResult.data as SharedTaskLookupRow;
  }

  private async postMessageToSlack(
    text: string,
    threadTs?: string | null,
  ): Promise<string> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: this.slackChannelId,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Slack chat.postMessage failed (${response.status}): ${message}`,
      );
    }

    const payload = (await response.json()) as SlackPostMessageResponse;
    if (!payload.ok || !payload.ts) {
      throw new Error(
        `Slack chat.postMessage returned invalid payload: ${payload.error ?? 'missing ts'}`,
      );
    }

    this.logger.log(`Slack message posted (ts=${payload.ts})`);
    return payload.ts;
  }

  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value || value.trim() === '') {
      throw new Error(`${name} is required when WORK_PROVIDER=slack`);
    }
    return value;
  }
}
